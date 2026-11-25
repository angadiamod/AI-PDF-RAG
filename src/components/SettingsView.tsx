import { useEffect, useState } from 'react';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import type { RagSettings } from '../../shared/types';
import { api } from '../api';

interface SettingsViewProps {
  settings: RagSettings;
  models: { generation: string; embedding: string };
  onSettingsUpdated: (settings: RagSettings) => void;
}

const DEFAULT_FORM: RagSettings = {
  chunkSize: 900,
  chunkOverlap: 180,
  topK: 5,
  minSimilarity: 0.32,
  responseStyle: 'balanced',
  maxFileSizeMb: 20,
};

export function SettingsView({ settings, models, onSettingsUpdated }: SettingsViewProps) {
  const [form, setForm] = useState<RagSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      const res = await api.updateSettings(form);
      onSettingsUpdated(res.settings);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">RAG Pipeline Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Tune document chunking, cosine similarity retrieval parameters, and answer verbosity.
          Chunking updates apply to newly uploaded PDFs; retrieval parameters apply immediately.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <form
          onSubmit={handleSave}
          className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 xl:col-span-8"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="setting-chunk-size"
                className="block text-xs font-semibold text-slate-700"
              >
                Chunk Size (characters)
              </label>
              <input
                id="setting-chunk-size"
                type="number"
                min={300}
                max={2500}
                step={50}
                value={form.chunkSize}
                onChange={(e) => setForm({ ...form, chunkSize: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                Recommended: 700–1200 characters per chunk.
              </p>
            </div>

            <div>
              <label
                htmlFor="setting-chunk-overlap"
                className="block text-xs font-semibold text-slate-700"
              >
                Chunk Overlap (characters)
              </label>
              <input
                id="setting-chunk-overlap"
                type="number"
                min={0}
                max={600}
                step={20}
                value={form.chunkOverlap}
                onChange={(e) => setForm({ ...form, chunkOverlap: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                Preserves sentence continuity across chunk boundaries.
              </p>
            </div>

            <div>
              <label
                htmlFor="setting-topk"
                className="block text-xs font-semibold text-slate-700"
              >
                Top-K Retrieved Chunks
              </label>
              <input
                id="setting-topk"
                type="number"
                min={1}
                max={12}
                value={form.topK}
                onChange={(e) => setForm({ ...form, topK: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-xs text-slate-500">
                Maximum ranked PDF excerpts injected into Gemini context.
              </p>
            </div>

            <div>
              <label
                htmlFor="setting-min-sim"
                className="block text-xs font-semibold text-slate-700"
              >
                Min Cosine Similarity Threshold ({Math.round(form.minSimilarity * 100)}%)
              </label>
              <input
                id="setting-min-sim"
                type="range"
                min={0.15}
                max={0.8}
                step={0.01}
                value={form.minSimilarity}
                onChange={(e) => setForm({ ...form, minSimilarity: Number(e.target.value) })}
                className="mt-3 w-full accent-blue-600"
              />
              <p className="mt-1 text-xs text-slate-500">
                Higher values enforce stricter document matching and reduce off-topic hits.
              </p>
            </div>

            <div>
              <label
                htmlFor="setting-style"
                className="block text-xs font-semibold text-slate-700"
              >
                Response Style
              </label>
              <select
                id="setting-style"
                value={form.responseStyle}
                onChange={(e) =>
                  setForm({
                    ...form,
                    responseStyle: e.target.value as RagSettings['responseStyle'],
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="concise">Concise</option>
                <option value="balanced">Balanced (Default)</option>
                <option value="detailed">Detailed Academic</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="setting-max-size"
                className="block text-xs font-semibold text-slate-700"
              >
                Max PDF File Size (MB)
              </label>
              <input
                id="setting-max-size"
                type="number"
                min={1}
                max={50}
                value={form.maxFileSizeMb}
                onChange={(e) => setForm({ ...form, maxFileSizeMb: Number(e.target.value) })}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setForm(DEFAULT_FORM)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>

            <div className="flex items-center gap-3">
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  Settings saved
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        </form>

        {/* Architecture Summary Card */}
        <aside className="rounded-xl border border-slate-200 bg-white p-6 xl:col-span-4">
          <h2 className="text-base font-semibold text-slate-900">Server Architecture Overview</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            All Gemini API credentials and inference calls execute strictly on the Express backend.
          </p>

          <dl className="mt-5 divide-y divide-slate-100 text-xs">
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-500">Generation Model</dt>
              <dd className="font-mono font-medium text-slate-900">{models.generation}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-500">Embedding Model</dt>
              <dd className="font-mono font-medium text-slate-900">{models.embedding}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-500">Vector Similarity</dt>
              <dd className="font-medium text-slate-900">Cosine Similarity</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-500">PDF Parser</dt>
              <dd className="font-medium text-slate-900">PDF.js (Page-Aware)</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-slate-500">Persistence</dt>
              <dd className="font-medium text-slate-900">SQLite (WAL Mode)</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
