import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AlertCircle, Check, Copy, FileText, Loader2, Upload } from 'lucide-react';
import type { DocumentRecord, SummaryMode, SummaryRecord } from '../../shared/types';
import { api } from '../api';
import { formatDateTime } from '../utils/format';

interface SummarizerViewProps {
  documents: DocumentRecord[];
  summaries: SummaryRecord[];
  onSummaryCreated: (summary: SummaryRecord) => void;
  onNavigateUpload: () => void;
}

const SUMMARY_MODES: Array<{ id: SummaryMode; label: string; description: string }> = [
  { id: 'short', label: 'Short Summary', description: 'Concise 2–3 paragraph overview' },
  { id: 'detailed', label: 'Detailed Summary', description: 'Comprehensive structured breakdown' },
  { id: 'chapter', label: 'Individual Chapter', description: 'Summarize one detected chapter' },
  { id: 'key_points', label: 'Key Points', description: 'Extract essential exam-ready takeaways' },
];

export function SummarizerView({
  documents,
  summaries,
  onSummaryCreated,
  onNavigateUpload,
}: SummarizerViewProps) {
  const readyDocs = (documents ?? []).filter((d) => d && d.status === 'ready');
  const validSummaries = (summaries ?? []).filter(
    (item): item is SummaryRecord => Boolean(item && typeof item.id === 'string')
  );
  const [selectedDocId, setSelectedDocId] = useState<string>(readyDocs[0]?.id ?? '');
  const [mode, setMode] = useState<SummaryMode>('short');
  const [chapterTitle, setChapterTitle] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSummary, setActiveSummary] = useState<SummaryRecord | null>(
    validSummaries[0] ?? null
  );
  const [copied, setCopied] = useState(false);

  const selectedDoc = readyDocs.find((d) => d.id === selectedDocId) ?? readyDocs[0] ?? null;

  useEffect(() => {
    if (!selectedDocId && readyDocs.length > 0) {
      setSelectedDocId(readyDocs[0].id);
    }
  }, [readyDocs, selectedDocId]);

  useEffect(() => {
    if (selectedDoc && selectedDoc.chapters.length > 0) {
      setChapterTitle(selectedDoc.chapters[0].title);
    } else {
      setChapterTitle('');
    }
  }, [selectedDoc?.id]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoc || generating) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await api.generateSummary({
        documentId: selectedDoc.id,
        mode,
        chapterTitle: mode === 'chapter' ? chapterTitle : null,
      });
      if (!res?.summary || !res.summary.id) {
        throw new Error('Summary response was incomplete. Please try generating again.');
      }
      onSummaryCreated(res.summary);
      setActiveSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary.');
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (!activeSummary) return;
    const text = `${activeSummary.documentName}${
      activeSummary.chapterTitle ? ` — ${activeSummary.chapterTitle}` : ''
    }\n\n${activeSummary.summary}\n\nKey Points:\n${activeSummary.keyPoints
      .map((p) => `- ${p}`)
      .join('\n')}`;
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">AI Document Summarizer</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generate short overviews, detailed breakdowns, chapter-specific summaries, and extracted
          key takeaways grounded strictly in your uploaded PDFs.
        </p>
      </div>

      {readyDocs.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            No processed PDFs ready to summarize
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a PDF or load a sample document first to generate summaries.
          </p>
          <button
            type="button"
            onClick={onNavigateUpload}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" />
            Upload PDF
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Controls Column */}
          <div className="space-y-6 xl:col-span-4">
            <form
              onSubmit={handleGenerate}
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
            >
              <div>
                <label
                  htmlFor="summarizer-doc-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Select PDF Document
                </label>
                <select
                  id="summarizer-doc-select"
                  value={selectedDoc?.id ?? ''}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {readyDocs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.originalName} ({doc.pageCount} pages)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold text-slate-700">Summary Format</span>
                <div className="mt-2 space-y-2">
                  {SUMMARY_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMode(m.id)}
                      className={`flex w-full flex-col rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                        mode === m.id
                          ? 'border-blue-500 bg-blue-50/70 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-sm font-medium">{m.label}</span>
                      <span className="text-xs text-slate-500">{m.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'chapter' && selectedDoc && (
                <div>
                  <label
                    htmlFor="summarizer-chapter-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Select Chapter / Section
                  </label>
                  <select
                    id="summarizer-chapter-select"
                    value={chapterTitle}
                    onChange={(e) => setChapterTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {selectedDoc.chapters.map((ch) => (
                      <option key={ch.title} value={ch.title}>
                        {ch.title} (Pages {ch.startPage}–{ch.endPage})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={generating || !selectedDoc}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-slate-300"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Summary...
                  </>
                ) : (
                  'Generate Summary'
                )}
              </button>
            </form>

            {/* Saved Summaries List */}
            {validSummaries.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Recent Summaries ({validSummaries.length})
                  </h2>
                </div>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {validSummaries.map((item) => {
                    const isSelected = activeSummary?.id === item.id;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setActiveSummary(item)}
                          className={`block w-full px-5 py-3 text-left transition-colors ${
                            isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate text-xs font-semibold text-slate-900">
                            {item.chapterTitle || item.documentName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                            {(item.mode || 'short').replace('_', ' ')} ·{' '}
                            {formatDateTime(item.createdAt)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Generated Summary Display */}
          <div className="xl:col-span-8">
            <section className="min-h-[420px] rounded-xl border border-slate-200 bg-white p-6">
              {generating ? (
                <div className="flex h-80 flex-col items-center justify-center text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    Analyzing PDF content with Gemini...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Extracting grounded summary and key takeaways
                  </p>
                </div>
              ) : !activeSummary ? (
                <div className="flex h-80 flex-col items-center justify-center text-center">
                  <FileText className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    Choose a PDF and summary mode on the left
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Generated summaries and key points are automatically saved for revision.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {activeSummary.chapterTitle || activeSummary.documentName}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500 tabular-nums">
                        Source: {activeSummary.documentName} · Mode:{' '}
                        {activeSummary.mode.replace('_', ' ')} ·{' '}
                        {formatDateTime(activeSummary.createdAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy Summary
                        </>
                      )}
                    </button>
                  </div>

                  <div className="rag-prose text-sm text-slate-700">
                    <ReactMarkdown>{activeSummary.summary}</ReactMarkdown>
                  </div>

                  {(activeSummary.keyPoints ?? []).length > 0 && (
                    <div className="border-t border-slate-100 pt-5">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Extracted Important Points ({activeSummary.keyPoints.length})
                      </h3>
                      <ol className="mt-3 space-y-2.5">
                        {(activeSummary.keyPoints ?? []).map((point, idx) => (
                          <li
                            key={idx}
                            className="flex gap-3 text-sm leading-relaxed text-slate-700"
                          >
                            <span className="shrink-0 font-mono text-xs font-semibold text-blue-600 tabular-nums pt-0.5">
                              {String(idx + 1).padStart(2, '0')}.
                            </span>
                            <span>{point}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
