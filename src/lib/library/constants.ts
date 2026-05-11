// Phase 33F — Shared Library constants and types
// Extracted from library/page.tsx for reuse by RetrievalLab

import type { AuthorityStatus, PresenceScope } from './authority'

// ─── Types ──────────────────────────────────────────────────────────────────

export type Collection =
  | 'development_documentation'
  | 'books'
  | 'articles'
  | 'transcripts'
  | 'images'
  | 'research'
  | 'archive_references'

export type ItemType =
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

export interface LibraryItem {
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

export interface LibraryFile {
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
  // Extraction fields
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
  // OCR quality
  ocr_quality: 'clean' | 'partial' | 'noisy' | 'failed' | null
  needs_review: boolean
  cleaned_extracted_text: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const COLLECTIONS: { id: Collection; label: string }[] = [
  { id: 'development_documentation', label: 'Development Docs' },
  { id: 'books', label: 'Books' },
  { id: 'articles', label: 'Articles' },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'images', label: 'Images' },
  { id: 'research', label: 'Research' },
  { id: 'archive_references', label: 'Archive References' },
]

export const ITEM_TYPES: { id: ItemType; label: string }[] = [
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

export const AUTHORITY_LABELS: Record<AuthorityStatus, string> = {
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

export const AUTHORITY_COLORS: Record<AuthorityStatus, string> = {
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

export const PRESENCE_LABELS: Record<PresenceScope, string> = {
  ari: 'Ari',
  eli: 'Eli',
  shared: 'Shared',
  house: 'House',
  none: 'None',
}

export const EXTRACTION_METHOD_LABELS: Record<string, string> = {
  text_parse: 'Text parse',
  image_ocr: 'OCR',
  audio_transcript: 'Transcript',
  video_audio_transcript: 'Audio transcript',
}
