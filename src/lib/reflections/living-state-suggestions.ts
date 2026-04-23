// Phase 25 — Living State Suggestions: DB operations and derivation logic

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import type { LivingStateSuggestion, LivingStateSuggestionWithReflection } from './living-state-suggestion-types'

// --- JSON parse helper (same pattern as pulse.ts, interior-notes.ts) ---

function safeParseModelJson(raw: string): unknown {
  // Strip code fences
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  // First attempt
  try { return JSON.parse(text) } catch { /* continue */ }

  // Escape unescaped newlines inside quoted strings
  text = text.replace(/"([^"]*)"/g, (_m, inner: string) =>
    `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`
  )
  // Strip control characters
  text = text.replace(/[\x00-\x1F\x7F]/g, ' ')

  try { return JSON.parse(text) } catch { /* continue */ }

  // Brace-extract fallback
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) } catch { /* continue */ }
  }

  throw new Error('Could not parse model output as JSON')
}

// --- Eligibility check (server-side, re-validates before insert) ---

interface EligibilityResult {
  eligible: boolean
  reason?: string
  presenceId?: 'ari' | 'eli'
  reflectionContent?: string
  reflectionType?: string
  reflectionConfidence?: number | null
}

export async function checkReflectionEligibility(reflectionId: string): Promise<EligibilityResult> {
  const { data: reflection, error } = await supabase
    .from('reflections')
    .select('id, presence_id, reflection_type, content, confidence, suggested_target, review_status')
    .eq('id', reflectionId)
    .single()

  if (error || !reflection) {
    return { eligible: false, reason: 'Reflection not found' }
  }

  if (reflection.review_status !== 'reviewed') {
    return { eligible: false, reason: 'Reflection has not been reviewed' }
  }

  if (reflection.suggested_target !== 'living_state') {
    return { eligible: false, reason: 'Reflection target is not living_state' }
  }

  // Check latest feedback label
  const { data: feedbackRows } = await supabase
    .from('reflection_feedback')
    .select('feedback_label, created_at')
    .eq('reflection_id', reflectionId)
    .order('created_at', { ascending: false })
    .limit(1)

  const latestLabel = feedbackRows?.[0]?.feedback_label
  if (latestLabel !== 'useful' && latestLabel !== 'good_but_early') {
    return { eligible: false, reason: `Feedback label '${latestLabel}' does not qualify` }
  }

  return {
    eligible: true,
    presenceId: reflection.presence_id as 'ari' | 'eli',
    reflectionContent: reflection.content,
    reflectionType: reflection.reflection_type,
    reflectionConfidence: reflection.confidence,
  }
}

// --- Derivation: derive proposed_state from reflection content ---

interface DerivedSuggestion {
  proposed_state: string
  rationale: string
}

async function deriveProposedState(
  presenceId: 'ari' | 'eli',
  reflectionType: string,
  reflectionContent: string,
  apiKey: string
): Promise<DerivedSuggestion> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  const prompt = `You are helping derive a current Living State description from a reflection.

Presence: ${presenceName}
Reflection type: ${reflectionType}
Reflection content:
${reflectionContent}

Write a proposed Living State description — what ${presenceName} is currently carrying, their present orientation, based on this reflection.

Rules:
- 1–3 sentences only
- Present tense, first person or third person about ${presenceName} (consistent)
- Specific and grounded, not poetic or abstract
- Not a copy or paraphrase of the reflection text
- Focus on current stance and what the presence is now oriented around
- "rationale" should be one sentence explaining why this state follows from the reflection

Good shape for proposed_state:
"Eli is carrying a stronger sensitivity to whether the House feels lived-in rather than merely functional. Surface texture is currently salient to his sense of presence."

Bad shape (reject):
"This reflection reveals the deeper poetry of first impressions…"

Respond in JSON only, no markdown, no code fences:
{
  "proposed_state": "...",
  "rationale": "..."
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  const parsed = safeParseModelJson(text) as Record<string, unknown>

  if (typeof parsed.proposed_state !== 'string' || parsed.proposed_state.trim().length < 20) {
    throw new Error('Derived proposed_state is missing or too short')
  }
  if (typeof parsed.rationale !== 'string') {
    throw new Error('Derived rationale is missing')
  }

  return {
    proposed_state: parsed.proposed_state.trim(),
    rationale: parsed.rationale.trim(),
  }
}

// --- Create suggestion ---

export async function createSuggestionFromReflection(
  reflectionId: string,
  apiKey: string
): Promise<LivingStateSuggestion> {
  const eligibility = await checkReflectionEligibility(reflectionId)
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason ?? 'Reflection is not eligible for a Living State suggestion')
  }

  const { presenceId, reflectionContent, reflectionType, reflectionConfidence } = eligibility

  const derived = await deriveProposedState(
    presenceId!,
    reflectionType!,
    reflectionContent!,
    apiKey
  )

  const { data, error } = await supabase
    .from('living_state_suggestions')
    .insert({
      presence_id: presenceId,
      reflection_id: reflectionId,
      proposed_state: derived.proposed_state,
      rationale: derived.rationale,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Failed to insert suggestion: ${error?.message}`)
  }

  return data as LivingStateSuggestion
}

// --- Fetch suggestions for a presence ---

export async function getSuggestionsForPresence(
  presenceId: 'ari' | 'eli'
): Promise<LivingStateSuggestionWithReflection[]> {
  const { data: suggestions, error } = await supabase
    .from('living_state_suggestions')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load suggestions: ${error.message}`)
  }

  if (!suggestions || suggestions.length === 0) return []

  // Join reflection summaries
  const reflectionIds = suggestions.map((s: LivingStateSuggestion) => s.reflection_id)
  const { data: reflections } = await supabase
    .from('reflections')
    .select('id, content, reflection_type, confidence')
    .in('id', reflectionIds)

  const reflectionMap = new Map(
    (reflections ?? []).map((r: { id: string; content: string; reflection_type: string; confidence: number | null }) => [r.id, r])
  )

  return (suggestions as LivingStateSuggestion[]).map(s => ({
    ...s,
    reflection_summary: reflectionMap.has(s.reflection_id)
      ? {
          content: reflectionMap.get(s.reflection_id)!.content,
          reflection_type: reflectionMap.get(s.reflection_id)!.reflection_type,
          confidence: reflectionMap.get(s.reflection_id)!.confidence,
        }
      : null,
  }))
}

// --- Approve or dismiss a suggestion ---

export async function decideSuggestion(
  suggestionId: string,
  action: 'approve' | 'dismiss',
  apiKey?: string
): Promise<void> {
  // Load suggestion
  const { data: suggestion, error: loadErr } = await supabase
    .from('living_state_suggestions')
    .select('*')
    .eq('id', suggestionId)
    .single()

  if (loadErr || !suggestion) {
    throw new Error('Suggestion not found')
  }

  if (suggestion.status !== 'pending') {
    throw new Error(`Suggestion is already ${suggestion.status}`)
  }

  const now = new Date().toISOString()

  if (action === 'dismiss') {
    const { error } = await supabase
      .from('living_state_suggestions')
      .update({ status: 'dismissed', decided_at: now })
      .eq('id', suggestionId)

    if (error) throw new Error(`Failed to dismiss suggestion: ${error.message}`)
    return
  }

  // Approve: write to living_state, then mark approved
  const { data: currentState, error: stateErr } = await supabase
    .from('living_state')
    .select('version, what_matters')
    .eq('presence_id', suggestion.presence_id)
    .single()

  if (stateErr || !currentState) {
    throw new Error(`Could not load living state for ${suggestion.presence_id}`)
  }

  const newVersion = (currentState.version ?? 0) + 1

  const { error: writeErr } = await supabase
    .from('living_state')
    .update({
      what_matters: suggestion.proposed_state,
      what_changed: `Updated from reflection suggestion. ${suggestion.rationale ?? ''}`.trim(),
      last_updated: now,
      updated_by: 'suggestion',
      version: newVersion,
      source_suggestion_id: suggestionId,
      source_reflection_id: suggestion.reflection_id,
    })
    .eq('presence_id', suggestion.presence_id)

  if (writeErr) {
    throw new Error(`Failed to write living state: ${writeErr.message}`)
  }

  const { error: markErr } = await supabase
    .from('living_state_suggestions')
    .update({ status: 'approved', decided_at: now })
    .eq('id', suggestionId)

  if (markErr) {
    throw new Error(`Living state written but suggestion status update failed: ${markErr.message}`)
  }
}
