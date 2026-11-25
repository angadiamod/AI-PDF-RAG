import type {
  ChatMessage,
  ChunkRecord,
  ConversationDetail,
  ConversationRecord,
  DashboardStats,
  DifficultyLevel,
  DocumentRecord,
  QuestionSetRecord,
  QuestionType,
  RagSettings,
  SamplePdfInfo,
  SearchResultItem,
  SummaryMode,
  SummaryRecord,
} from '../shared/types';

function parseErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    if (parsed?.error?.message) return parsed.error.message;
    if (parsed?.message) return parsed.message;
  } catch {
    // Plain text message
  }
  return raw;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();

  let data: (T & { error?: string }) | null = null;
  if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    try {
      data = JSON.parse(text) as T & { error?: string };
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg = parseErrorMessage(
      data?.error,
      res.status === 503 || res.status === 504
        ? 'The AI service is temporarily busy or timed out. Please try again.'
        : `Request failed with status ${res.status}.`
    );
    throw new Error(msg);
  }

  if (data === null) {
    throw new Error('Server returned an unexpected non-JSON response. Please try again.');
  }

  return data;
}

export const api = {
  getDashboard(): Promise<DashboardStats> {
    return requestJson('/api/dashboard');
  },

  getDocuments(): Promise<{ documents: DocumentRecord[] }> {
    return requestJson('/api/documents');
  },

  getDocumentChunks(id: string): Promise<{ document: DocumentRecord; chunks: ChunkRecord[] }> {
    return requestJson(`/api/documents/${encodeURIComponent(id)}/chunks`);
  },

  getDocumentFileUrl(id: string): string {
    return `/api/documents/${encodeURIComponent(id)}/file`;
  },

  uploadPdf(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{
    results: Array<{
      originalName: string;
      document?: DocumentRecord;
      pipelineLog?: string[];
      error?: string;
    }>;
  }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('files', file);

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || parsed.results?.[0]?.error || `Upload failed (${xhr.status})`));
          }
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error while uploading PDF file.'));
      });

      xhr.open('POST', '/api/documents/upload');
      xhr.send(formData);
    });
  },

  deleteDocument(id: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  getSamples(): Promise<{ samples: SamplePdfInfo[] }> {
    return requestJson('/api/samples');
  },

  getSampleDownloadUrl(slug: string): string {
    return `/api/samples/${encodeURIComponent(slug)}/download`;
  },

  importSample(slug: string): Promise<{ document: DocumentRecord; pipelineLog: string[] }> {
    return requestJson(`/api/samples/${encodeURIComponent(slug)}/import`, {
      method: 'POST',
    });
  },

  semanticSearch(payload: {
    query: string;
    documentIds?: string[];
    topK?: number;
    minSimilarity?: number;
  }): Promise<{
    query: string;
    embeddingDimensions: number;
    totalChunksSearched: number;
    results: SearchResultItem[];
  }> {
    return requestJson('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getConversations(): Promise<{ conversations: ConversationRecord[] }> {
    return requestJson('/api/conversations');
  },

  createConversation(payload?: {
    title?: string;
    documentIds?: string[];
  }): Promise<{ conversation: ConversationRecord }> {
    return requestJson('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  },

  getConversation(id: string): Promise<{ conversation: ConversationDetail }> {
    return requestJson(`/api/conversations/${encodeURIComponent(id)}`);
  },

  deleteConversation(id: string): Promise<{ deleted: boolean }> {
    return requestJson(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  clearAllConversations(): Promise<{ deletedCount: number }> {
    return requestJson('/api/conversations', { method: 'DELETE' });
  },

  sendChatMessage(payload: {
    message: string;
    conversationId?: string;
    documentIds?: string[];
  }): Promise<{
    conversation: ConversationDetail;
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    retrievalMeta: {
      chunksSearched: number;
      chunksMatched: number;
      topSimilarity: number;
    };
  }> {
    return requestJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getSummaries(): Promise<{ summaries: SummaryRecord[] }> {
    return requestJson('/api/summaries');
  },

  generateSummary(payload: {
    documentId: string;
    mode: SummaryMode;
    chapterTitle?: string | null;
  }): Promise<{ summary: SummaryRecord }> {
    return requestJson('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getQuestionSets(): Promise<{ questionSets: QuestionSetRecord[] }> {
    return requestJson('/api/questions');
  },

  generateQuestions(payload: {
    documentId: string;
    questionType: QuestionType;
    difficulty: DifficultyLevel;
    count: number;
  }): Promise<{ questionSet: QuestionSetRecord }> {
    return requestJson('/api/questions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getSettings(): Promise<{
    settings: RagSettings;
    models: { generation: string; embedding: string };
  }> {
    return requestJson('/api/settings');
  },

  updateSettings(settings: Partial<RagSettings>): Promise<{ settings: RagSettings }> {
    return requestJson('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },
};
