// Phase 37B — Graph Source Adapter Registry
//
// Server-side source fetching. The client sends source_type + source_id.
// The backend fetches the record, derives metadata, and returns a
// standardised GraphSourceRecord. Do not trust client-provided metadata.

import { supabase } from '@/lib/supabase'
import { isValidGraphSourceType, type GraphSourceType, type GraphAuthorityStatus, type GraphPresenceScope } from './ontology'

// ─── Types ──────────────────────────────────────────────────────────────────

export type GraphSourceRecord = {
  sourceType: GraphSourceType
  sourceTable: string
  sourceId: string
  label: string
  text: string
  excerpt: string
  presenceScope: GraphPresenceScope
  sourceMetadata: Record<string, unknown>
  authorityStatusHint: GraphAuthorityStatus
}

export type GraphSourceAdapter = {
  sourceType: GraphSourceType
  fetchById: (id: string) => Promise<GraphSourceRecord | null>
}

export type SourceFetchError =
  | 'unsupported_source_type'
  | 'source_not_found'
  | 'source_not_eligible'
  | 'source_too_short'
  | 'source_deleted'
  | 'source_test_owned'
  | 'fetch_error'

export type SourceFetchResult =
  | { ok: true; record: GraphSourceRecord }
  | { ok: false; error: SourceFetchError; message: string }

// ─── Minimum source text length ─────────────────────────────────────────────

const MIN_SOURCE_TEXT_LENGTH = 30

// ─── Adapter: archive_item ──────────────────────────────────────────────────

const archiveItemAdapter: GraphSourceAdapter = {
  sourceType: 'archive_item',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('archive_items')
      .select('id, title, raw_content, excerpt, category, canonical_status, sensitivity, owner_presence, visibility, deleted_at')
      .eq('id', id)
      .single()

    if (error || !data) return null

    // Deleted check
    if (data.deleted_at) return null

    // Eligibility: must be canonical or canonical_candidate
    if (!['canonical', 'canonical_candidate'].includes(data.canonical_status)) return null

    const presenceScope: GraphPresenceScope =
      data.owner_presence === 'ari' ? 'ari' :
      data.owner_presence === 'eli' ? 'eli' :
      data.owner_presence === 'shared' || data.owner_presence === 'house' ? 'shared' :
      'none'

    const authorityHint: GraphAuthorityStatus =
      data.canonical_status === 'canonical' ? 'archive_supported' : 'candidate'

    const text = [data.title, data.excerpt, data.raw_content?.slice(0, 2000)].filter(Boolean).join('\n\n')

    return {
      sourceType: 'archive_item',
      sourceTable: 'archive_items',
      sourceId: data.id,
      label: data.title || 'Untitled archive item',
      text,
      excerpt: data.excerpt || text.slice(0, 300),
      presenceScope,
      sourceMetadata: {
        category: data.category,
        canonical_status: data.canonical_status,
        sensitivity: data.sensitivity,
        owner_presence: data.owner_presence,
        visibility: data.visibility,
      },
      authorityStatusHint: authorityHint,
    }
  },
}

// ─── Adapter: interior_note ─────────────────────────────────────────────────

const interiorNoteAdapter: GraphSourceAdapter = {
  sourceType: 'interior_note',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('interior_notes')
      .select('id, presence_id, note_type, content, is_active, created_at')
      .eq('id', id)
      .single()

    if (error || !data) return null

    const presenceScope: GraphPresenceScope =
      data.presence_id === 'ari' ? 'ari' :
      data.presence_id === 'eli' ? 'eli' :
      'none'

    return {
      sourceType: 'interior_note',
      sourceTable: 'interior_notes',
      sourceId: data.id,
      label: `Interior note: ${data.note_type}`,
      text: data.content,
      excerpt: data.content.slice(0, 300),
      presenceScope,
      sourceMetadata: {
        note_type: data.note_type,
        presence_id: data.presence_id,
        is_active: data.is_active,
      },
      authorityStatusHint: 'candidate',
    }
  },
}

// ─── Adapter: held_truth ────────────────────────────────────────────────────

const heldTruthAdapter: GraphSourceAdapter = {
  sourceType: 'held_truth',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('held_truths')
      .select('id, presence_id, content, created_at')
      .eq('id', id)
      .single()

    if (error || !data) return null

    const presenceScope: GraphPresenceScope =
      data.presence_id === 'ari' ? 'ari' :
      data.presence_id === 'eli' ? 'eli' :
      'shared'

    return {
      sourceType: 'held_truth',
      sourceTable: 'held_truths',
      sourceId: data.id,
      label: `Held truth: ${data.content.slice(0, 60)}`,
      text: data.content,
      excerpt: data.content.slice(0, 300),
      presenceScope,
      sourceMetadata: {
        presence_id: data.presence_id,
      },
      authorityStatusHint: 'held_truth',
    }
  },
}

// ─── Adapter: journal_entry ─────────────────────────────────────────────────

const journalEntryAdapter: GraphSourceAdapter = {
  sourceType: 'journal_entry',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('presence_journal')
      .select('id, presence_id, entry_type, title, content, tags, salience, deleted_at, created_at')
      .eq('id', id)
      .single()

    if (error || !data) return null
    if (data.deleted_at) return null

    const presenceScope: GraphPresenceScope =
      data.presence_id === 'ari' ? 'ari' :
      data.presence_id === 'eli' ? 'eli' :
      'none'

    return {
      sourceType: 'journal_entry',
      sourceTable: 'presence_journal',
      sourceId: data.id,
      label: data.title || `Journal: ${data.entry_type}`,
      text: data.content,
      excerpt: data.content.slice(0, 300),
      presenceScope,
      sourceMetadata: {
        presence_id: data.presence_id,
        entry_type: data.entry_type,
        tags: data.tags,
        salience: data.salience,
      },
      authorityStatusHint: 'candidate',
    }
  },
}

// ─── Adapter: canonical_memory ───────────────────────────────────────────────
//
// One Crown Rule: Only confirmed Archive Memory (canonical_status = 'canonical')
// qualifies as canonical_supported. room_memories are NOT canonical Memory —
// they are per-room summaries with no governance review. If room_memories
// support is needed later, it must be a separate source type mapped to
// 'candidate' or 'archive_supported', never 'canonical_supported'.

const canonicalMemoryAdapter: GraphSourceAdapter = {
  sourceType: 'canonical_memory',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('archive_items')
      .select('id, title, raw_content, excerpt, category, canonical_status, sensitivity, owner_presence, visibility, deleted_at')
      .eq('id', id)
      .single()

    if (error || !data) return null

    // Deleted check
    if (data.deleted_at) return null

    // One Crown Rule: only canonical_status = 'canonical' qualifies.
    // canonical_candidate is NOT canonical — it is still under review.
    if (data.canonical_status !== 'canonical') return null

    const presenceScope: GraphPresenceScope =
      data.owner_presence === 'ari' ? 'ari' :
      data.owner_presence === 'eli' ? 'eli' :
      data.owner_presence === 'shared' || data.owner_presence === 'house' ? 'shared' :
      'none'

    const text = [data.title, data.excerpt, data.raw_content?.slice(0, 2000)].filter(Boolean).join('\n\n')

    return {
      sourceType: 'canonical_memory',
      sourceTable: 'archive_items',
      sourceId: data.id,
      label: data.title || 'Canonical archive memory',
      text,
      excerpt: data.excerpt || text.slice(0, 300),
      presenceScope,
      sourceMetadata: {
        category: data.category,
        canonical_status: data.canonical_status,
        sensitivity: data.sensitivity,
        owner_presence: data.owner_presence,
        visibility: data.visibility,
      },
      authorityStatusHint: 'canonical_supported',
    }
  },
}

// ─── Adapter: library_item ──────────────────────────────────────────────────

const libraryItemAdapter: GraphSourceAdapter = {
  sourceType: 'library_item',
  async fetchById(id: string): Promise<GraphSourceRecord | null> {
    const { data, error } = await supabase
      .from('library_items')
      .select('id, title, description, created_at')
      .eq('id', id)
      .single()

    if (error || !data) return null

    const text = [data.title, data.description].filter(Boolean).join('\n\n')

    return {
      sourceType: 'library_item',
      sourceTable: 'library_items',
      sourceId: data.id,
      label: data.title || 'Library item',
      text,
      excerpt: text.slice(0, 300),
      presenceScope: 'house',
      sourceMetadata: {},
      authorityStatusHint: 'library_reference',
    }
  },
}

// ─── Registry ───────────────────────────────────────────────────────────────

const ADAPTER_REGISTRY: Map<GraphSourceType, GraphSourceAdapter> = new Map([
  ['archive_item', archiveItemAdapter],
  ['interior_note', interiorNoteAdapter],
  ['held_truth', heldTruthAdapter],
  ['journal_entry', journalEntryAdapter],
  ['canonical_memory', canonicalMemoryAdapter],
  ['library_item', libraryItemAdapter],
])

// ─── Source types that are NOT yet implemented ──────────────────────────────

const UNSUPPORTED_SOURCE_TYPES: GraphSourceType[] = [
  'memory_candidate',
  'reflection_output',
  'lounge_capture',
  'recent_continuity',
  'living_state',
  'carryforward',
  'carryback',
  'watchtower_evidence',
  'architecture_law',
  'manual_tara',
  'manual_ari',
  'manual_eli',
  'relationship_arc_entry',
  'system_candidate',
]

// ─── Public API ─────────────────────────────────────────────────────────────

export function isSourceTypeSupported(sourceType: string): boolean {
  return ADAPTER_REGISTRY.has(sourceType as GraphSourceType)
}

export function getSupportedSourceTypes(): GraphSourceType[] {
  return [...ADAPTER_REGISTRY.keys()]
}

export function getUnsupportedSourceTypes(): GraphSourceType[] {
  return [...UNSUPPORTED_SOURCE_TYPES]
}

export async function fetchSourceRecord(
  sourceType: string,
  sourceId: string
): Promise<SourceFetchResult> {
  // Validate source type
  if (!isValidGraphSourceType(sourceType)) {
    return { ok: false, error: 'unsupported_source_type', message: `Unknown source type: "${sourceType}"` }
  }

  const adapter = ADAPTER_REGISTRY.get(sourceType as GraphSourceType)
  if (!adapter) {
    return { ok: false, error: 'unsupported_source_type', message: `Source type "${sourceType}" is not yet supported` }
  }

  try {
    const record = await adapter.fetchById(sourceId)

    if (!record) {
      return { ok: false, error: 'source_not_found', message: `Source "${sourceType}:${sourceId}" not found or not eligible` }
    }

    // Minimum text length check
    if (record.text.length < MIN_SOURCE_TEXT_LENGTH) {
      return { ok: false, error: 'source_too_short', message: `Source text too short (${record.text.length} chars, minimum ${MIN_SOURCE_TEXT_LENGTH})` }
    }

    return { ok: true, record }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[graph-source-adapter] Fetch error for ${sourceType}:${sourceId}:`, msg)
    return { ok: false, error: 'fetch_error', message: msg }
  }
}
