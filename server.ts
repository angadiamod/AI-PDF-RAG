import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import {
  addChatMessage,
  clearAllConversations,
  createConversation,
  createDocumentRecord,
  deleteConversation,
  deleteDocument,
  getAllEmbeddedChunks,
  getConversationDetail,
  getDashboardStats,
  getDocumentById,
  getDocumentChunks,
  getDocumentFilePath,
  getSettings,
  listConversations,
  listDocuments,
  listQuestionSets,
  listSummaries,
  replaceDocumentChunks,
  saveQuestionSet,
  saveSummary,
  UPLOADS_DIR,
  updateConversationMeta,
  updateDocumentState,
  updateSettings,
} from './server/db';
import {
  embedTexts,
  EMBEDDING_MODEL,
  generateDocumentQuestions,
  generateDocumentSummary,
  generateRagAnswer,
  GENERATION_MODEL,
  normalizeGeminiError,
} from './server/gemini';
import { extractPdfPages } from './server/pdfProcessor';
import { chunkPages, detectChapters, rankChunks, validatePdfBuffer } from './server/rag';
import {
  ensureSamplePdfsExist,
  getSamplePdfPath,
  SAMPLE_PDF_DEFINITIONS,
} from './server/samplePdfs';
import type {
  DifficultyLevel,
  DocumentRecord,
  QuestionType,
  SamplePdfInfo,
  SearchResultItem,
  SummaryMode,
} from './shared/types';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Full RAG ingestion pipeline for a single PDF buffer:
 * Validate -> Persist PDF -> Extract pages -> Detect chapters & Chunk -> Embed via Gemini -> Store in SQLite.
 */
async function ingestPdfBuffer(
  buffer: Buffer,
  originalName: string
): Promise<{ document: DocumentRecord; pipelineLog: string[] }> {
  const settings = getSettings();
  const maxBytes = settings.maxFileSizeMb * 1024 * 1024;
  const validation = validatePdfBuffer(buffer, originalName, maxBytes);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.error || 'Invalid PDF file.'), { statusCode: 400 });
  }

  const id = crypto.randomUUID();
  const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedFilename = `${id}_${safeBase}`;
  const filePath = path.join(UPLOADS_DIR, storedFilename);
  fs.writeFileSync(filePath, buffer);

  const pipelineLog: string[] = [];
  createDocumentRecord({
    id,
    filename: storedFilename,
    originalName,
    fileSize: buffer.length,
    filePath,
    status: 'extracting',
  });
  pipelineLog.push('Validated PDF header and saved file.');

  try {
    // Step 1: Extract text page-by-page
    const extracted = await extractPdfPages(buffer);
    pipelineLog.push(
      `Extracted ${extracted.totalCharacters.toLocaleString()} characters across ${extracted.pageCount} page(s).`
    );

    // Step 2: Detect chapters & split into overlapping chunks preserving page numbers
    updateDocumentState(id, {
      status: 'chunking',
      pageCount: extracted.pageCount,
    });

    const chapters = detectChapters(extracted.pages);
    const chunks = chunkPages(extracted.pages, id, originalName, {
      chunkSize: settings.chunkSize,
      chunkOverlap: settings.chunkOverlap,
    });

    if (chunks.length === 0) {
      throw new Error('Document text could not be segmented into searchable chunks.');
    }

    pipelineLog.push(
      `Split text into ${chunks.length} overlapping chunks (${settings.chunkSize} chars / ${settings.chunkOverlap} overlap) and identified ${chapters.length} chapter/section(s).`
    );

    // Step 3: Generate vector embeddings via Gemini Embedding API
    updateDocumentState(id, {
      status: 'embedding',
      chapters,
    });

    const embeddings = await embedTexts(chunks.map((c) => c.content));
    const dimensions = embeddings[0]?.length ?? 0;
    pipelineLog.push(
      `Generated ${embeddings.length} dense vectors (${dimensions} dimensions) via ${EMBEDDING_MODEL}.`
    );

    // Step 4: Store embeddings & chunks in SQLite
    replaceDocumentChunks(
      id,
      chunks.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddings[idx],
      }))
    );

    const readyDoc = updateDocumentState(id, {
      status: 'ready',
      pageCount: extracted.pageCount,
      chunkCount: chunks.length,
      chapters,
      errorMessage: null,
    })!;

    pipelineLog.push('Indexed vectors in SQLite. Document is ready for semantic search.');
    return { document: readyDoc, pipelineLog };
  } catch (err) {
    const normalized = normalizeGeminiError(err);
    const message =
      err instanceof Error && !err.message.includes('API')
        ? err.message
        : normalized.message;
    const failedDoc = updateDocumentState(id, {
      status: 'error',
      errorMessage: message,
    })!;
    return {
      document: failedDoc,
      pipelineLog: [...pipelineLog, `Pipeline failed: ${message}`],
    };
  }
}

async function startServer() {
  await ensureSamplePdfsExist();

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 50 * 1024 * 1024, // Hard multer ceiling; per-settings limit enforced in validatePdfBuffer
      files: 10,
    },
  });

  // Health & model metadata
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      generationModel: GENERATION_MODEL,
      embeddingModel: EMBEDDING_MODEL,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
      ),
    });
  });

  // Dashboard metrics
  app.get('/api/dashboard', (_req, res) => {
    res.json(getDashboardStats());
  });

  // Documents CRUD
  app.get('/api/documents', (_req, res) => {
    res.json({ documents: listDocuments() });
  });

  app.get('/api/documents/:id', (req, res) => {
    const doc = getDocumentById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ document: doc });
  });

  app.get('/api/documents/:id/chunks', (req, res) => {
    const doc = getDocumentById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ document: doc, chunks: getDocumentChunks(doc.id) });
  });

  app.get('/api/documents/:id/file', (req, res) => {
    const info = getDocumentFilePath(req.params.id);
    if (!info || !fs.existsSync(info.filePath)) {
      res.status(404).json({ error: 'PDF file not found on disk.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(info.originalName)}"`
    );
    fs.createReadStream(info.filePath).pipe(res);
  });

  app.post('/api/documents/upload', (req, res, next) => {
    upload.array('files', 10)(req, res, (multerErr) => {
      if (multerErr) {
        res.status(400).json({ error: multerErr.message || 'File upload failed.' });
        return;
      }
      next();
    });
  }, async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: 'Please select at least one PDF file to upload.' });
      return;
    }

    const results: Array<{
      document?: DocumentRecord;
      pipelineLog?: string[];
      error?: string;
      originalName: string;
    }> = [];

    for (const file of files) {
      try {
        const result = await ingestPdfBuffer(file.buffer, file.originalname);
        results.push({
          originalName: file.originalname,
          document: result.document,
          pipelineLog: result.pipelineLog,
          error: result.document.status === 'error' ? result.document.errorMessage ?? 'Processing failed' : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload validation failed.';
        results.push({
          originalName: file.originalname,
          error: message,
        });
      }
    }

    const anySucceeded = results.some((r) => r.document && r.document.status === 'ready');
    res.status(anySucceeded ? 201 : 400).json({ results });
  });

  app.delete('/api/documents/:id', (req, res) => {
    const deleted = deleteDocument(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Real sample PDFs
  app.get('/api/samples', (_req, res) => {
    const existingNames = new Set(
      listDocuments()
        .filter((d) => d.status === 'ready')
        .map((d) => d.originalName)
    );
    const samples: SamplePdfInfo[] = SAMPLE_PDF_DEFINITIONS.map((def) => ({
      slug: def.slug,
      filename: def.filename,
      title: def.title,
      description: def.description,
      pages: def.pages.length,
      topics: def.topics,
      alreadyImported: existingNames.has(def.filename),
    }));
    res.json({ samples });
  });

  app.get('/api/samples/:slug/download', (req, res) => {
    const found = getSamplePdfPath(req.params.slug);
    if (!found || !fs.existsSync(found.filePath)) {
      res.status(404).json({ error: 'Sample PDF not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${found.def.filename}"`);
    fs.createReadStream(found.filePath).pipe(res);
  });

  app.post('/api/samples/:slug/import', async (req, res) => {
    const found = getSamplePdfPath(req.params.slug);
    if (!found || !fs.existsSync(found.filePath)) {
      res.status(404).json({ error: 'Sample PDF not found.' });
      return;
    }
    try {
      const buffer = fs.readFileSync(found.filePath);
      const result = await ingestPdfBuffer(buffer, found.def.filename);
      if (result.document.status === 'error') {
        res.status(502).json({
          error: result.document.errorMessage || 'Failed to process sample PDF.',
          document: result.document,
          pipelineLog: result.pipelineLog,
        });
        return;
      }
      res.status(201).json(result);
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // Semantic similarity search endpoint (direct vector search explorer)
  app.post('/api/search', async (req, res) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const documentIds = Array.isArray(req.body?.documentIds)
      ? (req.body.documentIds as string[]).filter((id) => typeof id === 'string')
      : undefined;

    if (!query) {
      res.status(400).json({ error: 'Please enter a search query.' });
      return;
    }

    const storedChunks = getAllEmbeddedChunks(documentIds);
    if (storedChunks.length === 0) {
      res.status(400).json({
        error: 'No processed PDF documents are indexed yet. Upload a PDF first.',
      });
      return;
    }

    try {
      const settings = getSettings();
      const topK =
        typeof req.body?.topK === 'number'
          ? Math.max(1, Math.min(20, Math.round(req.body.topK)))
          : settings.topK;
      const minSimilarity =
        typeof req.body?.minSimilarity === 'number'
          ? Math.max(0, Math.min(1, req.body.minSimilarity))
          : 0.15;

      const [queryEmbedding] = await embedTexts([query]);
      const ranked = rankChunks(queryEmbedding, storedChunks, {
        topK,
        minSimilarity,
        documentIds,
      });

      const results: SearchResultItem[] = ranked.map((r) => ({
        chunkId: r.chunkId,
        documentId: r.documentId,
        documentName: r.documentName,
        pageNumber: r.pageNumber,
        chunkIndex: r.chunkIndex,
        similarity: r.similarity,
        content: r.excerpt,
      }));

      res.json({
        query,
        embeddingDimensions: queryEmbedding.length,
        totalChunksSearched: storedChunks.length,
        results,
      });
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // Conversations & Chat History
  app.get('/api/conversations', (_req, res) => {
    res.json({ conversations: listConversations() });
  });

  app.post('/api/conversations', (req, res) => {
    const title =
      typeof req.body?.title === 'string' && req.body.title.trim()
        ? req.body.title.trim().slice(0, 80)
        : 'New PDF Conversation';
    const documentIds = Array.isArray(req.body?.documentIds)
      ? (req.body.documentIds as string[]).filter((id) => typeof id === 'string')
      : [];
    const conversation = createConversation(title, documentIds);
    res.status(201).json({ conversation });
  });

  app.get('/api/conversations/:id', (req, res) => {
    const detail = getConversationDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ conversation: detail });
  });

  app.delete('/api/conversations/:id', (req, res) => {
    const deleted = deleteConversation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json({ deleted: true });
  });

  app.delete('/api/conversations', (_req, res) => {
    const count = clearAllConversations();
    res.json({ deletedCount: count });
  });

  // Core RAG Chat endpoint
  app.post('/api/chat', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const requestedConvId =
      typeof req.body?.conversationId === 'string' ? req.body.conversationId : undefined;
    const documentIds = Array.isArray(req.body?.documentIds)
      ? (req.body.documentIds as string[]).filter((id) => typeof id === 'string')
      : undefined;

    if (!message) {
      res.status(400).json({ error: 'Please enter a question.' });
      return;
    }

    const storedChunks = getAllEmbeddedChunks(documentIds);
    if (storedChunks.length === 0) {
      res.status(400).json({
        error:
          'No ready PDF documents are available to search. Please upload and process at least one PDF first.',
      });
      return;
    }

    let conversation = requestedConvId ? getConversationDetail(requestedConvId) : null;
    if (!conversation) {
      const autoTitle = message.length > 56 ? `${message.slice(0, 56)}…` : message;
      const created = createConversation(autoTitle, documentIds ?? []);
      conversation = getConversationDetail(created.id)!;
    } else if (conversation.messages.length === 0) {
      const autoTitle = message.length > 56 ? `${message.slice(0, 56)}…` : message;
      updateConversationMeta(conversation.id, {
        title: autoTitle,
        documentIds: documentIds ?? conversation.documentIds,
      });
    }

    const priorTurns = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const settings = getSettings();

      // Step 1: Embed question (include brief previous user turn if follow-up is very short)
      const isShortFollowUp =
        message.split(/\s+/).length <= 7 &&
        priorTurns.length > 0 &&
        /\b(it|this|that|they|them|more|example|explain|elaborate|chapter)\b/i.test(message);
      const lastUserTurn = [...priorTurns].reverse().find((t) => t.role === 'user');
      const embeddingQuery =
        isShortFollowUp && lastUserTurn ? `${lastUserTurn.content} — ${message}` : message;

      const [queryEmbedding] = await embedTexts([embeddingQuery]);

      // Step 2: Cosine similarity search & ranking
      const retrievedChunks = rankChunks(queryEmbedding, storedChunks, {
        topK: settings.topK,
        minSimilarity: settings.minSimilarity,
        documentIds,
      });

      // Step 3: Send retrieved context + history to Gemini
      const { answer, foundInDocs } = await generateRagAnswer({
        question: message,
        retrievedChunks,
        history: priorTurns,
        responseStyle: settings.responseStyle,
      });

      // Step 4: Persist both turns with accurate source references in SQLite
      const userMessage = addChatMessage({
        conversationId: conversation.id,
        role: 'user',
        content: message,
        sources: [],
        foundInDocs: true,
      });

      const assistantMessage = addChatMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: answer,
        sources: foundInDocs ? retrievedChunks : [],
        foundInDocs,
      });

      const updatedConversation = getConversationDetail(conversation.id)!;
      res.json({
        conversation: updatedConversation,
        userMessage,
        assistantMessage,
        retrievalMeta: {
          chunksSearched: storedChunks.length,
          chunksMatched: retrievedChunks.length,
          topSimilarity: retrievedChunks[0]?.similarity ?? 0,
        },
      });
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // AI Document Summarizer
  app.get('/api/summaries', (_req, res) => {
    res.json({ summaries: listSummaries() });
  });

  app.post('/api/summarize', async (req, res) => {
    const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : '';
    const mode = (req.body?.mode as SummaryMode) || 'short';
    const chapterTitle =
      typeof req.body?.chapterTitle === 'string' && req.body.chapterTitle.trim()
        ? req.body.chapterTitle.trim()
        : null;

    if (!documentId) {
      res.status(400).json({ error: 'Please select a document to summarize.' });
      return;
    }

    const doc = getDocumentById(documentId);
    if (!doc || doc.status !== 'ready') {
      res.status(400).json({ error: 'Selected document is not ready for summarization.' });
      return;
    }

    const fileInfo = getDocumentFilePath(documentId);
    if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
      res.status(404).json({ error: 'Document PDF file could not be located.' });
      return;
    }

    try {
      const extracted = await extractPdfPages(fs.readFileSync(fileInfo.filePath));
      let targetPages = extracted.pages;

      if (mode === 'chapter' && chapterTitle) {
        const chapter = doc.chapters.find((c) => c.title === chapterTitle);
        if (chapter) {
          targetPages = extracted.pages.filter(
            (p) => p.pageNumber >= chapter.startPage && p.pageNumber <= chapter.endPage
          );
        }
      }

      const content = targetPages
        .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
        .join('\n\n');

      const generated = await generateDocumentSummary({
        documentName: doc.originalName,
        content,
        mode,
        chapterTitle: mode === 'chapter' ? chapterTitle : null,
      });

      const saved = saveSummary({
        documentId: doc.id,
        documentName: doc.originalName,
        mode,
        chapterTitle: mode === 'chapter' ? chapterTitle : null,
        summary: generated.summary,
        keyPoints: generated.keyPoints,
      });

      res.status(201).json({ summary: saved });
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // AI Question Generator
  app.get('/api/questions', (_req, res) => {
    res.json({ questionSets: listQuestionSets() });
  });

  app.post('/api/questions/generate', async (req, res) => {
    const documentId = typeof req.body?.documentId === 'string' ? req.body.documentId : '';
    const questionType = (req.body?.questionType as QuestionType) || 'mcq';
    const difficulty = (req.body?.difficulty as DifficultyLevel) || 'medium';
    const count = Math.max(2, Math.min(12, Number(req.body?.count ?? 5)));

    if (!documentId) {
      res.status(400).json({ error: 'Please select a document to generate questions from.' });
      return;
    }

    const doc = getDocumentById(documentId);
    if (!doc || doc.status !== 'ready') {
      res.status(400).json({ error: 'Selected document is not ready yet.' });
      return;
    }

    const fileInfo = getDocumentFilePath(documentId);
    if (!fileInfo || !fs.existsSync(fileInfo.filePath)) {
      res.status(404).json({ error: 'Document PDF file could not be located.' });
      return;
    }

    try {
      const extracted = await extractPdfPages(fs.readFileSync(fileInfo.filePath));
      const content = extracted.pages
        .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
        .join('\n\n');

      const questions = await generateDocumentQuestions({
        documentName: doc.originalName,
        content,
        questionType,
        difficulty,
        count,
      });

      const saved = saveQuestionSet({
        documentId: doc.id,
        documentName: doc.originalName,
        questionType,
        difficulty,
        questions,
      });

      res.status(201).json({ questionSet: saved });
    } catch (err) {
      const normalized = normalizeGeminiError(err);
      res.status(normalized.status).json({ error: normalized.message });
    }
  });

  // RAG Settings
  app.get('/api/settings', (_req, res) => {
    res.json({
      settings: getSettings(),
      models: {
        generation: GENERATION_MODEL,
        embedding: EMBEDDING_MODEL,
      },
    });
  });

  app.put('/api/settings', (req, res) => {
    const updated = updateSettings(req.body ?? {});
    res.json({ settings: updated });
  });

  // Explicit JSON 404 for unknown /api/* routes so SPA HTML is never served to API callers
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // JSON error handler for /api/*
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    res.status(500).json({ error: message });
  });

  // Frontend serving (Vite dev middleware in dev, dist/ static files in production)
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI PDF RAG Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
