import { ArrowRight, BookOpen, Eye, MessageSquare, Upload } from 'lucide-react';
import type { DashboardStats, DocumentRecord, SamplePdfInfo } from '../../shared/types';
import {
  formatDateTime,
  formatFileSize,
  formatStatusLabel,
  getStatusTextColor,
} from '../utils/format';
import type { NavSection } from './Sidebar';

interface DashboardViewProps {
  stats: DashboardStats | null;
  samples: SamplePdfInfo[];
  loading: boolean;
  importingSlug: string | null;
  onImportSample: (slug: string) => void;
  onNavigate: (section: NavSection) => void;
  onOpenConversation: (conversationId: string) => void;
  onPreviewDocument: (doc: DocumentRecord) => void;
}

const PIPELINE_STEPS = [
  { step: '01', title: 'PDF Extraction', detail: 'Extract page-accurate text via PDF.js' },
  { step: '02', title: 'Chunking', detail: 'Split with overlap preserving page numbers' },
  { step: '03', title: 'Embeddings', detail: 'Generate vectors via Gemini Embedding 2' },
  { step: '04', title: 'Cosine Search', detail: 'Rank top-K chunks by vector similarity' },
  { step: '05', title: 'Grounded Answer', detail: 'Generate cited responses with Gemini' },
];

export function DashboardView({
  stats,
  samples,
  loading,
  importingSlug,
  onImportSample,
  onNavigate,
  onOpenConversation,
  onPreviewDocument,
}: DashboardViewProps) {
  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  const data: DashboardStats = stats ?? {
    totalUploadedPdfs: 0,
    totalProcessedDocuments: 0,
    totalProcessingDocuments: 0,
    totalFailedDocuments: 0,
    totalChunksIndexed: 0,
    totalQuestionsAsked: 0,
    totalConversations: 0,
    totalSummariesGenerated: 0,
    totalQuestionSetsGenerated: 0,
    recentConversations: [],
    documents: [],
  };

  const kpis = [
    {
      label: 'Total Uploaded PDFs',
      value: data.totalUploadedPdfs,
      subtext: `${data.totalChunksIndexed} vector chunks indexed`,
    },
    {
      label: 'Processed Documents',
      value: data.totalProcessedDocuments,
      subtext:
        data.totalFailedDocuments > 0
          ? `${data.totalFailedDocuments} failed · ${data.totalProcessingDocuments} active`
          : 'Ready for semantic search',
    },
    {
      label: 'Total Questions Asked',
      value: data.totalQuestionsAsked,
      subtext: `Across ${data.totalConversations} conversation${data.totalConversations === 1 ? '' : 's'}`,
    },
    {
      label: 'Study Artifacts Created',
      value: data.totalSummariesGenerated + data.totalQuestionSetsGenerated,
      subtext: `${data.totalSummariesGenerated} summaries · ${data.totalQuestionSetsGenerated} question sets`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Primary Hero / Overview Strip */}
      <section className="flex flex-col justify-between gap-6 rounded-xl border border-blue-100 bg-white p-6 md:flex-row md:items-center">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            AI PDF Chatbot using Retrieval-Augmented Generation
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Upload PDF documents to extract text, build overlapping page-indexed chunks, generate
            Gemini vector embeddings, and ask grounded questions with accurate page citations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Upload className="h-4 w-4" />
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => onNavigate('chat')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 whitespace-nowrap transition-colors hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
          >
            <MessageSquare className="h-4 w-4" />
            Chat with PDF
          </button>
        </div>
      </section>

      {/* 4-column KPI Metrics */}
      <section aria-label="Workspace metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-5 py-5"
          >
            <div className="text-xs font-medium text-slate-500">{item.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {item.value}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 tabular-nums">{item.subtext}</div>
          </div>
        ))}
      </section>

      {/* Quick Start Sample PDFs Banner when no documents are uploaded yet */}
      {data.totalProcessedDocuments === 0 && samples.length > 0 && (
        <section className="rounded-xl border border-violet-200/80 bg-gradient-to-r from-blue-50/70 via-white to-violet-50/70 p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Get Started with Sample Academic PDFs
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Load a genuine multi-page PDF through the real extraction, chunking, and Gemini
                embedding pipeline to test semantic search and citations right away.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 shrink-0">
              {samples.map((sample) => (
                <button
                  key={sample.slug}
                  type="button"
                  disabled={importingSlug !== null}
                  onClick={() => onImportSample(sample.slug)}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3.5 py-2 text-xs font-medium text-violet-700 whitespace-nowrap transition-colors hover:bg-violet-50 disabled:opacity-60"
                >
                  {importingSlug === sample.slug ? 'Processing PDF...' : `Load ${sample.filename}`}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main 2-column content: Document Processing Status + Recent Conversations */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Document Processing Status */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Document Processing Status
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Indexed PDFs available for vector similarity search
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('library')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
            >
              View Library
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {data.documents.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No PDF documents uploaded yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Upload your first PDF or import a sample academic guide to populate the vector index.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('upload')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                Go to Upload PDF
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                    <th className="px-6 py-3">Document</th>
                    <th className="px-4 py-3 text-right">Pages</th>
                    <th className="px-4 py-3 text-right">Chunks</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.documents.slice(0, 6).map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-3.5">
                        <div className="max-w-[230px] truncate font-medium text-slate-900">
                          {doc.originalName}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                          {formatFileSize(doc.fileSize)} · {formatDateTime(doc.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                        {doc.pageCount}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs tabular-nums text-slate-700">
                        {doc.chunkCount}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`text-xs font-medium ${getStatusTextColor(doc.status)}`}
                        >
                          {formatStatusLabel(doc.status)}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => onPreviewDocument(doc)}
                          aria-label={`Preview ${doc.originalName}`}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent Conversations */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recent Conversations</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Continue your recent grounded Q&A threads
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('history')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
            >
              All History
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {data.recentConversations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No conversations yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Ask questions about your uploaded PDFs to start a grounded chat thread.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('chat')}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Open Chat with PDF
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentConversations.map((conv) => (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conv.id)}
                    className="block w-full px-6 py-4 text-left transition-colors hover:bg-blue-50/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="truncate text-sm font-medium text-slate-900">
                        {conv.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
                        {formatDateTime(conv.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {conv.lastMessagePreview || 'Empty conversation'}
                    </p>
                    <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                      {conv.messageCount} message{conv.messageCount === 1 ? '' : 's'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* RAG Architecture Pipeline Reference Strip */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Active RAG Pipeline Workflow
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Every uploaded PDF and user query executes all five stages server-side
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900 whitespace-nowrap"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Test Vector Search
          </button>
        </div>

        <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PIPELINE_STEPS.map((item) => (
            <li
              key={item.step}
              className="border-t border-slate-200 pt-3"
            >
              <div className="font-mono text-xs font-semibold text-blue-600 tabular-nums">
                {item.step}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{item.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
