export type DocumentStatus =
  | 'uploading'
  | 'extracting'
  | 'chunking'
  | 'embedding'
  | 'ready'
  | 'error';

export interface ChapterInfo {
  title: string;
  startPage: number;
  endPage: number;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  originalName: string;
  fileSize: number;
  pageCount: number;
  chunkCount: number;
  status: DocumentStatus;
  errorMessage: string | null;
  chapters: ChapterInfo[];
  createdAt: string;
}

export interface ChunkRecord {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  charCount: number;
  embedding?: number[];
}

export interface SourceReference {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  similarity: number;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  foundInDocs?: boolean;
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  title: string;
  documentIds: string[];
  messageCount: number;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationRecord {
  messages: ChatMessage[];
}

export type SummaryMode = 'short' | 'detailed' | 'chapter' | 'key_points';

export interface SummaryRecord {
  id: string;
  documentId: string;
  documentName: string;
  mode: SummaryMode;
  chapterTitle: string | null;
  summary: string;
  keyPoints: string[];
  createdAt: string;
}

export type QuestionType = 'mcq' | 'short' | 'long' | 'exam';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface GeneratedQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  answer: string;
  explanation: string;
  pageReference: string;
  marks?: number;
}

export interface QuestionSetRecord {
  id: string;
  documentId: string;
  documentName: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  questions: GeneratedQuestion[];
  createdAt: string;
}

export interface RagSettings {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  minSimilarity: number;
  responseStyle: 'concise' | 'balanced' | 'detailed';
  maxFileSizeMb: number;
}

export interface DashboardStats {
  totalUploadedPdfs: number;
  totalProcessedDocuments: number;
  totalProcessingDocuments: number;
  totalFailedDocuments: number;
  totalChunksIndexed: number;
  totalQuestionsAsked: number;
  totalConversations: number;
  totalSummariesGenerated: number;
  totalQuestionSetsGenerated: number;
  recentConversations: ConversationRecord[];
  documents: DocumentRecord[];
}

export interface SamplePdfInfo {
  slug: string;
  filename: string;
  title: string;
  description: string;
  pages: number;
  topics: string[];
  alreadyImported: boolean;
}

export interface SearchResultItem {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  similarity: number;
  content: string;
}
