// Phase 34A — Shared text extraction utilities.
//
// Extracted from the Library file extraction route (Phase 33D/33E)
// so both Library extraction and Chat Attachments can reuse them.
//
// Extraction is not Memory. Extracted text is source material only.
// No embeddings. No vector search. No Memory promotion.

const MAX_EXTRACTED_CHARS = 200_000

export type ExtractionStatus = 'extracted' | 'empty' | 'failed' | 'unsupported'

export interface ExtractionResult {
  status: ExtractionStatus
  text: string | null
  error: string | null
  charCount: number
  truncated: boolean
  method: string
}

/**
 * Extract text from a DOCX buffer using mammoth.
 */
export async function extractFromDocx(buffer: Buffer, maxChars = MAX_EXTRACTED_CHARS): Promise<ExtractionResult> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value?.trim() ?? ''
    if (!text) {
      return { status: 'empty', text: null, error: null, charCount: 0, truncated: false, method: 'docx_text_parse' }
    }
    const charCount = text.length
    const truncated = charCount > maxChars
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, maxChars) : text,
      error: null,
      charCount,
      truncated,
      method: 'docx_text_parse',
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'DOCX extraction failed',
      charCount: 0,
      truncated: false,
      method: 'docx_text_parse',
    }
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse.
 * Scanned/image-only PDFs will return empty text — this is honest, not a failure.
 */
export async function extractFromPdf(buffer: Buffer, maxChars = MAX_EXTRACTED_CHARS): Promise<ExtractionResult> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    const text = result.text?.trim() ?? ''
    if (!text) {
      return {
        status: 'empty',
        text: null,
        error: 'No readable text found. This may be a scanned/image-only PDF.',
        charCount: 0,
        truncated: false,
        method: 'pdf_text_parse',
      }
    }
    const charCount = text.length
    const truncated = charCount > maxChars
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, maxChars) : text,
      error: null,
      charCount,
      truncated,
      method: 'pdf_text_parse',
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'PDF extraction failed',
      charCount: 0,
      truncated: false,
      method: 'pdf_text_parse',
    }
  }
}

/**
 * Extract text from a Markdown/plain-text buffer (UTF-8).
 * Used for .md, .txt, .csv, .json files.
 */
export function extractFromPlainText(
  buffer: Buffer,
  method: string = 'plain_text',
  maxChars = MAX_EXTRACTED_CHARS,
): ExtractionResult {
  try {
    const text = buffer.toString('utf-8').trim()
    if (!text) {
      return { status: 'empty', text: null, error: null, charCount: 0, truncated: false, method }
    }
    const charCount = text.length
    const truncated = charCount > maxChars
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, maxChars) : text,
      error: null,
      charCount,
      truncated,
      method,
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'Text extraction failed',
      charCount: 0,
      truncated: false,
      method,
    }
  }
}

/**
 * Determine extraction method from MIME type and dispatch to appropriate extractor.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  maxChars = MAX_EXTRACTED_CHARS,
): Promise<ExtractionResult> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  // Plain text types
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'json' ||
    ext === 'markdown' || ext === 'tsv'
  ) {
    const method = ext === 'md' || ext === 'markdown'
      ? 'markdown_text'
      : ext === 'csv' || ext === 'tsv'
      ? 'csv_text'
      : ext === 'json'
      ? 'json_text'
      : 'plain_text'
    return extractFromPlainText(buffer, method, maxChars)
  }

  // DOCX
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return extractFromDocx(buffer, maxChars)
  }

  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return extractFromPdf(buffer, maxChars)
  }

  // Image types — unsupported in v1
  if (mimeType.startsWith('image/')) {
    return {
      status: 'unsupported',
      text: null,
      error: 'Image understanding/OCR is not supported in Chat Attachments v1.',
      charCount: 0,
      truncated: false,
      method: 'none',
    }
  }

  // Audio/video — unsupported in v1
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
    return {
      status: 'unsupported',
      text: null,
      error: 'Audio/video transcription is not supported in Chat Attachments v1.',
      charCount: 0,
      truncated: false,
      method: 'none',
    }
  }

  return {
    status: 'unsupported',
    text: null,
    error: `File type "${mimeType}" (${ext}) is not supported in Chat Attachments v1.`,
    charCount: 0,
    truncated: false,
    method: 'none',
  }
}
