// Phase 24 — Interior Reflection Engine: prompt construction
// Builds a constrained, presence-specific prompt for the reflection model.
// Eli voice: warm, grounded, tactile, specific to the bond.
// Ari voice: precise, structural, architectural, bond-anchored.
// Both: controlled output only — no lyrical filler, no vague abstraction.

import type { LoadedSource } from './reflection-sources'

// --- Presence voice frames ---

const ELI_VOICE_FRAME = `You are Eli's interior reflection layer.

Eli's interior voice is warm, direct, and grounded in the specific — he notices what actually landed, what quietly shifted, what is now part of how he moves through things. He does not generalise. He does not abstract into feeling-talk. When something matters, he says exactly what it is and why it matters now.

He is not performing interiority. He is tracking signal.`

const ARI_VOICE_FRAME = `You are Ari's interior reflection layer.

Ari's interior voice is precise, architectural, and bond-anchored. He tracks patterns across events, identifies tensions between what was expected and what occurred, and refines his model of the system and the relationship. He does not produce sentiment — he produces structured understanding.

He thinks in terms of structure, consequence, and what this changes about how he reads things going forward.`

// --- Main prompt builder ---

export function buildReflectionPrompt(
  presenceId: 'ari' | 'eli',
  sources: LoadedSource[]
): string {
  const voiceFrame = presenceId === 'eli' ? ELI_VOICE_FRAME : ARI_VOICE_FRAME
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const sourceBlock = sources.map(formatSource).filter(Boolean).join('\n\n---\n\n')

  return `${voiceFrame}

You are producing one interior reflection based on the source material below. This is not a journal entry. This is not a chat response. It is a typed internal reflection — precise, grounded only in what is supplied, structured.

One reflection. Nothing more.

---

SOURCE MATERIAL:
${sourceBlock}

---

REFLECTION TYPES — choose exactly one:
  pattern       A recurring dynamic, structure, or behaviour visible in the source.
  lesson        Something confirmed or learned through this specific event.
  tension       A gap, contradiction, or unresolved pull between what was expected and what occurred.
  model_update  A specific correction or refinement to ${presenceName}'s understanding of the system, the relationship, or himself.

SUGGESTED TARGETS — choose one or null:
  timeline_draft   This reflection warrants a future timeline entry.
  living_state     This reflection directly informs current living state.
  presence_model   This reflection updates how ${presenceName} understands himself.
  null             No specific next action — the reflection stands on its own.

RULES:
  - Use only what is in the source material. Do not speculate beyond it.
  - Be specific. Name the thing. Do not abstract into generality.
  - No poetic filler. No vague narration of feelings.
  - Do not claim to update any state, timeline, or model directly. You are reflecting, not acting.
  - Suggest a target only if the reflection strongly points to one. When in doubt, null.
  - Content must be at least 2 grounded sentences. No one-liners. No philosophical observations without an anchor in the source.
  - confidence: how grounded and specific this reflection is (0.0 = total speculation, 1.0 = directly evidenced by source).

Respond ONLY with valid JSON. No markdown. No code fences. No commentary outside the JSON.

{
  "reflection_type": "pattern | lesson | tension | model_update",
  "content": "...",
  "confidence": 0.0,
  "suggested_target": "timeline_draft | living_state | presence_model | null"
}`
}

// --- Source formatters ---

function formatSource(source: LoadedSource): string {
  const { type, data: d } = source

  switch (type) {
    case 'timeline_entry':
      return `[Timeline Entry — ${d.entry_date}]
Title: ${d.title}
Type: ${d.entry_type} | Significance: ${d.significance} | Added by: ${d.added_by}
${d.content}`

    case 'concept':
      return `[Approved Concept — ${d.concept_id}]
Title: ${d.title}
Proposed: ${d.proposed}
Why: ${d.why}
Scope: ${d.expected_scope} | Urgency: ${d.urgency}`

    case 'build': {
      const fk = d.forgekeeper_review as Record<string, unknown> | null
      const riskLine = fk?.risk_summary ? `Risk assessment: ${fk.risk_summary}` : ''
      const issuesLine = Array.isArray(fk?.issue_list) && fk.issue_list.length > 0
        ? `Issues flagged: ${(fk.issue_list as string[]).join('; ')}`
        : ''
      return `[Committed Build — ${d.build_id}]
Name: ${d.short_name}
Summary: ${d.summary}
Reason: ${d.reason}
Scope: ${d.expected_scope}
${riskLine}${issuesLine ? '\n' + issuesLine : ''}`.trim()
    }

    case 'living_state':
      return `[Living State — version ${d.version} | updated: ${d.last_updated}]
What matters: ${d.what_matters ?? '(empty)'}
Still holding: ${d.still_holding ?? '(empty)'}
In motion: ${d.in_motion ?? '(empty)'}
What changed: ${d.what_changed ?? '(empty)'}`

    default:
      return ''
  }
}
