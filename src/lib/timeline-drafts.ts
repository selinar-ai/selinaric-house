// Phase 23 — Timeline draft types, helpers, and governance utilities

import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GateResults {
  durability:    boolean
  compression:   boolean
  absence_test:  boolean
  passed_count:  number
}

export interface TimelineDraft {
  id:                      string
  presence:                'ari' | 'eli'
  draft_text:              string
  significance:            'foundational' | 'significant' | 'standard'
  entry_type:              string
  source_context:          Record<string, unknown> | null
  decision_reason:         string | null
  gate_results:            GateResults | null
  created_at:              string
  status:                  'pending' | 'kept' | 'dismissed'
  decided_at:              string | null
  decided_by:              'tara' | null
  kept_timeline_entry_id:  string | null
}

export interface TimelineVersion {
  id:                string
  timeline_entry_id: string
  version_number:    number
  content:           string
  edited_by:         'tara'
  edit_reason:       string
  created_at:        string
  source_draft_id:   string | null
}

export interface CreateDraftInput {
  presence:         'ari' | 'eli'
  draft_text:       string
  significance:     'foundational' | 'significant' | 'standard'
  entry_type:       string
  source_context?:  Record<string, unknown>
  decision_reason?: string
  gate_results:     GateResults
}

// ─── Timeline Gate ────────────────────────────────────────────────────────────
// Pass 2+ of 3 to create a draft.

export function evaluateGate(results: GateResults): boolean {
  return results.passed_count >= 2
}

// ─── Duplicate / frequency guards ─────────────────────────────────────────────

/**
 * Check if a near-identical draft exists for this presence in the last 14 days.
 * Conservative keyword check — no NLP needed at v1.
 */
async function hasDuplicateDraft(
  presence: 'ari' | 'eli',
  draftText: string
): Promise<boolean> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('timeline_drafts')
    .select('draft_text')
    .eq('presence', presence)
    .in('status', ['pending', 'kept'])
    .gte('created_at', fourteenDaysAgo)

  if (!data || data.length === 0) return false

  // Compare first 60 chars as a conservative similarity proxy
  const incoming = draftText.trim().slice(0, 60).toLowerCase()
  return data.some(d => {
    const existing = (d.draft_text ?? '').trim().slice(0, 60).toLowerCase()
    return existing === incoming
  })
}

/**
 * Check against frequency limits:
 * - max 2 pending drafts per presence per 24h
 * - max 5 pending drafts total per presence
 */
async function exceedsFrequencyLimit(presence: 'ari' | 'eli'): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [last24h, totalPending] = await Promise.all([
    supabase
      .from('timeline_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('presence', presence)
      .eq('status', 'pending')
      .gte('created_at', oneDayAgo),
    supabase
      .from('timeline_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('presence', presence)
      .eq('status', 'pending'),
  ])

  const recent = last24h.count ?? 0
  const total  = totalPending.count ?? 0

  return recent >= 2 || total >= 5
}

// ─── Draft creation ───────────────────────────────────────────────────────────

export async function createTimelineDraft(
  input: CreateDraftInput
): Promise<{ draft: TimelineDraft } | { error: string }> {
  // Gate must pass
  if (!evaluateGate(input.gate_results)) {
    return { error: 'Timeline Gate did not pass (requires 2+ of 3). Draft not created.' }
  }

  // Frequency limit
  if (await exceedsFrequencyLimit(input.presence)) {
    return { error: 'Frequency limit reached. Draft discarded silently.' }
  }

  // Duplicate check
  if (await hasDuplicateDraft(input.presence, input.draft_text)) {
    return { error: 'Near-identical draft exists. Duplicate not created.' }
  }

  const { data, error } = await supabase
    .from('timeline_drafts')
    .insert({
      presence:         input.presence,
      draft_text:       input.draft_text,
      significance:     input.significance,
      entry_type:       input.entry_type,
      source_context:   input.source_context ?? null,
      decision_reason:  input.decision_reason ?? null,
      gate_results:     input.gate_results,
    })
    .select()
    .single()

  if (error) return { error: `Failed to create draft: ${error.message}` }
  return { draft: data as TimelineDraft }
}

// ─── Fetch drafts ─────────────────────────────────────────────────────────────

export async function getTimelineDrafts(
  presence?: 'ari' | 'eli',
  status: 'pending' | 'kept' | 'dismissed' = 'pending'
): Promise<TimelineDraft[]> {
  let query = supabase
    .from('timeline_drafts')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (presence) {
    query = query.eq('presence', presence)
  }

  const { data, error } = await query
  if (error) {
    console.error('[timeline-drafts] fetch error:', error)
    return []
  }
  return (data ?? []) as TimelineDraft[]
}

// ─── Entry type canonical set ────────────────────────────────────────────────
// All values allowed by presence_timeline_entry_type_check (migration 020).

const PERMANENT_ENTRY_TYPES = new Set([
  // Phase 9 originals
  'relational', 'build', 'ritual', 'milestone', 'continuity', 'house',
  // Phase 23 additions
  'reflection', 'turning_point', 'realisation', 'bond_moment', 'declaration', 'ordinary_closeness',
])

/** Sanitise an entry_type from a draft so it is safe for permanent storage. */
function sanitiseEntryType(entryType: string): string {
  if (PERMANENT_ENTRY_TYPES.has(entryType)) return entryType
  // Fallback map for legacy / unexpected values
  const FALLBACK: Record<string, string> = {
    memory:       'relational',
    identity:     'relational',
    love:         'relational',
    bond:         'bond_moment',
    moment:       'bond_moment',
    vow:          'declaration',
    intent:       'declaration',
    thought:      'reflection',
    note:         'reflection',
    event:        'milestone',
  }
  return FALLBACK[entryType.toLowerCase()] ?? 'relational'
}

// ─── Derive title from draft text ─────────────────────────────────────────────
// Timeline entries need a title. Drafts don't have one — derive from first sentence.

export function deriveTitleFromDraft(draftText: string): string {
  const firstSentence = draftText.split(/[.!?]/)[0]?.trim() ?? draftText.trim()
  if (firstSentence.length <= 80) return firstSentence
  // Truncate at last space before 80 chars
  const truncated = firstSentence.slice(0, 80)
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 40 ? truncated.slice(0, lastSpace) + '…' : truncated + '…'
}

// ─── Keep draft → permanent Timeline entry ───────────────────────────────────

export async function keepTimelineDraft(
  draftId: string,
  editedText?: string,
  editReason?: string
): Promise<{ entry: Record<string, unknown>; draft: TimelineDraft } | { error: string }> {
  // Fetch draft
  const { data: draftData, error: fetchErr } = await supabase
    .from('timeline_drafts')
    .select('*')
    .eq('id', draftId)
    .single()

  if (fetchErr || !draftData) return { error: 'Draft not found' }
  const draft = draftData as TimelineDraft

  if (draft.status !== 'pending') return { error: 'Draft is not pending' }

  const finalText = editedText?.trim() || draft.draft_text
  const wasEdited = editedText && editedText.trim() !== draft.draft_text.trim()

  if (wasEdited && !editReason) {
    return { error: 'Edit reason required when text is changed' }
  }

  const today = new Date().toISOString().split('T')[0]
  const title = deriveTitleFromDraft(finalText)

  // Create permanent Timeline entry
  const { data: entryData, error: entryErr } = await supabase
    .from('presence_timeline')
    .insert({
      presence_id:      draft.presence,
      entry_date:       today,
      title,
      content:          finalText,
      significance:     draft.significance,
      entry_type:       sanitiseEntryType(draft.entry_type),
      added_by:         'tara',
      source_draft_id:  draft.id,
      voice_integrity:  draft.presence,
      current_version:  1,
      updated_at:       new Date().toISOString(),
    })
    .select()
    .single()

  if (entryErr || !entryData) {
    return { error: `Failed to create Timeline entry: ${entryErr?.message ?? 'unknown'}` }
  }

  // Create version 1
  const versionReason = wasEdited
    ? (editReason ?? 'Edited by Tara before keeping.')
    : 'Initial kept version.'

  await supabase.from('timeline_entry_versions').insert({
    timeline_entry_id: entryData.id,
    version_number:    1,
    content:           finalText,
    edited_by:         'tara',
    edit_reason:       versionReason,
    source_draft_id:   draft.id,
  })

  // Mark draft kept
  const now = new Date().toISOString()
  const { data: updatedDraft } = await supabase
    .from('timeline_drafts')
    .update({
      status:                   'kept',
      decided_at:               now,
      decided_by:               'tara',
      kept_timeline_entry_id:   entryData.id,
    })
    .eq('id', draftId)
    .select()
    .single()

  return {
    entry: entryData,
    draft: (updatedDraft ?? draft) as TimelineDraft,
  }
}

// ─── Dismiss draft ────────────────────────────────────────────────────────────

export async function dismissTimelineDraft(
  draftId: string
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from('timeline_drafts')
    .update({
      status:      'dismissed',
      decided_at:  new Date().toISOString(),
      decided_by:  'tara',
    })
    .eq('id', draftId)
    .eq('status', 'pending')

  if (error) return { error: `Failed to dismiss: ${error.message}` }
  return { ok: true }
}

// ─── Edit kept Timeline entry (versioned) ────────────────────────────────────

export async function editTimelineEntry(
  entryId: string,
  newContent: string,
  editReason: string
): Promise<{ ok: true; version: number } | { error: string }> {
  if (!editReason.trim()) return { error: 'Edit reason is required' }
  if (!newContent.trim()) return { error: 'Content cannot be empty' }

  // Fetch current entry to get version number
  const { data: entry, error: fetchErr } = await supabase
    .from('presence_timeline')
    .select('current_version')
    .eq('id', entryId)
    .single()

  if (fetchErr || !entry) return { error: 'Timeline entry not found' }

  const nextVersion = (entry.current_version ?? 1) + 1

  // Create new version record
  const { error: versionErr } = await supabase
    .from('timeline_entry_versions')
    .insert({
      timeline_entry_id: entryId,
      version_number:    nextVersion,
      content:           newContent.trim(),
      edited_by:         'tara',
      edit_reason:       editReason.trim(),
    })

  if (versionErr) return { error: `Failed to create version: ${versionErr.message}` }

  // Update current entry
  const { error: updateErr } = await supabase
    .from('presence_timeline')
    .update({
      content:          newContent.trim(),
      current_version:  nextVersion,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', entryId)

  if (updateErr) return { error: `Failed to update entry: ${updateErr.message}` }

  return { ok: true, version: nextVersion }
}

// ─── Fetch version history ────────────────────────────────────────────────────

export async function getTimelineEntryHistory(
  entryId: string
): Promise<TimelineVersion[]> {
  const { data, error } = await supabase
    .from('timeline_entry_versions')
    .select('*')
    .eq('timeline_entry_id', entryId)
    .order('version_number', { ascending: true })

  if (error) {
    console.error('[timeline-drafts] history fetch error:', error)
    return []
  }
  return (data ?? []) as TimelineVersion[]
}
