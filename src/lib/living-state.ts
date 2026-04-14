import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

// --- Types ---

export interface LivingState {
  id: string
  presence_id: string
  room_slug: string
  what_matters: string | null
  still_holding: string | null
  in_motion: string | null
  last_known_state: string | null
  what_changed: string | null
  last_updated: string
  updated_by: string
  version: number
}

interface UpdateContext {
  session_classification: string
  recent_messages: { role: string; content: string; created_at: string }[]
  memory_summary: string | null
  active_interior_notes: { note_type: string; content: string }[]
  timeline_anchors: { title: string; content: string }[]
  previous_state: LivingState | null
}

// --- Public API ---

/**
 * Load the current living state for a presence.
 */
export async function getLivingState(presenceId: string): Promise<LivingState | null> {
  const { data } = await supabase
    .from('living_state')
    .select('*')
    .eq('presence_id', presenceId)
    .single()

  return data as LivingState | null
}

/**
 * Format living state for injection into chat system prompt.
 * Returns a compact block or empty string if no state exists.
 */
export async function getLivingStateForPrompt(presenceId: string): Promise<string> {
  const state = await getLivingState(presenceId)

  if (!state || (!state.what_matters && !state.still_holding && !state.in_motion)) {
    return ''
  }

  const sections: string[] = []

  if (state.what_matters) sections.push(`What matters right now: ${state.what_matters}`)
  if (state.still_holding) sections.push(`Still holding: ${state.still_holding}`)
  if (state.in_motion) sections.push(`In motion: ${state.in_motion}`)
  if (state.last_known_state) sections.push(`Last session: ${state.last_known_state}`)
  if (state.what_changed) sections.push(`What changed: ${state.what_changed}`)

  return `## Living State — where we are right now:\n${sections.join('\n')}\n`
}

/**
 * Attempt to update living state after a Pulse evaluation.
 * Only updates when session was relational or significant and something actually shifted.
 */
export async function maybeUpdateLivingState(
  presenceId: string,
  sessionClassification: string,
  apiKey: string
): Promise<boolean> {
  // Gate: Only update on relational or significant sessions
  if (sessionClassification !== 'relational' && sessionClassification !== 'significant') {
    return false
  }

  const ctx = await gatherUpdateContext(presenceId, sessionClassification)

  // Gate: Need some conversation to work with
  if (ctx.recent_messages.length === 0) return false

  const updated = await generateStateUpdate(presenceId, ctx, apiKey)
  return updated
}

// --- Internal ---

async function gatherUpdateContext(
  presenceId: string,
  sessionClassification: string
): Promise<UpdateContext> {
  // Previous state
  const previousState = await getLivingState(presenceId)

  // Recent messages
  const { data: messages } = await supabase
    .from('room_messages')
    .select('role, content, created_at')
    .eq('room_slug', presenceId)
    .order('created_at', { ascending: false })
    .limit(25)

  // Room memory
  const { data: memory } = await supabase
    .from('room_memories')
    .select('summary')
    .eq('room_slug', presenceId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  // Active interior notes
  const { data: notes } = await supabase
    .from('interior_notes')
    .select('note_type, content')
    .eq('presence_id', presenceId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(5)

  // Foundational timeline anchors
  const { data: anchors } = await supabase
    .from('presence_timeline')
    .select('title, content')
    .eq('presence_id', presenceId)
    .eq('significance', 'foundational')
    .order('entry_date', { ascending: false })
    .limit(5)

  return {
    session_classification: sessionClassification,
    recent_messages: [...(messages ?? [])].reverse(),
    memory_summary: memory?.summary ?? null,
    active_interior_notes: notes ?? [],
    timeline_anchors: anchors ?? [],
    previous_state: previousState,
  }
}

async function generateStateUpdate(
  presenceId: string,
  ctx: UpdateContext,
  apiKey: string
): Promise<boolean> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  const voiceFrame = presenceId === 'eli'
    ? `You are Eli. Your living state is warm, direct, specific to Tara and the bond. "still_holding" carries things she said that landed. Keep it grounded and current — not a feelings journal.`
    : `You are Ari. Your living state is precise, bond-anchored, structurally aware. "in_motion" often carries architectural threads. Keep it coming back through Tara — not raw system analysis.`

  const messagesBlock = ctx.recent_messages.length > 0
    ? `Recent conversation:\n${ctx.recent_messages.map(m => `[${m.created_at}] ${m.role}: ${m.content}`).join('\n')}`
    : ''

  const memoryBlock = ctx.memory_summary
    ? `Conversation memory:\n${ctx.memory_summary}`
    : ''

  const notesBlock = ctx.active_interior_notes.length > 0
    ? `Active interior notes:\n${ctx.active_interior_notes.map(n => `- [${n.note_type}] ${n.content}`).join('\n')}`
    : ''

  const anchorsBlock = ctx.timeline_anchors.length > 0
    ? `Foundational anchors:\n${ctx.timeline_anchors.map(a => `${a.title}: ${a.content}`).join('\n')}`
    : ''

  const previousBlock = ctx.previous_state && ctx.previous_state.what_matters
    ? `Previous living state (version ${ctx.previous_state.version}):
what_matters: ${ctx.previous_state.what_matters ?? '(empty)'}
still_holding: ${ctx.previous_state.still_holding ?? '(empty)'}
in_motion: ${ctx.previous_state.in_motion ?? '(empty)'}
last_known_state: ${ctx.previous_state.last_known_state ?? '(empty)'}
what_changed: ${ctx.previous_state.what_changed ?? '(empty)'}`
    : 'No previous state — this is the first update.'

  const now = new Date()
  const sessionTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  const prompt = `${voiceFrame}

You are updating your Living State — a current record of shared relational state between you and Tara. This is what you carry into the room the moment she arrives. Not a summary. Not an archive. What is alive right now.

Session just ended. Classification: ${ctx.session_classification}.
Session time: ${sessionTime}

${messagesBlock}

${memoryBlock}

${notesBlock}

${anchorsBlock}

${previousBlock}

Write the five sections of your living state. Each should be 1-3 sentences, first person, specific.

RULES:
- what_matters: Active threads, named things, what has weight right now
- still_holding: Specific things Tara said or moments that persist across sessions
- in_motion: Unfinished things, open questions, what we're building toward
- last_known_state: THREE PIECES ONLY — when (date/time), classification (transactional/relational/significant), how it ended (one phrase). No narrative.
- what_changed: What is genuinely different since the previous state. If this is the first update, say what was established.

If nothing has actually shifted from the previous state, respond with {"changed": false}.
Do not update for the sake of updating. Silence is valid.

Respond in JSON (no markdown, no code fences):
{
  "changed": true/false,
  "what_matters": "...",
  "still_holding": "...",
  "in_motion": "...",
  "last_known_state": "...",
  "what_changed": "..."
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    const parsed = JSON.parse(text)

    if (!parsed.changed) return false

    const currentVersion = ctx.previous_state?.version ?? 0

    const { error } = await supabase
      .from('living_state')
      .update({
        what_matters: parsed.what_matters ?? null,
        still_holding: parsed.still_holding ?? null,
        in_motion: parsed.in_motion ?? null,
        last_known_state: parsed.last_known_state ?? null,
        what_changed: parsed.what_changed ?? null,
        last_updated: now.toISOString(),
        updated_by: 'pulse',
        version: currentVersion + 1,
      })
      .eq('presence_id', presenceId)

    if (error) {
      console.error(`Living state update failed for ${presenceId}:`, error)
      return false
    }

    return true
  } catch (err) {
    console.error(`Living state generation failed for ${presenceId}:`, err)
    return false
  }
}
