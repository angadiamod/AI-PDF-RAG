import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import crypto from 'node:crypto';
import type {
  DifficultyLevel,
  GeneratedQuestion,
  QuestionType,
  SourceReference,
  SummaryMode,
} from '../shared/types';
import { buildRagPrompt, type ConversationTurn } from './rag';

export const GENERATION_MODEL = 'gemini-4-hydrogen';
export const FALLBACK_GENERATION_MODEL = 'gemini-3.1-flash-lite';
export const EMBEDDING_MODEL = 'gemini-embedding-2';

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your Gemini API key in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function extractReadableErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    if (parsed?.error?.message) return parsed.error.message;
    if (parsed?.message) return parsed.message;
  } catch {
    // Not raw JSON
  }
  return raw;
}

export function normalizeGeminiError(error: unknown): { status: number; message: string } {
  const readable = extractReadableErrorMessage(error);
  const lower = readable.toLowerCase();

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    lower.includes('403')
  ) {
    return {
      status: 403,
      message:
        'Gemini API authentication failed. Please check that a valid GEMINI_API_KEY is configured in Settings > Secrets.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota')) {
    return {
      status: 429,
      message:
        'Gemini API rate limit or quota reached. Please wait a few moments and try again, or select a billing-enabled API key in Settings > Secrets.',
    };
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return {
      status: 503,
      message:
        'The Gemini model is temporarily experiencing high demand. Please retry in a few seconds.',
    };
  }
  if (lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 502,
      message: `Requested Gemini model was not found: ${readable}`,
    };
  }
  return {
    status: 502,
    message: readable || 'Unexpected error communicating with the Gemini API.',
  };
}

function isTransientDemandError(error: unknown): boolean {
  const msg = extractReadableErrorMessage(error).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('500') ||
    msg.includes('internal') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = extractReadableErrorMessage(err).toLowerCase();
      const isRetryable = isTransientDemandError(err) || msg.includes('429');
      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
    }
  }
  throw lastError;
}

let primaryDegradedUntil = 0;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

/**
 * Runs generateContent on the primary model (`gemini-4-hydrogen`) with a tight timeout
 * and seamlessly fails over to `gemini-3.1-flash-lite` (with a 5-minute circuit breaker)
 * if the primary model is experiencing 503 high-demand spikes or stalls.
 */
async function generateWithResilience(params: {
  contents: string;
  systemInstruction: string;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}): Promise<{ text: string; modelUsed: string }> {
  const ai = getClient();

  const buildConfig = (model: string) => ({
    systemInstruction: params.systemInstruction,
    thinkingConfig: {
      thinkingLevel:
        model === FALLBACK_GENERATION_MODEL ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
    },
    ...(params.responseMimeType ? { responseMimeType: params.responseMimeType } : {}),
    ...(params.responseSchema ? { responseSchema: params.responseSchema } : {}),
  });

  const callFallback = async () => {
    const fallbackResponse = await withRetry(
      () =>
        withTimeout(
          ai.models.generateContent({
            model: FALLBACK_GENERATION_MODEL,
            contents: params.contents,
            config: buildConfig(FALLBACK_GENERATION_MODEL),
          }),
          25000,
          FALLBACK_GENERATION_MODEL
        ),
      2
    );
    return { text: (fallbackResponse.text ?? '').trim(), modelUsed: FALLBACK_GENERATION_MODEL };
  };

  // If primary model recently returned 503 or timed out, route immediately to fast fallback
  if (Date.now() < primaryDegradedUntil) {
    return callFallback();
  }

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GENERATION_MODEL,
        contents: params.contents,
        config: buildConfig(GENERATION_MODEL),
      }),
      12000,
      GENERATION_MODEL
    );
    return { text: (response.text ?? '').trim(), modelUsed: GENERATION_MODEL };
  } catch (primaryErr) {
    if (!isTransientDemandError(primaryErr)) {
      throw primaryErr;
    }
    primaryDegradedUntil = Date.now() + 5 * 60 * 1000;
    return callFallback();
  }
}

function parseJsonSafely<T>(raw: string, fallback: T): T {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

/**
 * Generates dense vector embeddings for an array of text strings using Gemini Embedding 2.
 * Each text chunk is embedded individually with bounded concurrency to guarantee an exact
 * 1-to-1 vector per chunk.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getClient();
  const vectors: number[][] = new Array(texts.length);
  const concurrency = 5;

  let cursor = 0;
  async function worker() {
    while (cursor < texts.length) {
      const idx = cursor++;
      const text = texts[idx];
      const result = await withRetry(
        () =>
          ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
          }),
        3
      );

      const values = result.embeddings?.[0]?.values;
      if (!values || values.length === 0) {
        throw new Error('Gemini Embedding API returned an empty embedding vector.');
      }
      vectors[idx] = values;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  );

  return vectors;
}

/**
 * Generates a grounded RAG answer strictly from retrieved PDF chunks.
 */
export async function generateRagAnswer(params: {
  question: string;
  retrievedChunks: SourceReference[];
  history: ConversationTurn[];
  responseStyle: 'concise' | 'balanced' | 'detailed';
}): Promise<{ answer: string; foundInDocs: boolean }> {
  if (params.retrievedChunks.length === 0) {
    return {
      answer:
        'I could not find information about this in the uploaded PDF documents. Try rephrasing your question, adjusting the minimum similarity threshold in Settings, or uploading a PDF that covers this topic.',
      foundInDocs: false,
    };
  }

  const { systemInstruction, userPrompt } = buildRagPrompt(
    params.question,
    params.retrievedChunks,
    params.history,
    params.responseStyle
  );

  const { text } = await generateWithResilience({
    contents: userPrompt,
    systemInstruction,
  });

  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  const lower = text.toLowerCase();
  const notFound =
    lower.includes('could not find information about this in the uploaded pdf') ||
    lower.includes('not found in the provided documents') ||
    lower.includes('does not contain information about') ||
    lower.includes('do not contain information about');

  return {
    answer: text,
    foundInDocs: !notFound,
  };
}

/**
 * Generates structured document or chapter summaries with key takeaways.
 */
export async function generateDocumentSummary(params: {
  documentName: string;
  content: string;
  mode: SummaryMode;
  chapterTitle: string | null;
}): Promise<{ summary: string; keyPoints: string[] }> {
  const modeInstructions: Record<SummaryMode, string> = {
    short:
      'Write a concise executive summary (2-3 crisp paragraphs, ~150-220 words) capturing the primary objective, core methodology, and conclusions.',
    detailed:
      'Write a comprehensive, well-structured detailed summary with clear markdown section headings covering every major concept, formula/mechanism, and finding in the document.',
    chapter: `Write a focused, thorough summary specifically for the selected chapter "${
      params.chapterTitle ?? 'Selected Section'
    }", explaining its key concepts, examples, and significance.`,
    key_points:
      'Provide a brief 1-paragraph overview followed by a comprehensive list of 8-12 structured, exam-ready key points extracted strictly from the text.',
  };

  const maxChars = 48000;
  const trimmedContent =
    params.content.length > maxChars
      ? `${params.content.slice(
          0,
          maxChars
        )}\n\n[Document truncated at ${maxChars} characters for summary generation]`
      : params.content;

  const { text } = await generateWithResilience({
    contents: `DOCUMENT NAME: ${params.documentName}\n${
      params.chapterTitle ? `TARGET CHAPTER: ${params.chapterTitle}\n` : ''
    }\nTASK:\n${modeInstructions[params.mode]}\n\nDOCUMENT CONTENT (with [Page N] markers):\n${trimmedContent}`,
    systemInstruction:
      'You are an expert academic summarizer. Base your summary strictly on the provided PDF text. Do not invent facts or external citations. Return valid JSON matching the requested schema.',
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Markdown-formatted summary grounded strictly in the PDF content.',
        },
        keyPoints: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description:
            '5 to 10 concise, factual key takeaways with page references like (Page 2) where applicable.',
        },
      },
      required: ['summary', 'keyPoints'],
    },
  });

  const parsed = parseJsonSafely<{ summary?: string; keyPoints?: string[] }>(text, {});
  const summaryText =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : text.trim();

  if (!summaryText) {
    throw new Error('Could not generate a summary from this document.');
  }

  return {
    summary: summaryText,
    keyPoints: Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.filter((p) => typeof p === 'string' && p.trim().length > 0)
      : [],
  };
}

/**
 * Generates grounded questions (MCQ, Short Answer, Long Answer, Exam Questions)
 * with answers, explanations, and page references.
 */
export async function generateDocumentQuestions(params: {
  documentName: string;
  content: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  count: number;
}): Promise<GeneratedQuestion[]> {
  const typeDescriptions: Record<QuestionType, string> = {
    mcq: 'Multiple Choice Questions. Each item MUST include exactly 4 plausible options in the `options` array, and `answer` must match one of the options clearly.',
    short:
      'Short Answer Questions (2-4 sentence answers worth 2-3 marks each). Leave `options` empty.',
    long: 'Long Answer / Analytical Questions (detailed multi-paragraph model answers worth 8-10 marks each). Leave `options` empty.',
    exam: 'Important University Final-Year Exam Questions (mix of conceptual definitions, architecture explanations, and applied questions with clear model answers and mark allocation). Leave `options` empty.',
  };

  const maxChars = 42000;
  const trimmedContent =
    params.content.length > maxChars ? params.content.slice(0, maxChars) : params.content;

  const { text } = await generateWithResilience({
    contents: [
      `DOCUMENT NAME: ${params.documentName}`,
      `QUESTION TYPE: ${typeDescriptions[params.questionType]}`,
      `DIFFICULTY: ${params.difficulty}`,
      `NUMBER OF QUESTIONS: ${params.count}`,
      '',
      `DOCUMENT CONTENT (with [Page N] markers):`,
      trimmedContent,
    ].join('\n'),
    systemInstruction:
      'You are a university computer science professor creating accurate exam and study questions strictly grounded in the provided PDF text. Every question, answer, explanation, and pageReference MUST come directly from the provided PDF content.',
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: {
            type: Type.STRING,
            description: 'The question text.',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '4 options for MCQ type; empty array for other types.',
          },
          answer: {
            type: Type.STRING,
            description: 'The exact correct answer or model answer.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Clear explanation justifying the answer from the PDF.',
          },
          pageReference: {
            type: Type.STRING,
            description: 'Exact page reference, e.g., "Page 2" or "Pages 2-3".',
          },
          marks: {
            type: Type.INTEGER,
            description: 'Suggested exam mark weight (e.g., 1 for MCQ, 3 for short, 10 for long).',
          },
        },
        required: ['question', 'answer', 'explanation', 'pageReference'],
      },
    },
  });

  const parsed = parseJsonSafely<
    Array<{
      question?: string;
      options?: string[];
      answer?: string;
      explanation?: string;
      pageReference?: string;
      marks?: number;
    }>
  >(text, []);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('No questions were returned by the Gemini model. Please try again.');
  }

  return parsed.map((item) => ({
    id: crypto.randomUUID(),
    question: item.question?.trim() || 'Untitled question',
    type: params.questionType,
    options:
      params.questionType === 'mcq' && Array.isArray(item.options) && item.options.length > 0
        ? item.options
        : undefined,
    answer: item.answer?.trim() || '',
    explanation: item.explanation?.trim() || '',
    pageReference: item.pageReference?.trim() || 'Page 1',
    marks:
      typeof item.marks === 'number' && item.marks > 0
        ? item.marks
        : params.questionType === 'mcq'
        ? 1
        : params.questionType === 'short'
        ? 3
        : 10,
  }));
}
