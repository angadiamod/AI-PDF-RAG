import type { ChapterInfo, SourceReference } from '../shared/types';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface TextChunkInput {
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charCount: number;
}

export interface StoredEmbeddedChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface ChunkingOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export const DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Validates that an uploaded buffer is a legitimate non-empty PDF within size limits.
 */
export function validatePdfBuffer(
  buffer: Buffer | Uint8Array | null | undefined,
  filename: string,
  maxBytes: number = DEFAULT_MAX_PDF_BYTES
): ValidationResult {
  if (!filename || !filename.toLowerCase().trim().endsWith('.pdf')) {
    return { valid: false, error: 'Only PDF (.pdf) files are supported.' };
  }
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'The uploaded PDF file is empty (0 bytes).' };
  }
  if (buffer.length > maxBytes) {
    const limitMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return {
      valid: false,
      error: `File exceeds the maximum allowed size of ${limitMb} MB.`,
    };
  }
  // PDF files begin with "%PDF-" (allow minor leading whitespace/BOM within first 1024 bytes per spec)
  const headerSlice = Buffer.from(buffer.slice(0, Math.min(buffer.length, 1024))).toString('latin1');
  if (!headerSlice.includes('%PDF-')) {
    return {
      valid: false,
      error: 'Invalid or corrupted PDF header. Please upload a valid PDF document.',
    };
  }
  return { valid: true };
}

/**
 * Normalizes extracted PDF text while preserving paragraph structure.
 */
export function cleanPageText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Splits extracted PDF pages into overlapping text chunks while preserving
 * exact document names and page numbers for grounded citations.
 */
export function chunkPages(
  pages: ExtractedPage[],
  documentId: string,
  documentName: string,
  options: ChunkingOptions = { chunkSize: 900, chunkOverlap: 180 }
): TextChunkInput[] {
  const chunkSize = Math.max(200, Math.min(4000, Math.floor(options.chunkSize || 900)));
  const chunkOverlap = Math.max(
    0,
    Math.min(Math.floor(chunkSize * 0.5), Math.floor(options.chunkOverlap || 180))
  );

  const chunks: TextChunkInput[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const cleaned = cleanPageText(page.text);
    if (!cleaned) continue;

    if (cleaned.length <= chunkSize) {
      chunks.push({
        documentId,
        documentName,
        pageNumber: page.pageNumber,
        chunkIndex: globalIndex++,
        content: cleaned,
        charCount: cleaned.length,
      });
      continue;
    }

    let start = 0;
    while (start < cleaned.length) {
      let end = Math.min(cleaned.length, start + chunkSize);

      // Prefer breaking on paragraph or sentence boundary when not at end of page
      if (end < cleaned.length) {
        const windowStart = Math.max(start + Math.floor(chunkSize * 0.55), start);
        const slice = cleaned.slice(windowStart, end);

        const paraBreak = slice.lastIndexOf('\n\n');
        const sentenceBreak = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('? '),
          slice.lastIndexOf('! '),
          slice.lastIndexOf('.\n')
        );
        const spaceBreak = slice.lastIndexOf(' ');

        if (paraBreak > 0) {
          end = windowStart + paraBreak;
        } else if (sentenceBreak > 0) {
          end = windowStart + sentenceBreak + 1;
        } else if (spaceBreak > 0) {
          end = windowStart + spaceBreak;
        }
      }

      const piece = cleaned.slice(start, end).trim();
      if (piece.length > 0) {
        chunks.push({
          documentId,
          documentName,
          pageNumber: page.pageNumber,
          chunkIndex: globalIndex++,
          content: piece,
          charCount: piece.length,
        });
      }

      if (end >= cleaned.length) break;
      let nextStart = Math.max(end - chunkOverlap, start + 1);
      // Snap overlap start forward to a clean word boundary so excerpts never start mid-word
      if (nextStart > 0 && nextStart < cleaned.length && !/\s/.test(cleaned[nextStart - 1])) {
        const nextSpace = cleaned.indexOf(' ', nextStart);
        if (nextSpace !== -1 && nextSpace < end) {
          nextStart = nextSpace + 1;
        }
      }
      start = nextStart;
    }
  }

  return chunks;
}

/**
 * Detects chapter or major section headings across PDF pages so users can
 * summarize individual chapters cleanly.
 */
export function detectChapters(pages: ExtractedPage[]): ChapterInfo[] {
  const chapters: ChapterInfo[] = [];
  const headingPatterns = [
    /^(?:chapter|unit|module|section|part)\s+\d+(?:\.\d+)?\s*[:.\-–—]?\s*.+$/i,
    /^\d+\.\s+[A-Z][A-Za-z0-9\s,&:\-()]{3,72}$/,
  ];

  for (const page of pages) {
    const lines = cleanPageText(page.text)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length >= 4 && line.length <= 100);

    for (const line of lines) {
      const matched = headingPatterns.some((regex) => regex.test(line));
      if (matched) {
        const normalized = line.replace(/\s+/g, ' ');
        const duplicate = chapters.some(
          (c) => c.title.toLowerCase() === normalized.toLowerCase()
        );
        if (!duplicate) {
          chapters.push({
            title: normalized,
            startPage: page.pageNumber,
            endPage: page.pageNumber,
          });
        }
        break; // At most one top chapter heading per page to avoid noisy subheadings
      }
    }
  }

  const maxPage = pages.length > 0 ? pages[pages.length - 1].pageNumber : 1;
  for (let i = 0; i < chapters.length; i++) {
    const next = chapters[i + 1];
    chapters[i].endPage = next ? Math.max(chapters[i].startPage, next.startPage - 1) : maxPage;
  }

  // If no explicit chapter headings found, group multi-page docs into clean page sections
  if (chapters.length === 0 && pages.length > 0) {
    const pagesPerSection = pages.length <= 4 ? 1 : Math.ceil(pages.length / 4);
    let idx = 1;
    for (let p = 1; p <= pages.length; p += pagesPerSection) {
      const end = Math.min(pages.length, p + pagesPerSection - 1);
      chapters.push({
        title:
          p === end
            ? `Section ${idx} (Page ${p})`
            : `Section ${idx} (Pages ${p}–${end})`,
        startPage: p,
        endPage: end,
      });
      idx++;
    }
  }

  return chapters;
}

/**
 * Computes cosine similarity between two equal-length numeric vectors.
 * Returns a value in [-1, 1], or 0 when either vector is empty/zero/mismatched.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0 || !Number.isFinite(denom)) {
    return 0;
  }
  const score = dot / denom;
  return Math.max(-1, Math.min(1, score));
}

export interface RankOptions {
  topK: number;
  minSimilarity: number;
  documentIds?: string[];
}

/**
 * Ranks stored chunks by cosine similarity to a query embedding.
 */
export function rankChunks(
  queryEmbedding: number[],
  chunks: StoredEmbeddedChunk[],
  options: RankOptions
): SourceReference[] {
  const allowedIds =
    options.documentIds && options.documentIds.length > 0
      ? new Set(options.documentIds)
      : null;

  const scored: SourceReference[] = [];
  for (const chunk of chunks) {
    if (allowedIds && !allowedIds.has(chunk.documentId)) continue;
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    if (similarity >= options.minSimilarity) {
      scored.push({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        pageNumber: chunk.pageNumber,
        chunkIndex: chunk.chunkIndex,
        similarity: Math.round(similarity * 10000) / 10000,
        excerpt: chunk.content,
      });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, Math.max(1, options.topK));
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Builds the grounded system instruction and user prompt for Gemini RAG answering.
 */
export function buildRagPrompt(
  question: string,
  retrievedChunks: SourceReference[],
  history: ConversationTurn[] = [],
  responseStyle: 'concise' | 'balanced' | 'detailed' = 'balanced'
): { systemInstruction: string; userPrompt: string } {
  const styleGuidance =
    responseStyle === 'concise'
      ? 'Keep the answer brief, focused, and easy to scan (2-4 short paragraphs or bullet points).'
      : responseStyle === 'detailed'
      ? 'Provide a thorough, well-structured explanation with definitions, step-by-step details, and examples directly supported by the excerpts.'
      : 'Provide a clear, well-structured answer with clean headings or bullet points where helpful.';

  const systemInstruction = [
    'You are an accurate Retrieval-Augmented Generation (RAG) PDF assistant.',
    'STRICT GROUNDING RULES:',
    '1. Base your answer strictly on the Retrieved PDF Context Excerpts provided below.',
    '2. Cite sources inline using the exact format [DocumentName, p. X] whenever stating facts from an excerpt.',
    '3. If the retrieved context does not contain sufficient information to answer the question, DO NOT guess, DO NOT use outside knowledge, and DO NOT fabricate citations. Clearly state: "I could not find information about this in the uploaded PDF documents." and briefly note what topics are visible in the retrieved excerpts if any.',
    '4. Never invent page numbers, chapters, statistics, or quotes.',
    `5. Style guidance: ${styleGuidance}`,
  ].join('\n');

  const contextBlock =
    retrievedChunks.length > 0
      ? retrievedChunks
          .map(
            (chunk, index) =>
              `--- EXCERPT ${index + 1} | Source: ${chunk.documentName} | Page ${chunk.pageNumber} | Cosine Similarity: ${(
                chunk.similarity * 100
              ).toFixed(1)}% ---\n${chunk.excerpt}`
          )
          .join('\n\n')
      : '(No relevant excerpts exceeded the similarity threshold.)';

  const recentHistory = history.slice(-6);
  const historyBlock =
    recentHistory.length > 0
      ? recentHistory
          .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
          .join('\n\n')
      : '';

  const userPrompt = [
    historyBlock ? `RECENT CONVERSATION HISTORY:\n${historyBlock}\n` : '',
    `RETRIEVED PDF CONTEXT EXCERPTS:\n${contextBlock}\n`,
    `USER QUESTION:\n${question.trim()}\n`,
    'Answer strictly using the retrieved PDF context excerpts above, citing [DocumentName, p. X].',
  ]
    .filter(Boolean)
    .join('\n');

  return { systemInstruction, userPrompt };
}
