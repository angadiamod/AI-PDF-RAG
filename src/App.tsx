import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Menu, MessageSquare, Upload, X } from 'lucide-react';
import type {
  ConversationDetail,
  ConversationRecord,
  DashboardStats,
  DocumentRecord,
  QuestionSetRecord,
  RagSettings,
  SamplePdfInfo,
  SummaryRecord,
} from '../shared/types';
import { api } from './api';
import { ChatView } from './components/ChatView';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { LibraryView } from './components/LibraryView';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { QuestionGeneratorView } from './components/QuestionGeneratorView';
import { SettingsView } from './components/SettingsView';
import { NAV_ITEMS, Sidebar, type NavSection } from './components/Sidebar';
import { SummarizerView } from './components/SummarizerView';
import { UploadView } from './components/UploadView';

const DEFAULT_SETTINGS: RagSettings = {
  chunkSize: 900,
  chunkOverlap: 180,
  topK: 5,
  minSimilarity: 0.32,
  responseStyle: 'balanced',
  maxFileSizeMb: 20,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [summaries, setSummaries] = useState<SummaryRecord[]>([]);
  const [questionSets, setQuestionSets] = useState<QuestionSetRecord[]>([]);
  const [samples, setSamples] = useState<SamplePdfInfo[]>([]);
  const [settings, setSettings] = useState<RagSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState({
    generation: 'gemini-4-hydrogen',
    embedding: 'gemini-embedding-2',
  });

  const [loading, setLoading] = useState(true);
  const [importingSlug, setImportingSlug] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'error' | 'info'; message: string } | null>(null);

  const [previewState, setPreviewState] = useState<{
    document: DocumentRecord | null;
    tab: 'pdf' | 'chunks';
    page: number | null;
  }>({ document: null, tab: 'pdf', page: null });

  const refreshWorkspace = useCallback(async () => {
    try {
      const [dashData, convData, sumData, qData, sampleData, settingsData] = await Promise.all([
        api.getDashboard(),
        api.getConversations(),
        api.getSummaries(),
        api.getQuestionSets(),
        api.getSamples(),
        api.getSettings(),
      ]);
      setDashboard(dashData);
      setDocuments(dashData.documents);
      setConversations(convData.conversations);
      setSummaries(sumData.summaries);
      setQuestionSets(qData.questionSets);
      setSamples(sampleData.samples);
      setSettings(settingsData.settings);
      setModels(settingsData.models);
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load workspace data.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  async function handleImportSample(slug: string) {
    setImportingSlug(slug);
    setBanner(null);
    try {
      const res = await api.importSample(slug);
      await refreshWorkspace();
      setBanner({
        type: 'info',
        message: `Processed "${res.document.originalName}" (${res.document.pageCount} pages, ${res.document.chunkCount} embedded chunks). Ready for semantic search and Q&A.`,
      });
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to import sample PDF.',
      });
    } finally {
      setImportingSlug(null);
    }
  }

  async function handleDeleteDocument(id: string) {
    setBanner(null);
    try {
      await api.deleteDocument(id);
      if (previewState.document?.id === id) {
        setPreviewState({ document: null, tab: 'pdf', page: null });
      }
      await refreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to remove document.',
      });
    }
  }

  async function handleOpenConversation(conversationId: string) {
    setBanner(null);
    try {
      const res = await api.getConversation(conversationId);
      setActiveConversation(res.conversation);
      setActiveSection('chat');
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not open conversation.',
      });
    }
  }

  function handleStartNewConversation() {
    setActiveConversation(null);
    setActiveSection('chat');
  }

  async function handleDeleteConversation(id: string) {
    try {
      await api.deleteConversation(id);
      if (activeConversation?.id === id) {
        setActiveConversation(null);
      }
      await refreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to delete conversation.',
      });
    }
  }

  async function handleClearAllConversations() {
    try {
      await api.clearAllConversations();
      setActiveConversation(null);
      await refreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to clear chat history.',
      });
    }
  }

  function handlePreviewDocument(
    doc: DocumentRecord,
    tab: 'pdf' | 'chunks' = 'pdf',
    page: number | null = null
  ) {
    setPreviewState({ document: doc, tab, page });
  }

  const readyDocCount = documents.filter((d) => d.status === 'ready').length;
  const activeNavMeta = NAV_ITEMS.find((item) => item.id === activeSection);

  return (
    <div className="flex min-h-screen bg-[#F4F8FC] text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        readyDocCount={readyDocCount}
        conversationCount={conversations.length}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Contextual Workspace Header (SaaS Top Bar Contract) */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-200/90 bg-white/95 px-4 backdrop-blur-xs sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 truncate text-sm">
              <span className="hidden text-slate-400 sm:inline">AI PDF RAG</span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
                /
              </span>
              <span className="truncate font-semibold text-slate-900">
                {activeNavMeta?.label ?? 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="shrink-0">
            {activeSection === 'dashboard' ||
            activeSection === 'upload' ||
            activeSection === 'library' ? (
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 whitespace-nowrap transition-colors hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-700"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                New Chat
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveSection('upload')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-700"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload PDF
              </button>
            )}
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-8 sm:py-7">
          {banner && (
            <div
              role={banner.type === 'error' ? 'alert' : 'status'}
              className={`mb-6 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                banner.type === 'error'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-blue-200 bg-blue-50 text-blue-900'
              }`}
            >
              <span className="flex items-start gap-2.5">
                {banner.type === 'error' && (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <span>{banner.message}</span>
              </span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeSection === 'dashboard' && (
            <DashboardView
              stats={dashboard}
              samples={samples}
              loading={loading}
              importingSlug={importingSlug}
              onImportSample={(slug) => void handleImportSample(slug)}
              onNavigate={setActiveSection}
              onOpenConversation={(id) => void handleOpenConversation(id)}
              onPreviewDocument={(doc) => handlePreviewDocument(doc, 'pdf')}
            />
          )}

          {activeSection === 'upload' && (
            <UploadView
              documents={documents}
              samples={samples}
              settings={settings}
              importingSlug={importingSlug}
              onImportSample={(slug) => void handleImportSample(slug)}
              onDocumentsChanged={refreshWorkspace}
              onPreviewDocument={(doc, tab) => handlePreviewDocument(doc, tab)}
              onDeleteDocument={handleDeleteDocument}
            />
          )}

          {activeSection === 'chat' && (
            <ChatView
              documents={documents}
              activeConversation={activeConversation}
              onConversationUpdated={(conv) => {
                setActiveConversation(conv);
                void refreshWorkspace();
              }}
              onStartNewConversation={handleStartNewConversation}
              onNavigateUpload={() => setActiveSection('upload')}
              onPreviewDocument={(doc, tab, page) =>
                handlePreviewDocument(doc, tab ?? 'chunks', page ?? null)
              }
            />
          )}

          {activeSection === 'library' && (
            <LibraryView
              documents={documents}
              onPreviewDocument={(doc, tab, page) =>
                handlePreviewDocument(doc, tab ?? 'pdf', page ?? null)
              }
              onDeleteDocument={handleDeleteDocument}
              onNavigateUpload={() => setActiveSection('upload')}
            />
          )}

          {activeSection === 'summarizer' && (
            <SummarizerView
              documents={documents}
              summaries={summaries}
              onSummaryCreated={(summary) => {
                if (summary && summary.id) {
                  setSummaries((prev) => [summary, ...prev.filter((s) => s && s.id !== summary.id)]);
                }
                void refreshWorkspace();
              }}
              onNavigateUpload={() => setActiveSection('upload')}
            />
          )}

          {activeSection === 'questions' && (
            <QuestionGeneratorView
              documents={documents}
              questionSets={questionSets}
              onQuestionSetCreated={(set) => {
                if (set && set.id) {
                  setQuestionSets((prev) => [set, ...prev.filter((q) => q && q.id !== set.id)]);
                }
                void refreshWorkspace();
              }}
              onNavigateUpload={() => setActiveSection('upload')}
            />
          )}

          {activeSection === 'history' && (
            <HistoryView
              conversations={conversations}
              onOpenConversation={(id) => void handleOpenConversation(id)}
              onStartNewConversation={handleStartNewConversation}
              onDeleteConversation={handleDeleteConversation}
              onClearAllConversations={handleClearAllConversations}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsView
              settings={settings}
              models={models}
              onSettingsUpdated={(updated) => setSettings(updated)}
            />
          )}
        </main>
      </div>

      <PdfPreviewModal
        document={previewState.document}
        initialTab={previewState.tab}
        highlightPage={previewState.page}
        onClose={() => setPreviewState({ document: null, tab: 'pdf', page: null })}
      />
    </div>
  );
}
