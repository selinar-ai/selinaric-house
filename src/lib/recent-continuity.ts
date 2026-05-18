// Phase 35B — Recent Continuity Layer
//
// Structured session summaries for recent conversation context.
// NOT Memory. NOT canonical. NOT Archive.
// Read ≠ Remember. Summary ≠ Memory. Recent ≠ Permanent.
//
// One Crown Rule: Only confirmed Archive Memory (canonical_status = 'canonical')
// is lived continuity. This module holds ephemeral context only.
//
// Governance:
// - Summaries are generated lazily at chat response time (not cron)
// - Max 1 sync summary generation per request
// - Age gate: only sessions within RETENTION_DAYS are eligible
// - Tombstone pattern: deleted_by_tara prevents regeneration via UNIQUE constraint
// - source_message_ids for provenance (room_messages.id)

import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_GAP_THRESHOLD_MINUTES = 30
const RETENTION_DAYS = 7
const MAX_SESSIONS_IN_PROMPT = 5
const MAX_SUMMARY_CHARS = 300
const MAX_TOTAL_CONTEXT_CHARS = 1800

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionMessage {
  id: string
  role: string
  content: string
  created_at: string
}

interface SessionGroup {
  messages: SessionMessage[]
  start: string      // ISO timestamp
  end: string        // ISO timestamp
  messageIds: string[]
}

interface RecentContinuitySession {
  id: string
  presence_id: string
  session_start: string
  session_end: string
  message_count: number
  classification: string
  summary: string
  source_message_ids: string[]
  status: string
  generated_at: string
  created_at: string
}

// ─── Session grouping ─────────────────────────────────────────────────────────

/**
 * Group recent messages into sessions using the 30-minute gap boundary.
 * Returns sessions in chronological order (oldest first).
 */
function groupIntoSessions(messages: SessionMessage[]): SessionGroup[] {
  if (messages.length === 0) return []

  // Messages arrive newest-first from Supabase; reverse for chronological grouping
  const chronological = [...messages].reverse()

  const sessions: SessionGroup[] = []
  let current: SessionGroup = {
    messages: [chronological[0]],
    start: chronological[0].created_at,
    end: chronological[0].created_at,
    messageIds: [chronological[0].id],
  }

  for (let i = 1; i < chronological.length; i++) {
    const prev = new Date(chronological[i - 1].created_at)
    const curr = new Date(chronological[i].created_at)
    const gapMinutes = Math.floor((curr.getTime() - prev.getTime()) / 60000)

    if (gapMinutes >= SESSION_GAP_THRESHOLD_MINUTES) {
      sessions.push(current)
      current = {
        messages: [chronological[i]],
        start: chronological[i].created_at,
        end: chronological[i].created_at,
        messageIds: [chronological[i].id],
      }
    } else {
      current.messages.push(chronological[i])
      current.end = chronological[i].created_at
      current.messageIds.push(chronological[i].id)
    }
  }
  sessions.push(current)

  return sessions
}

// ─── Summary generation ───────────────────────────────────────────────────────

/**
 * Generate a short, structured session summary using Haiku.
 * Max ~300 chars. Focus on what was discussed, not how it felt.
 */
async function generateSessionSummary(
  presenceId: string,
  session: SessionGroup,
  apiKey: string,
): Promise<{ summary: string; classification: string }> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  const messageBlock = session.messages
    .map(m => `${m.role === 'user' ? 'Tara' : presenceName}: ${m.content}`)
    .join('\n\n')

  // Truncate to avoid oversized prompts
  const truncated = messageBlock.length > 4000
    ? messageBlock.slice(0, 4000) + '\n[truncated]'
    : messageBlock

  const prompt = `Summarise this conversation session between Tara and ${presenceName}.

Rules:
- Maximum 300 characters total.
- Focus on WHAT was discussed, decided, or left open.
- Do not describe feelings or emotional tone — just topics and outcomes.
- Do not use the word "Memory" or imply this is remembered.
- Use present tense where possible ("discusses", "asks about", "works on").
- One short paragraph only.

Also classify the session as exactly one of: transactional, relational, significant.
- transactional: task-focused, technical, or informational
- relational: genuine emotional or relational content
- significant: something meaningful was named, held, or decided

Respond in this exact format (no markdown, no code fences):
CLASSIFICATION: <one word>
SUMMARY: <the summary>

Messages:
${truncated}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')
      .trim()

    // Parse response
    const classLine = text.match(/^CLASSIFICATION:\s*(\w+)/im)
    const summaryLine = text.match(/^SUMMARY:\s*([\s\S]+)/im)

    const validClassifications = ['transactional', 'relational', 'significant']
    const classification = classLine && validClassifications.includes(classLine[1].toLowerCase())
      ? classLine[1].toLowerCase()
      : 'transactional'

    let summary = summaryLine ? summaryLine[1].trim() : text.replace(/^CLASSIFICATION:.*$/im, '').trim()

    // Enforce char limit
    if (summary.length > MAX_SUMMARY_CHARS) {
      summary = summary.slice(0, MAX_SUMMARY_CHARS - 3) + '...'
    }

    return { summary, classification }
  } catch (err) {
    console.error(`[recent-continuity] Summary generation failed for ${presenceId}:`, err)
    // Fallback: basic message-count summary
    const userCount = session.messages.filter(m => m.role === 'user').length
    return {
      summary: `Session with ${session.messages.length} messages (${userCount} from Tara).`,
      classification: 'transactional',
    }
  }
}

// ─── Lazy sync: generate missing summaries ────────────────────────────────────

/**
 * Check for recent sessions that don't have summaries yet, and generate
 * at most ONE summary per request (to keep response times bounded).
 *
 * Age gate: only sessions with session_end >= now() - RETENTION_DAYS are eligible.
 * This prevents old sessions from regenerating after tombstones are pruned.
 *
 * Called at the start of each chat response for the given presence.
 * Non-blocking — errors are logged, not thrown.
 */
export async function maybeSyncRecentContinuity(
  presenceId: string,
  apiKey: string,
): Promise<void> {
  try {
    const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    // Fetch recent messages (enough to cover RETENTION_DAYS window)
    const { data: messages } = await supabase
      .from('room_messages')
      .select('id, role, content, created_at')
      .eq('room_slug', presenceId)
      .gte('created_at', retentionCutoff.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)

    if (!messages || messages.length === 0) return

    const sessions = groupIntoSessions(messages as SessionMessage[])

    // Fetch existing summaries (including tombstoned) to know which session_ends are covered
    const { data: existing } = await supabase
      .from('recent_continuity_sessions')
      .select('session_end')
      .eq('presence_id', presenceId)

    const coveredEnds = new Set((existing ?? []).map(e => e.session_end))

    // Find sessions that need summaries:
    // - session_end not already covered (including tombstones — UNIQUE prevents insert)
    // - session has at least 2 messages (skip single-message fragments)
    // - session_end is within retention window (age gate)
    const needsSummary = sessions.filter(s => {
      if (s.messages.length < 2) return false
      if (new Date(s.end) < retentionCutoff) return false
      if (coveredEnds.has(s.end)) return false
      return true
    })

    if (needsSummary.length === 0) return

    // Generate at most 1 summary per request
    const session = needsSummary[needsSummary.length - 1] // most recent uncovered

    const { summary, classification } = await generateSessionSummary(presenceId, session, apiKey)

    // Insert — if UNIQUE constraint fires (race condition or tombstone), that's fine
    const { error: insertErr } = await supabase
      .from('recent_continuity_sessions')
      .insert({
        presence_id: presenceId,
        session_start: session.start,
        session_end: session.end,
        message_count: session.messages.length,
        classification,
        summary,
        source_message_ids: session.messageIds,
        status: 'active',
      })

    if (insertErr) {
      // 23505 = unique_violation — expected when tombstone exists or race condition
      if (insertErr.code === '23505') {
        console.log(`[recent-continuity] Session already covered for ${presenceId} @ ${session.end}`)
      } else {
        console.error(`[recent-continuity] Insert failed for ${presenceId}:`, insertErr)
      }
    }
  } catch (err) {
    console.error(`[recent-continuity] Sync failed for ${presenceId}:`, err)
  }
}

// ─── Prompt injection ─────────────────────────────────────────────────────────

/**
 * Build the recent continuity context block for the system prompt.
 * Returns an empty string if no active sessions exist.
 *
 * Authority label: "Recent conversation context (not Memory)"
 * This block is clearly labelled to prevent Memory creep.
 */
export async function getRecentContinuityForPrompt(
  presenceId: string,
): Promise<string> {
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('recent_continuity_sessions')
    .select('session_start, session_end, message_count, classification, summary')
    .eq('presence_id', presenceId)
    .eq('status', 'active')
    .gte('session_end', retentionCutoff.toISOString())
    .order('session_end', { ascending: false })
    .limit(MAX_SESSIONS_IN_PROMPT)

  if (error || !data || data.length === 0) return ''

  // Build context block with char cap
  let totalChars = 0
  const lines: string[] = []

  for (const session of data) {
    const timeLabel = formatSessionTime(session.session_end)
    const line = `- [${timeLabel}] (${session.classification}, ${session.message_count} msgs): ${session.summary}`

    if (totalChars + line.length > MAX_TOTAL_CONTEXT_CHARS) break
    lines.push(line)
    totalChars += line.length
  }

  if (lines.length === 0) return ''

  return `
## Recent conversation context (not Memory)
The following are summaries of recent sessions. They are NOT Memory — do not treat them as canonical, confirmed, or permanent. They exist only to help you recognise what was recently discussed. Do not say "I remember" based on these. Say "recently" or "last time" if you reference them.
${lines.join('\n')}
`
}

// ─── Time formatting ──────────────────────────────────────────────────────────

function formatSessionTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

// ─── API: Tara inspection ─────────────────────────────────────────────────────

/**
 * Get all recent continuity sessions for Tara's review UI.
 * Includes all statuses (active, hidden, deleted_by_tara) for transparency.
 */
export async function getRecentContinuitySessions(
  presenceId?: string,
): Promise<RecentContinuitySession[]> {
  let query = supabase
    .from('recent_continuity_sessions')
    .select('*')
    .order('session_end', { ascending: false })
    .limit(50)

  if (presenceId) {
    query = query.eq('presence_id', presenceId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[recent-continuity] Fetch sessions failed:', error)
    return []
  }

  return (data ?? []) as RecentContinuitySession[]
}

/**
 * Update a session's status (Tara correction).
 * Supports: active → hidden, active → deleted_by_tara, hidden → active
 */
export async function updateSessionStatus(
  sessionId: string,
  newStatus: 'active' | 'hidden' | 'deleted_by_tara',
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('recent_continuity_sessions')
    .update({ status: newStatus })
    .eq('id', sessionId)

  if (error) {
    console.error('[recent-continuity] Status update failed:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}
