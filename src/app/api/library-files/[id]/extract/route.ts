// Phase 33D — Document Text Extraction API
//
// POST /api/library-files/[id]/extract
//
// Downloads file from private Supabase Storage, extracts text,
// and saves extraction result to library_item_files.
//
// Extraction is not Memory. Searchable text is not RAG.
// Extracted attachment text is Library material only.
// No embeddings. No vector search. No chat injection.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const STORAGE_BUCKET = 'library-files'
const MAX_EXTRACTED_CHARS = 200_000

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type ExtractionResult = {
  status: 'extracted' | 'empty' | 'failed' | 'unsupported'
  text: string | null
  error: string | null
  charCount: number
  truncated: boolean
}

async function extractFromDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    const text = result.value?.trim() ?? ''
    if (!text) {
      return { status: 'empty', text: null, error: null, charCount: 0, truncated: false }
    }
    const charCount = text.length
    const truncated = charCount > MAX_EXTRACTED_CHARS
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, MAX_EXTRACTED_CHARS) : text,
      error: null,
      charCount,
      truncated,
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'DOCX extraction failed',
      charCount: 0,
      truncated: false,
    }
  }
}

async function extractFromPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const result = await pdfParse(buffer)
    const text = result.text?.trim() ?? ''
    if (!text) {
      return { status: 'empty', text: null, error: null, charCount: 0, truncated: false }
    }
    const charCount = text.length
    const truncated = charCount > MAX_EXTRACTED_CHARS
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, MAX_EXTRACTED_CHARS) : text,
      error: null,
      charCount,
      truncated,
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'PDF extraction failed',
      charCount: 0,
      truncated: false,
    }
  }
}

function extractFromMarkdown(buffer: Buffer): ExtractionResult {
  try {
    const text = buffer.toString('utf-8').trim()
    if (!text) {
      return { status: 'empty', text: null, error: null, charCount: 0, truncated: false }
    }
    const charCount = text.length
    const truncated = charCount > MAX_EXTRACTED_CHARS
    return {
      status: 'extracted',
      text: truncated ? text.substring(0, MAX_EXTRACTED_CHARS) : text,
      error: null,
      charCount,
      truncated,
    }
  } catch (err) {
    return {
      status: 'failed',
      text: null,
      error: err instanceof Error ? err.message : 'Markdown extraction failed',
      charCount: 0,
      truncated: false,
    }
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getSupabase()
  const { id } = await params

  // 1. Find file record
  const { data: fileRecord, error: fetchErr } = await supabase
    .from('library_item_files')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !fileRecord) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // 2. Verify library item exists
  const { data: item, error: itemErr } = await supabase
    .from('library_items')
    .select('id')
    .eq('id', fileRecord.library_item_id)
    .single()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Library item not found' }, { status: 404 })
  }

  const fileType = fileRecord.file_type as string

  // 3. Check if file type supports extraction
  if (!['docx', 'pdf', 'markdown'].includes(fileType)) {
    // Mark as unsupported and return
    await supabase
      .from('library_item_files')
      .update({
        extraction_status: 'unsupported',
        extracted_text: null,
        extracted_at: new Date().toISOString(),
        extraction_error: null,
        extraction_char_count: 0,
        extraction_truncated: false,
      })
      .eq('id', id)

    return NextResponse.json({
      extraction: {
        status: 'unsupported',
        char_count: 0,
        truncated: false,
        preview: null,
      },
    })
  }

  // 4. Mark as processing
  await supabase
    .from('library_item_files')
    .update({ extraction_status: 'processing' })
    .eq('id', id)

  // 5. Download file from storage
  const { data: downloadData, error: downloadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(fileRecord.file_path)

  if (downloadErr || !downloadData) {
    const errMsg = downloadErr?.message ?? 'Failed to download file from storage'
    await supabase
      .from('library_item_files')
      .update({
        extraction_status: 'failed',
        extraction_error: errMsg,
        extracted_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ error: errMsg }, { status: 500 })
  }

  // 6. Convert to Buffer
  const buffer = Buffer.from(await downloadData.arrayBuffer())

  // 7. Extract text based on file type
  let result: ExtractionResult

  switch (fileType) {
    case 'docx':
      result = await extractFromDocx(buffer)
      break
    case 'pdf':
      result = await extractFromPdf(buffer)
      break
    case 'markdown':
      result = extractFromMarkdown(buffer)
      break
    default:
      result = { status: 'unsupported', text: null, error: null, charCount: 0, truncated: false }
  }

  // 8. Save extraction result
  const { error: updateErr } = await supabase
    .from('library_item_files')
    .update({
      extraction_status: result.status,
      extracted_text: result.text,
      extracted_at: new Date().toISOString(),
      extraction_error: result.error,
      extraction_char_count: result.charCount,
      extraction_truncated: result.truncated,
    })
    .eq('id', id)

  if (updateErr) {
    console.error('[library-files/extract] Update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // 9. Return result with preview
  const previewLength = 500
  const preview = result.text
    ? result.text.substring(0, previewLength) + (result.text.length > previewLength ? '…' : '')
    : null

  return NextResponse.json({
    extraction: {
      status: result.status,
      char_count: result.charCount,
      truncated: result.truncated,
      error: result.error,
      preview,
    },
  })
}
