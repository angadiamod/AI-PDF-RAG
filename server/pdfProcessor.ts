import type { ExtractedPage } from './rag';
import { cleanPageText } from './rag';

export interface PdfExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  totalCharacters: number;
}

/**
 * Extracts text page-by-page from a PDF Buffer using pdfjs-dist so that exact
 * page numbers are preserved for chunking and grounded source citations.
 */
export async function extractPdfPages(buffer: Buffer): Promise<PdfExtractionResult> {
  // Dynamically import legacy pdfjs build for Node.js compatibility
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let pdfDocument: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    const loadingTask = pdfjs.getDocument({
      data,
      useWorkerFetch: false,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    pdfDocument = await loadingTask.promise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('password')) {
      throw new Error(
        'This PDF is password-protected or encrypted. Please upload an unlocked PDF document.'
      );
    }
    throw new Error(
      `Could not parse PDF document. The file may be corrupted or malformed (${message}).`
    );
  }

  try {
    const pageCount = pdfDocument.numPages;
    if (pageCount === 0) {
      throw new Error('The PDF document contains 0 pages.');
    }

    const pages: ExtractedPage[] = [];
    let totalCharacters = 0;

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();

      const lines: string[] = [];
      let currentLine = '';
      let lastY: number | null = null;

      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        const str = item.str;
        const transform = Array.isArray(item.transform) ? item.transform : null;
        const y = transform ? Math.round(transform[5]) : null;

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = str;
        } else {
          currentLine += currentLine && str && !currentLine.endsWith(' ') && !str.startsWith(' ')
            ? ` ${str}`
            : str;
        }

        if ('hasEOL' in item && item.hasEOL) {
          if (currentLine.trim()) {
            lines.push(currentLine.trim());
          }
          currentLine = '';
          lastY = null;
        } else if (y !== null) {
          lastY = y;
        }
      }

      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }

      const cleaned = cleanPageText(lines.join('\n'));
      totalCharacters += cleaned.length;
      pages.push({ pageNumber: pageNum, text: cleaned });
    }

    if (totalCharacters < 20) {
      throw new Error(
        'No selectable text could be extracted from this PDF. It may be empty or contain only scanned images without embedded text.'
      );
    }

    return {
      pageCount,
      pages,
      totalCharacters,
    };
  } finally {
    const docAny = pdfDocument as unknown as {
      destroy?: () => Promise<void>;
      cleanup?: () => Promise<void>;
    };
    if (typeof docAny.destroy === 'function') {
      await docAny.destroy();
    } else if (typeof docAny.cleanup === 'function') {
      await docAny.cleanup();
    }
  }
}
