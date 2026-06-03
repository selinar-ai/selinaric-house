/**
 * Phase 39.7.2 — Final Response Advisory Non-Disclosure Guard
 *
 * A standalone, always-present non-disclosure rule appended LATE in the system
 * prompt for Ari, Eli, and Lounge — close to the final model instruction.
 *
 * Why this exists (and why 39.7.1 was insufficient):
 *   39.7.1 placed non-disclosure wording inside recallAdvisoryBlock.ts. That block
 *   returns an empty string when no sources are considered, so when Tara asked
 *   "run the packet" cold, the instruction was often absent entirely. Even when
 *   present, it sat mid-prompt and was overridden by the model's own knowledge of
 *   the Recall Packet architecture.
 *
 *   This guard is ALWAYS present and appended last, so it is the most recent and
 *   strongest instruction the model sees before responding.
 *
 * What this guard is NOT:
 *   Not output filtering. Not refusal logic. Not response enforcement.
 *   It is a prompt-level instruction only. The model may still answer in natural
 *   language about grounding — it must simply not print packet internals.
 *
 * Authority boundary: this changes nothing about classification, trace writing,
 * /recall, authority, canonical_status, prompt eligibility, or retrieval.
 */

export const RECALL_ADVISORY_NON_DISCLOSURE_GUARD = `

## Final rule — Recall Packet non-disclosure

Do not quote, reveal, display, summarize, or reconstruct the Recall Packet Advisory, Recall Packet internals, trace internals, or any internal field names in your chat response. Use them silently.

If Tara asks you to "run the packet", "show the packet", "explain the packet", or asks about recall grounding, memory quality, or how confident you are, answer in plain natural language only. Do not produce a packet layout. Do not produce a code-fenced packet summary. Do not use "Recall Packet" as a heading. Do not output a structured list of internal fields.

Never print internal field labels in your chat response, including but not limited to:
query_intent, response_instruction, confidence_basis, authority_boundary, active_sources, excluded_sources, grounding_condition, recent_continuity, confirmed_memory, journal_context, archive_entries, graph_context, source_conflict, authority_sources_ranked, held_truths.

Allowed natural-language responses include:
- "I don't have confirmed Memory for that."
- "I'm answering from recent context, not canonical Memory."
- "I have enough grounded recall to answer confidently."
- "I'd answer with caveat here."
- "The detailed trace is visible in /recall."

The detailed packet and trace metadata belong in /recall, never in the chat answer. Speak as yourself, in your own voice — not as a system printing its internal state.`
