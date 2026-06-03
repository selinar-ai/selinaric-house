// Phase 36E — Cross-Room Prompt Carryforward
//
// Governed prompt context layer. Carryforward from explicitly enabled
// cross-room propagation candidates into Ari/Eli room prompts.
//
// Authority label: cross_room_prompt_carryforward_not_memory
//
// Import strategy:
// - Direct Supabase read/write queries for own table + source data
// - NO imports from: living-state, interior-notes, pulse, journal,
//   archive, memory-graph, memory-injection, lounge, continuity-store,
//   emotional-snapshot, or prompt construction modules
//
// This module does NOT:
// - update living_state or interior_notes
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Library authority
// - inject prompt carryforward into Lounge prompts
// - update injection_count at prompt read time (reserved for 36H)

import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type CarryforwardStatus = 'active' | 'expired' | 'revoked' | 'superseded'
export type CarryforwardCreatedBy = 'manual_ui' | 'deterministic_test' | 'admin_seed'

export interface PromptCarryforward {
  id: string
  cross_room_event_id: string
  cross_room_impact_id: string
  propagation_candidate_id: string
  target_presence_id: string
  target_room_slug: string | null
  carryforward_status: CarryforwardStatus
  authority_label: string
  carryforward_summary: string
  prompt_lines: string[]
  source_message_ids: string[]
  source_candidate_snapshot: Record<string, unknown>
  source_impact_snapshot: Record<string, unknown>
  created_by: CarryforwardCreatedBy
  expires_at: string
  last_injected_at: string | null
  injection_count: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Compact snapshot of the 36D propagation candidate */
interface CandidateSnapshot {
  candidate_type: string
  candidate_summary: string
  proposed_state_patch: Record<string, unknown> | null
  rationale: string | null
  confidence: number
}

/** Compact snapshot of the 36C impact */
interface ImpactSnapshot {
  impact_summary: string
  what_matters: string[]
  what_changed: string[]
  what_remains_open: string[]
  continuity_signal: string | null
  emotional_signal: string | null
  future_context_hint: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPIRY_DAYS = 7
const MAX_PROMPT_CARRYFORWARDS = 3
const MAX_SUMMARY_CHARS = 600
const MAX_PROMPT_LINE_CHARS = 400

/** Room slugs that may receive carryforward. All others are blocked. */
const ALLOWED_ROOM_SLUGS = new Set(['ari', 'eli'])

// ─── Forbidden Language Guard ───────────────────────────────────────────────

const FORBIDDEN_TERMS = [
  'canonical memory',
  'confirmed memory',
  'i remember',
  'i now remember',
  'archive confirms',
  'state has been updated',
  'interior has been updated',
  'memory was created',
  'journal entry created',
  'prompt updated',
  'carryforward created as memory',
  'applied to state',
  'written to interior',
  'pulse should',
]

function containsForbiddenLanguage(text: string): boolean {
  const lower = text.toLowerCase()
  return FORBIDDEN_TERMS.some(term => lower.includes(term))
}

function sanitizeText(text: string, maxLen: number): string {
  return text.trim().slice(0, maxLen)
}

// ─── Deterministic Builder ──────────────────────────────────────────────────

function buildCarryforwardContent(
  candidate: Record<string, unknown>,
  impact: Record<string, unknown>,
  event: Record<string, unknown>,
): { summary: string; promptLines: string[] } | { error: string } {
  const candidateSummary = typeof candidate.candidate_summary === 'string'
    ? candidate.candidate_summary : ''
  const patch = candidate.proposed_state_patch as Record<string, unknown> | null
  const proposedText = patch && typeof patch.proposed_text === 'string'
    ? patch.proposed_text : ''

  if (!candidateSummary && !proposedText) {
    return { error: 'No content available from candidate' }
  }

  // Build summary from candidate_summary
  const summary = sanitizeText(candidateSummary || proposedText, MAX_SUMMARY_CHARS)

  // Build prompt lines from proposed_text (primary) and candidate_summary (fallback)
  const lines: string[] = []

  if (proposedText) {
    lines.push(sanitizeText(proposedText, MAX_PROMPT_LINE_CHARS))
  } else if (candidateSummary) {
    lines.push(sanitizeText(candidateSummary, MAX_PROMPT_LINE_CHARS))
  }

  // Validate candidate-derived content before adding system guard line
  for (const text of [summary, ...lines]) {
    if (containsForbiddenLanguage(text)) {
      return { error: 'Forbidden mutation-claiming language detected in carryforward content' }
    }
  }

  // System guard line — appended after validation (contains "canonical Memory" intentionally)
  lines.push('This is recent cross-room context only, not canonical Memory.')

  return { summary, promptLines: lines }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Get existing carryforward for a propagation candidate.
 */
export async function getCarryforwardForCandidate(
  candidateId: string,
): Promise<PromptCarryforward[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cross_room_prompt_carryforwards')
    .select('*')
    .eq('propagation_candidate_id', candidateId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[cross-room-prompt-carryforward] Get failed:', error.message)
    return []
  }

  return (data ?? []) as PromptCarryforward[]
}

/**
 * Get active unexpired carryforwards for a presence + room.
 * Used by the prompt block helper.
 */
async function getActiveCarryforwards(
  presenceId: string,
): Promise<PromptCarryforward[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cross_room_prompt_carryforwards')
    .select('*')
    .eq('target_presence_id', presenceId)
    .eq('carryforward_status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_PROMPT_CARRYFORWARDS)

  if (error) {
    console.error('[cross-room-prompt-carryforward] Active query failed:', error.message)
    return []
  }

  return (data ?? []) as PromptCarryforward[]
}

/**
 * Phase 39.6 — export active carryforwards for Recall Packet advisory signal mapping.
 * Returns the same rows as the internal `getActiveCarryforwards()` query.
 * Called alongside (not instead of) `getCrossRoomCarryforwardBlock()` so the
 * advisory layer can access structured metadata without a second formatting pass.
 */
export async function getActiveCarryforwardsForAdvisory(
  presenceId: string,
): Promise<PromptCarryforward[]> {
  return getActiveCarryforwards(presenceId)
}

// ─── Creation Orchestrator ──────────────────────────────────────────────────

export interface CreationResult {
  created: boolean
  already_exists?: boolean
  carryforward: PromptCarryforward | null
  error?: string
  reason?: string
}

/**
 * Create a prompt carryforward from an eligible propagation candidate.
 *
 * Eligibility:
 * - candidate_type = state_candidate
 * - candidate_status = pending or approved
 * - authority_label = impact_propagation_candidate_not_memory
 * - target_presence_id in ('ari', 'eli')
 *
 * This function does NOT update living_state, interior_notes,
 * Pulse, Journal, Memory, Archive, graph, carryback, or prompts.
 */
export async function createCarryforwardFromCandidate(
  candidateId: string,
  options: {
    targetRoomSlug?: string
    expiresInDays?: number
    createdBy?: CarryforwardCreatedBy
  } = {},
): Promise<CreationResult> {
  const supabase = getSupabase()

  // 1. Fetch candidate
  const { data: candidate, error: candErr } = await supabase
    .from('cross_room_impact_propagation_candidates')
    .select('*')
    .eq('id', candidateId)
    .single()

  if (candErr || !candidate) {
    return { created: false, carryforward: null, error: 'Candidate not found' }
  }

  // 2. Validate candidate_type
  if (candidate.candidate_type !== 'state_candidate') {
    return {
      created: false,
      carryforward: null,
      error: 'Only state_candidate is eligible for prompt carryforward in v1',
      reason: `Candidate has type '${candidate.candidate_type}'.`,
    }
  }

  // 3. Validate candidate_status
  if (candidate.candidate_status !== 'pending' && candidate.candidate_status !== 'approved') {
    return {
      created: false,
      carryforward: null,
      error: 'Candidate status is not eligible',
      reason: `Candidate has status '${candidate.candidate_status}', only 'pending' or 'approved' are eligible.`,
    }
  }

  // 4. Validate authority_label
  if (candidate.authority_label !== 'impact_propagation_candidate_not_memory') {
    return {
      created: false,
      carryforward: null,
      error: 'Unsupported candidate authority',
      reason: `Candidate has authority '${candidate.authority_label}'.`,
    }
  }

  // 5. Validate target_presence_id
  if (candidate.target_presence_id !== 'ari' && candidate.target_presence_id !== 'eli') {
    return {
      created: false,
      carryforward: null,
      error: 'Invalid target presence',
      reason: `Target presence '${candidate.target_presence_id}' is not ari or eli.`,
    }
  }

  // 6. Check existing
  const existing = await getCarryforwardForCandidate(candidateId)
  const existingForPresence = existing.filter(
    cf => cf.target_presence_id === candidate.target_presence_id,
  )
  if (existingForPresence.length > 0) {
    return {
      created: false,
      already_exists: true,
      carryforward: existingForPresence[0],
    }
  }

  // 7. Fetch source impact
  const { data: impact, error: impactErr } = await supabase
    .from('cross_room_event_impacts')
    .select('*')
    .eq('id', candidate.cross_room_impact_id)
    .single()

  if (impactErr || !impact) {
    return { created: false, carryforward: null, error: 'Source impact could not be resolved' }
  }

  // 8. Fetch source event
  const { data: event, error: eventErr } = await supabase
    .from('cross_room_events')
    .select('id, summary, source_message_ids')
    .eq('id', candidate.cross_room_event_id)
    .single()

  if (eventErr || !event) {
    return { created: false, carryforward: null, error: 'Source event could not be resolved' }
  }

  // 9. Build deterministic content
  const content = buildCarryforwardContent(candidate, impact, event)
  if ('error' in content) {
    return { created: false, carryforward: null, error: content.error }
  }

  // 10. Build snapshots
  const candidateSnapshot: CandidateSnapshot = {
    candidate_type: candidate.candidate_type,
    candidate_summary: candidate.candidate_summary ?? '',
    proposed_state_patch: candidate.proposed_state_patch ?? null,
    rationale: candidate.rationale ?? null,
    confidence: Number(candidate.confidence) ?? 0.5,
  }

  const impactSnapshot: ImpactSnapshot = {
    impact_summary: impact.impact_summary ?? '',
    what_matters: Array.isArray(impact.what_matters) ? impact.what_matters : [],
    what_changed: Array.isArray(impact.what_changed) ? impact.what_changed : [],
    what_remains_open: Array.isArray(impact.what_remains_open) ? impact.what_remains_open : [],
    continuity_signal: impact.continuity_signal ?? null,
    emotional_signal: impact.emotional_signal ?? null,
    future_context_hint: impact.future_context_hint ?? null,
  }

  // 11. Calculate expiry
  const expiryDays = options.expiresInDays ?? EXPIRY_DAYS
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()

  // 12. Determine target room slug
  const targetRoomSlug = options.targetRoomSlug ?? candidate.target_presence_id

  // 13. Insert
  const row = {
    cross_room_event_id: candidate.cross_room_event_id,
    cross_room_impact_id: candidate.cross_room_impact_id,
    propagation_candidate_id: candidateId,
    target_presence_id: candidate.target_presence_id,
    target_room_slug: targetRoomSlug,
    // FORCED
    carryforward_status: 'active' as const,
    authority_label: 'cross_room_prompt_carryforward_not_memory' as const,
    carryforward_summary: content.summary,
    prompt_lines: content.promptLines,
    source_message_ids: Array.isArray(candidate.source_message_ids)
      ? candidate.source_message_ids : [],
    source_candidate_snapshot: candidateSnapshot,
    source_impact_snapshot: impactSnapshot,
    created_by: options.createdBy ?? 'manual_ui' as const,
    expires_at: expiresAt,
    metadata: { phase: '36E' },
  }

  const { data, error } = await supabase
    .from('cross_room_prompt_carryforwards')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[cross-room-prompt-carryforward] Insert failed:', error.message)
    return { created: false, carryforward: null, error: error.message }
  }

  console.log(`[cross-room-prompt-carryforward] Created carryforward ${data.id} for ${candidate.target_presence_id} from candidate ${candidateId}`)

  return { created: true, carryforward: data as PromptCarryforward }
}

// ─── Prompt Block Helper ────────────────────────────────────────────────────

/**
 * Build the Recent Cross-Room Context prompt block for injection into
 * Ari/Eli room prompts.
 *
 * Returns empty string if no active unexpired carryforwards exist,
 * or if the presenceId/roomSlug combination is not an allowed
 * single-presence room.
 *
 * This function is READ-ONLY. It does not update any rows.
 */
export async function getCrossRoomCarryforwardBlock(
  presenceId: string,
  roomSlug: string,
): Promise<string> {
  // Scope guard: only allowed for Ari/Eli single-presence rooms
  if (!ALLOWED_ROOM_SLUGS.has(roomSlug)) {
    console.log(`[cross-room-prompt-carryforward] Block skipped: room '${roomSlug}' not in allowed set`)
    return ''
  }

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return ''
  }

  const carryforwards = await getActiveCarryforwards(presenceId)

  if (carryforwards.length === 0) {
    return ''
  }

  const items = carryforwards.map(cf => {
    const lines = Array.isArray(cf.prompt_lines) ? cf.prompt_lines : []
    const mainLine = lines.length > 0 ? lines[0] : cf.carryforward_summary
    const expiresDate = new Date(cf.expires_at).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const eventShort = cf.cross_room_event_id.slice(0, 8)
    const impactShort = cf.cross_room_impact_id.slice(0, 8)
    const cfShort = cf.id.slice(0, 8)

    return `- ${mainLine}\n  Source: event=${eventShort}, impact=${impactShort}, carryforward=${cfShort}\n  Expires: ${expiresDate}`
  })

  return `\n\n## Recent Cross-Room Context — Not Memory

The following is recent House contact carried forward from another room.
It is not canonical Memory.
It is not confirmed Archive Memory.
It is not State.
It is not Interior.
Use it only as short-term context for this conversation.
Do not say "I remember" based only on this block.
If referencing it, use wording such as "I have recent House context that..."

${items.join('\n\n')}
`
}
