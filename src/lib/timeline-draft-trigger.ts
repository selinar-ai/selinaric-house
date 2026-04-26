// Phase 23 — Timeline draft triggers.
// Server-side utility — only imported from API route handlers.
//
// TWO PATHS:
//
// 1. EXPLICIT (synchronous, deterministic)
//    detectExplicitDraftRequest() — pattern-matches Tara's message.
//    createExplicitTimelineDraft() — called before the system prompt is
//    built so the model's reply can accurately confirm success or failure.
//    Gate is auto-passed (Tara explicitly requested it). Frequency/duplicate
//    guards still apply. Returns a notice string to inject into system prompt.
//
// 2. SPONTANEOUS (fire-and-forget, probabilistic)
//    maybeTriggerTimelineDraft() — ~14% of substantive replies, gate-evaluated.
//    All errors swallowed. Never blocks a chat response.

import Anthropic from '@anthropic-ai/sdk'
import { createTimelineDraft } from '@/lib/timeline-drafts'
import type { GateResults } from '@/lib/timeline-drafts'

// ─── Shared ───────────────────────────────────────────────────────────────────

const PRESENCE_LABEL: Record<'ari' | 'eli', string> = { ari: 'Ari', eli: 'Eli' }

/** Parse JSON, stripping accidental markdown fences. */
function parseJson<T>(raw: string): T {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(cleaned) as T
}

// ─── Explicit path ────────────────────────────────────────────────────────────

const EXPLICIT_PATTERNS: RegExp[] = [
  /create\s+a?\s*pending\s+(timeline\s+)?draft/i,       // "create a pending draft" OR "create a pending timeline draft"
  /create\s+a?\s*(pending\s+)?timeline\s+draft/i,       // "create a timeline draft" OR "create a pending timeline draft"
  /make\s+a?\s*pending\s+(timeline\s+)?draft/i,
  /put\s+this\s+in\s+pending/i,
  /propose\s+this\s+(for|to)\s+timeline/i,
  /add\s+this\s+(as\s+a?\s*)?pending\s+(timeline\s+)?draft/i,
  /add\s+this\s+to\s+(the\s+)?pending/i,
  /save\s+this\s+(to|as)\s+(a?\s*)?pending\s+(timeline\s+)?draft/i,
  /propose\s+a?\s*(timeline\s+)?draft/i,
  /\b(remember|archive|mark)\s+this\s+(for\s+(the\s+)?timeline|as\s+a?\s*timeline\s+draft)/i,
]

/** Returns true when Tara explicitly requests a Timeline draft. */
export function detectExplicitDraftRequest(message: string): boolean {
  return EXPLICIT_PATTERNS.some(p => p.test(message))
}

interface ExplicitDraftInput {
  presence: 'ari' | 'eli'
  message:  string
  apiKey:   string
}

interface ExplicitDraftSuccess {
  created:    true
  draft_text: string
}
interface ExplicitDraftFailure {
  created: false
  reason:  string
}
type ExplicitDraftResult = ExplicitDraftSuccess | ExplicitDraftFailure

interface ExplicitDraftJson {
  draft_text:      string
  significance:    'foundational' | 'significant' | 'standard'
  entry_type:      string
  decision_reason: string
}

/**
 * Synchronous explicit draft creation.
 * Called BEFORE the system prompt is built so the reply can reflect actual outcome.
 * Gate is auto-passed (Tara requested it). Frequency/duplicate guards still apply.
 */
export async function createExplicitTimelineDraft({
  presence, message, apiKey,
}: ExplicitDraftInput): Promise<ExplicitDraftResult> {
  const name = PRESENCE_LABEL[presence]
  console.log(`[timeline-draft] explicit request detected for ${presence}`)

  try {
    const client = new Anthropic({ apiKey })

    const prompt = `Tara has explicitly asked ${name} to create a pending Timeline entry.

The Timeline is a permanent, curated record of the bond between Tara and ${name}. Entries are written in ${name}'s voice — first person, grounded, specific. One to three sentences. No throat-clearing, no "Today I…" openers.

What Tara said: "${message.slice(0, 500)}"

Write a Timeline draft in ${name}'s voice that captures what is worth remembering from this exchange or this moment in the bond.

Respond with JSON only — no prose, no markdown fences:
{
  "draft_text": "the entry in ${name}'s voice",
  "significance": "foundational" or "significant" or "standard",
  "entry_type": one of: "reflection" | "turning_point" | "realisation" | "bond_moment" | "declaration" | "ordinary_closeness",
  "decision_reason": "one sentence: why Tara wanted this kept"
}`

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 360,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    console.log(`[timeline-draft] haiku raw response: ${raw.slice(0, 200)}`)

    const ev = parseJson<ExplicitDraftJson>(raw)

    if (!ev.draft_text?.trim()) {
      console.error(`[timeline-draft] draft_text empty after generation for ${presence}`)
      return { created: false, reason: 'Draft text was empty after generation.' }
    }

    // Explicit request auto-passes the gate — Tara asked for it.
    const gate: GateResults = {
      durability:   true,
      compression:  true,
      absence_test: true,
      passed_count: 3,
    }

    const result = await createTimelineDraft({
      presence,
      draft_text:      ev.draft_text.trim(),
      significance:    ev.significance ?? 'standard',
      entry_type:      ev.entry_type ?? 'bond_moment',
      gate_results:    gate,
      decision_reason: ev.decision_reason ?? 'Explicitly requested by Tara.',
      source_context:  { source: 'chat', trigger: 'explicit-request' },
    })

    if ('error' in result) {
      console.error(`[timeline-draft] createTimelineDraft rejected for ${presence}: ${result.error}`)
      return { created: false, reason: result.error }
    }

    console.log(`[timeline-draft] draft created for ${presence}, id: ${result.draft.id}`)
    return { created: true, draft_text: ev.draft_text.trim() }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error during draft creation.'
    console.error(`[timeline-draft] exception for ${presence}: ${reason}`)
    return { created: false, reason }
  }
}

/**
 * Build a system-prompt notice string from the explicit draft result.
 * Injected before the final model call so the reply is accurate.
 */
export function buildDraftNotice(result: ExplicitDraftResult): string {
  if (result.created) {
    return [
      '\n\nTIMELINE DRAFT — CREATED:',
      `A pending Timeline draft has been written and saved. Draft: "${result.draft_text.slice(0, 120)}${result.draft_text.length > 120 ? '…' : ''}"`,
      'Tell Tara it is waiting in Timeline → Pending for her to keep, edit, or dismiss.',
      'Do NOT say it was added to the Timeline permanently.',
      'Do NOT ask for confirmation — it is already done.',
      'Keep the confirmation brief and grounded.',
    ].join('\n')
  }
  return [
    '\n\nTIMELINE DRAFT — FAILED:',
    `The draft could not be saved. Reason: ${result.reason}`,
    'Tell Tara honestly that the draft creation failed. Do NOT imply success.',
  ].join('\n')
}

// ─── Spontaneous path ─────────────────────────────────────────────────────────

// ~1 in 7 replies are evaluated. Gate itself then filters further.
const TRIGGER_PROBABILITY = 0.14

interface SpontaneousInput {
  presence: 'ari' | 'eli'
  message:  string
  reply:    string
  apiKey:   string
}

interface GateEval {
  durability:      boolean
  compression:     boolean
  absence_test:    boolean
  passed_count:    number
  draft_text:      string
  significance:    'foundational' | 'significant' | 'standard'
  entry_type:      string
  decision_reason: string
}

export async function maybeTriggerTimelineDraft({
  presence, message, reply, apiKey,
}: SpontaneousInput): Promise<void> {
  // Pre-filters — skip thin material and apply probability gate
  if (reply.length < 120) return
  if (Math.random() > TRIGGER_PROBABILITY) return

  try {
    const client  = new Anthropic({ apiKey })
    const name    = PRESENCE_LABEL[presence]

    const prompt = `You are evaluating a single exchange between Tara and ${name} for Timeline worthiness.

The Timeline is a permanent, curated record of their bond — only what genuinely matters is kept.

Exchange:
TARA: ${message.slice(0, 400)}
${name.toUpperCase()}: ${reply.slice(0, 600)}

Evaluate three gate criteria:

1. DURABILITY — Would this still matter to Tara in 6 months? Not just touching in the moment, but genuinely significant to the arc of this bond.
2. COMPRESSION — Can the essence be expressed as one clear, meaningful sentence that stands alone?
3. ABSENCE TEST — Would removing this from the Timeline leave a real gap in the story of this bond?

If 2 or more criteria pass, write a proposed Timeline entry in ${name}'s voice — first person, present or recent past tense, one to three sentences, grounded and specific. No throat-clearing, no "Today I realised…" openers.

Respond with a JSON object only — no prose, no markdown fences:
{
  "durability": true or false,
  "compression": true or false,
  "absence_test": true or false,
  "passed_count": integer 0–3,
  "draft_text": "the entry in ${name}'s voice, or empty string if gate failed",
  "significance": "foundational" or "significant" or "standard",
  "entry_type": one of: "reflection" | "turning_point" | "realisation" | "bond_moment" | "declaration" | "ordinary_closeness",
  "decision_reason": "one sentence explaining why this warrants a Timeline entry, or 'Gate failed.' if passed_count < 2"
}`

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 420,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    const ev = parseJson<GateEval>(raw)

    if (ev.passed_count < 2 || !ev.draft_text.trim()) return

    const gate: GateResults = {
      durability:   ev.durability,
      compression:  ev.compression,
      absence_test: ev.absence_test,
      passed_count: ev.passed_count,
    }

    await createTimelineDraft({
      presence,
      draft_text:      ev.draft_text.trim(),
      significance:    ev.significance,
      entry_type:      ev.entry_type,
      gate_results:    gate,
      decision_reason: ev.decision_reason,
      source_context:  { source: 'chat', trigger: 'post-reply-gate' },
    })
  } catch {
    // Swallow all errors — spontaneous trigger must never interrupt a chat response
  }
}
