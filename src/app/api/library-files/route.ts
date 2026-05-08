// Phase 33C — Library File Attachments API
//
// POST   /api/library-files  — upload file (multipart/form-data)
// GET    /api/library-files   — list files for a library item
// DELETE /api/library-files   — delete file (storage + metadata)
//
// Uploading a file is not remembering.
// Attachments are Library material only.
// File attachment must not alter canonical Memory authority.
// File attachment must not write to archive_items.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 30 * 1024 * 1024 // 30 MB
const STORAGE_BUCKET = 'library-files'

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200)
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  const libraryItemId = request.nextUrl.searchParams.get('library_item_id')

  if (!libraryItemId) {
    return NextResponse.json({ error: 'library_item_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('library_item_files')
    .select('*')
    .eq('library_item_id', libraryItemId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[library-files] GET error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Generate signed URLs for each file
  const files = await Promise.all(
    (data ?? []).map(async (file) => {
      const { data: urlData } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(file.file_path, 3600) // 1 hour expiry

      return {
        ...file,
        url: urlData?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json({ files })
}

// ─── POST (upload) ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const libraryItemId = formData.get('library_item_id') as string | null

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (!libraryItemId) {
    return NextResponse.json({ error: 'library_item_id is required' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
      { status: 400 },
    )
  }

  // Validate MIME type
  const fileType = ALLOWED_MIME_TYPES[file.type]
  if (!fileType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Allowed: DOCX, PDF, PNG, JPG, WEBP.` },
      { status: 400 },
    )
  }

  // Verify library item exists
  const { data: item, error: itemErr } = await supabase
    .from('library_items')
    .select('id')
    .eq('id', libraryItemId)
    .single()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Library item not found' }, { status: 404 })
  }

  // Build storage path: library/{library_item_id}/{timestamp}-{safe_filename}
  const safeName = sanitizeFilename(file.name)
  const timestamp = Date.now()
  const storagePath = `library/${libraryItemId}/${timestamp}-${safeName}`

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer())

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    console.error('[library-files] Upload error:', uploadErr.message)
    return NextResponse.json({ error: 'File upload failed: ' + uploadErr.message }, { status: 500 })
  }

  // Insert metadata row
  const { data: fileRecord, error: insertErr } = await supabase
    .from('library_item_files')
    .insert({
      library_item_id: libraryItemId,
      file_name: file.name,
      file_path: storagePath,
      file_type: fileType,
      mime_type: file.type,
      file_size_bytes: file.size,
      storage_bucket: STORAGE_BUCKET,
    })
    .select()
    .single()

  if (insertErr) {
    // Clean up uploaded file if metadata insert fails
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    console.error('[library-files] Insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Generate signed URL for the response
  const { data: urlData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json(
    {
      file: {
        ...fileRecord,
        url: urlData?.signedUrl ?? null,
      },
    },
    { status: 201 },
  )
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase()
  let body: Record<string, unknown>

  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = body.id as string | undefined
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Get file record to find storage path
  const { data: fileRecord, error: fetchErr } = await supabase
    .from('library_item_files')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !fileRecord) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Delete from storage
  const { error: storageErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([fileRecord.file_path])

  if (storageErr) {
    console.error('[library-files] Storage delete error:', storageErr.message)
    // Continue to delete metadata even if storage delete fails
  }

  // Delete metadata row
  const { error: deleteErr } = await supabase
    .from('library_item_files')
    .delete()
    .eq('id', id)

  if (deleteErr) {
    console.error('[library-files] Delete error:', deleteErr.message)
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  return NextResponse.json({
    deleted: true,
    storageWarning: storageErr ? storageErr.message : undefined,
  })
}
