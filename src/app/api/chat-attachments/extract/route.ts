// Phase 34A — Chat Attachment Extraction API
//
// POST /api/chat-attachments/extract
//
// Accepts file uploads via Supabase Storage staging (chat-attachments bucket).
// Extracts readable text and returns structured ChatAttachmentContext[].
// Deletes staged files after extraction.
//
// Read ≠ Remember. Attach ≠ Ingest. Save ≠ Memory.
// No Library items. No Memory. No Archive entries. No canonical status changes.
//
// Security: Uses SUPABASE_SERVICE_ROLE_KEY for download + delete (bypasses RLS).
// Client can only upload to tmp/ prefix; cannot read or delete staged files.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { extractTextFromBuffer } from '@/lib/files/extract-text'
import {
  CHAT_ATTACHMENT_MAX_FILES,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  type ChatAttachmentContext,
} from '@/lib/files/chat-attachment-types'

const BUCKET = 'chat-attachments'

/** Service-role client — bypasses RLS for download + delete of staged files. */
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[chat-attachments] Missing env:', { hasUrl: !!url, hasKey: !!key })
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  let supabase
  try {
    supabase = getServiceSupabase()
  } catch (err) {
    console.error('[chat-attachments] Service role init failed:', err)
    return NextResponse.json(
      { error: 'Server configuration error: service role key missing.' },
      { status: 500 },
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  const storagePaths = formData.getAll('storagePaths') as string[]

  // Mode 1: Files uploaded via Supabase Storage staging (storagePaths provided)
  // Mode 2: Direct file upload via formData (small files only)
  // Both modes are supported — client chooses based on file size.

  const results: ChatAttachmentContext[] = []

  if (storagePaths.length > 0) {
    // ─── Supabase Storage staging mode ─────────────────────────────────
    if (storagePaths.length > CHAT_ATTACHMENT_MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${CHAT_ATTACHMENT_MAX_FILES} attachments per message.` },
        { status: 400 },
      )
    }

    const fileNames = formData.getAll('fileNames') as string[]
    const mimeTypes = formData.getAll('mimeTypes') as string[]
    const fileSizes = formData.getAll('fileSizes') as string[]

    for (let i = 0; i < storagePaths.length; i++) {
      const path = storagePaths[i]
      const fileName = fileNames[i] ?? 'unknown'
      const mimeType = mimeTypes[i] ?? 'application/octet-stream'
      const sizeBytes = parseInt(fileSizes[i] ?? '0', 10)
      const id = `chat-att-${Date.now()}-${i}`

      // Validate path starts with tmp/ (defense in depth)
      if (!path.startsWith('tmp/')) {
        results.push({
          id,
          fileName,
          mimeType,
          sizeBytes,
          extractionStatus: 'failed',
          charCount: 0,
          error: 'Invalid storage path.',
        })
        continue
      }

      if (sizeBytes > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
        results.push({
          id,
          fileName,
          mimeType,
          sizeBytes,
          extractionStatus: 'too_large',
          charCount: 0,
          error: `File exceeds the ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / 1024 / 1024)}MB limit.`,
        })
        // Clean up staged file
        await supabase.storage.from(BUCKET).remove([path])
        continue
      }

      // Download from staging (service role — bypasses RLS)
      const { data: downloadData, error: downloadErr } = await supabase.storage
        .from(BUCKET)
        .download(path)

      if (downloadErr || !downloadData) {
        console.error(`[chat-attachments] Download failed for ${path}:`, downloadErr?.message)
        results.push({
          id,
          fileName,
          mimeType,
          sizeBytes,
          extractionStatus: 'failed',
          charCount: 0,
          error: `Staged file read failed: ${downloadErr?.message ?? 'no data returned'}`,
        })
        continue
      }

      const buffer = Buffer.from(await downloadData.arrayBuffer())

      // Extract text
      const extraction = await extractTextFromBuffer(buffer, mimeType, fileName)

      results.push({
        id,
        fileName,
        mimeType,
        sizeBytes,
        extractionStatus: extraction.status === 'empty' ? 'failed' : extraction.status as ChatAttachmentContext['extractionStatus'],
        extractionMethod: extraction.method,
        extractedText: extraction.text ?? undefined,
        charCount: extraction.charCount,
        truncated: extraction.truncated,
        error: extraction.error ?? (extraction.status === 'empty' ? 'No readable text found in the file.' : undefined),
      })

      // Delete staged file after extraction (service role — bypasses RLS)
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {
        // Non-fatal — file will be cleaned up eventually
        console.warn(`[chat-attachments] Failed to delete staged file: ${path}`)
      })
    }
  } else if (files.length > 0) {
    // ─── Direct upload mode (small files) ──────────────────────────────
    if (files.length > CHAT_ATTACHMENT_MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${CHAT_ATTACHMENT_MAX_FILES} attachments per message.` },
        { status: 400 },
      )
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const id = `chat-att-${Date.now()}-${i}`

      if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
        results.push({
          id,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          extractionStatus: 'too_large',
          charCount: 0,
          error: `File exceeds the ${Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / 1024 / 1024)}MB limit.`,
        })
        continue
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const extraction = await extractTextFromBuffer(buffer, file.type || 'application/octet-stream', file.name)

      results.push({
        id,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        extractionStatus: extraction.status === 'empty' ? 'failed' : extraction.status as ChatAttachmentContext['extractionStatus'],
        extractionMethod: extraction.method,
        extractedText: extraction.text ?? undefined,
        charCount: extraction.charCount,
        truncated: extraction.truncated,
        error: extraction.error ?? (extraction.status === 'empty' ? 'No readable text found in the file.' : undefined),
      })
    }
  } else {
    return NextResponse.json({ error: 'No files or storage paths provided.' }, { status: 400 })
  }

  return NextResponse.json({ attachments: results })
}
