import { useState } from 'react';
import { Eye, Layers, Loader2, Search, Trash2, Upload } from 'lucide-react';
import type { DocumentRecord, SearchResultItem } from '../../shared/types';
import { api } from '../api';
import {
  formatDateTime,
  formatFileSize,
  formatSimilarityPercent,
  formatStatusLabel,
  getStatusTextColor,
} from '../utils/format';

interface LibraryViewProps {
  documents: DocumentRecord[];
  onPreviewDocument: (doc: DocumentRecord, tab?: 'pdf' | 'chunks', page?: number) => void;
  onDeleteDocument: (id: string) => Promise<void>;
  onNavigateUpload: () => void;
}

export function LibraryView({
  documents,
  onPreviewDocument,
  onDeleteDocument,
  onNavigateUpload,
}: LibraryViewProps) {
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'error'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Semantic Vector Search Explorer state
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMeta, setSearchMeta] = useState<{
    dimensions: number;
    searched: number;
    query: string;
  } | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  const filteredDocs = documents.filter((doc) => {
    const matchesText =
      !filterText.trim() ||
      doc.originalName.toLowerCase().includes(filterText.trim().toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'ready' && doc.status === 'ready') ||
      (statusFilter === 'error' && doc.status === 'error');
    return matchesText && matchesStatus;
  });

  const readyCount = documents.filter((d) => d.status === 'ready').length;

  async function handleSemanticSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.semanticSearch({ query: searchQuery.trim(), topK: 6 });
      setSearchMeta({
        dimensions: res.embeddingDimensions,
        searched: res.totalChunksSearched,
        query: res.query,
      });
      setSearchResults(res.results);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Semantic search failed.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDeleteDocument(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Document Library</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage indexed PDFs, inspect extracted chunks and detected chapters, and test cosine
            similarity vector search directly.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap hover:bg-blue-700"
        >
          <Upload className="h-4 w-4" />
          Upload PDF
        </button>
      </div>

      {/* Semantic Similarity Search Workbench */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Semantic Vector Search Explorer (Cosine Similarity)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Convert any natural language query into a Gemini embedding vector and inspect the
            highest-ranked PDF chunks by cosine similarity.
          </p>
        </div>

        <form onSubmit={handleSemanticSearch} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label htmlFor="semantic-search-input" className="sr-only">
            Semantic search query
          </label>
          <input
            id="semantic-search-input"
            type="text"
            value={searchQuery}
            disabled={readyCount === 0 || searching}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              readyCount === 0
                ? 'Upload at least one PDF to run semantic vector search...'
                : 'e.g., How does cosine similarity rank document embeddings?'
            }
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={readyCount === 0 || searching || !searchQuery.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap transition-colors hover:bg-violet-700 disabled:bg-slate-300"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Run Vector Search
              </>
            )}
          </button>
        </form>

        {searchError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
            {searchError}
          </div>
        )}

        {searchMeta && (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              Query embedded into {searchMeta.dimensions}-dim vector · Scanned {searchMeta.searched}{' '}
              stored chunks · Returned {searchResults.length} ranked match
              {searchResults.length === 1 ? '' : 'es'}
            </div>

            {searchResults.length === 0 ? (
              <p className="text-sm text-slate-500">
                No chunks exceeded the similarity threshold for this query.
              </p>
            ) : (
              <div className="space-y-3">
                {searchResults.map((item, idx) => (
                  <div
                    key={item.chunkId}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-900">
                        #{idx + 1} · {item.documentName}{' '}
                        <span className="font-mono text-slate-500 tabular-nums">
                          (Page {item.pageNumber} · Chunk #{item.chunkIndex + 1})
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-violet-700 tabular-nums">
                        Cosine: {item.similarity.toFixed(4)} ({formatSimilarityPercent(item.similarity)})
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-700">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Indexed Document Catalog */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['all', 'ready', 'error'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all'
                  ? `All (${documents.length})`
                  : tab === 'ready'
                  ? `Ready (${readyCount})`
                  : `Failed (${documents.filter((d) => d.status === 'error').length})`}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <label htmlFor="library-filter-input" className="sr-only">
              Filter documents by filename
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              id="library-filter-input"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter by filename..."
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            {documents.length === 0
              ? 'Your library is empty. Upload a PDF document to begin.'
              : 'No documents match your current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="px-6 py-3">Document & Chapters</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-right">Pages</th>
                  <th className="px-4 py-3 text-right">Chunks</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{doc.originalName}</div>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        Uploaded {formatDateTime(doc.createdAt)}
                        {doc.chapters.length > 0
                          ? ` · ${doc.chapters.length} chapter${
                              doc.chapters.length === 1 ? '' : 's'
                            } detected`
                          : ''}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs tabular-nums text-slate-600">
                      {formatFileSize(doc.fileSize)}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {doc.pageCount}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {doc.chunkCount}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium ${getStatusTextColor(doc.status)}`}>
                        {formatStatusLabel(doc.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPreviewDocument(doc, 'pdf')}
                          aria-label={`Preview ${doc.originalName}`}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          PDF
                        </button>
                        {doc.status === 'ready' && (
                          <button
                            type="button"
                            onClick={() => onPreviewDocument(doc, 'chunks')}
                            aria-label={`View chunks for ${doc.originalName}`}
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                          >
                            <Layers className="h-3.5 w-3.5" />
                            Chunks
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deletingId === doc.id}
                          onClick={() => void handleDelete(doc.id)}
                          aria-label={`Delete ${doc.originalName}`}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
