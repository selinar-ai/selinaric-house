// Phase 33D + 33E — Document & Media Text Extraction API
// Phase 34A — Refactored to use shared extraction utilities.
//
// POST /api/library-files/[id]/extract
//
// For DOCX/PDF/MD: sync extraction (downloads from Storage, extracts, saves)
// For image/audio/video: creates extraction job (processed by local worker)
//
// Extraction is not Memory. OCR is not Memory. Transcript is not Memory.
// Searchable media text is not RAG. Library media content is Library material only.
// No embeddings. No vector search. No chat injection.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  extractFromDocx,
  extractFromPdf,
  extractFromPlainText,
  type ExtractionResult,
} from '@/lib/files/extract-text'

const STORAGE_BUCKET = 'library-files'

const JOB_TYPE_MAP: Record<string, string> = {
  image: 'image_ocr',
  audio: 'audio_transcript',
  video: 'video_audio_transcript',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
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

  // ─── Media types: create extraction job (processed by local worker) ───

  const jobType = JOB_TYPE_MAP[fileType]
  if (jobType) {
    // Check for existing queued/processing job to avoid duplicates
    const { data: existingJobs } = await supabase
      .from('library_extraction_jobs')
      .select('*')
      .eq('file_id', id)
      .in('status', ['queued', 'processing'])
      .order('requested_at', { ascending: false })
      .limit(1)

    if (existingJobs && existingJobs.length > 0) {
      const existing = existingJobs[0]
      return NextResponse.json({
        extraction: {
          status: existing.status,
          job_id: existing.id,
          job_type: existing.job_type,
          message: `Extraction already ${existing.status}`,
        },
      })
    }

    // Create extraction job
    const { data: job, error: jobErr } = await supabase
      .from('library_extraction_jobs')
      .insert({
        file_id: id,
        library_item_id: fileRecord.library_item_id,
        job_type: jobType,
        status: 'queued',
      })
      .select()
      .single()

    if (jobErr) {
      console.error('[library-files/extract] Job creation error:', jobErr.message)
      return NextResponse.json({ error: jobErr.message }, { status: 500 })
    }

    // Mark file as queued
    await supabase
      .from('library_item_files')
      .update({
        extraction_status: 'queued',
        extraction_error: null,
      })
      .eq('id', id)

    return NextResponse.json({
      extraction: {
        status: 'queued',
        job_id: job.id,
        job_type: jobType,
        message: 'Extraction job queued. Start the local worker to process.',
      },
    })
  }

  // ─── Document types: sync extraction ─────────────────────────────────

  if (!['docx', 'pdf', 'markdown'].includes(fileType)) {
    // Unsupported (e.g. 'other')
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

  // 7. Extract text based on file type (using shared utilities)
  let result: ExtractionResult

  switch (fileType) {
    case 'docx':
      result = await extractFromDocx(buffer)
      break
    case 'pdf':
      result = await extractFromPdf(buffer)
      break
    case 'markdown':
      result = extractFromPlainText(buffer, 'markdown_text')
      break
    default:
      result = { status: 'unsupported', text: null, error: null, charCount: 0, truncated: false, method: 'none' }
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
      extraction_method: 'text_parse',
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
