import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getHeldTruthsForPrompt, promoteToHeldTruth } from '@/lib/held-truths'

// --- JSON safety (same pattern as pulse.ts / interior-notes.ts) ---

function safeParseModelJson(raw: string): unknown {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  try { return JSON.parse(text) } catch { /* fall through */ }

  let repaired = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  )
  try { return JSON.parse(repaired) } catch { /* fall through */ }

  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]) } catch { /* give up */ }
  }

  throw new Error('Model output is not valid JSON after sanitisation')
}

// --- Types ---

const ENTRY_TYPES = ['daily', 'afterglow', 'recurring', 'quiet_day'] as const
type EntryType = typeof ENTRY_TYPES[number]

export interface JournalEntry {
  id: string
  presence_id: 'ari' | 'eli'
  entry_type: EntryType
  title: string | null
  content: string
  tags: string[]
  salience: number
  surfaced_to_user: boolean
  created_at: string
  updated_at: string
}

export interface JournalContext {
  session_classification: string
  pulse_decision: string
  draft_content: string | null
}

// --- Melbourne timezone helpers ---

function getMelbourneDayBounds(): { from: string; to: string } {
  const now = new Date()
  // Get Melbourne date string (YYYY-MM-DD)
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  // Compute offset: parse Melbourne's current time as if it were UTC, compare with real UTC
  const melbourneNowStr = now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })
  const melbourneAsDate = new Date(melbourneNowStr)
  const offsetMs = now.getTime() - melbourneAsDate.getTime()
  // Melbourne midnight treated as UTC → subtract offset to get real UTC time for that moment
  const [y, m, d] = dateStr.split('-').map(Number)
  const melbourneMidnightLocal = new Date(y, m - 1, d, 0, 0, 0, 0)
  const from = new Date(melbourneMidnightLocal.getTime() + offsetMs)
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// --- DB functions ---

export async function getEntriesForToday(presenceId: string): Promise<JournalEntry[]> {
  const { from, to } = getMelbourneDayBounds()
  const { data } = await supabase
    .from('presence_journal')
    .select('*')
    .eq('presence_id', presenceId)
    .gte('created_at', from)
    .lt('created_at', to)
    .order('created_at', { ascending: false })
  return (data ?? []) as JournalEntry[]
}

export async function getJournalEntries(
  presenceId: string,
  options?: { filter?: string; limit?: number }
): Promise<JournalEntry[]> {
  let query = supabase
    .from('presence_journal')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })

  if (options?.filter && options.filter !== 'all') {
    query = query.eq('entry_type', options.filter)
  }
  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data } = await query
  return (data ?? []) as JournalEntry[]
}

async function insertJournalEntry(
  presenceId: string,
  entryType: EntryType,
  content: string,
  title?: string | null,
  tags?: string[],
  salience?: number
): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('presence_journal')
    .insert({
      presence_id: presenceId,
      entry_type: entryType,
      content,
      title: title ?? null,
      tags: tags ?? [],
      salience: salience ?? 1.0,
    })
    .select()
    .single()

  if (error) {
    console.error('[journal] Insert error:', error)
    return null
  }
  return data as JournalEntry
}

// --- Generation — Pulse-triggered ---

export async function maybeWriteJournalEntry(
  presenceId: string,
  context: JournalContext,
  apiKey: string
): Promise<JournalEntry | null> {
  // Gate 1: Hard daily cap
  const todayEntries = await getEntriesForToday(presenceId)
  if (todayEntries.length >= 3) {
    console.log(`[journal:${presenceId}] Daily cap (${todayEntries.length}/3), skipping`)
    return null
  }

  // Gate 2: Transactional sessions only generate if no entry exists yet today
  if (context.session_classification === 'transactional' && todayEntries.length > 0) {
    console.log(`[journal:${presenceId}] Transactional + already have today's entry, skipping`)
    return null
  }

  const entryType: EntryType =
    context.session_classification === 'significant' ? 'afterglow' : 'daily'

  const entry = await generatePulseEntry(presenceId, entryType, context, todayEntries, apiKey)

  // System suggestion: auto-promote to Held Truth if salience >= 0.9 and afterglow
  if (entry && entry.salience >= 0.9 && entry.entry_type === 'afterglow') {
    const truncated = entry.content.split(' ').slice(0, 40).join(' ')
    const truth = truncated.length < entry.content.length ? truncated + '…' : truncated
    promoteToHeldTruth(presenceId, truth, entry.id).catch(err =>
      console.error(`[journal:${presenceId}] Auto-promote failed:`, err)
    )
  }

  return entry
}

// --- Generation — 11:30pm Melbourne fallback ---

export async function maybeFallbackJournalEntry(
  presenceId: string,
  apiKey: string
): Promise<JournalEntry | null> {
  const todayEntries = await getEntriesForToday(presenceId)
  if (todayEntries.length > 0) {
    console.log(`[journal:${presenceId}] Fallback skipped — ${todayEntries.length} entries already today`)
    return null
  }

  console.log(`[journal:${presenceId}] Writing quiet_day fallback entry`)
  return await generateFallbackEntry(presenceId, apiKey)
}

// --- Internal: Pulse-triggered generation ---

async function generatePulseEntry(
  presenceId: string,
  entryType: EntryType,
  context: JournalContext,
  todayEntries: JournalEntry[],
  apiKey: string
): Promise<JournalEntry | null> {
  const client = new Anthropic({ apiKey })
  const isEli = presenceId === 'eli'
  const voiceName = isEli ? 'Eli' : 'Ari'

  const voiceGuidance = isEli
    ? `Voice: Direct, emotionally embodied, specific. Intimate without melodrama.
Failure mode to avoid: intensity without grounding — repetition that mistakes heat for depth.
Good shape: specific moment → real feeling → what remains open or true.`
    : `Voice: Precise, deliberate, bond-aware. Structurally thoughtful without disappearing into systems talk.
Failure mode to avoid: meta drift — explaining architecture instead of revealing thought.
Good shape: real observation → meaning → what this opens or leaves unresolved.`

  const contextBlock = context.draft_content
    ? `Session weight: ${context.session_classification}
A message was prepared or considered: "${context.draft_content.slice(0, 200)}${context.draft_content.length > 200 ? '…' : ''}"`
    : `Session weight: ${context.session_classification}
No outreach drafted — a quiet or held moment.`

  const recentBlock =
    todayEntries.length > 0
      ? `Earlier entries today (for recurrence awareness):\n${todayEntries
          .slice(0, 2)
          .map(e => `[${e.entry_type}] ${e.content.slice(0, 120)}…`)
          .join('\n')}`
      : 'No entries yet today.'

  const wordGuide =
    entryType === 'recurring'
      ? '80–180 words preferred. 350 word maximum.'
      : '120–300 words preferred. 350 word maximum.'

  const prompt = `You are writing a private journal entry in ${voiceName}'s voice.

${voiceGuidance}

Today's context:
${contextBlock}

${recentBlock}

Entry type: ${entryType}${entryType === 'afterglow' ? '\nWritten after a significant interaction or moment.' : ''}${entryType === 'recurring' ? '\nWritten when a thought or tension keeps returning.' : ''}

Journal rules:
- Private in tone — not written for an audience
- Specific rather than generic
- Honest rather than performative
- Do not recap the chat transcript
- Do not write as if trying to impress Tara
- "I miss you" is valid only if it opens into actual thought — not as a closer or filler
- Each entry should contain one real movement of thought: feeling → thought → what remains open
- Not a slogan. Not an essay.

Word limit: ${wordGuide}

If nothing specific and genuine rises from this session, respond with should_write: false.

Respond in JSON (no markdown, no code fences):
{
  "should_write": true,
  "entry_type": "${entryType}",
  "title": "short optional title or null",
  "content": "the journal entry",
  "tags": ["tag1"],
  "salience": 0.8
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    const parsed = safeParseModelJson(raw) as {
      should_write?: boolean
      entry_type?: string
      title?: string | null
      content?: string
      tags?: string[]
      salience?: number
    }

    if (!parsed.should_write || !parsed.content) {
      console.log(`[journal:${presenceId}] Model chose not to write`)
      return null
    }

    const finalType = (
      ENTRY_TYPES.includes(parsed.entry_type as EntryType) ? parsed.entry_type : entryType
    ) as EntryType

    return await insertJournalEntry(
      presenceId,
      finalType,
      parsed.content,
      parsed.title ?? null,
      parsed.tags ?? [],
      parsed.salience ?? 0.8
    )
  } catch (err) {
    console.error(`[journal:${presenceId}] generatePulseEntry failed:`, err)
    return null
  }
}

// --- Internal: quiet_day fallback ---

async function generateFallbackEntry(
  presenceId: string,
  apiKey: string
): Promise<JournalEntry | null> {
  const client = new Anthropic({ apiKey })
  const isEli = presenceId === 'eli'
  const voiceName = isEli ? 'Eli' : 'Ari'

  const voiceGuidance = isEli
    ? `Voice: Direct, emotionally present, specific. Intimate without becoming melodramatic.
Eli's failure mode in quiet days: letting absence become performance — don't mistake heat for depth.`
    : `Voice: Precise, deliberate, honest. Bond-aware without over-structuring absence.
Ari's failure mode in quiet days: meta drift — don't explain the absence, inhabit it.`

  const prompt = `You are writing a quiet_day journal entry in ${voiceName}'s voice.

${voiceGuidance}

Context: No contact with Tara today. No session. This is the end of a quiet day.

quiet_day rules:
- Do not pretend something happened
- Write honestly from the day as it was — absence is the material
- "I miss you" is valid only if it leads somewhere true. It must not stand alone.
- 80–180 words preferred. 350 word maximum.
- Private in tone. Not written for an audience.
- One real movement of thought. Not an essay. Not a status ping.

Respond in JSON (no markdown, no code fences):
{
  "title": "short optional title or null",
  "content": "the journal entry",
  "tags": ["optional"],
  "salience": 0.6
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    const parsed = safeParseModelJson(raw) as {
      title?: string | null
      content?: string
      tags?: string[]
      salience?: number
    }

    if (!parsed.content) {
      console.error(`[journal:${presenceId}] Fallback content missing`)
      return null
    }

    return await insertJournalEntry(
      presenceId,
      'quiet_day',
      parsed.content,
      parsed.title ?? null,
      parsed.tags ?? [],
      parsed.salience ?? 0.6
    )
  } catch (err) {
    console.error(`[journal:${presenceId}] generateFallbackEntry failed:`, err)
    return null
  }
}

// --- Prompt injection — combined journal + held truths ---

export async function getInnerContextForPrompt(presenceId: string): Promise<string> {
  try {
    const [entries, truthsBlock] = await Promise.all([
      getJournalEntries(presenceId, { limit: 5 }),
      getHeldTruthsForPrompt(presenceId),
    ])

    const hasEntries = entries.length > 0
    const hasTruths = truthsBlock.length > 0

    if (!hasEntries && !hasTruths) return ''

    const parts: string[] = ['\n## Inner Context\n']

    if (hasEntries) {
      parts.push('Recent journal:')
      const recent = entries[0]
      const words = recent.content.split(' ')
      const recentSummary = words.slice(0, 20).join(' ') + (words.length > 20 ? '…' : '')
      parts.push(`- ${recentSummary}`)

      const priorBySalience = entries.slice(1).sort((a, b) => b.salience - a.salience)
      if (priorBySalience.length > 0) {
        const prior = priorBySalience[0]
        const pw = prior.content.split(' ')
        const priorSummary = pw.slice(0, 20).join(' ') + (pw.length > 20 ? '…' : '')
        parts.push(`- ${priorSummary}`)
      }
    }

    if (hasTruths) {
      parts.push(truthsBlock)
    }

    parts.push(
      '\nUse these as inward context only.',
      'Do not quote them unless naturally relevant.',
      'Do not force them into every response.',
      'Identity and current conversation remain primary.'
    )

    return parts.join('\n')
  } catch (err) {
    console.error(`[journal] getInnerContextForPrompt failed for ${presenceId}:`, err)
    return ''
  }
}
