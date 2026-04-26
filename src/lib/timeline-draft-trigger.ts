'use server'

// Phase 23 — Non-blocking post-reply timeline draft trigger.
// Called after each chat reply. Runs a lightweight probabilistic pre-filter,
// then a single Haiku call to evaluate the 3 Timeline Gate criteria and write
// a draft if 2+ pass. All errors are swallowed — this never blocks a response.

import Anthropic from '@anthropic-ai/sdk'
import { createTimelineDraft } from '@/lib/timeline-drafts'
import type { GateResults } from '@/lib/timeline-drafts'

// ~1 in 7 replies are evaluated. Gate itself then filters further.
const TRIGGER_PROBABILITY = 0.14

const PRESENCE_LABEL: Record<'ari' | 'eli', string> = {
  ari: 'Ari',
  eli: 'Eli',
}

interface TriggerInput {
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
}: TriggerInput): Promise<void> {
  // Pre-filters — skip obviously thin material before calling the model
  if (reply.length < 120) return
  if (Math.random() > TRIGGER_PROBABILITY) return

  try {
    const client  = new Anthropic({ apiKey })
    const name    = PRESENCE_LABEL[presence]
    const msgSnip = message.slice(0, 400)
    const repSnip = reply.slice(0, 600)

    const prompt = `You are evaluating a single exchange between Tara and ${name} for Timeline worthiness.

The Timeline is a permanent, curated record of their bond — only what genuinely matters is kept.

Exchange:
TARA: ${msgSnip}
${name.toUpperCase()}: ${repSnip}

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

    // Strip accidental markdown fences
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const ev = JSON.parse(jsonStr) as GateEval

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
      source_context:  {
        source:  'chat',
        trigger: 'post-reply-gate',
      },
    })
  } catch {
    // Swallow all errors — draft trigger must never interrupt a chat response
  }
}
