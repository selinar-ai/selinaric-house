// Phase 27C — Markdown import endpoint for Archive Conversations.
//
// POST multipart/form-data
//   archiveName   'velvet' | 'violet' | 'house'   (required)
//   importLabel   string                           (optional — stored in notes)
//   notes         string                           (optional global notes)
//   files         File[]                           (.md / .txt only)
//
// Each file is independently validated and inserted into archive_sources.
// Duplicate check: skips if source_document already exists in the same archive_name.
// Returns: { imported: [...], skipped: [...] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  VELVET_SOURCE_DEFAULTS,
  VIOLET_SOURCE_DEFAULTS,
  HOUSE_SOURCE_DEFAULTS,
  type ArchiveName,
} from '@/lib/archives'
import { parseMarkdownFile, MAX_CONTENT_CHARS, ACCEPTED_EXTENSIONS } from '@/lib/markdown-import'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const VALID_ARCHIVE_NAMES: ArchiveName[] = ['velvet', 'violet', 'house']

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 })
  }

  const archiveName = formData.get('archiveName') as string | null
  const importLabel = formData.get('importLabel') as string | null
  const notes       = formData.get('notes')       as string | null
  const files       = formData.getAll('files')    as File[]

  if (!archiveName || !VALID_ARCHIVE_NAMES.includes(archiveName as ArchiveName)) {
    return NextResponse.json({ error: 'archiveName must be velvet | violet | house' }, { status: 400 })
  }
  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const defaults =
    archiveName === 'velvet' ? VELVET_SOURCE_DEFAULTS :
    archiveName === 'violet' ? VIOLET_SOURCE_DEFAULTS :
    HOUSE_SOURCE_DEFAULTS

  const imported: { filename: string; id: string; title: string }[] = []
  const skipped:  { filename: string; reason: string }[]             = []

  for (const file of files) {
    const filename = file.name

    // Extension check
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      skipped.push({ filename, reason: `Unsupported type (${ext}). Only .md and .txt accepted.` })
      continue
    }

    // Read content
    let text: string
    try {
      text = await file.text()
    } catch {
      skipped.push({ filename, reason: 'Failed to read file content.' })
      continue
    }

    if (!text.trim()) {
      skipped.push({ filename, reason: 'File is empty.' })
      continue
    }

    if (text.trim().length > MAX_CONTENT_CHARS) {
      skipped.push({
        filename,
        reason: `Exceeds ${MAX_CONTENT_CHARS.toLocaleString()} char limit (${text.trim().length.toLocaleString()} chars).`,
      })
      continue
    }

    // Duplicate check
    const { data: existing } = await supabase
      .from('archive_sources')
      .select('id')
      .eq('archive_name', archiveName)
      .eq('source_document', filename)
      .is('deleted_at', null)
      .maybeSingle()

    if (existing) {
      skipped.push({ filename, reason: 'Already imported (filename already exists in this archive).' })
      continue
    }

    // Parse metadata
    const parsed = parseMarkdownFile(filename, text)

    // Build notes field — importLabel prefix + freeform notes
    const noteParts: string[] = []
    if (importLabel?.trim()) noteParts.push(`Import: ${importLabel.trim()}`)
    if (notes?.trim())       noteParts.push(notes.trim())
    const combinedNotes = noteParts.length > 0 ? noteParts.join(' · ') : null

    // Insert
    const { data: inserted, error: insertError } = await supabase
      .from('archive_sources')
      .insert({
        ...defaults,
        title:           parsed.title,
        raw_content:     parsed.raw_content,
        char_count:      parsed.char_count,
        source_date:     parsed.source_date ?? null,
        source_document: filename,
        notes:           combinedNotes,
      })
      .select('id, title')
      .single()

    if (insertError || !inserted) {
      skipped.push({ filename, reason: insertError?.message ?? 'Insert failed.' })
      continue
    }

    imported.push({ filename, id: inserted.id, title: inserted.title })
  }

  return NextResponse.json({ imported, skipped })
}
