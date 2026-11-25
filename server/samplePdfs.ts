import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SAMPLES_DIR } from './db';

export interface SamplePdfDefinition {
  slug: string;
  filename: string;
  title: string;
  subtitle: string;
  description: string;
  topics: string[];
  pages: Array<{
    chapterTitle: string;
    paragraphs: string[];
  }>;
}

export const SAMPLE_PDF_DEFINITIONS: SamplePdfDefinition[] = [
  {
    slug: 'rag-architecture-guide',
    filename: 'Retrieval_Augmented_Generation_Guide.pdf',
    title: 'Retrieval-Augmented Generation (RAG) Engineering Guide',
    subtitle: 'B.E. Computer Science Reference Handbook — Vector Search & Grounded LLMs',
    description:
      '4-page technical handbook covering RAG architecture, overlapping document chunking, dense vector embeddings, cosine similarity ranking, and hallucination mitigation.',
    topics: ['RAG Pipeline', 'Chunking', 'Cosine Similarity', 'Hallucination Mitigation'],
    pages: [
      {
        chapterTitle: 'Chapter 1: Introduction to Retrieval-Augmented Generation',
        paragraphs: [
          'Retrieval-Augmented Generation (RAG) is a hybrid artificial intelligence architecture that pairs an information retrieval engine with a generative Large Language Model (LLM). Rather than relying exclusively on static parametric knowledge memorized during pre-training, a RAG system dynamically retrieves relevant passages from an external knowledge base such as PDF manuals, academic textbooks, or enterprise reports at query time.',
          'The primary objective of RAG is to produce accurate, verifiable, and up-to-date answers grounded in user-supplied documents. Standard LLMs suffer from two critical limitations: a fixed knowledge cutoff date and hallucination, where the model generates fluent but factually unsupported claims. RAG mitigates both weaknesses by injecting verified source excerpts directly into the model context window.',
          'A production RAG workflow operates in two distinct phases. The offline Ingestion Pipeline extracts raw text from source PDFs, splits the text into coherent chunks while preserving metadata such as document titles and page numbers, converts each chunk into a dense numerical vector using an embedding model, and persists those vectors in a searchable index.',
          'The online Query Pipeline converts each incoming natural language question into a query embedding in the exact same vector space, computes cosine similarity against all stored chunk vectors, ranks the top-K most relevant passages, and supplies them alongside strict grounding instructions to the generative model.',
        ],
      },
      {
        chapterTitle: 'Chapter 2: Document Processing, Chunking, and Vector Embeddings',
        paragraphs: [
          'Effective document processing begins with accurate page-by-page text extraction. Preserving exact page numbers and section headings during extraction ensures that every downstream answer can cite its exact origin (for example, DocumentName, Page 2) so human reviewers can verify every claim.',
          'Because PDF documents often span dozens or hundreds of pages, feeding an entire document into every prompt is slow, expensive, and dilutes retrieval precision. Chunking divides extracted text into manageable windows typically between 500 and 1,200 characters. Crucially, adjacent chunks share a sliding overlap of 15 to 20 percent (for example, 180 characters) so concepts or sentences crossing a boundary remain intact.',
          'Once chunked, each text passage is encoded by a neural embedding model such as Gemini Embedding 2 into a high-dimensional floating-point vector. Unlike keyword search (TF-IDF or BM25), which fails when users ask questions using synonyms, dense embeddings capture semantic meaning: sentences discussing "overfitting prevention" and "L2 weight decay regularization" map to nearby regions of the vector space.',
          'Storing the chunk text, source PDF identifier, page number, and serialized embedding vector inside a persistent SQLite database enables instant restarts without re-embedding previously processed PDFs.',
        ],
      },
      {
        chapterTitle: 'Chapter 3: Semantic Search and Cosine Similarity Ranking',
        paragraphs: [
          'Semantic similarity search finds the document passages whose meaning most closely matches a user query. Given a query vector Q and a stored chunk vector D of identical dimensionality, Cosine Similarity computes the dot product of Q and D divided by the product of their Euclidean magnitudes: cos(theta) = (Q . D) / (||Q|| * ||D||).',
          'Cosine similarity produces a normalized score between -1.0 and 1.0 regardless of absolute vector magnitude. A score close to 1.0 indicates strong semantic alignment, 0.0 indicates orthogonality (no shared semantic direction), and negative values indicate opposing semantics.',
          'To balance recall and precision, RAG engineers tune two retrieval hyperparameters: Top-K (typically 4 to 6 chunks) and Minimum Similarity Threshold (typically 0.30 to 0.45). If no stored chunk exceeds the minimum similarity threshold, the system knows the uploaded documents likely lack relevant evidence.',
          'Ranking chunks in descending order of cosine similarity places the strongest evidence at the top of the prompt context. Multi-turn conversations also pass recent dialogue turns so follow-up questions like "Explain that formula with an example" resolve cleanly against the retrieved source material.',
        ],
      },
      {
        chapterTitle: 'Chapter 4: Grounded Answer Generation and Evaluation Metrics',
        paragraphs: [
          'After semantic retrieval, the top-K excerpts are assembled into a structured prompt paired with strict grounding rules. The generative model is explicitly instructed to answer strictly from the provided excerpts, include inline source citations, and openly refuse when evidence is missing rather than fabricating answers.',
          'Evaluating a RAG system requires measuring both Retrieval Quality and Generation Quality. Retrieval metrics include Recall@K (percentage of queries where the ground-truth passage appears in the top-K results) and Mean Reciprocal Rank (MRR), which rewards ranking the right passage at position 1.',
          'Generation metrics evaluate Faithfulness (whether every claim in the answer is entailed by the retrieved chunks), Answer Relevance (whether the response directly addresses the user question), and Citation Accuracy (whether cited document names and page numbers match the source excerpt).',
          'Beyond interactive Q&A, the same indexed PDF corpus powers automated Document Summarization (executive, detailed, and chapter-level summaries) and Exam Question Generation (Multiple Choice, Short Answer, and Long Answer questions with model explanations).',
        ],
      },
    ],
  },
  {
    slug: 'machine-learning-cs401',
    filename: 'Machine_Learning_Fundamentals_CS401.pdf',
    title: 'Machine Learning Fundamentals (CS401 Lecture Notes)',
    subtitle: 'Department of Computer Science & Engineering — Final-Year Study Guide',
    description:
      '4-page university course notes covering Supervised vs. Unsupervised Learning, Neural Networks & Backpropagation, Regularization, and Evaluation Metrics.',
    topics: ['Supervised Learning', 'Backpropagation', 'Regularization', 'Precision & Recall'],
    pages: [
      {
        chapterTitle: 'Chapter 1: Supervised and Unsupervised Learning Paradigms',
        paragraphs: [
          'Machine Learning enables computer systems to learn statistical patterns from historical data rather than executing explicitly hand-coded decision rules. In Supervised Learning, each training sample consists of an input feature vector X paired with a known ground-truth target label Y.',
          'Supervised problems split into Classification (predicting discrete categories such as spam detection or medical diagnosis using algorithms like Logistic Regression, Support Vector Machines, and Random Forests) and Regression (predicting continuous numerical values such as housing prices or energy demand using Linear Regression and Gradient Boosted Trees).',
          'In Unsupervised Learning, the dataset contains only input features X without target labels. The algorithm discovers intrinsic structure via Clustering (such as K-Means and DBSCAN to segment customer cohorts) or Dimensionality Reduction (such as Principal Component Analysis, PCA, which projects high-dimensional features onto orthogonal directions of maximum variance).',
          'Choosing the right paradigm depends on label availability, problem formulation, and interpretability requirements. Semi-supervised and self-supervised learning bridge both worlds by pre-training representations on abundant unlabeled corpora before fine-tuning on small labeled datasets.',
        ],
      },
      {
        chapterTitle: 'Chapter 2: Neural Networks and Backpropagation',
        paragraphs: [
          'An Artificial Neural Network (ANN) composes layers of parameterized linear transformations followed by non-linear activation functions. Without non-linear activations such as ReLU (Rectified Linear Unit, f(z) = max(0, z)), Sigmoid, or GELU, stacking multiple linear layers mathematically collapses into a single linear transformation incapable of modeling complex decision boundaries.',
          'During the Forward Pass, input features propagate layer by layer to compute predicted outputs y-hat, which are compared against ground truth y using a differentiable Loss Function such as Mean Squared Error (MSE) for regression or Cross-Entropy Loss for multi-class classification.',
          'Backpropagation applies the chain rule of calculus in reverse from the output layer back to the input layer to compute exact partial derivatives (gradients) of the loss with respect to every weight and bias parameter. Gradient Descent optimizers such as SGD with Momentum and Adam update weights in the negative gradient direction scaled by the learning rate alpha.',
          'Vanishing gradients occur when repeated multiplication of small activation derivatives (such as Sigmoid saturation) shrinks gradients near zero in early layers. Modern deep networks solve this using ReLU/GELU activations, Residual Skip Connections (ResNets), and Batch or Layer Normalization.',
        ],
      },
      {
        chapterTitle: 'Chapter 3: Bias-Variance Tradeoff and Regularization',
        paragraphs: [
          'A central goal in machine learning is Generalization: achieving low prediction error on unseen test data rather than merely memorizing the training set. High Bias (Underfitting) arises when a model is too simple to capture underlying patterns, producing high error on both training and validation sets.',
          'High Variance (Overfitting) occurs when an overly complex model memorizes random noise in the training data, achieving near-zero training error but poor validation accuracy. The Bias-Variance Tradeoff balances model capacity against dataset size.',
          'Regularization techniques explicitly constrain model complexity to prevent overfitting. L2 Regularization (Ridge / Weight Decay) adds lambda * sum(w^2) to the loss function, discouraging excessively large weights. L1 Regularization (Lasso) adds lambda * sum(|w|), driving irrelevant feature weights to exactly zero for automatic feature selection.',
          'In deep neural networks, Dropout randomly zeroes a fraction p (commonly 0.2 to 0.5) of neuron activations during each training step so neurons cannot co-adapt excessively. Early Stopping halts training once validation loss stops improving for a configured patience window.',
        ],
      },
      {
        chapterTitle: 'Chapter 4: Model Evaluation Metrics and Cross-Validation',
        paragraphs: [
          'Evaluating a classifier strictly by overall Accuracy can be misleading on imbalanced datasets (for example, fraud detection where 99% of transactions are legitimate). A Confusion Matrix decomposes predictions into True Positives (TP), False Positives (FP), True Negatives (TN), and False Negatives (FN).',
          'Precision = TP / (TP + FP) measures how many predicted positives are genuinely positive, making it critical when false alarms are costly. Recall (Sensitivity) = TP / (TP + FN) measures how many actual positives the model successfully captures, which is vital in cancer screening or security alerts.',
          'The F1-Score is the harmonic mean of Precision and Recall: F1 = 2 * (Precision * Recall) / (Precision + Recall). ROC-AUC evaluates ranking performance across all classification thresholds by plotting True Positive Rate against False Positive Rate.',
          'K-Fold Cross-Validation (commonly K = 5 or K = 10) partitions the training dataset into K equal folds, trains K separate models holding out a different fold each time, and averages validation scores. Crucially, feature scaling and preprocessing must be fit strictly inside each training fold to prevent data leakage.',
        ],
      },
    ],
  },
];

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

/**
 * Generates real binary multi-page PDF files on disk using pdf-lib so users
 * can import or download authentic PDF documents for RAG testing.
 */
export async function ensureSamplePdfsExist(): Promise<void> {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });

  for (const def of SAMPLE_PDF_DEFINITIONS) {
    const outPath = path.join(SAMPLES_DIR, def.filename);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) {
      continue;
    }

    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    pdfDoc.setTitle(def.title);
    pdfDoc.setSubject(def.subtitle);
    pdfDoc.setCreator('AI PDF Chatbot RAG Platform');

    for (let i = 0; i < def.pages.length; i++) {
      const pageSpec = def.pages[i];
      const page = pdfDoc.addPage([612, 792]); // US Letter
      const { width, height } = page.getSize();
      const marginX = 56;
      let y = height - 56;

      // Top document header bar on page 1, running header on subsequent pages
      if (i === 0) {
        page.drawText(def.title, {
          x: marginX,
          y,
          size: 16,
          font: fontBold,
          color: rgb(0.09, 0.22, 0.48),
        });
        y -= 20;
        page.drawText(def.subtitle, {
          x: marginX,
          y,
          size: 10,
          font: fontRegular,
          color: rgb(0.35, 0.42, 0.52),
        });
        y -= 14;
        page.drawLine({
          start: { x: marginX, y },
          end: { x: width - marginX, y },
          thickness: 1,
          color: rgb(0.82, 0.88, 0.96),
        });
        y -= 28;
      } else {
        page.drawText(def.title, {
          x: marginX,
          y,
          size: 9,
          font: fontRegular,
          color: rgb(0.42, 0.48, 0.58),
        });
        y -= 10;
        page.drawLine({
          start: { x: marginX, y },
          end: { x: width - marginX, y },
          thickness: 0.75,
          color: rgb(0.86, 0.9, 0.96),
        });
        y -= 28;
      }

      // Chapter heading
      const headingLines = wrapText(pageSpec.chapterTitle, 64);
      for (const hLine of headingLines) {
        page.drawText(hLine, {
          x: marginX,
          y,
          size: 13.5,
          font: fontBold,
          color: rgb(0.06, 0.1, 0.2),
        });
        y -= 20;
      }
      y -= 6;

      // Body paragraphs
      for (const para of pageSpec.paragraphs) {
        const lines = wrapText(para, 84);
        for (const line of lines) {
          if (y < 68) break;
          page.drawText(line, {
            x: marginX,
            y,
            size: 10.5,
            font: fontRegular,
            color: rgb(0.15, 0.19, 0.26),
          });
          y -= 16;
        }
        y -= 10;
      }

      // Page footer
      page.drawText(`Page ${i + 1} of ${def.pages.length}`, {
        x: width - marginX - 65,
        y: 34,
        size: 9,
        font: fontRegular,
        color: rgb(0.45, 0.5, 0.58),
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outPath, Buffer.from(pdfBytes));
  }
}

export function getSamplePdfPath(slug: string): { def: SamplePdfDefinition; filePath: string } | null {
  const def = SAMPLE_PDF_DEFINITIONS.find((s) => s.slug === slug);
  if (!def) return null;
  return {
    def,
    filePath: path.join(SAMPLES_DIR, def.filename),
  };
}
