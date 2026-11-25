import type { DocumentStatus } from '../../shared/types';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateTime(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

export function formatStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case 'uploading':
      return 'Uploading';
    case 'extracting':
      return 'Extracting Text';
    case 'chunking':
      return 'Chunking Pages';
    case 'embedding':
      return 'Generating Embeddings';
    case 'ready':
      return 'Indexed & Ready';
    case 'error':
      return 'Processing Failed';
  }
}

export function getStatusTextColor(status: DocumentStatus): string {
  switch (status) {
    case 'ready':
      return 'text-emerald-700';
    case 'error':
      return 'text-red-700';
    default:
      return 'text-blue-700';
  }
}

export function formatSimilarityPercent(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}
