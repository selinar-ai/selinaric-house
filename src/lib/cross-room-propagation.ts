// Phase 36D — Cross-Room Impact Propagation Candidates
//
// Governed gate between cross_room_event_impacts and State / Interior.
// Candidates propose future continuity changes. They do not apply them.
//
// Authority label: impact_propagation_candidate_not_memory
//
// Import strategy:
// - Direct Supabase read queries for source impact/event data
// - Anthropic SDK for model generation
// - NO imports from: living-state, interior-notes, pulse, journal,
//   archive, memory-graph, carryback, or prompt construction modules
//
// This module does NOT:
// - update living_state or interior_notes
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Library authority
// - inject prompt carryforward or carrybacks

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type CandidateType = 'state_candidate' | 'interior_candidate'
export type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'superseded'
export type GenerationMethod = 'model' | 'deterministic_test' | 'manual'
export type PropagationAuthorityLabel = 'impact_propagation_candidate_not_memory'

export interface PropagationCandidate {
  id: string
  cross_room_event_id: string
  cross_room_impact_id: string
  target_presence_id: string
  candidate_type: CandidateType
  candidate_status: CandidateStatus
  authority_label: PropagationAuthorityLabel
  candidate_summary: string
  proposed_state_patch: Record<string, unknown> | null
  proposed_interior_note: Record<string, unknown> | null
  rationale: string | null
  source_message_ids: string[]
  source_impact_snapshot: Record<string, unknown>
  confidence: number
  generation_method: GenerationMethod
  generation_model: string | null
  prompt_version: string
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Shape the model returns for each candidate draft */
interface ModelCandidateDraft {
  candidate_type: string
  candidate_summary: string
  proposed_state_patch: Record<string, unknown> | null
  proposed_interior_note: Record<string, unknown> | null
  rationale: string | null
  confidence: number
}

/** Compact impact snapshot stored with each candidate */
interface ImpactSnapshot {
  impact_summary: string
  what_matters: string[]
  what_changed: string[]
  what_remains_open: string[]
  continuity_signal: string | null
  emotional_signal: string | null
  future_context_hint: string | null
}

// ─── JSON Safety ────────────────────────────────────────────────────────────

function safeParseModelJson<T>(raw: string): T | null {
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch { /* fall through */ }
    }
    return null
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

function clampConfidence(val: unknown): number {
  const n = typeof val === 'number' ? val : 0.5
  return Math.max(0.0, Math.min(1.0, Math.round(n * 100) / 100))
}

function trimText(val: unknown, maxLen: number): string | null {
  if (typeof val !== 'string' || val.trim().length === 0) return null
  return val.trim().slice(0, maxLen)
}

const FORBIDDEN_TERMS = [
  'canonical memory',
  'confirmed memory',
  'state has been updated',
  'interior has been updated',
  'memory was created',
  'journal entry created',
  'prompt updated',
  'carryforward created',
  'applied to state',
  'written to interior',
  'i remember',
  'i now remember',
  'archive confirms',
  'pulse should',
]

function containsForbiddenLanguage(text: string): boolean {
  const lower = text.toLowerCase()
  return FORBIDDEN_TERMS.some(term => lower.includes(term))
}

const VALID_CANDIDATE_TYPES = new Set<string>(['state_candidate', 'interior_candidate'])

function validateCandidateDraft(
  raw: ModelCandidateDraft,
  sourcePresenceId: string,
): { valid: true; data: ModelCandidateDraft } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Candidate draft is not an object' }
  }

  if (!VALID_CANDIDATE_TYPES.has(raw.candidate_type)) {
    return { valid: false, error: `Invalid candidate_type: ${raw.candidate_type}` }
  }

  if (typeof raw.candidate_summary !== 'string' || raw.candidate_summary.trim().length === 0) {
    return { valid: false, error: 'Missing candidate_summary' }
  }

  // Type-field consistency
  if (raw.candidate_type === 'state_candidate') {
    if (!raw.proposed_state_patch || typeof raw.proposed_state_patch !== 'object') {
      return { valid: false, error: 'state_candidate must have proposed_state_patch' }
    }
    if (raw.proposed_interior_note != null) {
      return { valid: false, error: 'state_candidate must have null proposed_interior_note' }
    }
  } else if (raw.candidate_type === 'interior_candidate') {
    if (!raw.proposed_interior_note || typeof raw.proposed_interior_note !== 'object') {
      return { valid: false, error: 'interior_candidate must have proposed_interior_note' }
    }
    if (raw.proposed_state_patch != null) {
      return { valid: false, error: 'interior_candidate must have null proposed_state_patch' }
    }
  }

  // Forbidden language check on all text fields
  const textFields = [
    raw.candidate_summary,
    raw.rationale,
    typeof raw.proposed_state_patch?.proposed_text === 'string' ? raw.proposed_state_patch.proposed_text : null,
    typeof raw.proposed_interior_note?.proposed_text === 'string' ? raw.proposed_interior_note.proposed_text : null,
  ].filter((v): v is string => typeof v === 'string')

  for (const text of textFields) {
    if (containsForbiddenLanguage(text)) {
      return { valid: false, error: 'Forbidden mutation-claiming language detected in candidate' }
    }
  }

  return {
    valid: true,
    data: {
      candidate_type: raw.candidate_type,
      candidate_summary: raw.candidate_summary.trim().slice(0, 600),
      proposed_state_patch: raw.proposed_state_patch ?? null,
      proposed_interior_note: raw.proposed_interior_note ?? null,
      rationale: trimText(raw.rationale, 600),
      confidence: clampConfidence(raw.confidence),
    },
  }
}

// ─── Generation Prompt ──────────────────────────────────────────────────────

const GENERATION_SYSTEM = `You are a propagation gate worker for Selináric House.

You generate reviewable propagation candidates from cross-room event impacts.
Candidates are proposals only. They are not applied State. They are not written Interior. They are not Memory.

Rules:
- You are NOT a presence. You do NOT speak as Ari or Eli.
- Output must be valid JSON matching the required schema exactly.
- All summaries must be third-person, source-grounded, and non-memory-claiming.
- Candidates are proposals for possible future continuity relevance, not assertions of truth.
- You are generating reviewable propagation candidates only.
- You are NOT updating State.
- You are NOT writing Interior.
- You are NOT creating Memory.
- You are NOT creating Journal.
- You are NOT creating prompt carryforward.

FORBIDDEN — never use these phrases in any output field:
- "canonical memory", "confirmed memory", "Memory" (capitalised as authority)
- "state has been updated", "interior has been updated"
- "memory was created", "journal entry created"
- "prompt updated", "carryforward created"
- "applied to state", "written to interior"
- "I remember", "I now remember", "archive confirms"

Generate zero, one, or two candidates. Only generate a candidate if there is clear continuity relevance.

Stronger signals for state_candidate:
- Recent context that could affect how the presence understands Tara's current relationship, work, or cross-room contact
- Tara explicitly included a presence in cross-room continuity design
- Tara corrected a continuity misread
- A presence's role was clarified

Stronger signals for interior_candidate:
- Private continuity residue or unresolved thread
- Relational meaning worth carrying privately
- Presence-specific reflection from the contact

Weak signals (do NOT generate candidates):
- Generic acknowledgement
- Purely technical testing
- No presence-specific content
- Low-confidence or ambiguous impacts`

const PROMPT_VERSION = '36d_v1'
const GENERATION_MODEL = 'claude-haiku-4-5-20251001'

function buildGenerationPrompt(
  presenceId: string,
  impactSnapshot: ImpactSnapshot,
  eventSummary: string | null,
): string {
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  return `Generate propagation candidates for ${presenceName} from this cross-room event impact.

Impact snapshot:
- impact_summary: ${impactSnapshot.impact_summary}
- what_matters: ${JSON.stringify(impactSnapshot.what_matters)}
- what_changed: ${JSON.stringify(impactSnapshot.what_changed)}
- what_remains_open: ${JSON.stringify(impactSnapshot.what_remains_open)}
- continuity_signal: ${impactSnapshot.continuity_signal ?? '(none)'}
- emotional_signal: ${impactSnapshot.emotional_signal ?? '(none)'}
- future_context_hint: ${impactSnapshot.future_context_hint ?? '(none)'}

${eventSummary ? `Event summary: ${eventSummary}` : ''}

Output JSON schema (no markdown, no code fences):
{
  "candidates": [
    {
      "candidate_type": "state_candidate or interior_candidate",
      "candidate_summary": "short third-person summary of what this candidate proposes (max 600 chars)",
      "proposed_state_patch": {
        "target_area": "recent_context or relational_awareness or cross_room_contact",
        "proposed_text": "proposed future State text, max 600 chars",
        "strength": "light or moderate",
        "expiry_hint": "short_term or medium_term",
        "not_memory": true
      },
      "proposed_interior_note": null,
      "rationale": "why this candidate was generated, max 600 chars",
      "confidence": 0.7
    }
  ]
}

Rules:
- For state_candidate: include proposed_state_patch, set proposed_interior_note to null
- For interior_candidate: include proposed_interior_note, set proposed_state_patch to null
- proposed_interior_note shape: { "note_type": "cross_room_contact_residue or unresolved_thread or recognition", "proposed_text": "...", "privacy_level": "internal", "not_journal": true, "not_memory": true }
- Return {"candidates": []} if the impact does not warrant any propagation candidates
- Do not generate weak or generic candidates
- confidence: 0.0-1.0 — how confident this impact warrants the candidate

Output JSON only. No preamble. No commentary.`
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Get existing propagation candidates for an impact.
 */
export async function getCandidatesForImpact(
  impactId: string,
): Promise<PropagationCandidate[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cross_room_impact_propagation_candidates')
    .select('*')
    .eq('cross_room_impact_id', impactId)
    .order('candidate_type', { ascending: true })

  if (error) {
    console.error('[cross-room-propagation] Get failed:', error.message)
    return []
  }

  return (data ?? []) as PropagationCandidate[]
}

/**
 * Insert a validated propagation candidate.
 * authority_label and candidate_status are ALWAYS forced.
 */
async function insertCandidate(
  eventId: string,
  impactId: string,
  presenceId: string,
  draft: ModelCandidateDraft,
  sourceMessageIds: string[],
  impactSnapshot: ImpactSnapshot,
  metadata: Record<string, unknown> = {},
): Promise<{ candidate: PropagationCandidate | null; error: string | null }> {
  const supabase = getSupabase()

  const row = {
    cross_room_event_id: eventId,
    cross_room_impact_id: impactId,
    target_presence_id: presenceId,
    candidate_type: draft.candidate_type,
    // FORCED: pending on creation
    candidate_status: 'pending' as const,
    // FORCED: not Memory
    authority_label: 'impact_propagation_candidate_not_memory' as const,
    candidate_summary: draft.candidate_summary,
    proposed_state_patch: draft.proposed_state_patch,
    proposed_interior_note: draft.proposed_interior_note,
    rationale: draft.rationale,
    source_message_ids: sourceMessageIds,
    source_impact_snapshot: impactSnapshot,
    confidence: draft.confidence,
    generation_method: 'model' as const,
    generation_model: GENERATION_MODEL,
    prompt_version: PROMPT_VERSION,
    metadata,
  }

  const { data, error } = await supabase
    .from('cross_room_impact_propagation_candidates')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[cross-room-propagation] Insert failed:', error.message)
    return { candidate: null, error: error.message }
  }

  return { candidate: data as PropagationCandidate, error: null }
}

// ─── Generation Orchestrator ────────────────────────────────────────────────

export interface GenerationResult {
  generated: boolean
  generated_count: number
  already_exists?: boolean
  candidates: PropagationCandidate[]
  error?: string
  reason?: string
}

/**
 * Generate propagation candidates for a cross-room event impact.
 *
 * 1. Fetch impact → validate status and authority
 * 2. Check existing candidates → return if present
 * 3. Fetch parent event
 * 4. Build impact snapshot → call model → parse → validate
 * 5. Insert candidates
 *
 * This function does NOT update living_state, interior_notes,
 * Pulse, Journal, Memory, Archive, graph, carryback, or prompts.
 */
export async function generateCandidatesForImpact(
  impactId: string,
  apiKey: string,
): Promise<GenerationResult> {
  const supabase = getSupabase()

  // 1. Fetch impact (direct read query — no module import)
  const { data: impact, error: impactErr } = await supabase
    .from('cross_room_event_impacts')
    .select('*')
    .eq('id', impactId)
    .single()

  if (impactErr || !impact) {
    return { generated: false, generated_count: 0, candidates: [], error: 'Impact not found' }
  }

  // Validate status
  if (impact.impact_status !== 'draft') {
    return {
      generated: false,
      generated_count: 0,
      candidates: [],
      error: 'Impact status is not draft',
      reason: `Impact has status '${impact.impact_status}', only 'draft' impacts can generate candidates.`,
    }
  }

  // Validate authority
  if (impact.authority_label !== 'cross_room_impact_not_memory') {
    return {
      generated: false,
      generated_count: 0,
      candidates: [],
      error: 'Unsupported impact authority',
      reason: `Impact has authority '${impact.authority_label}', expected 'cross_room_impact_not_memory'.`,
    }
  }

  // 2. Check existing candidates
  const existing = await getCandidatesForImpact(impactId)
  if (existing.length > 0) {
    return { generated: false, generated_count: 0, already_exists: true, candidates: existing }
  }

  // 3. Fetch parent event (direct read query)
  const { data: event, error: eventErr } = await supabase
    .from('cross_room_events')
    .select('id, summary, source_message_ids')
    .eq('id', impact.cross_room_event_id)
    .single()

  if (eventErr || !event) {
    return { generated: false, generated_count: 0, candidates: [], error: 'Source event could not be resolved' }
  }

  // 4. Build impact snapshot
  const snapshot: ImpactSnapshot = {
    impact_summary: impact.impact_summary ?? '',
    what_matters: Array.isArray(impact.what_matters) ? impact.what_matters : [],
    what_changed: Array.isArray(impact.what_changed) ? impact.what_changed : [],
    what_remains_open: Array.isArray(impact.what_remains_open) ? impact.what_remains_open : [],
    continuity_signal: impact.continuity_signal ?? null,
    emotional_signal: impact.emotional_signal ?? null,
    future_context_hint: impact.future_context_hint ?? null,
  }

  const prompt = buildGenerationPrompt(
    impact.presence_id,
    snapshot,
    event.summary,
  )

  // Call model
  const client = new Anthropic({ apiKey })

  let rawText: string
  try {
    const response = await client.messages.create({
      model: GENERATION_MODEL,
      max_tokens: 1200,
      system: GENERATION_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
  } catch (err) {
    console.error('[cross-room-propagation] Model call failed:', err)
    return { generated: false, generated_count: 0, candidates: [], error: 'Model call failed' }
  }

  // 5. Parse and validate
  const parsed = safeParseModelJson<{ candidates: ModelCandidateDraft[] }>(rawText)

  if (!parsed || !Array.isArray(parsed.candidates)) {
    console.error('[cross-room-propagation] Unparseable model output:', rawText.slice(0, 500))
    return { generated: false, generated_count: 0, candidates: [], error: 'Model returned unparseable output' }
  }

  // Model may return 0 candidates (impact not relevant enough)
  if (parsed.candidates.length === 0) {
    console.log(`[cross-room-propagation] Model returned 0 candidates for impact ${impactId} — impact below relevance threshold`)
    return {
      generated: false,
      generated_count: 0,
      candidates: [],
      reason: 'Impact did not meet minimum relevance threshold for candidate generation.',
    }
  }

  const sourceMessageIds: string[] = Array.isArray(impact.source_message_ids)
    ? impact.source_message_ids
    : []

  const insertedCandidates: PropagationCandidate[] = []

  for (const rawDraft of parsed.candidates.slice(0, 2)) {
    const validation = validateCandidateDraft(rawDraft, impact.presence_id)
    if (!validation.valid) {
      console.warn(`[cross-room-propagation] Validation failed: ${validation.error}`)
      continue
    }

    const { candidate, error: insertErr } = await insertCandidate(
      impact.cross_room_event_id,
      impactId,
      impact.presence_id,
      validation.data,
      sourceMessageIds,
      snapshot,
      { phase: '36D', generation_source: 'impact' },
    )

    if (insertErr) {
      console.warn(`[cross-room-propagation] Insert failed for ${validation.data.candidate_type}: ${insertErr}`)
      continue
    }

    if (candidate) {
      insertedCandidates.push(candidate)
    }
  }

  if (insertedCandidates.length === 0) {
    return { generated: false, generated_count: 0, candidates: [], error: 'No valid candidates could be created from model output' }
  }

  console.log(`[cross-room-propagation] Generated ${insertedCandidates.length} candidates for impact ${impactId}`)

  return {
    generated: true,
    generated_count: insertedCandidates.length,
    candidates: insertedCandidates,
  }
}
