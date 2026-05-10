'use client'

// Phase 33B + 33C — House Library v1 + File Attachments
//
// Collections sidebar · Item list with search/filters · Item detail · Create/edit form
// Development Documentation grouped by phase_code/phase_label
// Authority display uses getEffectiveAuthorityStatus() — One Crown Rule enforced
// Phase 33C+E: File attachments (DOCX, PDF, MD, images, audio, video) via Supabase Storage
//
// This is a reference-material surface only.
// No RAG, no embeddings, no chat injection, no Memory Review, no auto-promotion.
// Reading is not remembering. Uploading a file is not remembering.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveAuthorityStatus, isInvalidCanonicalMemoryLabel } from '@/lib/library/authority'
import type { AuthorityStatus, PresenceScope, RetrievedContextItem } from '@/lib/library/authority'

// ─── Supabase client (browser-side, for direct Storage uploads) ────────────

const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ─── Types ──────────────────────────────────────────────────────────────────

type Collection =
  | 'development_documentation'
  | 'books'
  | 'articles'
  | 'transcripts'
  | 'images'
  | 'research'
  | 'archive_references'

type ItemType =
  | 'design_brief'
  | 'markdown_file'
  | 'validation_record'
  | 'architecture_law'
  | 'ui_polish_request'
  | 'technical_note'
  | 'thread_handoff'
  | 'superseded_archive'
  | 'guide'
  | 'book'
  | 'article'
  | 'transcript'
  | 'image'
  | 'research_note'
  | 'reference'
  | 'other'

interface LibraryItem {
  id: string
  title: string
  description: string | null
  collection: Collection
  item_type: ItemType
  phase_label: string | null
  phase_code: string | null
  phase_number: number | null
  authority_status: AuthorityStatus
  presence_scope: PresenceScope
  source_url: string | null
  file_path: string | null
  content_text: string | null
  external_doc_id: string | null
  tags: string[]
  archive_item_id: string | null
  derived_canonical_status: string | null
  created_at: string
  updated_at: string
}

interface LibraryFile {
  id: string
  library_item_id: string
  file_name: string
  file_path: string
  file_type: 'docx' | 'pdf' | 'image' | 'markdown' | 'audio' | 'video' | 'other'
  mime_type: string | null
  file_size_bytes: number | null
  storage_bucket: string
  created_at: string
  url: string | null
  // Extraction fields (Phase 33D + 33E)
  extraction_status: 'not_started' | 'queued' | 'processing' | 'extracted' | 'empty' | 'failed' | 'unsupported'
  extracted_text: string | null
  extracted_at: string | null
  extraction_error: string | null
  extraction_char_count: number | null
  extraction_truncated: boolean
  extraction_method: string | null
  extraction_confidence: number | null
  extraction_language: string | null
  media_duration_seconds: number | null
  extraction_metadata: Record<string, unknown>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'development_documentation', label: 'Development Docs' },
  { id: 'books', label: 'Books' },
  { id: 'articles', label: 'Articles' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'images', label: 'Images' },
  { id: 'research', label: 'Research' },
  { id: 'archive_references', label: 'Archive References' },
]

const ITEM_TYPES: { id: ItemType; label: string }[] = [
  { id: 'design_brief', label: 'Design Brief' },
  { id: 'markdown_file', label: 'Markdown File' },
  { id: 'validation_record', label: 'Validation Record' },
  { id: 'architecture_law', label: 'Architecture Law' },
  { id: 'ui_polish_request', label: 'UI Polish Request' },
  { id: 'technical_note', label: 'Technical Note' },
  { id: 'thread_handoff', label: 'Thread Handoff' },
  { id: 'superseded_archive', label: 'Superseded Archive' },
  { id: 'guide', label: 'Guide' },
  { id: 'book', label: 'Book' },
  { id: 'article', label: 'Article' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'image', label: 'Image' },
  { id: 'research_note', label: 'Research Note' },
  { id: 'reference', label: 'Reference' },
  { id: 'other', label: 'Other' },
]

const AUTHORITY_LABELS: Record<AuthorityStatus, string> = {
  library_reference: 'Library Reference',
  technical_reference: 'Technical Reference',
  validation_record: 'Validation Record',
  thread_handoff: 'Thread Handoff',
  ui_request: 'UI Request',
  architecture_law: 'Architecture Law',
  archive_only: 'Archive Only',
  canonical_candidate: 'Canonical Candidate',
  canonical_memory: 'Canonical Memory',
  superseded: 'Superseded',
}

const AUTHORITY_COLORS: Record<AuthorityStatus, string> = {
  library_reference: 'text-text-muted',
  technical_reference: 'text-blue-400',
  validation_record: 'text-green-400',
  thread_handoff: 'text-amber-400',
  ui_request: 'text-purple-400',
  architecture_law: 'text-red-400',
  archive_only: 'text-text-muted',
  canonical_candidate: 'text-amber-400',
  canonical_memory: 'text-green-400',
  superseded: 'text-text-muted line-through',
}

const PRESENCE_LABELS: Record<PresenceScope, string> = {
  ari: 'Ari',
  eli: 'Eli',
  shared: 'Shared',
  house: 'House',
  none: 'None',
}

// ─── Blank form ─────────────────────────────────────────────────────────────

const BLANK_FORM = {
  title: '',
  description: '',
  collection: 'development_documentation' as Collection,
  item_type: 'technical_note' as ItemType,
  phase_label: '',
  phase_code: '',
  phase_number: '',
  authority_status: 'library_reference' as AuthorityStatus,
  presence_scope: 'house' as PresenceScope,
  source_url: '',
  file_path: '',
  content_text: '',
  tags: '',
  archive_item_id: '',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function itemToContextItem(item: LibraryItem): RetrievedContextItem {
  return {
    id: item.id,
    title: item.title,
    source_type: item.item_type,
    authority_status: item.authority_status,
    presence_scope: item.presence_scope,
    content: item.content_text ?? '',
    created_at: item.created_at,
    updated_at: item.updated_at,
    archive_item_id: item.archive_item_id ?? undefined,
    derived_canonical_status: item.derived_canonical_status === 'canonical' ? 'canonical' : undefined,
  }
}

function getEffectiveAuthority(item: LibraryItem): AuthorityStatus {
  return getEffectiveAuthorityStatus(itemToContextItem(item))
}

function isRejectedCanonical(item: LibraryItem): boolean {
  return isInvalidCanonicalMemoryLabel(itemToContextItem(item))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FILE_TYPE_ICONS: Record<string, string> = {
  docx: '📄',
  pdf: '📕',
  image: '🖼',
  markdown: '📝',
  audio: '🎵',
  video: '🎬',
  other: '📎',
}

const ACCEPTED_FILE_TYPES = '.docx,.pdf,.md,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.mp4,.mov,.webm'

const MAX_FILE_SIZE = 30 * 1024 * 1024 // 30 MB
const STORAGE_BUCKET = 'library-files'

const ALLOWED_MIME_MAP: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/mp4': 'audio',
  'audio/m4a': 'audio',
  'audio/wav': 'audio',
  'audio/webm': 'audio',
  'audio/x-wav': 'audio',
  'audio/x-m4a': 'audio',
  // Video
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
}
const MD_EXTENSION_ONLY = new Set(['text/plain', 'application/octet-stream'])

const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'wma', 'aac'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi'])

function resolveFileType(file: File): string | null {
  const mapped = ALLOWED_MIME_MAP[file.type]
  if (mapped) return mapped
  if (MD_EXTENSION_ONLY.has(file.type) && file.name.toLowerCase().endsWith('.md')) return 'markdown'
  // Extension fallback for audio/video with generic MIME types
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200)
}

/** Safely parse a fetch response — never throws a JSON parse error */
async function safeResponseJson(res: Response): Promise<{ ok: boolean; data: Record<string, unknown> | null; error: string }> {
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      try {
        const data = await res.json()
        return { ok: false, data, error: (data as Record<string, unknown>).error as string ?? `HTTP ${res.status}` }
      } catch {
        return { ok: false, data: null, error: `HTTP ${res.status}` }
      }
    }
    // Non-JSON error response (e.g. "Request Entity Too Large")
    const text = await res.text().catch(() => '')
    const msg = text.length > 0 && text.length < 200 ? text : `HTTP ${res.status}`
    return { ok: false, data: null, error: msg }
  }
  try {
    const data = await res.json()
    return { ok: true, data, error: '' }
  } catch {
    return { ok: true, data: null, error: '' }
  }
}

/**
 * Upload a file directly to Supabase Storage from the browser,
 * then create metadata via the API route.
 * Returns { file, error }.
 */
async function uploadLibraryFile(
  file: File,
  libraryItemId: string,
): Promise<{ file: LibraryFile | null; error: string | null }> {
  // Client-side validation
  if (file.size > MAX_FILE_SIZE) {
    return { file: null, error: `File too large (${formatFileSize(file.size)}). Maximum is 30 MB.` }
  }
  const fileType = resolveFileType(file)
  if (!fileType) {
    return { file: null, error: `Unsupported file type: ${file.type}. Allowed: DOCX, PDF, MD, PNG, JPG, WEBP, MP3, WAV, M4A, MP4, MOV, WEBM.` }
  }

  // Build storage path
  const safeName = sanitizeFilename(file.name)
  const timestamp = Date.now()
  const storagePath = `library/${libraryItemId}/${timestamp}-${safeName}`

  // Direct upload to Supabase Storage (bypasses Vercel body limits)
  const { error: uploadErr } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    return { file: null, error: `Storage upload failed: ${uploadErr.message}` }
  }

  // Create metadata via API route (small JSON, no file bytes)
  const metaRes = await fetch('/api/library-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      library_item_id: libraryItemId,
      file_name: file.name,
      file_path: storagePath,
      file_type: fileType,
      mime_type: file.type,
      file_size_bytes: file.size,
    }),
  })

  const parsed = await safeResponseJson(metaRes)
  if (!parsed.ok) {
    // Clean up the uploaded file since metadata creation failed
    await supabaseClient.storage.from(STORAGE_BUCKET).remove([storagePath])
    return { file: null, error: parsed.error }
  }

  return {
    file: (parsed.data as Record<string, unknown>)?.file as LibraryFile ?? null,
    error: null,
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  // Data
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [activeCollection, setActiveCollection] = useState<Collection | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [authorityFilter, setAuthorityFilter] = useState<AuthorityStatus | ''>('')
  const [presenceFilter, setPresenceFilter] = useState<PresenceScope | ''>('')

  // Detail / form state
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formWarning, setFormWarning] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Phase 33C.1 — staged files for new item creation
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const [uploadErrors, setUploadErrors] = useState<string[]>([])

  // Phase 33D — attachment text search match tracking
  const [attachmentMatches, setAttachmentMatches] = useState<Record<string, string[]>>({})

  // ─── Fetch ──────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (activeCollection) params.set('collection', activeCollection)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (authorityFilter) params.set('authority_status', authorityFilter)
      if (presenceFilter) params.set('presence_scope', presenceFilter)

      const res = await fetch(`/api/library-items?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setItems(data.items ?? [])
      setAttachmentMatches(data.attachment_matches ?? {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library items')
    } finally {
      setLoading(false)
    }
  }, [activeCollection, searchQuery, authorityFilter, presenceFilter])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Fetch all items for collection counts (unfiltered)
  const [allItems, setAllItems] = useState<LibraryItem[]>([])
  useEffect(() => {
    async function fetchAll() {
      try {
        const res = await fetch('/api/library-items')
        const data = await res.json()
        if (res.ok) setAllItems(data.items ?? [])
      } catch { /* silent */ }
    }
    fetchAll()
  }, [items]) // re-fetch counts when items change

  // ─── Collection counts ────────────────────────────────────────────────

  const collectionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of allItems) {
      counts[item.collection] = (counts[item.collection] ?? 0) + 1
    }
    return counts
  }, [allItems])

  // ─── Phase grouping (for development_documentation) ───────────────────

  const phaseGroups = useMemo(() => {
    if (activeCollection !== 'development_documentation') return null

    const grouped: Record<string, LibraryItem[]> = {}
    const ungrouped: LibraryItem[] = []

    for (const item of items) {
      const key = item.phase_code
      if (key) {
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(item)
      } else {
        ungrouped.push(item)
      }
    }

    // Sort phase groups by phase_number (descending), then phase_code
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      const aNum = grouped[a][0]?.phase_number ?? 0
      const bNum = grouped[b][0]?.phase_number ?? 0
      if (bNum !== aNum) return bNum - aNum
      return b.localeCompare(a)
    })

    return { sortedKeys, grouped, ungrouped }
  }, [items, activeCollection])

  // ─── Form handlers ────────────────────────────────────────────────────

  function openCreateForm() {
    setEditingItem(null)
    setForm({
      ...BLANK_FORM,
      collection: activeCollection ?? 'development_documentation',
    })
    setFormError(null)
    setFormWarning(null)
    setStagedFiles([])
    setUploadErrors([])
    setFormOpen(true)
    setSelectedItem(null)
  }

  function openEditForm(item: LibraryItem) {
    setEditingItem(item)
    setForm({
      title: item.title,
      description: item.description ?? '',
      collection: item.collection,
      item_type: item.item_type,
      phase_label: item.phase_label ?? '',
      phase_code: item.phase_code ?? '',
      phase_number: item.phase_number != null ? String(item.phase_number) : '',
      authority_status: item.authority_status,
      presence_scope: item.presence_scope,
      source_url: item.source_url ?? '',
      file_path: item.file_path ?? '',
      content_text: item.content_text ?? '',
      tags: item.tags.join(', '),
      archive_item_id: item.archive_item_id ?? '',
    })
    setFormError(null)
    setFormWarning(null)
    setStagedFiles([])
    setUploadErrors([])
    setFormOpen(true)
    setSelectedItem(null)
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return

    setFormSubmitting(true)
    setFormError(null)
    setFormWarning(null)
    setUploadErrors([])

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      collection: form.collection,
      item_type: form.item_type,
      phase_label: form.phase_label.trim() || null,
      phase_code: form.phase_code.trim() || null,
      phase_number: form.phase_number.trim() ? Number(form.phase_number) : null,
      authority_status: form.authority_status,
      presence_scope: form.presence_scope,
      source_url: form.source_url.trim() || null,
      file_path: form.file_path.trim() || null,
      content_text: form.content_text.trim() || null,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      archive_item_id: form.archive_item_id.trim() || null,
    }

    // Only set derived_canonical_status if claiming canonical_memory
    if (form.authority_status === 'canonical_memory' && form.archive_item_id.trim()) {
      payload.derived_canonical_status = 'canonical'
    }

    try {
      const isEdit = !!editingItem
      const method = isEdit ? 'PATCH' : 'POST'
      if (isEdit) payload.id = editingItem!.id

      const res = await fetch('/api/library-items', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      if (data.warning) {
        setFormWarning(data.warning)
      }

      const createdItem: LibraryItem | null = data.item ?? null

      // Phase 33C.1 — Upload staged files after successful item creation
      // Uses direct browser-to-Supabase Storage upload (bypasses Vercel body limits)
      const fileErrors: string[] = []
      if (!isEdit && createdItem && stagedFiles.length > 0) {
        for (const file of stagedFiles) {
          try {
            const result = await uploadLibraryFile(file, createdItem.id)
            if (result.error) {
              fileErrors.push(`${file.name}: ${result.error}`)
            }
          } catch (err) {
            fileErrors.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`)
          }
        }
      }

      setFormOpen(false)
      setEditingItem(null)
      setForm({ ...BLANK_FORM })
      setStagedFiles([])
      await fetchItems()

      // Show file upload errors if any, but keep the item
      if (fileErrors.length > 0) {
        setUploadErrors(fileErrors)
      }

      // Open the newly created item in the detail view
      if (!isEdit && createdItem) {
        setSelectedItem(createdItem)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch('/api/library-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      setDeleteConfirm(null)
      setSelectedItem(null)
      await fetchItems()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="shrink-0 border-b border-house-border bg-house-surface px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-sm font-light tracking-[0.2em] text-text-primary uppercase">
              Library
            </h2>
            <p className="font-body text-xs text-text-muted mt-0.5">
              Reference material · Documentation · Guides
            </p>
          </div>
          <button
            onClick={openCreateForm}
            className="font-body text-xs px-3 py-1.5 border border-house-muted text-text-secondary hover:bg-house-bg transition-all"
          >
            + Add item
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">

        {/* Collections sidebar */}
        <div className="hidden md:flex flex-col w-52 shrink-0 border-r border-house-border bg-house-surface/50">
          <div className="px-3 py-2.5 border-b border-house-border/40">
            <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
              Collections
            </span>
          </div>
          <nav className="flex-1 py-1 overflow-y-auto">
            <button
              onClick={() => setActiveCollection(null)}
              className={`
                w-full text-left px-3 py-2 font-body text-xs transition-colors
                flex items-center justify-between
                ${activeCollection === null
                  ? 'text-text-secondary bg-house-bg border-l-2 border-house-muted'
                  : 'text-text-muted hover:text-text-secondary hover:bg-house-bg/40 border-l-2 border-transparent'
                }
              `}
            >
              <span>All items</span>
              <span className="text-[10px] text-text-muted">{allItems.length}</span>
            </button>
            {COLLECTIONS.map(col => (
              <button
                key={col.id}
                onClick={() => setActiveCollection(col.id)}
                className={`
                  w-full text-left px-3 py-2 font-body text-xs transition-colors
                  flex items-center justify-between
                  ${activeCollection === col.id
                    ? 'text-text-secondary bg-house-bg border-l-2 border-house-muted'
                    : 'text-text-muted hover:text-text-secondary hover:bg-house-bg/40 border-l-2 border-transparent'
                  }
                `}
              >
                <span>{col.label}</span>
                <span className="text-[10px] text-text-muted">{collectionCounts[col.id] ?? 0}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Centre: Item list */}
        <div className={`flex-1 flex flex-col min-w-0 ${selectedItem || formOpen ? 'hidden md:flex' : ''}`}>

          {/* Mobile collection picker */}
          <div className="md:hidden border-b border-house-border px-3 py-2">
            <select
              value={activeCollection ?? ''}
              onChange={e => setActiveCollection(e.target.value ? e.target.value as Collection : null)}
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              <option value="">All items ({allItems.length})</option>
              {COLLECTIONS.map(col => (
                <option key={col.id} value={col.id}>
                  {col.label} ({collectionCounts[col.id] ?? 0})
                </option>
              ))}
            </select>
          </div>

          {/* Search and filters bar */}
          <div className="shrink-0 border-b border-house-border/60 bg-house-bg px-3 py-2 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search title, description, content, phase..."
              className="flex-1 min-w-[140px] font-body text-xs bg-house-surface border border-house-border text-text-primary px-2.5 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
            <select
              value={authorityFilter}
              onChange={e => setAuthorityFilter(e.target.value as AuthorityStatus | '')}
              className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              <option value="">All authority</option>
              {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={presenceFilter}
              onChange={e => setPresenceFilter(e.target.value as PresenceScope | '')}
              className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              <option value="">All scopes</option>
              {Object.entries(PRESENCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Item count */}
          <div className="shrink-0 px-3 py-2 border-b border-house-border/40 flex items-center justify-between">
            <span className="font-body text-xs text-text-muted">
              {loading ? 'Loading...' : `${items.length} item${items.length === 1 ? '' : 's'}`}
            </span>
            {activeCollection === 'development_documentation' && !loading && items.length > 0 && (
              <span className="font-body text-[10px] text-text-muted">
                Grouped by phase
              </span>
            )}
          </div>

          {/* Scrollable item list */}
          <div className="flex-1 overflow-y-auto">
            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
                  <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                  <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="px-4 py-8 text-center">
                <p className="font-body text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="font-body text-sm text-text-muted">
                  {searchQuery || authorityFilter || presenceFilter
                    ? 'No items match the current filters.'
                    : activeCollection
                      ? `No items in ${COLLECTIONS.find(c => c.id === activeCollection)?.label ?? activeCollection} yet.`
                      : 'The Library is empty. Add your first item above.'
                  }
                </p>
              </div>
            )}

            {/* Phase-grouped view for development_documentation */}
            {!loading && !error && phaseGroups && (
              <div>
                {phaseGroups.sortedKeys.map(phaseCode => {
                  const group = phaseGroups.grouped[phaseCode]
                  const phaseLabel = group[0]?.phase_label ?? phaseCode
                  return (
                    <div key={phaseCode}>
                      <div className="sticky top-0 z-10 px-3 py-2 bg-house-bg/80 backdrop-blur-sm border-b border-house-border/40">
                        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
                          {phaseCode}
                        </span>
                        {phaseLabel !== phaseCode && (
                          <span className="font-body text-[10px] text-text-muted ml-2">
                            — {phaseLabel}
                          </span>
                        )}
                        <span className="font-body text-[10px] text-text-muted ml-2">
                          ({group.length})
                        </span>
                      </div>
                      {group.map(item => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          isSelected={selectedItem?.id === item.id}
                          onClick={() => { setSelectedItem(item); setFormOpen(false) }}
                          attachmentMatchFiles={attachmentMatches[item.id]}
                        />
                      ))}
                    </div>
                  )
                })}
                {phaseGroups.ungrouped.length > 0 && (
                  <div>
                    <div className="sticky top-0 z-10 px-3 py-2 bg-house-bg/80 backdrop-blur-sm border-b border-house-border/40">
                      <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
                        No phase
                      </span>
                      <span className="font-body text-[10px] text-text-muted ml-2">
                        ({phaseGroups.ungrouped.length})
                      </span>
                    </div>
                    {phaseGroups.ungrouped.map(item => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        isSelected={selectedItem?.id === item.id}
                        onClick={() => { setSelectedItem(item); setFormOpen(false) }}
                        attachmentMatchFiles={attachmentMatches[item.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Flat list for other collections */}
            {!loading && !error && !phaseGroups && items.length > 0 && (
              <div>
                {items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    isSelected={selectedItem?.id === item.id}
                    onClick={() => { setSelectedItem(item); setFormOpen(false) }}
                    attachmentMatchFiles={attachmentMatches[item.id]}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: Detail or Form */}
        {(selectedItem || formOpen) && (
          <div className="w-full md:w-[420px] md:max-w-[50%] shrink-0 border-l border-house-border bg-house-surface flex flex-col overflow-y-auto">

            {/* Detail view */}
            {selectedItem && !formOpen && (
              <ItemDetail
                item={selectedItem}
                onClose={() => setSelectedItem(null)}
                onEdit={() => openEditForm(selectedItem)}
                onDelete={() => setDeleteConfirm(selectedItem.id)}
                deleteConfirm={deleteConfirm === selectedItem.id}
                onDeleteConfirm={() => handleDelete(selectedItem.id)}
                onDeleteCancel={() => setDeleteConfirm(null)}
              />
            )}

            {/* Create / edit form */}
            {formOpen && (
              <ItemForm
                form={form}
                setForm={setForm}
                isEdit={!!editingItem}
                submitting={formSubmitting}
                error={formError}
                warning={formWarning}
                onSubmit={handleFormSubmit}
                onCancel={() => { setFormOpen(false); setEditingItem(null); setStagedFiles([]) }}
                stagedFiles={stagedFiles}
                setStagedFiles={setStagedFiles}
              />
            )}
          </div>
        )}

      </div>

      {/* One Crown warning banner (shown after save if server downgraded) */}
      {formWarning && !formOpen && (
        <div className="shrink-0 border-t border-amber-400/30 bg-amber-400/5 px-4 py-2.5 flex items-center justify-between">
          <p className="font-body text-xs text-amber-400">
            {formWarning}
          </p>
          <button
            onClick={() => setFormWarning(null)}
            className="font-body text-[10px] text-text-muted hover:text-text-secondary ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Phase 33C.1 — File upload errors after item creation */}
      {uploadErrors.length > 0 && !formOpen && (
        <div className="shrink-0 border-t border-red-400/30 bg-red-400/5 px-4 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="font-body text-xs text-red-400">
              {uploadErrors.length} file{uploadErrors.length === 1 ? '' : 's'} failed to upload. Item was saved. You can attach files from the item detail.
            </span>
            <button
              onClick={() => setUploadErrors([])}
              className="font-body text-[10px] text-text-muted hover:text-text-secondary ml-3"
            >
              Dismiss
            </button>
          </div>
          {uploadErrors.map((err, i) => (
            <p key={i} className="font-body text-[10px] text-red-400/70">{err}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Item Row ───────────────────────────────────────────────────────────────

function ItemRow({
  item,
  isSelected,
  onClick,
  attachmentMatchFiles,
}: {
  item: LibraryItem
  isSelected: boolean
  onClick: () => void
  attachmentMatchFiles?: string[]
}) {
  const effectiveAuthority = getEffectiveAuthority(item)
  const rejected = isRejectedCanonical(item)

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2.5 border-b border-house-border/30 transition-colors
        ${isSelected ? 'bg-house-bg' : 'hover:bg-house-bg/40'}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-body text-sm text-text-primary truncate">
            {item.title}
          </h3>
          {item.description && (
            <p className="font-body text-xs text-text-muted mt-0.5 line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
            {/* Effective authority — not raw */}
            <span className={`font-body text-[10px] ${AUTHORITY_COLORS[effectiveAuthority]}`}>
              {AUTHORITY_LABELS[effectiveAuthority]}
            </span>
            {rejected && (
              <span className="font-body text-[10px] text-red-400/70">
                (label rejected)
              </span>
            )}
            <span className="font-body text-[10px] text-text-muted">
              {ITEM_TYPES.find(t => t.id === item.item_type)?.label ?? item.item_type}
            </span>
            {item.phase_code && (
              <span className="font-body text-[10px] text-text-muted">
                {item.phase_code}
              </span>
            )}
            <span className="font-body text-[10px] text-text-muted">
              {PRESENCE_LABELS[item.presence_scope]}
            </span>
          </div>
        </div>
        <span className="font-body text-[10px] text-text-muted shrink-0 mt-0.5">
          {formatDate(item.created_at)}
        </span>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {item.tags.map(tag => (
            <span
              key={tag}
              className="font-body text-[10px] text-text-muted bg-house-bg px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Attachment text match cue */}
      {attachmentMatchFiles && attachmentMatchFiles.length > 0 && (
        <div className="mt-1.5">
          {attachmentMatchFiles.map(fname => (
            <span key={fname} className="font-body text-[10px] text-amber-400/80 mr-2">
              📎 Matched file: {fname}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

// ─── File Attachment Card (Phase 33D — with extraction) ────────────────────

const EXTRACTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not extracted', color: 'text-text-muted' },
  queued: { label: 'Queued', color: 'text-blue-400/80' },
  processing: { label: 'Extracting...', color: 'text-amber-400' },
  extracted: { label: 'Extracted', color: 'text-green-400/80' },
  empty: { label: 'No text found', color: 'text-text-muted' },
  failed: { label: 'Extraction failed', color: 'text-red-400/80' },
  unsupported: { label: 'Not supported', color: 'text-text-muted' },
}

const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  text_parse: 'Text parse',
  image_ocr: 'OCR',
  audio_transcript: 'Transcript',
  video_audio_transcript: 'Audio transcript',
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function FileAttachmentCard({
  file,
  deleteFileId,
  setDeleteFileId,
  handleDeleteFile,
  onFileUpdated,
}: {
  file: LibraryFile
  deleteFileId: string | null
  setDeleteFileId: (id: string | null) => void
  handleDeleteFile: (id: string) => void
  onFileUpdated: () => void
}) {
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const canExtract = ['docx', 'pdf', 'markdown', 'image', 'audio', 'video'].includes(file.file_type)
  const isMediaType = ['image', 'audio', 'video'].includes(file.file_type)
  const statusInfo = EXTRACTION_STATUS_LABELS[file.extraction_status] ?? EXTRACTION_STATUS_LABELS.not_started

  // Poll for job completion when file is queued/processing (media types)
  useEffect(() => {
    if (!isMediaType) return
    if (file.extraction_status !== 'queued' && file.extraction_status !== 'processing') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/library-extraction-jobs?file_id=${file.id}`)
        const data = await res.json()
        const jobs = data.jobs ?? []
        const latest = jobs[0]
        if (latest && (latest.status === 'completed' || latest.status === 'failed')) {
          onFileUpdated()
        }
      } catch { /* silent */ }
    }, 6000)

    return () => clearInterval(interval)
  }, [file.id, file.extraction_status, isMediaType, onFileUpdated])

  function getExtractLabel(): string {
    if (file.extraction_status === 'not_started') {
      if (file.file_type === 'image') return 'Extract text (OCR)'
      if (file.file_type === 'audio') return 'Extract transcript'
      if (file.file_type === 'video') return 'Extract audio transcript'
      return 'Extract text'
    }
    return 'Re-extract'
  }

  async function handleExtract() {
    setExtracting(true)
    setExtractError(null)
    try {
      const res = await fetch(`/api/library-files/${file.id}/extract`, { method: 'POST' })
      const parsed = await safeResponseJson(res)
      if (!parsed.ok) {
        setExtractError(parsed.error)
      } else {
        onFileUpdated()
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="bg-house-bg border border-house-border/40 group">
      <div className="flex items-center gap-2 px-2.5 py-2">
        {/* Icon / thumbnail */}
        {file.file_type === 'image' && file.url ? (
          <img
            src={file.url}
            alt={file.file_name}
            className="w-8 h-8 object-cover rounded flex-shrink-0 border border-house-border/40"
          />
        ) : (
          <span className="text-base flex-shrink-0">
            {FILE_TYPE_ICONS[file.file_type] ?? FILE_TYPE_ICONS.other}
          </span>
        )}

        {/* File info */}
        <div className="flex-1 min-w-0">
          <p className="font-body text-xs text-text-secondary truncate">
            {file.file_name}
          </p>
          <p className="font-body text-[10px] text-text-muted">
            {file.file_type.toUpperCase()} · {formatFileSize(file.file_size_bytes)}
            {file.media_duration_seconds != null && ` · ${formatDuration(file.media_duration_seconds)}`}
            {' · '}{formatDate(file.created_at)}
          </p>
          {/* Extraction status */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`font-body text-[10px] ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {file.extraction_method && (
              <span className="font-body text-[10px] text-text-muted">
                ({EXTRACTION_METHOD_LABELS[file.extraction_method] ?? file.extraction_method})
              </span>
            )}
            {file.extraction_status === 'extracted' && file.extraction_char_count != null && (
              <span className="font-body text-[10px] text-text-muted">
                {file.extraction_char_count.toLocaleString()} chars{file.extraction_truncated ? ' (truncated)' : ''}
              </span>
            )}
            {isMediaType && (file.extraction_status === 'queued' || file.extraction_status === 'processing') && (
              <span className="font-body text-[10px] text-text-muted italic">
                Requires local worker
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Extract / Re-extract */}
          {canExtract && !extracting && file.extraction_status !== 'queued' && file.extraction_status !== 'processing' && (
            <button
              onClick={handleExtract}
              className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
            >
              {getExtractLabel()}
            </button>
          )}
          {extracting && (
            <span className="font-body text-[10px] text-amber-400">
              {isMediaType ? 'Queueing...' : 'Extracting...'}
            </span>
          )}
          {file.url && (
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
            >
              Open
            </a>
          )}
          {deleteFileId === file.id ? (
            <span className="flex items-center gap-1">
              <button
                onClick={() => handleDeleteFile(file.id)}
                className="font-body text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setDeleteFileId(null)}
                className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setDeleteFileId(file.id)}
              className="font-body text-[10px] text-red-400/40 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Extraction error */}
      {extractError && (
        <div className="px-2.5 py-1.5 border-t border-house-border/20">
          <p className="font-body text-[10px] text-red-400">{extractError}</p>
        </div>
      )}

      {/* Extraction preview */}
      {file.extraction_status === 'extracted' && file.extracted_text && (
        <div className="border-t border-house-border/20">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full text-left px-2.5 py-1.5 font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            {showPreview ? '▾ Hide extracted text' : '▸ Show extracted text'}
          </button>
          {showPreview && (
            <div className="px-2.5 pb-2.5">
              <div className="font-body text-[11px] text-text-secondary bg-house-surface p-2.5 whitespace-pre-wrap max-h-60 overflow-y-auto border border-house-border/30 leading-relaxed">
                {file.extracted_text}
              </div>
              {file.extraction_truncated && (
                <p className="font-body text-[10px] text-amber-400/70 mt-1 italic">
                  Extracted text truncated for storage safety.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Failed extraction error detail */}
      {file.extraction_status === 'failed' && file.extraction_error && (
        <div className="px-2.5 py-1.5 border-t border-house-border/20">
          <p className="font-body text-[10px] text-red-400/70 italic">
            Error: {file.extraction_error}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Item Detail ────────────────────────────────────────────────────────────

function ItemDetail({
  item,
  onClose,
  onEdit,
  onDelete,
  deleteConfirm,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  item: LibraryItem
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  deleteConfirm: boolean
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
}) {
  const effectiveAuthority = getEffectiveAuthority(item)
  const rejected = isRejectedCanonical(item)

  // ─── File attachments state (Phase 33C) ──────────────────────────
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [filesLoading, setFilesLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true)
    try {
      const res = await fetch(`/api/library-files?library_item_id=${item.id}`)
      const data = await res.json()
      if (res.ok) setFiles(data.files ?? [])
    } catch { /* silent */ }
    finally { setFilesLoading(false) }
  }, [item.id])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    try {
      const result = await uploadLibraryFile(file, item.id)
      if (result.error) {
        setUploadError(result.error)
      } else {
        await fetchFiles()
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDeleteFile(fileId: string) {
    try {
      const res = await fetch('/api/library-files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fileId }),
      })
      const parsed = await safeResponseJson(res)
      if (!parsed.ok) throw new Error(parsed.error)
      setDeleteFileId(null)
      await fetchFiles()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-house-border flex items-center justify-between">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          Detail
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="font-body text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors ml-2"
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="shrink-0 px-4 py-2.5 border-b border-red-400/30 bg-red-400/5 flex items-center justify-between">
          <span className="font-body text-xs text-red-400">Delete this item?</span>
          <div className="flex gap-2">
            <button
              onClick={onDeleteConfirm}
              className="font-body text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={onDeleteCancel}
              className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <h3 className="font-body text-base text-text-primary font-medium">
          {item.title}
        </h3>

        {item.description && (
          <p className="font-body text-sm text-text-secondary leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Authority display — One Crown Rule */}
        <div className="space-y-1.5">
          <DetailField label="Authority status">
            <span className={AUTHORITY_COLORS[effectiveAuthority]}>
              {AUTHORITY_LABELS[effectiveAuthority]}
            </span>
            {rejected && (
              <span className="text-red-400/70 ml-1">(rejected)</span>
            )}
          </DetailField>

          {/* Full rejection notice when canonical_memory was invalid */}
          {rejected && (
            <div className="px-3 py-2 border border-red-400/20 bg-red-400/5 space-y-0.5">
              <p className="font-body text-[10px] text-red-400">
                Authority status: archive_only
              </p>
              <p className="font-body text-[10px] text-red-400/70">
                Original label rejected: canonical_memory without canonical archive proof
              </p>
            </div>
          )}

          {/* Raw vs effective note */}
          {rejected && (
            <p className="font-body text-[10px] text-text-muted italic">
              Raw authority_status: {item.authority_status} — displayed as effective: {effectiveAuthority}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <DetailField label="Collection">
            {COLLECTIONS.find(c => c.id === item.collection)?.label ?? item.collection}
          </DetailField>
          <DetailField label="Item type">
            {ITEM_TYPES.find(t => t.id === item.item_type)?.label ?? item.item_type}
          </DetailField>
          <DetailField label="Presence scope">
            {PRESENCE_LABELS[item.presence_scope]}
          </DetailField>
          {item.phase_code && (
            <DetailField label="Phase code">{item.phase_code}</DetailField>
          )}
          {item.phase_label && (
            <DetailField label="Phase label">{item.phase_label}</DetailField>
          )}
          {item.phase_number != null && (
            <DetailField label="Phase number">{item.phase_number}</DetailField>
          )}
        </div>

        {item.source_url && (
          <DetailField label="Source URL">
            <span className="break-all">{item.source_url}</span>
          </DetailField>
        )}

        {item.file_path && (
          <DetailField label="File path">
            <span className="break-all font-mono">{item.file_path}</span>
          </DetailField>
        )}

        {item.archive_item_id && (
          <DetailField label="Archive item ID">
            <span className="font-mono text-[10px]">{item.archive_item_id}</span>
          </DetailField>
        )}

        {item.derived_canonical_status && (
          <DetailField label="Derived canonical status">
            {item.derived_canonical_status}
          </DetailField>
        )}

        {item.tags.length > 0 && (
          <DetailField label="Tags">
            <div className="flex flex-wrap gap-1">
              {item.tags.map(tag => (
                <span
                  key={tag}
                  className="bg-house-bg px-1.5 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </DetailField>
        )}

        {item.content_text && (
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Content
            </span>
            <div className="font-body text-xs text-text-secondary bg-house-bg p-3 whitespace-pre-wrap max-h-80 overflow-y-auto border border-house-border/40">
              {item.content_text}
            </div>
          </div>
        )}

        {/* ── File Attachments (Phase 33C) ──────────────────────────────── */}
        <div className="pt-3 border-t border-house-border/40">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
              Attachments
            </span>
            <label className={`
              font-body text-[10px] px-2 py-1 border border-house-muted text-text-secondary
              hover:bg-house-bg transition-all cursor-pointer
              ${uploading ? 'opacity-40 pointer-events-none' : ''}
            `}>
              {uploading ? 'Uploading...' : '+ Attach file'}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          <p className="font-body text-[10px] text-text-muted mb-2">
            DOCX, PDF, MD, PNG, JPG, WEBP, MP3, WAV, M4A, MP4, MOV, WEBM — max 30 MB
          </p>

          {uploadError && (
            <div className="mb-2 px-2 py-1.5 border border-red-400/20 bg-red-400/5">
              <p className="font-body text-[10px] text-red-400">{uploadError}</p>
              <button
                onClick={() => setUploadError(null)}
                className="font-body text-[10px] text-text-muted hover:text-text-secondary mt-0.5"
              >
                Dismiss
              </button>
            </div>
          )}

          {filesLoading && (
            <p className="font-body text-[10px] text-text-muted">Loading files...</p>
          )}

          {!filesLoading && files.length === 0 && (
            <p className="font-body text-[10px] text-text-muted italic">No attachments yet.</p>
          )}

          {!filesLoading && files.length > 0 && (
            <div className="space-y-2">
              {files.map(file => (
                <FileAttachmentCard
                  key={file.id}
                  file={file}
                  deleteFileId={deleteFileId}
                  setDeleteFileId={setDeleteFileId}
                  handleDeleteFile={handleDeleteFile}
                  onFileUpdated={fetchFiles}
                />
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-house-border/40 grid grid-cols-2 gap-2">
          <DetailField label="Created">{formatDate(item.created_at)}</DetailField>
          <DetailField label="Updated">{formatDate(item.updated_at)}</DetailField>
        </div>

        <DetailField label="ID">
          <span className="font-mono text-[10px]">{item.id}</span>
        </DetailField>
      </div>
    </div>
  )
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-body text-[10px] text-text-muted tracking-wide block mb-0.5">
        {label}
      </span>
      <span className="font-body text-xs text-text-secondary">
        {children}
      </span>
    </div>
  )
}

// ─── Item Form ──────────────────────────────────────────────────────────────

function ItemForm({
  form,
  setForm,
  isEdit,
  submitting,
  error,
  warning,
  onSubmit,
  onCancel,
  stagedFiles,
  setStagedFiles,
}: {
  form: typeof BLANK_FORM
  setForm: (fn: (f: typeof BLANK_FORM) => typeof BLANK_FORM) => void
  isEdit: boolean
  submitting: boolean
  error: string | null
  warning: string | null
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
  stagedFiles: File[]
  setStagedFiles: (files: File[] | ((prev: File[]) => File[])) => void
}) {
  const stageFileInputRef = useRef<HTMLInputElement>(null)

  function handleStageFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files ?? [])
    if (newFiles.length > 0) {
      setStagedFiles(prev => [...prev, ...newFiles])
    }
    if (stageFileInputRef.current) stageFileInputRef.current.value = ''
  }

  function removeStagedFile(index: number) {
    setStagedFiles(prev => prev.filter((_, i) => i !== index))
  }

  function getStagedFileType(file: File): string {
    if (file.type === 'application/pdf') return 'pdf'
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
    if (file.type.startsWith('image/')) return 'image'
    if (file.type === 'text/markdown' || file.type === 'text/x-markdown') return 'markdown'
    if ((file.type === 'text/plain' || file.type === 'application/octet-stream') && file.name.toLowerCase().endsWith('.md')) return 'markdown'
    if (file.type.startsWith('audio/')) return 'audio'
    if (file.type.startsWith('video/')) return 'video'
    return 'other'
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-house-border flex items-center justify-between">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          {isEdit ? 'Edit item' : 'New item'}
        </span>
        <button
          onClick={onCancel}
          className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Title */}
        <div>
          <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required
            placeholder="Item title..."
            className="w-full font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted"
          />
        </div>

        {/* Description */}
        <div>
          <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="Short description..."
            className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted resize-y"
          />
        </div>

        {/* Collection + Item type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Collection <span className="text-red-400">*</span>
            </label>
            <select
              value={form.collection}
              onChange={e => setForm(f => ({ ...f, collection: e.target.value as Collection }))}
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              {COLLECTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Item type <span className="text-red-400">*</span>
            </label>
            <select
              value={form.item_type}
              onChange={e => setForm(f => ({ ...f, item_type: e.target.value as ItemType }))}
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              {ITEM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Phase fields */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Phase code
            </label>
            <input
              type="text"
              value={form.phase_code}
              onChange={e => setForm(f => ({ ...f, phase_code: e.target.value }))}
              placeholder="e.g. 33B"
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Phase label
            </label>
            <input
              type="text"
              value={form.phase_label}
              onChange={e => setForm(f => ({ ...f, phase_label: e.target.value }))}
              placeholder="e.g. House Library v1"
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Phase #
            </label>
            <input
              type="text"
              value={form.phase_number}
              onChange={e => setForm(f => ({ ...f, phase_number: e.target.value }))}
              placeholder="e.g. 33"
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* Authority + Presence scope */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Authority status
            </label>
            <select
              value={form.authority_status}
              onChange={e => setForm(f => ({ ...f, authority_status: e.target.value as AuthorityStatus }))}
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Presence scope
            </label>
            <select
              value={form.presence_scope}
              onChange={e => setForm(f => ({ ...f, presence_scope: e.target.value as PresenceScope }))}
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none"
            >
              {Object.entries(PRESENCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* canonical_memory guard notice */}
        {form.authority_status === 'canonical_memory' && (
          <div className="px-3 py-2 border border-amber-400/30 bg-amber-400/5 space-y-1">
            <p className="font-body text-[10px] text-amber-400 font-medium">
              One Crown Rule
            </p>
            <p className="font-body text-[10px] text-amber-400/70">
              canonical_memory requires a linked Archive item with canonical_status = &apos;canonical&apos;.
              Without valid archive proof, the server will downgrade this to archive_only.
            </p>
          </div>
        )}

        {/* Archive item ID (for canonical_memory linkage) */}
        {(form.authority_status === 'canonical_memory' || form.authority_status === 'canonical_candidate') && (
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Archive item ID
            </label>
            <input
              type="text"
              value={form.archive_item_id}
              onChange={e => setForm(f => ({ ...f, archive_item_id: e.target.value }))}
              placeholder="UUID of the canonical archive item"
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted font-mono"
            />
          </div>
        )}

        {/* Source URL + File path */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Source URL
            </label>
            <input
              type="text"
              value={form.source_url}
              onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
              placeholder="https://..."
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              File path
            </label>
            <input
              type="text"
              value={form.file_path}
              onChange={e => setForm(f => ({ ...f, file_path: e.target.value }))}
              placeholder="e.g. docs/memory-systems.md"
              className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
            Tags <span className="text-text-muted">(comma separated)</span>
          </label>
          <input
            type="text"
            value={form.tags}
            onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="e.g. architecture, memory, phase-33"
            className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
          />
        </div>

        {/* Content text */}
        <div>
          <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
            Content
          </label>
          <textarea
            value={form.content_text}
            onChange={e => setForm(f => ({ ...f, content_text: e.target.value }))}
            rows={8}
            placeholder="Full text content..."
            className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted resize-y"
          />
        </div>

        {/* Phase 33C.1 — Staged file attachments (new items only) */}
        {!isEdit && (
          <div className="pt-2 border-t border-house-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
                Attachments
              </span>
              <label className="font-body text-[10px] px-2 py-1 border border-house-muted text-text-secondary hover:bg-house-bg transition-all cursor-pointer">
                + Add file
                <input
                  ref={stageFileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  multiple
                  onChange={handleStageFiles}
                  className="hidden"
                />
              </label>
            </div>
            <p className="font-body text-[10px] text-text-muted mb-2">
              DOCX, PDF, MD, PNG, JPG, WEBP, MP3, WAV, M4A, MP4, MOV, WEBM — max 30 MB each. Files upload after item is created.
            </p>

            {stagedFiles.length > 0 && (
              <div className="space-y-1.5">
                {stagedFiles.map((file, idx) => {
                  const fileType = getStagedFileType(file)
                  return (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 px-2.5 py-2 bg-house-bg border border-house-border/40"
                    >
                      <span className="text-base flex-shrink-0">
                        {FILE_TYPE_ICONS[fileType] ?? FILE_TYPE_ICONS.other}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-xs text-text-secondary truncate">
                          {file.name}
                        </p>
                        <p className="font-body text-[10px] text-text-muted">
                          {fileType.toUpperCase()} · {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeStagedFile(idx)}
                        className="font-body text-[10px] text-red-400/60 hover:text-red-400 transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {stagedFiles.length === 0 && (
              <p className="font-body text-[10px] text-text-muted italic">No files staged.</p>
            )}
          </div>
        )}

        {/* Errors / warnings */}
        {error && (
          <p className="font-body text-xs text-red-400">{error}</p>
        )}
        {warning && (
          <div className="px-3 py-2 border border-amber-400/30 bg-amber-400/5">
            <p className="font-body text-xs text-amber-400">{warning}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 pb-4">
          <button
            type="submit"
            disabled={submitting || !form.title.trim()}
            className="font-body text-xs px-4 py-1.5 border border-house-muted text-text-secondary hover:bg-house-bg transition-all disabled:opacity-40"
          >
            {submitting
              ? stagedFiles.length > 0 ? 'Creating & uploading...' : 'Saving...'
              : isEdit ? 'Update item' : stagedFiles.length > 0 ? `Create item + ${stagedFiles.length} file${stagedFiles.length === 1 ? '' : 's'}` : 'Create item'
            }
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
