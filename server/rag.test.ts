import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRagPrompt,
  chunkPages,
  cosineSimilarity,
  detectChapters,
  rankChunks,
  validatePdfBuffer,
  type StoredEmbeddedChunk,
} from './rag';

test('validatePdfBuffer accepts valid PDF header and rejects invalid/empty/oversized files', () => {
  const validBuf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj', 'latin1');
  assert.equal(validatePdfBuffer(validBuf, 'thesis.pdf').valid, true);

  assert.equal(validatePdfBuffer(validBuf, 'notes.txt').valid, false);
  assert.equal(validatePdfBuffer(Buffer.alloc(0), 'empty.pdf').valid, false);
  assert.equal(validatePdfBuffer(Buffer.from('not a pdf file'), 'fake.pdf').valid, false);
  assert.equal(validatePdfBuffer(validBuf, 'big.pdf', 10).valid, false);
});

test('cosineSimilarity computes exact similarity and handles edge cases', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1]) - 0) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity([1, 2], [-1, -2]) - -1) < 1e-9);
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
});

test('chunkPages preserves page numbers, document names, and overlapping windows', () => {
  const longPage =
    'Retrieval-Augmented Generation combines dense vector retrieval with generative models. '.repeat(20);
  const pages = [
    { pageNumber: 1, text: longPage },
    { pageNumber: 2, text: '   ' },
    { pageNumber: 3, text: 'Chapter 2 covers cosine similarity and vector databases.' },
  ];

  const chunks = chunkPages(pages, 'doc-1', 'RAG_Paper.pdf', {
    chunkSize: 400,
    chunkOverlap: 80,
  });

  assert.ok(chunks.length >= 4, 'Long page should split into multiple overlapping chunks');
  assert.equal(chunks[0].documentName, 'RAG_Paper.pdf');
  assert.equal(chunks[0].pageNumber, 1);

  // Verify overlapping chunks start on whole words rather than sliced mid-word fragments
  for (const c of chunks.filter((item) => item.pageNumber === 1)) {
    const firstWord = c.content.split(/\s+/)[0];
    assert.ok(
      longPage.includes(` ${firstWord}`) || longPage.startsWith(firstWord),
      `Chunk should start on a complete word, got "${firstWord}"`
    );
  }

  const page3Chunks = chunks.filter((c) => c.pageNumber === 3);
  assert.equal(page3Chunks.length, 1);
  assert.ok(page3Chunks[0].content.includes('cosine similarity'));

  // Empty page 2 should produce zero chunks
  assert.equal(chunks.filter((c) => c.pageNumber === 2).length, 0);
});

test('detectChapters extracts chapter titles and contiguous page ranges', () => {
  const pages = [
    { pageNumber: 1, text: 'Chapter 1: Introduction to RAG\nRAG improves factual accuracy.' },
    { pageNumber: 2, text: 'More background details on language models.' },
    { pageNumber: 3, text: 'Chapter 2: Vector Embeddings\nDense vectors encode semantics.' },
    { pageNumber: 4, text: 'Chapter 3: Evaluation\nHallucination metrics.' },
  ];

  const chapters = detectChapters(pages);
  assert.equal(chapters.length, 3);
  assert.equal(chapters[0].title, 'Chapter 1: Introduction to RAG');
  assert.equal(chapters[0].startPage, 1);
  assert.equal(chapters[0].endPage, 2);
  assert.equal(chapters[1].startPage, 3);
  assert.equal(chapters[1].endPage, 3);
  assert.equal(chapters[2].startPage, 4);
  assert.equal(chapters[2].endPage, 4);
});

test('rankChunks orders by descending cosine similarity and respects filters', () => {
  const chunks: StoredEmbeddedChunk[] = [
    {
      id: 'c1',
      documentId: 'd1',
      documentName: 'A.pdf',
      pageNumber: 1,
      chunkIndex: 0,
      content: 'Low match',
      embedding: [0, 1, 0],
    },
    {
      id: 'c2',
      documentId: 'd1',
      documentName: 'A.pdf',
      pageNumber: 2,
      chunkIndex: 1,
      content: 'Best match',
      embedding: [0.95, 0.3, 0],
    },
    {
      id: 'c3',
      documentId: 'd2',
      documentName: 'B.pdf',
      pageNumber: 1,
      chunkIndex: 0,
      content: 'Exact match in doc 2',
      embedding: [1, 0, 0],
    },
  ];

  const allRanked = rankChunks([1, 0, 0], chunks, { topK: 2, minSimilarity: 0.5 });
  assert.equal(allRanked.length, 2);
  assert.equal(allRanked[0].chunkId, 'c3');
  assert.equal(allRanked[1].chunkId, 'c2');

  const doc1Only = rankChunks([1, 0, 0], chunks, {
    topK: 5,
    minSimilarity: 0.5,
    documentIds: ['d1'],
  });
  assert.equal(doc1Only.length, 1);
  assert.equal(doc1Only[0].chunkId, 'c2');
});

test('buildRagPrompt embeds strict grounding rules and retrieved source citations', () => {
  const { systemInstruction, userPrompt } = buildRagPrompt(
    'What is cosine similarity?',
    [
      {
        chunkId: 'c1',
        documentId: 'd1',
        documentName: 'Guide.pdf',
        pageNumber: 3,
        chunkIndex: 2,
        similarity: 0.892,
        excerpt: 'Cosine similarity measures the cosine of the angle between two vectors.',
      },
    ],
    [{ role: 'user', content: 'Hello' }],
    'balanced'
  );

  assert.ok(systemInstruction.includes('I could not find information about this'));
  assert.ok(userPrompt.includes('Source: Guide.pdf | Page 3'));
  assert.ok(userPrompt.includes('Cosine similarity measures the cosine'));
  assert.ok(userPrompt.includes('What is cosine similarity?'));
});
