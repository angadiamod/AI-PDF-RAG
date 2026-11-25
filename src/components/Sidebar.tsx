import {
  BookOpen,
  FileText,
  HelpCircle,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';

export type NavSection =
  | 'dashboard'
  | 'upload'
  | 'chat'
  | 'library'
  | 'summarizer'
  | 'questions'
  | 'history'
  | 'settings';

interface NavItem {
  id: NavSection;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload PDF', icon: Upload },
  { id: 'chat', label: 'Chat with PDF', icon: MessageSquare },
  { id: 'library', label: 'Document Library', icon: BookOpen },
  { id: 'summarizer', label: 'AI Summarizer', icon: FileText },
  { id: 'questions', label: 'Question Generator', icon: HelpCircle },
  { id: 'history', label: 'Chat History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  readyDocCount: number;
  conversationCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  readyDocCount,
  conversationCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const content = (
    <div className="flex h-full flex-col border-r border-slate-200/90 bg-white">
      {/* Brand header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
        <button
          type="button"
          onClick={() => {
            onSelectSection('dashboard');
            onCloseMobile();
          }}
          className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white font-display text-sm font-bold tracking-tight">
            RAG
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-[15px] font-bold tracking-tight text-slate-900">
              AI PDF Chatbot
            </span>
            <span className="block truncate text-[11px] font-medium text-slate-500">
              Retrieval-Augmented
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          const count =
            item.id === 'library'
              ? readyDocCount
              : item.id === 'history'
              ? conversationCount
              : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-blue-600' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {count !== null && count > 0 && (
                <span className="ml-2 font-mono text-xs tabular-nums text-slate-400">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quiet workspace footer summary */}
      <div className="border-t border-slate-100 px-5 py-4 text-xs text-slate-500">
        <div className="font-medium text-slate-700">Vector Knowledge Base</div>
        <div className="mt-1 font-mono tabular-nums text-slate-500">
          {readyDocCount} PDF{readyDocCount === 1 ? '' : 's'} indexed · Cosine Search
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{content}</aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Dismiss navigation overlay"
            onClick={onCloseMobile}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
          />
          <aside className="relative z-10 w-64 max-w-[82vw]">{content}</aside>
        </div>
      )}
    </>
  );
}
