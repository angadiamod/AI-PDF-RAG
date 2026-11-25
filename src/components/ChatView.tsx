import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  AlertCircle,
  BookOpen,
  Eye,
  FileText,
  Loader2,
  Plus,
  Send,
  Upload,
  X,
} from 'lucide-react';
import type {
  ConversationDetail,
  DocumentRecord,
  SourceReference,
} from '../../shared/types';
import { api } from '../api';
import { formatDateTime, formatSimilarityPercent } from '../utils/format';

interface ChatViewProps {
  documents: DocumentRecord[];
  activeConversation: ConversationDetail | null;
  onConversationUpdated: (conv: ConversationDetail) => void;
  onStartNewConversation: () => void;
  onNavigateUpload: () => void;
  onPreviewDocument: (doc: DocumentRecord, tab?: 'pdf' | 'chunks', page?: number) => void;
}

const SUGGESTED_QUESTIONS = [
  'Explain this PDF in simple words.',
  'Summarize the entire document.',
  'What are the important topics?',
  'Explain Chapter 2.',
  'What is the main objective of this document?',
  'Generate important questions from this document.',
];

export function ChatView({
  documents,
  activeConversation,
  onConversationUpdated,
  onStartNewConversation,
  onNavigateUpload,
  onPreviewDocument,
}: ChatViewProps) {
  const readyDocs = documents.filter((d) => d.status === 'ready');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectedSource, setInspectedSource] = useState<SourceReference | null>(null);
  const [lastRetrievalInfo, setLastRetrievalInfo] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef<number>(activeConversation?.messages.length ?? 0);

  useEffect(() => {
    const count = activeConversation?.messages.length ?? 0;
    if (sending || count > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = count;
  }, [activeConversation?.messages.length, sending]);

  function toggleDocumentScope(docId: string) {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }

  async function handleSend(questionOverride?: string) {
    const text = (questionOverride ?? input).trim();
    if (!text || sending) return;
    if (readyDocs.length === 0) {
      setError('Upload and process at least one PDF document before asking questions.');
      return;
    }

    setError(null);
    setSending(true);
    if (!questionOverride) setInput('');

    try {
      const response = await api.sendChatMessage({
        message: text,
        conversationId: activeConversation?.id,
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      });

      if (!response?.conversation || !response.assistantMessage) {
        throw new Error('Chat response was incomplete. Please try sending your question again.');
      }

      onConversationUpdated(response.conversation);
      setLastRetrievalInfo(
        `Searched ${response.retrievalMeta.chunksSearched} vector chunks · Matched ${
          response.retrievalMeta.chunksMatched
        } excerpt${response.retrievalMeta.chunksMatched === 1 ? '' : 's'}${
          response.retrievalMeta.topSimilarity > 0
            ? ` · Top cosine similarity ${formatSimilarityPercent(
                response.retrievalMeta.topSimilarity
              )}`
            : ''
        }`
      );

      if (response.assistantMessage.sources.length > 0) {
        setInspectedSource(response.assistantMessage.sources[0]);
      } else {
        setInspectedSource(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate RAG answer.');
      if (!questionOverride) setInput(text);
    } finally {
      setSending(false);
    }
  }

  const messages = activeConversation?.messages ?? [];

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[540px] flex-col gap-4 lg:flex-row">
      {/* Main Chat Column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Top Context Scope Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-900">
              {activeConversation ? activeConversation.title : 'Chat with PDF'}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {readyDocs.length === 0
                ? 'No indexed PDFs available yet'
                : selectedDocIds.length === 0
                ? `Searching across all ${readyDocs.length} indexed PDF${
                    readyDocs.length === 1 ? '' : 's'
                  }`
                : `Filtered to ${selectedDocIds.length} selected PDF${
                    selectedDocIds.length === 1 ? '' : 's'
                  }`}
              {lastRetrievalInfo ? ` · ${lastRetrievalInfo}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onStartNewConversation();
              setInspectedSource(null);
              setLastRetrievalInfo(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        {/* Document Filter Selector Row */}
        {readyDocs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-5 py-2.5">
            <span className="shrink-0 text-xs font-medium text-slate-500">Scope:</span>
            <button
              type="button"
              onClick={() => setSelectedDocIds([])}
              className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedDocIds.length === 0
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900'
              }`}
            >
              All PDFs ({readyDocs.length})
            </button>
            {readyDocs.map((doc) => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => toggleDocumentScope(doc.id)}
                  className={`max-w-[220px] shrink-0 truncate rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-violet-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300 hover:text-slate-900'
                  }`}
                >
                  {doc.originalName}
                </button>
              );
            })}
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {readyDocs.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center py-14 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Upload className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                Upload a PDF to start chatting
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                This chatbot answers strictly from your uploaded PDF documents using Gemini vector
                embeddings and cosine similarity search.
              </p>
              <button
                type="button"
                onClick={onNavigateUpload}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" />
                Upload or Load Sample PDF
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto max-w-2xl py-6">
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-6">
                <h2 className="text-lg font-semibold text-slate-900">
                  Welcome to AI PDF RAG Assistant
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Ask any natural language question about your indexed PDF documents. Every answer
                  is retrieved via cosine similarity search and grounded with exact source PDF and
                  page references. If information is missing from your PDFs, I will state so clearly
                  without inventing facts.
                </p>

                <div className="mt-4 border-t border-blue-100 pt-4 text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">Active Knowledge Base: </span>
                  {readyDocs.map((d) => `${d.originalName} (${d.pageCount}p)`).join(' · ')}
                </div>
              </div>

              <div className="mt-6">
                <div className="mb-3 text-xs font-semibold text-slate-500">
                  Suggested Questions
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={sending}
                      onClick={() => void handleSend(q)}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-800 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-xl px-4 py-3.5 text-sm ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'border border-slate-200 bg-slate-50/70 text-slate-800'
                      }`}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      ) : (
                        <div className="rag-prose">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}

                      {/* Source References attached to AI message */}
                      {!isUser && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 border-t border-slate-200/80 pt-3">
                          <div className="mb-2 text-xs font-semibold text-slate-600">
                            Source References ({msg.sources.length}) — click to inspect excerpt
                          </div>
                          <div className="space-y-1.5">
                            {msg.sources.map((src, idx) => {
                              const isSelected = inspectedSource?.chunkId === src.chunkId;
                              return (
                                <button
                                  key={`${msg.id}-${src.chunkId}-${idx}`}
                                  type="button"
                                  onClick={() => setInspectedSource(src)}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                                    isSelected
                                      ? 'border-blue-400 bg-blue-50 text-blue-900'
                                      : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/40'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <FileText className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                    <span className="truncate font-medium">
                                      {src.documentName}
                                    </span>
                                    <span className="shrink-0 font-mono text-slate-500 tabular-nums">
                                      Page {src.pageNumber}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-mono font-medium text-violet-700 tabular-nums">
                                    {formatSimilarityPercent(src.similarity)} match
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {!isUser && msg.foundInDocs === false && (
                        <div className="mt-3 border-t border-amber-200/80 pt-2.5 text-xs text-amber-800">
                          Grounded verification: No supporting evidence was found in the selected
                          PDF documents.
                        </div>
                      )}
                    </div>

                    <span className="mt-1 px-1 text-[11px] text-slate-400 tabular-nums">
                      {isUser ? 'You' : 'RAG Assistant'} · {formatDateTime(msg.createdAt)}
                    </span>
                  </div>
                );
              })}

              {sending && (
                <div className="flex items-start">
                  <div className="flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    <span>
                      Embedding question, running cosine similarity search & generating cited
                      answer...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mx-5 mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700"
          >
            <span className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="text-red-500 hover:text-red-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Question Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="border-t border-slate-200 bg-white px-5 py-3.5"
        >
          <label htmlFor="chat-question-input" className="sr-only">
            Ask a question about your uploaded PDFs
          </label>
          <div className="flex items-end gap-2.5">
            <textarea
              id="chat-question-input"
              rows={2}
              value={input}
              disabled={sending || readyDocs.length === 0}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                readyDocs.length === 0
                  ? 'Upload a PDF document first to ask questions...'
                  : 'Ask a question about your PDFs (Enter to send, Shift+Enter for new line)...'
              }
              className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || readyDocs.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Right Source Reference Inspector Panel */}
      <aside
        aria-label="Source reference inspector"
        className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:w-80 xl:w-96"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Source Reference Inspector</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Verify exact PDF passages retrieved by cosine search
            </p>
          </div>
          {inspectedSource && (
            <button
              type="button"
              onClick={() => setInspectedSource(null)}
              aria-label="Clear selected source"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!inspectedSource ? (
            <div className="flex h-full flex-col items-center justify-center py-8 text-center">
              <BookOpen className="h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No citation selected</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Click any source reference beneath an AI answer to inspect the verbatim retrieved
                PDF excerpt, page number, and cosine similarity score.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-slate-500">Source Document</div>
                <div className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {inspectedSource.documentName}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3">
                <div>
                  <div className="text-[11px] text-slate-500">Page</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {inspectedSource.pageNumber}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Chunk</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    #{inspectedSource.chunkIndex + 1}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Similarity</div>
                  <div className="mt-0.5 font-mono text-sm font-semibold text-violet-700 tabular-nums">
                    {formatSimilarityPercent(inspectedSource.similarity)}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-slate-500">
                  Retrieved Text Excerpt
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {inspectedSource.excerpt}
                </div>
              </div>

              {(() => {
                const matchedDoc = documents.find((d) => d.id === inspectedSource.documentId);
                if (!matchedDoc) return null;
                return (
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewDocument(matchedDoc, 'chunks', inspectedSource.pageNumber)
                    }
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100/70"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Open Page {inspectedSource.pageNumber} in Document Viewer
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
