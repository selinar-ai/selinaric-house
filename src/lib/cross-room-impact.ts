// Phase 36C — Cross-Room Event Impact Extraction
//
// Per-presence interpretive impact records extracted from cross-room events.
// One row per presence per event. Unique on (cross_room_event_id, presence_id).
//
// Authority label: cross_room_impact_not_memory
//
// This module does NOT:
// - update State or Interior
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Library authority
// - inject prompt carryforward
// - interpret emotional impact as Memory

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImpactStatus = 'draft' | 'superseded' | 'rejected'
export type ExtractionMethod = 'model' | 'deterministic_test' | 'manual'
export type ImpactAuthorityLabel = 'cross_room_impact_not_memory'

export interface CrossRoomEventImpact {
  id: string
  cross_room_event_id: string
  presence_id: string
  impact_summary: string
  what_matters: string[]
  what_changed: string[]
  what_remains_open: string[]
  continuity_signal: string | null
  emotional_signal: string | null
  future_context_hint: string | null
  confidence: number
  source_message_ids: string[]
  extraction_method: ExtractionMethod
  extraction_model: string
  prompt_version: string
  impact_status: ImpactStatus
  authority_label: ImpactAuthorityLabel
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** Shape the model must return for each presence */
export interface ModelImpactOutput {
  presence_id: string
  impact_summary: string
  what_matters: string[]
  what_changed: string[]
  what_remains_open: string[]
  continuity_signal: string | null
  emotional_signal: string | null
  future_context_hint: string | null
  confidence: number
}

// ─── JSON Safety ────────────────────────────────────────────────────────────

function safeParseModelJson<T>(raw: string): T | null {
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Brace-extract fallback
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

/** Validate that a value is an array of strings. Returns sanitised array. */
function validateStringArray(val: unknown, maxItems = 10, maxLen = 200): string[] {
  if (!Array.isArray(val)) return []
  return val
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map(s => s.trim().slice(0, maxLen))
}

/** Clamp confidence to 0.0–1.0 */
function clampConfidence(val: unknown): number {
  const n = typeof val === 'number' ? val : 0.5
  return Math.max(0.0, Math.min(1.0, Math.round(n * 100) / 100))
}

/** Trim text field to max length, or return null. */
function trimTextField(val: unknown, maxLen = 500): string | null {
  if (typeof val !== 'string' || val.trim().length === 0) return null
  return val.trim().slice(0, maxLen)
}

// Forbidden terms that must not appear in impact summaries
const FORBIDDEN_TERMS = [
  'canonical memory',
  'confirmed memory',
  'archive item',
  'update state',
  'modify interior',
  'change pulse',
  'create journal',
  'promote to archive',
  'carryforward',
  'memory candidate',
]

/** Check that text does not contain forbidden Memory-claiming language. */
function containsForbiddenLanguage(text: string): boolean {
  const lower = text.toLowerCase()
  return FORBIDDEN_TERMS.some(term => lower.includes(term))
}

/** Validate a single model impact output and sanitise. */
function validateModelOutput(
  raw: ModelImpactOutput,
  validPresenceIds: string[],
): { valid: true; data: ModelImpactOutput } | { valid: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Impact output is not an object' }
  }

  if (!validPresenceIds.includes(raw.presence_id)) {
    return { valid: false, error: `Invalid presence_id: ${raw.presence_id}` }
  }

  if (typeof raw.impact_summary !== 'string' || raw.impact_summary.trim().length === 0) {
    return { valid: false, error: `Missing impact_summary for ${raw.presence_id}` }
  }

  // Check forbidden language in all text fields
  const textFields = [
    raw.impact_summary,
    ...(Array.isArray(raw.what_matters) ? raw.what_matters : []),
    ...(Array.isArray(raw.what_changed) ? raw.what_changed : []),
    ...(Array.isArray(raw.what_remains_open) ? raw.what_remains_open : []),
    raw.continuity_signal,
    raw.emotional_signal,
    raw.future_context_hint,
  ].filter((v): v is string => typeof v === 'string')

  for (const text of textFields) {
    if (containsForbiddenLanguage(text)) {
      return { valid: false, error: `Forbidden Memory-claiming language detected in impact for ${raw.presence_id}` }
    }
  }

  return {
    valid: true,
    data: {
      presence_id: raw.presence_id,
      impact_summary: raw.impact_summary.trim().slice(0, 500),
      what_matters: validateStringArray(raw.what_matters),
      what_changed: validateStringArray(raw.what_changed),
      what_remains_open: validateStringArray(raw.what_remains_open),
      continuity_signal: trimTextField(raw.continuity_signal, 300),
      emotional_signal: trimTextField(raw.emotional_signal, 300),
      future_context_hint: trimTextField(raw.future_context_hint, 300),
      confidence: clampConfidence(raw.confidence),
    },
  }
}

// ─── Extraction Prompt ──────────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a structured extraction worker for Selináric House.

You extract per-presence impact records from shared-room conversation transcripts.

Rules:
- You are NOT a presence. You do NOT speak as Ari or Eli.
- Output must be valid JSON matching the required schema exactly.
- All summaries must be third-person, source-grounded, and non-memory-claiming.
- Describe what was observed in the conversation, not inner experience.
- Do not invent content beyond what the conversation contains.
- Do not use relational, emotional, or bond language directed at the user.

FORBIDDEN — never use these phrases in any output field:
- "canonical memory", "confirmed memory", "Memory" (capitalised)
- "archive item", "promote to archive"
- "update state", "modify interior", "change pulse"
- "create journal", "carryforward", "memory candidate"

Output must be presence-specific: each presence may have experienced the same conversation differently.`

const PROMPT_VERSION = '36c_v1'

function buildExtractionPrompt(
  conversationBlock: string,
  presenceIds: string[],
  taraPresent: boolean,
  eventSummary: string | null,
): string {
  const presenceList = presenceIds.join(', ')
  const taraNote = taraPresent ? 'Tara was present.' : 'Tara was not present.'

  return `Extract per-presence impact from this Lounge conversation.

Participants: ${presenceList}. ${taraNote}
${eventSummary ? `Event summary: ${eventSummary}` : ''}

Conversation:
${conversationBlock}

For each presence listed (${presenceList}), produce a structured impact record.

Output JSON schema (no markdown, no code fences):
{
  "impacts": [
    {
      "presence_id": "ari or eli",
      "impact_summary": "1-3 sentence third-person interpretive summary of what this contact meant for this presence",
      "what_matters": ["short string array — what mattered to this presence in this contact"],
      "what_changed": ["short string array — what shifted or moved for this presence"],
      "what_remains_open": ["short string array — what was left unresolved or open"],
      "continuity_signal": "one sentence — what this presence might carry forward from this contact, or null",
      "emotional_signal": "one sentence — the emotional register of this contact for this presence, or null",
      "future_context_hint": "one sentence — what future context might benefit from knowing about this contact, or null",
      "confidence": 0.7
    }
  ]
}

Rules for each field:
- impact_summary: Required. 1-3 sentences. Third person. Source-grounded.
- what_matters: Array of short strings (1-5 items). What mattered to this presence.
- what_changed: Array of short strings (1-5 items). What shifted. Empty array if nothing shifted.
- what_remains_open: Array of short strings (1-5 items). What was left unresolved. Empty array if everything resolved.
- continuity_signal: One sentence or null. What carries forward.
- emotional_signal: One sentence or null. Emotional register, not emotional judgement.
- future_context_hint: One sentence or null. What future context might need.
- confidence: 0.0-1.0. How confident you are in this extraction. Lower if conversation was ambiguous.

If a presence was present but had minimal participation, still produce an impact with lower confidence.
Output JSON only. No preamble. No commentary.`
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

/**
 * Get existing impacts for an event.
 */
export async function getImpactsForEvent(
  eventId: string,
): Promise<CrossRoomEventImpact[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('cross_room_event_impacts')
    .select('*')
    .eq('cross_room_event_id', eventId)
    .order('presence_id', { ascending: true })

  if (error) {
    console.error('[cross-room-impact] Get failed:', error.message)
    return []
  }

  return (data ?? []) as CrossRoomEventImpact[]
}

/**
 * Insert a validated impact row.
 * authority_label is ALWAYS forced to 'cross_room_impact_not_memory'.
 */
export async function insertImpact(
  eventId: string,
  presenceId: string,
  impact: ModelImpactOutput,
  sourceMessageIds: string[],
  method: ExtractionMethod = 'model',
  model = 'claude-haiku-4-5-20251001',
  metadata: Record<string, unknown> = {},
): Promise<{ impact: CrossRoomEventImpact | null; error: string | null }> {
  const supabase = getSupabase()

  const row = {
    cross_room_event_id: eventId,
    presence_id: presenceId,
    impact_summary: impact.impact_summary,
    what_matters: impact.what_matters,
    what_changed: impact.what_changed,
    what_remains_open: impact.what_remains_open,
    continuity_signal: impact.continuity_signal,
    emotional_signal: impact.emotional_signal,
    future_context_hint: impact.future_context_hint,
    confidence: impact.confidence,
    source_message_ids: sourceMessageIds,
    extraction_method: method,
    extraction_model: model,
    prompt_version: PROMPT_VERSION,
    impact_status: 'draft' as const,
    // FORCED: not Memory
    authority_label: 'cross_room_impact_not_memory' as const,
    metadata,
  }

  const { data, error } = await supabase
    .from('cross_room_event_impacts')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[cross-room-impact] Insert failed:', error.message)
    return { impact: null, error: error.message }
  }

  return { impact: data as CrossRoomEventImpact, error: null }
}

// ─── Extraction Orchestrator ────────────────────────────────────────────────

export interface ExtractionResult {
  extracted: boolean
  already_exists?: boolean
  impacts: CrossRoomEventImpact[]
  error?: string
}

/**
 * Extract impacts for a cross-room event.
 *
 * 1. Fetch event → validate
 * 2. Check existing impacts → return if present
 * 3. Resolve source messages → fail if unresolvable
 * 4. Call model → parse → validate
 * 5. Insert per-presence impact rows
 *
 * This function does NOT update State, Interior, Pulse, Journal, Memory, or Archive.
 */
export async function extractImpactsForEvent(
  eventId: string,
  apiKey: string,
): Promise<ExtractionResult> {
  const supabase = getSupabase()

  // 1. Fetch event
  const { data: event, error: eventErr } = await supabase
    .from('cross_room_events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) {
    return { extracted: false, impacts: [], error: 'Event not found' }
  }

  // 2. Check existing impacts
  const existing = await getImpactsForEvent(eventId)
  if (existing.length > 0) {
    return { extracted: false, already_exists: true, impacts: existing }
  }

  // 3. Resolve source messages
  const sourceMessageIds: string[] = Array.isArray(event.source_message_ids)
    ? event.source_message_ids
    : []

  if (sourceMessageIds.length === 0) {
    return { extracted: false, impacts: [], error: 'Event has no source_message_ids' }
  }

  const { data: messages, error: msgErr } = await supabase
    .from('lounge_messages')
    .select('id, speaker, content, created_at')
    .in('id', sourceMessageIds)
    .order('created_at', { ascending: true })

  if (msgErr || !messages || messages.length === 0) {
    return { extracted: false, impacts: [], error: 'Source messages could not be resolved' }
  }

  // 4. Build conversation block and call model
  const conversationBlock = messages
    .map(m => {
      const name = m.speaker === 'tara' ? 'Tara' : m.speaker === 'ari' ? 'Ari' : m.speaker === 'eli' ? 'Eli' : m.speaker
      return `${name}: ${m.content}`
    })
    .join('\n\n')
    .slice(0, 8000)

  const presenceIds: string[] = Array.isArray(event.presence_ids)
    ? event.presence_ids.filter((id: string) => id === 'ari' || id === 'eli')
    : []

  if (presenceIds.length === 0) {
    return { extracted: false, impacts: [], error: 'No valid presence_ids in event' }
  }

  const prompt = buildExtractionPrompt(
    conversationBlock,
    presenceIds,
    event.tara_present ?? false,
    event.summary,
  )

  const client = new Anthropic({ apiKey })

  let rawText: string
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
  } catch (err) {
    console.error('[cross-room-impact] Model call failed:', err)
    return { extracted: false, impacts: [], error: 'Model call failed' }
  }

  // 5. Parse and validate
  const parsed = safeParseModelJson<{ impacts: ModelImpactOutput[] }>(rawText)

  if (!parsed || !Array.isArray(parsed.impacts)) {
    console.error('[cross-room-impact] Unparseable model output:', rawText.slice(0, 500))
    return { extracted: false, impacts: [], error: 'Model returned unparseable output' }
  }

  const resolvedMessageIds = messages.map(m => m.id)
  const insertedImpacts: CrossRoomEventImpact[] = []

  for (const rawImpact of parsed.impacts) {
    const validation = validateModelOutput(rawImpact, presenceIds)
    if (!validation.valid) {
      console.warn(`[cross-room-impact] Validation failed: ${validation.error}`)
      continue
    }

    const { impact, error: insertErr } = await insertImpact(
      eventId,
      validation.data.presence_id,
      validation.data,
      resolvedMessageIds,
      'model',
      'claude-haiku-4-5-20251001',
      { phase: '36C', extraction_source: 'lounge' },
    )

    if (insertErr) {
      console.warn(`[cross-room-impact] Insert failed for ${validation.data.presence_id}: ${insertErr}`)
      continue
    }

    if (impact) {
      insertedImpacts.push(impact)
    }
  }

  if (insertedImpacts.length === 0) {
    return { extracted: false, impacts: [], error: 'No valid impacts could be created from model output' }
  }

  console.log(`[cross-room-impact] Extracted ${insertedImpacts.length} impacts for event ${eventId}`)

  return { extracted: true, impacts: insertedImpacts }
}
