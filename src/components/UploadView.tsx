import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileUp,
  Layers,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { DocumentRecord, RagSettings, SamplePdfInfo } from '../../shared/types';
import { api } from '../api';
import {
  formatDateTime,
  formatFileSize,
  formatStatusLabel,
  getStatusTextColor,
} from '../utils/format';

interface UploadViewProps {
  documents: DocumentRecord[];
  samples: SamplePdfInfo[];
  settings: RagSettings;
  importingSlug: string | null;
  onImportSample: (slug: string) => void;
  onDocumentsChanged: () => Promise<void>;
  onPreviewDocument: (doc: DocumentRecord, tab?: 'pdf' | 'chunks') => void;
  onDeleteDocument: (id: string) => Promise<void>;
}

interface UploadQueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  stage: 'uploading' | 'processing' | 'done' | 'error';
  message: string;
  pipelineLog?: string[];
}

export function UploadView({
  documents,
  samples,
  settings,
  importingSlug,
  onImportSample,
  onDocumentsChanged,
  onPreviewDocument,
  onDeleteDocument,
}: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const maxBytes = settings.maxFileSizeMb * 1024 * 1024;

  async function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const initialItems: UploadQueueItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      stage: 'uploading',
      message: 'Validating PDF file...',
    }));

    setQueue((prev) => [...initialItems, ...prev]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const itemId = initialItems[i].id;

      // Client-side pre-validation before hitting server
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? { ...q, stage: 'error', progress: 0, message: 'Only .pdf files are supported.' }
              : q
          )
        );
        continue;
      }
      if (file.size === 0) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? { ...q, stage: 'error', progress: 0, message: 'This file is empty (0 bytes).' }
              : q
          )
        );
        continue;
      }
      if (file.size > maxBytes) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  stage: 'error',
                  progress: 0,
                  message: `File exceeds the ${settings.maxFileSizeMb} MB limit configured in Settings.`,
                }
              : q
          )
        );
        continue;
      }

      try {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? { ...q, stage: 'uploading', progress: 15, message: 'Uploading PDF to server...' }
              : q
          )
        );

        const response = await api.uploadPdf(file, (pct) => {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === itemId
                ? {
                    ...q,
                    progress: pct < 100 ? Math.max(15, Math.round(pct * 0.55)) : 65,
                    stage: pct < 100 ? 'uploading' : 'processing',
                    message:
                      pct < 100
                        ? `Uploading (${pct}%)...`
                        : 'Extracting text, chunking pages & generating Gemini embeddings...',
                  }
                : q
            )
          );
        });

        const result = response.results[0];
        if (!result || result.error || result.document?.status === 'error') {
          throw new Error(
            result?.error || result?.document?.errorMessage || 'Document processing failed.'
          );
        }

        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  progress: 100,
                  stage: 'done',
                  message: `Indexed ${result.document?.pageCount ?? 0} page(s) into ${
                    result.document?.chunkCount ?? 0
                  } searchable vector chunks.`,
                  pipelineLog: result.pipelineLog,
                }
              : q
          )
        );

        await onDocumentsChanged();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload PDF.';
        setQueue((prev) =>
          prev.map((q) =>
            q.id === itemId ? { ...q, stage: 'error', progress: 0, message } : q
          )
        );
        await onDocumentsChanged();
      }
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Upload PDF Documents</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload one or multiple PDF files. Each document is validated, parsed page-by-page, split
          into overlapping chunks, and embedded with Gemini for cosine similarity search.
        </p>
      </div>

      {/* Drag and Drop Zone */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void processFiles(e.dataTransfer.files);
            }
          }}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50/70'
              : 'border-slate-300 bg-slate-50/60 hover:border-blue-400 hover:bg-blue-50/30'
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600">
            <FileUp className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            Drag and drop PDF files here
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Supports single or batch PDF uploads up to{' '}
            <span className="font-mono tabular-nums">{settings.maxFileSizeMb} MB</span> per file
          </p>

          <input
            ref={inputRef}
            id="pdf-file-input"
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) {
                void processFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              Browse PDF Files
            </button>
          </div>

          <p className="mt-4 text-xs text-slate-400 tabular-nums">
            Current pipeline settings: {settings.chunkSize} chars/chunk · {settings.chunkOverlap}{' '}
            char overlap · Gemini Embedding 2
          </p>
        </div>

        {/* Live Upload & Processing Queue */}
        {queue.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Upload & Processing Activity</h3>
              <button
                type="button"
                onClick={() => setQueue([])}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Clear log
              </button>
            </div>
            {queue.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.stage === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : item.stage === 'error' ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                    ) : (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                    )}
                    <span className="truncate text-sm font-medium text-slate-900">
                      {item.fileName}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
                      {formatFileSize(item.fileSize)}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">
                    {item.progress}%
                  </span>
                </div>

                {(item.stage === 'uploading' || item.stage === 'processing') && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}

                <p
                  className={`mt-1.5 text-xs ${
                    item.stage === 'error'
                      ? 'text-red-700'
                      : item.stage === 'done'
                      ? 'text-emerald-700'
                      : 'text-slate-600'
                  }`}
                >
                  {item.message}
                </p>

                {item.pipelineLog && item.pipelineLog.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-slate-200/70 pt-2 font-mono text-[11px] text-slate-500">
                    {item.pipelineLog.map((line, i) => (
                      <li key={i}>
                        {i + 1}. {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Real Sample PDFs for Instant Testing & Download */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Sample PDF Documents for Testing
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Import a sample PDF directly through the real extraction and embedding pipeline, or
            download the genuine .pdf file to test drag-and-drop upload manually.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {samples.map((sample) => {
            const isImporting = importingSlug === sample.slug;
            return (
              <div
                key={sample.slug}
                className="flex flex-col justify-between rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">{sample.title}</div>
                  <div className="mt-1 text-xs text-slate-500 tabular-nums">
                    {sample.filename} · {sample.pages} pages · {sample.topics.join(' · ')}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {sample.description}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={importingSlug !== null}
                    onClick={() => onImportSample(sample.slug)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-violet-700 disabled:opacity-60"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Processing & Embedding...
                      </>
                    ) : sample.alreadyImported ? (
                      'Re-import Sample PDF'
                    ) : (
                      'Import & Process PDF'
                    )}
                  </button>
                  <a
                    href={api.getSampleDownloadUrl(sample.slug)}
                    download={sample.filename}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .pdf
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Uploaded Documents List */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Uploaded Documents ({documents.length})
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Preview uploaded PDFs, inspect extracted chunks, or remove documents from the vector
            store
          </p>
        </div>

        {documents.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            No uploaded PDFs yet. Drag a PDF into the dropzone above or import a sample document.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col justify-between gap-4 px-6 py-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {doc.originalName}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                    <span>{formatFileSize(doc.fileSize)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.pageCount} pages</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.chunkCount} chunks</span>
                    <span aria-hidden="true">·</span>
                    <span className={`font-medium ${getStatusTextColor(doc.status)}`}>
                      {formatStatusLabel(doc.status)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatDateTime(doc.createdAt)}</span>
                  </div>
                  {doc.errorMessage && (
                    <p className="mt-1 text-xs text-red-700">{doc.errorMessage}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onPreviewDocument(doc, 'pdf')}
                    aria-label={`Preview PDF ${doc.originalName}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                  {doc.status === 'ready' && (
                    <button
                      type="button"
                      onClick={() => onPreviewDocument(doc, 'chunks')}
                      aria-label={`Inspect chunks for ${doc.originalName}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Chunks
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={deletingId === doc.id}
                    onClick={() => void handleDelete(doc.id)}
                    aria-label={`Remove ${doc.originalName}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 whitespace-nowrap hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
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
