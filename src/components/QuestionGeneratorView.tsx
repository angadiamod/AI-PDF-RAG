import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import type {
  DifficultyLevel,
  DocumentRecord,
  QuestionSetRecord,
  QuestionType,
} from '../../shared/types';
import { api } from '../api';
import { formatDateTime } from '../utils/format';

interface QuestionGeneratorViewProps {
  documents: DocumentRecord[];
  questionSets: QuestionSetRecord[];
  onQuestionSetCreated: (set: QuestionSetRecord) => void;
  onNavigateUpload: () => void;
}

const QUESTION_TYPES: Array<{ id: QuestionType; label: string }> = [
  { id: 'mcq', label: 'Multiple Choice (MCQ)' },
  { id: 'short', label: 'Short Answer Questions' },
  { id: 'long', label: 'Long Answer Questions' },
  { id: 'exam', label: 'Important Exam Questions' },
];

export function QuestionGeneratorView({
  documents,
  questionSets,
  onQuestionSetCreated,
  onNavigateUpload,
}: QuestionGeneratorViewProps) {
  const readyDocs = (documents ?? []).filter((d) => d && d.status === 'ready');
  const validQuestionSets = (questionSets ?? []).filter(
    (s): s is QuestionSetRecord => Boolean(s && typeof s.id === 'string')
  );
  const [selectedDocId, setSelectedDocId] = useState<string>(readyDocs[0]?.id ?? '');
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [count, setCount] = useState<number>(5);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSet, setActiveSet] = useState<QuestionSetRecord | null>(
    validQuestionSets[0] ?? null
  );

  // Interactive MCQ selections & answer visibility toggles
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!selectedDocId && readyDocs.length > 0) {
      setSelectedDocId(readyDocs[0].id);
    }
  }, [readyDocs, selectedDocId]);

  const selectedDoc = readyDocs.find((d) => d.id === selectedDocId) ?? readyDocs[0] ?? null;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDoc || generating) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await api.generateQuestions({
        documentId: selectedDoc.id,
        questionType,
        difficulty,
        count,
      });
      if (!res?.questionSet || !res.questionSet.id) {
        throw new Error('Question generation response was incomplete. Please try again.');
      }
      onQuestionSetCreated(res.questionSet);
      setActiveSet(res.questionSet);
      setSelectedOptions({});
      setRevealedIds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate questions.');
    } finally {
      setGenerating(false);
    }
  }

  function toggleReveal(qId: string) {
    setRevealedIds((prev) => ({ ...prev, [qId]: !prev[qId] }));
  }

  function revealAll(show: boolean) {
    if (!activeSet) return;
    const next: Record<string, boolean> = {};
    for (const q of activeSet.questions) {
      next[q.id] = show;
    }
    setRevealedIds(next);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">AI Question Generator</h1>
        <p className="mt-1 text-sm text-slate-600">
          Generate Multiple Choice, Short Answer, Long Answer, and Important University Exam
          Questions complete with answers, explanations, and page references.
        </p>
      </div>

      {readyDocs.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center">
          <HelpCircle className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            No processed PDFs available
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a PDF or load a sample document to generate practice and exam questions.
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
          {/* Configuration Form */}
          <div className="space-y-6 xl:col-span-4">
            <form
              onSubmit={handleGenerate}
              className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
            >
              <div>
                <label
                  htmlFor="qgen-doc-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Source PDF Document
                </label>
                <select
                  id="qgen-doc-select"
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
                <label
                  htmlFor="qgen-type-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Question Format
                </label>
                <select
                  id="qgen-type-select"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="qgen-difficulty-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Difficulty
                  </label>
                  <select
                    id="qgen-difficulty-select"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="qgen-count-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Questions
                  </label>
                  <select
                    id="qgen-count-select"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {[3, 5, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} questions
                      </option>
                    ))}
                  </select>
                </div>
              </div>

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
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:bg-slate-300"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Questions...
                  </>
                ) : (
                  'Generate Questions'
                )}
              </button>
            </form>

            {validQuestionSets.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-3.5">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Saved Question Sets ({validQuestionSets.length})
                  </h2>
                </div>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {validQuestionSets.map((set) => (
                    <li key={set.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSet(set);
                          setSelectedOptions({});
                          setRevealedIds({});
                        }}
                        className={`block w-full px-5 py-3 text-left transition-colors ${
                          activeSet?.id === set.id ? 'bg-violet-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {set.documentName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">
                          {set.questionType.toUpperCase()} · {set.difficulty} ·{' '}
                          {set.questions.length} Qs · {formatDateTime(set.createdAt)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Generated Questions Area */}
          <div className="xl:col-span-8">
            <section className="min-h-[420px] rounded-xl border border-slate-200 bg-white p-6">
              {generating ? (
                <div className="flex h-80 flex-col items-center justify-center text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                  <p className="mt-3 text-sm font-medium text-slate-800">
                    Drafting grounded questions and model answers...
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Linking each question to exact PDF page references
                  </p>
                </div>
              ) : !activeSet ? (
                <div className="flex h-80 flex-col items-center justify-center text-center">
                  <HelpCircle className="h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    Configure question parameters on the left
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Create interactive MCQs or university-style short, long, and exam questions.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {activeSet.documentName}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {activeSet.questionType.toUpperCase()} · Difficulty: {activeSet.difficulty}{' '}
                        · {activeSet.questions.length} questions ·{' '}
                        {formatDateTime(activeSet.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => revealAll(true)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 whitespace-nowrap hover:bg-slate-50"
                      >
                        Reveal All Answers
                      </button>
                      <button
                        type="button"
                        onClick={() => revealAll(false)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 whitespace-nowrap hover:bg-slate-50"
                      >
                        Hide All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {activeSet.questions.map((q, index) => {
                      const isRevealed = Boolean(revealedIds[q.id]);
                      const chosen = selectedOptions[q.id];
                      const isMcq = q.type === 'mcq' && q.options && q.options.length > 0;

                      return (
                        <article
                          key={q.id}
                          className="rounded-lg border border-slate-200 bg-slate-50/40 p-5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
                            <span className="font-semibold text-blue-700">
                              Question {index + 1}
                            </span>
                            <span>
                              {q.pageReference}
                              {q.marks ? ` · ${q.marks} mark${q.marks === 1 ? '' : 's'}` : ''}
                            </span>
                          </div>

                          <h3 className="mt-2 text-sm font-semibold leading-relaxed text-slate-900">
                            {q.question}
                          </h3>

                          {isMcq && q.options && (
                            <div className="mt-3 space-y-2">
                              {q.options.map((option, optIdx) => {
                                const isPicked = chosen === option;
                                const isCorrect =
                                  option.trim().toLowerCase() === q.answer.trim().toLowerCase() ||
                                  q.answer.trim().toLowerCase().includes(option.trim().toLowerCase());
                                const showResult = isRevealed || Boolean(chosen);

                                let optionClass =
                                  'border-slate-200 bg-white text-slate-700 hover:border-blue-300';
                                if (showResult && isCorrect) {
                                  optionClass =
                                    'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium';
                                } else if (showResult && isPicked && !isCorrect) {
                                  optionClass = 'border-red-300 bg-red-50 text-red-900';
                                }

                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    onClick={() => {
                                      setSelectedOptions((prev) => ({ ...prev, [q.id]: option }));
                                      setRevealedIds((prev) => ({ ...prev, [q.id]: true }));
                                    }}
                                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left text-xs transition-colors ${optionClass}`}
                                  >
                                    <span>{option}</span>
                                    {showResult && isCorrect && (
                                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                    )}
                                    {showResult && isPicked && !isCorrect && (
                                      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="mt-3.5">
                            <button
                              type="button"
                              aria-expanded={isRevealed}
                              onClick={() => toggleReveal(q.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900"
                            >
                              {isRevealed ? (
                                <>
                                  <ChevronUp className="h-3.5 w-3.5" />
                                  Hide Answer & Explanation
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="h-3.5 w-3.5" />
                                  Show Answer & Explanation
                                </>
                              )}
                            </button>

                            {isRevealed && (
                              <div className="mt-3 space-y-2 rounded-lg border border-blue-100 bg-white p-4 text-xs leading-relaxed text-slate-700">
                                <div>
                                  <span className="font-semibold text-slate-900">Answer: </span>
                                  <span className="whitespace-pre-wrap">{q.answer}</span>
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900">
                                    Explanation:{' '}
                                  </span>
                                  <span className="whitespace-pre-wrap">{q.explanation}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
