import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  ChapterInfo,
  ChatMessage,
  ChunkRecord,
  ConversationDetail,
  ConversationRecord,
  DashboardStats,
  DifficultyLevel,
  DocumentRecord,
  DocumentStatus,
  GeneratedQuestion,
  QuestionSetRecord,
  QuestionType,
  RagSettings,
  SourceReference,
  SummaryMode,
  SummaryRecord,
} from '../shared/types';
import type { StoredEmbeddedChunk } from './rag';

function resolveWritableDataDir(): string {
  const preferred = path.resolve(process.cwd(), 'data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'ai-pdf-rag-data');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const DATA_DIR = resolveWritableDataDir();
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const SAMPLES_DIR = path.join(DATA_DIR, 'samples');
const DB_PATH = path.join(DATA_DIR, 'rag.sqlite');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(SAMPLES_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading',
    error_message TEXT,
    file_path TEXT NOT NULL,
    chapters_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    embedding_json TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    found_in_docs INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    mode TEXT NOT NULL,
    chapter_title TEXT,
    summary TEXT NOT NULL,
    key_points_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS question_sets (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    document_name TEXT NOT NULL,
    question_type TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    questions_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export const DEFAULT_SETTINGS: RagSettings = {
  chunkSize: 900,
  chunkOverlap: 180,
  topK: 5,
  minSimilarity: 0.32,
  responseStyle: 'balanced',
  maxFileSizeMb: 20,
};

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getSettings(): RagSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    chunkSize: Number(map.get('chunkSize') ?? DEFAULT_SETTINGS.chunkSize),
    chunkOverlap: Number(map.get('chunkOverlap') ?? DEFAULT_SETTINGS.chunkOverlap),
    topK: Number(map.get('topK') ?? DEFAULT_SETTINGS.topK),
    minSimilarity: Number(map.get('minSimilarity') ?? DEFAULT_SETTINGS.minSimilarity),
    responseStyle:
      (map.get('responseStyle') as RagSettings['responseStyle']) ??
      DEFAULT_SETTINGS.responseStyle,
    maxFileSizeMb: Number(map.get('maxFileSizeMb') ?? DEFAULT_SETTINGS.maxFileSizeMb),
  };
}

export function updateSettings(partial: Partial<RagSettings>): RagSettings {
  const current = getSettings();
  const merged: RagSettings = {
    chunkSize: Math.max(300, Math.min(2500, Math.round(partial.chunkSize ?? current.chunkSize))),
    chunkOverlap: Math.max(
      0,
      Math.min(600, Math.round(partial.chunkOverlap ?? current.chunkOverlap))
    ),
    topK: Math.max(1, Math.min(12, Math.round(partial.topK ?? current.topK))),
    minSimilarity: Math.max(
      0.1,
      Math.min(0.9, Math.round((partial.minSimilarity ?? current.minSimilarity) * 100) / 100)
    ),
    responseStyle:
      partial.responseStyle === 'concise' ||
      partial.responseStyle === 'balanced' ||
      partial.responseStyle === 'detailed'
        ? partial.responseStyle
        : current.responseStyle,
    maxFileSizeMb: Math.max(1, Math.min(50, Math.round(partial.maxFileSizeMb ?? current.maxFileSizeMb))),
  };

  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((s: RagSettings) => {
    for (const [key, value] of Object.entries(s)) {
      upsert.run(key, String(value));
    }
  });
  tx(merged);
  return merged;
}

interface DocumentRow {
  id: string;
  filename: string;
  original_name: string;
  file_size: number;
  page_count: number;
  chunk_count: number;
  status: DocumentStatus;
  error_message: string | null;
  file_path: string;
  chapters_json: string;
  created_at: string;
}

function mapDocumentRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    filename: row.filename,
    originalName: row.original_name,
    fileSize: row.file_size,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    status: row.status,
    errorMessage: row.error_message,
    chapters: safeJsonParse<ChapterInfo[]>(row.chapters_json, []),
    createdAt: row.created_at,
  };
}

export function createDocumentRecord(input: {
  id?: string;
  filename: string;
  originalName: string;
  fileSize: number;
  filePath: string;
  status?: DocumentStatus;
}): DocumentRecord {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO documents (id, filename, original_name, file_size, page_count, chunk_count, status, error_message, file_path, chapters_json, created_at)
     VALUES (?, ?, ?, ?, 0, 0, ?, NULL, ?, '[]', ?)`
  ).run(
    id,
    input.filename,
    input.originalName,
    input.fileSize,
    input.status ?? 'uploading',
    input.filePath,
    createdAt
  );
  return getDocumentById(id)!;
}

export function updateDocumentState(
  id: string,
  updates: {
    status?: DocumentStatus;
    pageCount?: number;
    chunkCount?: number;
    errorMessage?: string | null;
    chapters?: ChapterInfo[];
  }
): DocumentRecord | null {
  const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | DocumentRow
    | undefined;
  if (!existing) return null;

  db.prepare(
    `UPDATE documents
     SET status = ?, page_count = ?, chunk_count = ?, error_message = ?, chapters_json = ?
     WHERE id = ?`
  ).run(
    updates.status ?? existing.status,
    updates.pageCount ?? existing.page_count,
    updates.chunkCount ?? existing.chunk_count,
    updates.errorMessage !== undefined ? updates.errorMessage : existing.error_message,
    updates.chapters ? JSON.stringify(updates.chapters) : existing.chapters_json,
    id
  );
  return getDocumentById(id);
}

export function listDocuments(): DocumentRecord[] {
  const rows = db
    .prepare('SELECT * FROM documents ORDER BY created_at DESC')
    .all() as DocumentRow[];
  return rows.map(mapDocumentRow);
}

export function getDocumentById(id: string): DocumentRecord | null {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | DocumentRow
    | undefined;
  return row ? mapDocumentRow(row) : null;
}

export function getDocumentFilePath(id: string): { filePath: string; originalName: string } | null {
  const row = db
    .prepare('SELECT file_path, original_name FROM documents WHERE id = ?')
    .get(id) as { file_path: string; original_name: string } | undefined;
  if (!row) return null;
  return { filePath: row.file_path, originalName: row.original_name };
}

export function deleteDocument(id: string): boolean {
  const fileInfo = getDocumentFilePath(id);
  const res = db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  if (fileInfo && fs.existsSync(fileInfo.filePath)) {
    try {
      fs.unlinkSync(fileInfo.filePath);
    } catch {
      // Ignore cleanup failures
    }
  }
  return res.changes > 0;
}

export function replaceDocumentChunks(
  documentId: string,
  chunks: Array<{
    documentId: string;
    documentName: string;
    pageNumber: number;
    chunkIndex: number;
    content: string;
    charCount: number;
    embedding: number[];
  }>
): void {
  const del = db.prepare('DELETE FROM chunks WHERE document_id = ?');
  const ins = db.prepare(
    `INSERT INTO chunks (id, document_id, document_name, page_number, chunk_index, content, char_count, embedding_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(() => {
    del.run(documentId);
    for (const chunk of chunks) {
      ins.run(
        crypto.randomUUID(),
        chunk.documentId,
        chunk.documentName,
        chunk.pageNumber,
        chunk.chunkIndex,
        chunk.content,
        chunk.charCount,
        JSON.stringify(chunk.embedding)
      );
    }
  });
  tx();
}

export function getDocumentChunks(documentId: string): ChunkRecord[] {
  const rows = db
    .prepare(
      `SELECT id, document_id, document_name, page_number, chunk_index, content, char_count
       FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC`
    )
    .all(documentId) as Array<{
    id: string;
    document_id: string;
    document_name: string;
    page_number: number;
    chunk_index: number;
    content: string;
    char_count: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    pageNumber: r.page_number,
    chunkIndex: r.chunk_index,
    content: r.content,
    charCount: r.char_count,
  }));
}

export function getAllEmbeddedChunks(documentIds?: string[]): StoredEmbeddedChunk[] {
  let rows: Array<{
    id: string;
    document_id: string;
    document_name: string;
    page_number: number;
    chunk_index: number;
    content: string;
    embedding_json: string;
  }>;

  if (documentIds && documentIds.length > 0) {
    const placeholders = documentIds.map(() => '?').join(',');
    rows = db
      .prepare(
        `SELECT c.id, c.document_id, c.document_name, c.page_number, c.chunk_index, c.content, c.embedding_json
         FROM chunks c
         INNER JOIN documents d ON d.id = c.document_id
         WHERE d.status = 'ready' AND c.document_id IN (${placeholders})`
      )
      .all(...documentIds) as typeof rows;
  } else {
    rows = db
      .prepare(
        `SELECT c.id, c.document_id, c.document_name, c.page_number, c.chunk_index, c.content, c.embedding_json
         FROM chunks c
         INNER JOIN documents d ON d.id = c.document_id
         WHERE d.status = 'ready'`
      )
      .all() as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    pageNumber: r.page_number,
    chunkIndex: r.chunk_index,
    content: r.content,
    embedding: safeJsonParse<number[]>(r.embedding_json, []),
  }));
}

export function createConversation(title: string, documentIds: string[] = []): ConversationRecord {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, title, document_ids_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, title, JSON.stringify(documentIds), now, now);

  return {
    id,
    title,
    documentIds,
    messageCount: 0,
    lastMessagePreview: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function updateConversationMeta(
  id: string,
  updates: { title?: string; documentIds?: string[] }
): void {
  const existing = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | { id: string; title: string; document_ids_json: string }
    | undefined;
  if (!existing) return;

  db.prepare(
    `UPDATE conversations SET title = ?, document_ids_json = ?, updated_at = ? WHERE id = ?`
  ).run(
    updates.title ?? existing.title,
    updates.documentIds ? JSON.stringify(updates.documentIds) : existing.document_ids_json,
    new Date().toISOString(),
    id
  );
}

export function listConversations(): ConversationRecord[] {
  const rows = db
    .prepare(
      `SELECT
        c.id,
        c.title,
        c.document_ids_json,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT m2.content FROM messages m2 WHERE m2.conversation_id = c.id ORDER BY m2.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       ORDER BY c.updated_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    document_ids_json: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    last_message: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    documentIds: safeJsonParse<string[]>(r.document_ids_json, []),
    messageCount: r.message_count,
    lastMessagePreview: (r.last_message ?? '').slice(0, 140),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getConversationDetail(id: string): ConversationDetail | null {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | {
        id: string;
        title: string;
        document_ids_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;

  const msgRows = db
    .prepare(
      `SELECT id, conversation_id, role, content, sources_json, found_in_docs, created_at
       FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
    )
    .all(id) as Array<{
    id: string;
    conversation_id: string;
    role: 'user' | 'assistant';
    content: string;
    sources_json: string;
    found_in_docs: number;
    created_at: string;
  }>;

  const messages: ChatMessage[] = msgRows.map((m) => ({
    id: m.id,
    conversationId: m.conversation_id,
    role: m.role,
    content: m.content,
    sources: safeJsonParse<SourceReference[]>(m.sources_json, []),
    foundInDocs: m.found_in_docs === 1,
    createdAt: m.created_at,
  }));

  return {
    id: row.id,
    title: row.title,
    documentIds: safeJsonParse<string[]>(row.document_ids_json, []),
    messageCount: messages.length,
    lastMessagePreview: messages.length > 0 ? messages[messages.length - 1].content.slice(0, 140) : '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

export function addChatMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceReference[];
  foundInDocs?: boolean;
}): ChatMessage {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const sources = input.sources ?? [];
  const foundInDocs = input.foundInDocs ?? true;

  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, sources_json, found_in_docs, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.conversationId,
    input.role,
    input.content,
    JSON.stringify(sources),
    foundInDocs ? 1 : 0,
    createdAt
  );

  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
    createdAt,
    input.conversationId
  );

  return {
    id,
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    sources,
    foundInDocs,
    createdAt,
  };
}

export function deleteConversation(id: string): boolean {
  const res = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  return res.changes > 0;
}

export function clearAllConversations(): number {
  const res = db.prepare('DELETE FROM conversations').run();
  return res.changes;
}

export function saveSummary(input: {
  documentId: string;
  documentName: string;
  mode: SummaryMode;
  chapterTitle: string | null;
  summary: string;
  keyPoints: string[];
}): SummaryRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO summaries (id, document_id, document_name, mode, chapter_title, summary, key_points_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.documentId,
    input.documentName,
    input.mode,
    input.chapterTitle,
    input.summary,
    JSON.stringify(input.keyPoints),
    createdAt
  );

  return {
    id,
    documentId: input.documentId,
    documentName: input.documentName,
    mode: input.mode,
    chapterTitle: input.chapterTitle,
    summary: input.summary,
    keyPoints: input.keyPoints,
    createdAt,
  };
}

export function listSummaries(): SummaryRecord[] {
  const rows = db
    .prepare('SELECT * FROM summaries ORDER BY created_at DESC LIMIT 30')
    .all() as Array<{
    id: string;
    document_id: string;
    document_name: string;
    mode: SummaryMode;
    chapter_title: string | null;
    summary: string;
    key_points_json: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    mode: r.mode,
    chapterTitle: r.chapter_title,
    summary: r.summary,
    keyPoints: safeJsonParse<string[]>(r.key_points_json, []),
    createdAt: r.created_at,
  }));
}

export function saveQuestionSet(input: {
  documentId: string;
  documentName: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  questions: GeneratedQuestion[];
}): QuestionSetRecord {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO question_sets (id, document_id, document_name, question_type, difficulty, questions_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.documentId,
    input.documentName,
    input.questionType,
    input.difficulty,
    JSON.stringify(input.questions),
    createdAt
  );

  return {
    id,
    documentId: input.documentId,
    documentName: input.documentName,
    questionType: input.questionType,
    difficulty: input.difficulty,
    questions: input.questions,
    createdAt,
  };
}

export function listQuestionSets(): QuestionSetRecord[] {
  const rows = db
    .prepare('SELECT * FROM question_sets ORDER BY created_at DESC LIMIT 30')
    .all() as Array<{
    id: string;
    document_id: string;
    document_name: string;
    question_type: QuestionType;
    difficulty: DifficultyLevel;
    questions_json: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    documentName: r.document_name,
    questionType: r.question_type,
    difficulty: r.difficulty,
    questions: safeJsonParse<GeneratedQuestion[]>(r.questions_json, []),
    createdAt: r.created_at,
  }));
}

export function getDashboardStats(): DashboardStats {
  const docs = listDocuments();
  const totalUploadedPdfs = docs.length;
  const totalProcessedDocuments = docs.filter((d) => d.status === 'ready').length;
  const totalProcessingDocuments = docs.filter(
    (d) =>
      d.status === 'uploading' ||
      d.status === 'extracting' ||
      d.status === 'chunking' ||
      d.status === 'embedding'
  ).length;
  const totalFailedDocuments = docs.filter((d) => d.status === 'error').length;

  const chunkCountRow = db.prepare('SELECT COUNT(*) AS count FROM chunks').get() as {
    count: number;
  };
  const questionCountRow = db
    .prepare("SELECT COUNT(*) AS count FROM messages WHERE role = 'user'")
    .get() as { count: number };
  const convCountRow = db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as {
    count: number;
  };
  const summaryCountRow = db.prepare('SELECT COUNT(*) AS count FROM summaries').get() as {
    count: number;
  };
  const qSetCountRow = db.prepare('SELECT COUNT(*) AS count FROM question_sets').get() as {
    count: number;
  };

  return {
    totalUploadedPdfs,
    totalProcessedDocuments,
    totalProcessingDocuments,
    totalFailedDocuments,
    totalChunksIndexed: chunkCountRow.count,
    totalQuestionsAsked: questionCountRow.count,
    totalConversations: convCountRow.count,
    totalSummariesGenerated: summaryCountRow.count,
    totalQuestionSetsGenerated: qSetCountRow.count,
    recentConversations: listConversations().slice(0, 5),
    documents: docs,
  };
}
