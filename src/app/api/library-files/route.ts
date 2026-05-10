// Phase 33C.3 — Library File Attachments API (direct Storage upload)
//
// POST   /api/library-files  — create metadata (JSON body, no file bytes)
// GET    /api/library-files  — list files for a library item
// DELETE /api/library-files  — delete file (storage + metadata)
//
// File bytes upload directly from browser to Supabase Storage.
// This API only manages metadata rows and signed URLs.
//
// Uploading a file is not remembering.
// Attachments are Library material only.
// File attachment must not alter canonical Memory authority.
// File attachment must not write to archive_items.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const STORAGE_BUCKET = 'library-files'

const VALID_FILE_TYPES = new Set(['docx', 'pdf', 'image', 'markdown', 'audio', 'video', 'other'])

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
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

// ─── POST (metadata only — file bytes uploaded directly to Storage) ────────

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const libraryItemId = body.library_item_id as string | undefined
  const fileName = body.file_name as string | undefined
  const filePath = body.file_path as string | undefined
  const fileType = body.file_type as string | undefined
  const mimeType = body.mime_type as string | undefined
  const fileSizeBytes = body.file_size_bytes as number | undefined

  // Validate required fields
  if (!libraryItemId) {
    return NextResponse.json({ error: 'library_item_id is required' }, { status: 400 })
  }
  if (!fileName || !filePath || !fileType) {
    return NextResponse.json({ error: 'file_name, file_path, and file_type are required' }, { status: 400 })
  }
  if (!VALID_FILE_TYPES.has(fileType)) {
    return NextResponse.json({ error: `Invalid file_type: ${fileType}` }, { status: 400 })
  }

  // Verify the storage path belongs to this library item (prevent path injection)
  const expectedPrefix = `library/${libraryItemId}/`
  if (!filePath.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: 'Invalid file_path' }, { status: 400 })
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

  // Verify the file actually exists in storage
  const { data: storageList, error: listErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(`library/${libraryItemId}`, {
      search: filePath.replace(expectedPrefix, ''),
      limit: 1,
    })

  if (listErr || !storageList || storageList.length === 0) {
    return NextResponse.json({ error: 'File not found in storage. Upload the file first.' }, { status: 400 })
  }

  // Insert metadata row
  const { data: fileRecord, error: insertErr } = await supabase
    .from('library_item_files')
    .insert({
      library_item_id: libraryItemId,
      file_name: fileName,
      file_path: filePath,
      file_type: fileType,
      mime_type: mimeType ?? null,
      file_size_bytes: fileSizeBytes ?? null,
      storage_bucket: STORAGE_BUCKET,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[library-files] Insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // Generate signed URL for the response
  const { data: urlData } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filePath, 3600)

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
