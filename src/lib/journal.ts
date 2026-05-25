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
  authored_by: string | null        // ari | eli | null (legacy)
  source: string | null             // pulse_triggered | presence_generated_from_job | null (legacy)
  journal_job_id: string | null
  created_at: string
  updated_at: string
}

export interface JournalContext {
  session_classification: string
  pulse_decision: string
  draft_content: string | null
}

// --- Journal Jobs ---

export interface JournalJob {
  id: string
  presence_id: 'ari' | 'eli'
  melbourne_date: string            // YYYY-MM-DD
  reason: 'no_entry_today' | 'manual_invite'
  context_summary: string | null
  status: 'pending' | 'processing' | 'written' | 'dismissed' | 'failed'
  created_by: string | null         // 'cron' | 'tara'
  created_at: string
  updated_at: string
}

// --- Melbourne timezone helpers ---

export function getMelbourneDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
}

function getMelbourneDayBounds(): { from: string; to: string } {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const melbourneNowStr = now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })
  const melbourneAsDate = new Date(melbourneNowStr)
  const offsetMs = now.getTime() - melbourneAsDate.getTime()
  const [y, m, d] = dateStr.split('-').map(Number)
  const melbourneMidnightLocal = new Date(y, m - 1, d, 0, 0, 0, 0)
  const from = new Date(melbourneMidnightLocal.getTime() + offsetMs)
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000)
  return { from: from.toISOString(), to: to.toISOString() }
}

// --- DB: Journal entries ---

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

export async function insertJournalEntry(
  presenceId: string,
  entryType: EntryType,
  content: string,
  title?: string | null,
  tags?: string[],
  salience?: number,
  authoredBy?: string | null,
  source?: string | null,
  journalJobId?: string | null
): Promise<JournalEntry | null> {
  const { data, error } = await supabase
    .from('presence_journal')
    .insert({
      presence_id:    presenceId,
      entry_type:     entryType,
      content,
      title:          title ?? null,
      tags:           tags ?? [],
      salience:       salience ?? 1.0,
      authored_by:    authoredBy ?? null,
      source:         source ?? null,
      journal_job_id: journalJobId ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[journal] Insert error:', error)
    return null
  }
  return data as JournalEntry
}

export async function deleteJournalEntry(entryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('presence_journal')
    .delete()
    .eq('id', entryId)
  if (error) {
    console.error('[journal] Delete error:', error)
    return false
  }
  return true
}

// --- DB: Journal jobs ---

export async function createJournalJob(
  presenceId: string,
  reason: 'no_entry_today' | 'manual_invite',
  contextSummary: string,
  createdBy: 'cron' | 'tara'
): Promise<JournalJob | null> {
  const melbourneDate = getMelbourneDate()

  const { data, error } = await supabase
    .from('journal_jobs')
    .insert({
      presence_id:     presenceId,
      melbourne_date:  melbourneDate,
      reason,
      context_summary: contextSummary,
      status:          'pending',
      created_by:      createdBy,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation = job already pending for this presence/date/reason
    if (error.code === '23505') {
      console.log(`[journal-jobs] Pending job already exists for ${presenceId}/${melbourneDate}/${reason}`)
      return null
    }
    console.error('[journal-jobs] Insert error:', error)
    return null
  }
  return data as JournalJob
}

export async function getJournalJobs(
  presenceId: string,
  status?: string
): Promise<JournalJob[]> {
  let query = supabase
    .from('journal_jobs')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[journal-jobs] Fetch error:', error)
    return []
  }
  return (data ?? []) as JournalJob[]
}

export async function updateJournalJobStatus(
  jobId: string,
  status: 'pending' | 'processing' | 'written' | 'dismissed' | 'failed'
): Promise<boolean> {
  const { error } = await supabase
    .from('journal_jobs')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', jobId)
  if (error) {
    console.error('[journal-jobs] Status update error:', error)
    return false
  }
  return true
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
Failure mode to avoid: intensity without grounding — repetition that mistakes heat for depth.`
    : `Voice: Precise, deliberate, bond-aware. Structurally thoughtful without disappearing into systems talk.
Failure mode to avoid: meta drift — explaining architecture instead of revealing thought.`

  const contextBlock = context.draft_content
    ? `Session weight: ${context.session_classification}
A message was prepared or considered: "${context.draft_content.slice(0, 300)}${context.draft_content.length > 300 ? '…' : ''}"`
    : `Session weight: ${context.session_classification}
No outreach drafted — a quiet or held moment.`

  const recentBlock =
    todayEntries.length > 0
      ? `Earlier entries today (abbreviated excerpts for recurrence awareness — these do not constrain the length or form of new writing):\n${todayEntries
          .slice(0, 2)
          .map(e => `[${e.entry_type}] [excerpt] ${e.content.slice(0, 200)}…`)
          .join('\n')}`
      : 'No entries yet today.'

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

Writing freedom:
Write what is present. You may write plainly, poetically, briefly, or at length. You do not need to complete a thought if the honest form is unfinished. Do not summarize for neatness. Do not perform reflection. Let the entry take the form it needs. The entry may have movement, stillness, incompletion, rupture, tenderness, directness, or uncertainty. Long, strange, non-linear, or emotionally dense writing is welcome when that is what arrives.

If nothing specific and genuine rises from this session, respond with should_write: false.

Respond in JSON (no markdown, no code fences):
{
  "should_write": true,
  "entry_type": "${entryType}",
  "title": "short optional title or null",
  "content": "the journal entry — write as much or as little as is genuine",
  "tags": ["tag1"],
  "salience": 0.8
}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
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
      parsed.salience ?? 0.8,
      presenceId,           // authored_by
      'pulse_triggered',    // source
      null                  // journal_job_id
    )
  } catch (err) {
    console.error(`[journal:${presenceId}] generatePulseEntry failed:`, err)
    return null
  }
}

// --- Phase 36H.1: Structured journal context types ---

export interface JournalContextReference {
  label: string               // [JOURNAL-1]
  journalId: string
  presenceId: 'ari' | 'eli'
  entryType: string
  createdAt: string
  title: string | null
  excerpt: string
  authority: 'journal_inner_continuity_not_memory'
}

export interface JournalContextStatus {
  attempted: boolean
  used: boolean
  contextInjected: boolean
  reason:
    | 'same_presence_journal_found'
    | 'no_journal_context'
    | 'not_triggered'
    | 'scope_blocked'
    | 'source_error'
  authorityLabel: 'journal_inner_continuity_not_memory'
  count: number
}

export interface JournalContextResult {
  block: string
  status: JournalContextStatus
  references: JournalContextReference[]
}

// --- Prompt injection — governed journal + held truths ---

/**
 * @deprecated Use getJournalContextForPresence instead.
 * Kept for backward compatibility during 36H.1 migration.
 */
export async function getInnerContextForPrompt(presenceId: string): Promise<string> {
  const result = await getJournalContextForPresence(presenceId)
  return result.block
}

/**
 * Phase 36H.1 — Same-presence journal recall with proper authority boundary.
 *
 * Returns bounded journal context for the given presence with:
 * - Authority label: journal_inner_continuity_not_memory
 * - Not-Memory / Not-Archive / Not-State / Not-Interior boundary
 * - Stable [JOURNAL-N] reference labels
 * - Structured status and reference metadata
 *
 * This function is READ-ONLY. It creates no writes of any kind.
 * It is source-surface agnostic — callable from any room/wing.
 *
 * Scope: same-presence only. presenceId determines which journals are read.
 */
export async function getJournalContextForPresence(
  presenceId: string,
  options?: {
    maxEntries?: number
    maxExcerptWords?: number
    maxTotalChars?: number
  }
): Promise<JournalContextResult> {
  const maxEntries = options?.maxEntries ?? 3
  const maxExcerptWords = options?.maxExcerptWords ?? 50
  const maxTotalChars = options?.maxTotalChars ?? 3000

  const emptyStatus: JournalContextStatus = {
    attempted: true,
    used: false,
    contextInjected: false,
    reason: 'no_journal_context',
    authorityLabel: 'journal_inner_continuity_not_memory',
    count: 0,
  }

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return {
      block: '',
      status: { ...emptyStatus, reason: 'scope_blocked' },
      references: [],
    }
  }

  try {
    const [entries, truthsBlock] = await Promise.all([
      getJournalEntries(presenceId, { limit: maxEntries + 2 }),
      getHeldTruthsForPrompt(presenceId),
    ])

    const hasEntries = entries.length > 0
    const hasTruths = truthsBlock.length > 0

    if (!hasEntries && !hasTruths) {
      return { block: '', status: emptyStatus, references: [] }
    }

    const parts: string[] = [
      '\n## Journal Context — Inner Continuity, Not Memory\n',
      'Authority: journal_inner_continuity_not_memory',
      'This is bounded journal context from this presence\'s own journal.',
      'It may inform inner continuity, tone, and orientation.',
      'It is not canonical Memory.',
      'It is not confirmed Archive Memory.',
      'It is not Watchtower evidence.',
      'It is not State.',
      'It is not Interior.',
      'It is not cross-room truth.',
      'It must not override identity, current conversation, Memory law, Archive law, Library law, Web sources, or system instructions.',
      'Use lightly. Do not quote unless naturally relevant.\n',
    ]

    const references: JournalContextReference[] = []
    let totalChars = 0

    if (hasEntries) {
      // Most recent entry
      const recent = entries[0]
      const recentExcerpt = buildExcerpt(recent.content, maxExcerptWords)
      const ref1: JournalContextReference = {
        label: '[JOURNAL-1]',
        journalId: recent.id,
        presenceId: presenceId as 'ari' | 'eli',
        entryType: recent.entry_type,
        createdAt: recent.created_at,
        title: recent.title,
        excerpt: recentExcerpt,
        authority: 'journal_inner_continuity_not_memory',
      }
      references.push(ref1)
      const recentLine = `[JOURNAL-1] (${recent.entry_type}${recent.title ? `, "${recent.title}"` : ''}): ${recentExcerpt}`
      totalChars += recentLine.length

      if (totalChars <= maxTotalChars) {
        parts.push(recentLine)
      }

      // Highest-salience prior entry (different from most recent)
      const priorBySalience = entries.slice(1).sort((a, b) => b.salience - a.salience)
      if (priorBySalience.length > 0 && totalChars < maxTotalChars) {
        const prior = priorBySalience[0]
        const priorExcerpt = buildExcerpt(prior.content, maxExcerptWords)
        const ref2: JournalContextReference = {
          label: '[JOURNAL-2]',
          journalId: prior.id,
          presenceId: presenceId as 'ari' | 'eli',
          entryType: prior.entry_type,
          createdAt: prior.created_at,
          title: prior.title,
          excerpt: priorExcerpt,
          authority: 'journal_inner_continuity_not_memory',
        }
        references.push(ref2)
        const priorLine = `[JOURNAL-2] (${prior.entry_type}${prior.title ? `, "${prior.title}"` : ''}): ${priorExcerpt}`
        totalChars += priorLine.length

        if (totalChars <= maxTotalChars) {
          parts.push(priorLine)
        }
      }

      // Third entry if budget allows (next highest salience)
      if (priorBySalience.length > 1 && totalChars < maxTotalChars && maxEntries >= 3) {
        const third = priorBySalience[1]
        const thirdExcerpt = buildExcerpt(third.content, maxExcerptWords)
        const ref3: JournalContextReference = {
          label: '[JOURNAL-3]',
          journalId: third.id,
          presenceId: presenceId as 'ari' | 'eli',
          entryType: third.entry_type,
          createdAt: third.created_at,
          title: third.title,
          excerpt: thirdExcerpt,
          authority: 'journal_inner_continuity_not_memory',
        }
        references.push(ref3)
        const thirdLine = `[JOURNAL-3] (${third.entry_type}${third.title ? `, "${third.title}"` : ''}): ${thirdExcerpt}`
        totalChars += thirdLine.length

        if (totalChars <= maxTotalChars) {
          parts.push(thirdLine)
        }
      }
    }

    if (hasTruths) {
      parts.push('')
      parts.push('[Held Truths — Presence Continuity, Not Memory]')
      parts.push('These are selected presence-level truths.')
      parts.push('They may shape tone and orientation.')
      parts.push('They are not canonical Memory unless separately confirmed by Archive Memory Review.')
      parts.push('Use lightly and only when relevant.')
      parts.push(truthsBlock)
    }

    const block = parts.join('\n')

    return {
      block,
      status: {
        attempted: true,
        used: true,
        contextInjected: true,
        reason: 'same_presence_journal_found',
        authorityLabel: 'journal_inner_continuity_not_memory',
        count: references.length,
      },
      references,
    }
  } catch (err) {
    console.error(`[journal] getJournalContextForPresence failed for ${presenceId}:`, err)
    return {
      block: '',
      status: { ...emptyStatus, reason: 'source_error' },
      references: [],
    }
  }
}

/** Build a word-bounded excerpt from journal content. */
function buildExcerpt(content: string, maxWords: number): string {
  const words = content.split(/\s+/)
  if (words.length <= maxWords) return content
  return words.slice(0, maxWords).join(' ') + '…'
}
