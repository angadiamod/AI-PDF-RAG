import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Layers, X } from 'lucide-react';
import type { ChunkRecord, DocumentRecord } from '../../shared/types';
import { api } from '../api';
import { formatFileSize } from '../utils/format';

interface PdfPreviewModalProps {
  document: DocumentRecord | null;
  initialTab?: 'pdf' | 'chunks';
  highlightPage?: number | null;
  onClose: () => void;
}

export function PdfPreviewModal({
  document: doc,
  initialTab = 'pdf',
  highlightPage = null,
  onClose,
}: PdfPreviewModalProps) {
  const [tab, setTab] = useState<'pdf' | 'chunks'>(initialTab);
  const [chunks, setChunks] = useState<ChunkRecord[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, doc?.id]);

  useEffect(() => {
    if (!doc) return;
    let active = true;
    setLoadingChunks(true);
    setError(null);
    api
      .getDocumentChunks(doc.id)
      .then((res) => {
        if (active) setChunks(res.chunks);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load chunks.');
      })
      .finally(() => {
        if (active) setLoadingChunks(false);
      });
    return () => {
      active = false;
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, onClose]);

  if (!doc) return null;

  const pdfUrl = highlightPage
    ? `${api.getDocumentFileUrl(doc.id)}#page=${highlightPage}`
    : api.getDocumentFileUrl(doc.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-title"
    >
      <div className="flex h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2
              id="pdf-preview-title"
              className="truncate text-base font-semibold text-slate-900"
            >
              {doc.originalName}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {doc.pageCount} pages · {doc.chunkCount} indexed chunks · {formatFileSize(doc.fileSize)}
              {highlightPage ? ` · Viewing Page ${highlightPage}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setTab('pdf')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === 'pdf'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                PDF Document
              </button>
              <button
                type="button"
                onClick={() => setTab('chunks')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  tab === 'chunks'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Extracted Chunks ({doc.chunkCount})
              </button>
            </div>

            <a
              href={pdfUrl}
              download={doc.originalName}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Download
            </a>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close document preview"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {tab === 'pdf' ? (
            <div className="flex h-full flex-col">
              <iframe
                title={`Preview of ${doc.originalName}`}
                src={pdfUrl}
                className="h-full w-full border-0 bg-slate-100"
              />
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-4 p-6">
              {loadingChunks ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4"
                    />
                  ))}
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : chunks.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  No indexed chunks available for this document yet.
                </div>
              ) : (
                chunks.map((chunk) => {
                  const isHighlighted = highlightPage === chunk.pageNumber;
                  return (
                    <article
                      key={chunk.id}
                      className={`rounded-lg border bg-white p-5 ${
                        isHighlighted
                          ? 'border-blue-400 ring-1 ring-blue-200'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                        <span className="font-medium text-blue-700">
                          Chunk #{chunk.chunkIndex + 1} · Page {chunk.pageNumber}
                        </span>
                        <span>{chunk.charCount} chars</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {chunk.content}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
