import { useState } from 'react';
import { ArrowRight, History, Plus, Search, Trash2 } from 'lucide-react';
import type { ConversationRecord } from '../../shared/types';
import { formatDateTime } from '../utils/format';

interface HistoryViewProps {
  conversations: ConversationRecord[];
  onOpenConversation: (id: string) => void;
  onStartNewConversation: () => void;
  onDeleteConversation: (id: string) => Promise<void>;
  onClearAllConversations: () => Promise<void>;
}

export function HistoryView({
  conversations,
  onOpenConversation,
  onStartNewConversation,
  onDeleteConversation,
  onClearAllConversations,
}: HistoryViewProps) {
  const [search, setSearch] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = conversations.filter((c) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.lastMessagePreview.toLowerCase().includes(q)
    );
  });

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDeleteConversation(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chat History</h1>
          <p className="mt-1 text-sm text-slate-600">
            Revisit previous grounded PDF conversations, continue asking follow-up questions, or
            clean up older threads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {conversations.length > 0 && !confirmClearAll && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-red-600 whitespace-nowrap hover:border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear All History
            </button>
          )}
          {confirmClearAll && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs">
              <span className="font-medium text-red-800">Delete all chats?</span>
              <button
                type="button"
                onClick={async () => {
                  await onClearAllConversations();
                  setConfirmClearAll(false);
                }}
                className="rounded bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmClearAll(false)}
                className="rounded border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onStartNewConversation}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white whitespace-nowrap hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Conversation
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <span className="text-xs font-medium text-slate-500 tabular-nums">
            {filtered.length} of {conversations.length} saved conversation
            {conversations.length === 1 ? '' : 's'}
          </span>

          <div className="relative w-full sm:w-72">
            <label htmlFor="history-search-input" className="sr-only">
              Search chat history
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="history-search-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <History className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {conversations.length === 0
                ? 'No chat history recorded yet'
                : 'No conversations match your search'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Conversations are persisted automatically in SQLite as you chat with your PDFs.
            </p>
            {conversations.length === 0 && (
              <button
                type="button"
                onClick={onStartNewConversation}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Start First Conversation
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((conv) => (
              <li
                key={conv.id}
                className="flex flex-col justify-between gap-4 px-6 py-4 sm:flex-row sm:items-center hover:bg-slate-50/70"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{conv.title}</div>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                    {conv.lastMessagePreview || 'No messages yet'}
                  </p>
                  <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                    {conv.messageCount} message{conv.messageCount === 1 ? '' : 's'} · Updated{' '}
                    {formatDateTime(conv.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenConversation(conv.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-1.5 text-xs font-medium text-blue-700 whitespace-nowrap hover:bg-blue-100/70"
                  >
                    Continue
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === conv.id}
                    onClick={() => void handleDelete(conv.id)}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
