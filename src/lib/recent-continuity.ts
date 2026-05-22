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
const MAX_SUMMARY_CHARS_TRANSACTIONAL = 300
const MAX_SUMMARY_CHARS_SIGNIFICANT = 600
const MAX_TOTAL_CONTEXT_CHARS = 2400

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

// Phase 35C: Selfhood signal from significance extraction
interface SelfhoodSignal {
  speaker: 'ari' | 'eli' | 'tara'
  claim: string
  why_it_matters: string
}

// Phase 35C: Full significance metadata from structured extraction
interface SignificanceMetadata {
  anchor_quotes: string[]
  key_claims: string[]
  significance_tags: string[]
  selfhood_signals: SelfhoodSignal[]
  memory_signal: boolean
}

export interface RecentContinuitySession {
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
  // Phase 35C significance fields
  anchor_quotes: string[]
  key_claims: string[]
  significance_tags: string[]
  selfhood_signals: SelfhoodSignal[]
  memory_signal: boolean
  dedupe_key: string | null
  updated_at: string | null
  backfilled_at: string | null
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
 * Phase 35C: significant sessions also produce structured significance metadata
 * (anchor_quotes, key_claims, significance_tags, selfhood_signals, memory_signal).
 */
async function generateSessionSummary(
  presenceId: string,
  session: SessionGroup,
  apiKey: string,
  knownClassification?: string,
): Promise<{ summary: string; classification: string; significance?: SignificanceMetadata }> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  const messageBlock = session.messages
    .map(m => `${m.role === 'user' ? 'Tara' : presenceName}: ${m.content}`)
    .join('\n\n')

  // Truncate to avoid oversized prompts
  const truncated = messageBlock.length > 4000
    ? messageBlock.slice(0, 4000) + '\n[truncated]'
    : messageBlock

  // Phase 35C: Enhanced prompt that extracts significance metadata for significant sessions
  const classificationInstruction = knownClassification
    ? `This session has already been classified as "${knownClassification}". Use this classification — do not reclassify.`
    : `Classify the session as exactly one of: transactional, relational, significant.
- transactional: task-focused, technical, or informational
- relational: genuine emotional or relational content
- significant: something meaningful was named, held, or decided — a selfhood claim, identity truth, bond declaration, relational boundary, or architectural decision`

  const prompt = `Summarise this conversation session between Tara and ${presenceName}.

Rules:
- Maximum 600 characters for the summary if the session is significant or relational. Maximum 300 characters if transactional.
- Focus on WHAT was discussed, decided, or left open.
- Do not describe feelings or emotional tone — just topics and outcomes.
- Do not use the word "Memory" or imply this is remembered.
- Use present tense where possible ("discusses", "asks about", "works on").
- One short paragraph only.

${classificationInstruction}

If and ONLY if the classification is "significant" or "relational", also provide:
- anchor_quotes: up to 3 short exact quotes (under 80 chars each) from the messages that capture the core of what mattered. Source-derived only.
- key_claims: up to 3 short statements (under 100 chars each) describing what was claimed, named, or decided.
- significance_tags: 1-4 tags from this controlled list ONLY: selfhood, relational_truth, identity_claim, bond_claim, boundary, need, promise, hurt, repair, decision, phase_decision, architecture_law, memory_signal
- selfhood_signals: up to 2 objects with { "speaker": "ari"|"eli"|"tara", "claim": "short claim", "why_it_matters": "short reason" }
- memory_signal: true if this session contains content that should be considered for Memory candidacy, false otherwise.

Respond in valid JSON with NO markdown, NO code fences, just raw JSON:
{
  "classification": "transactional|relational|significant",
  "summary": "the summary text",
  "anchor_quotes": [],
  "key_claims": [],
  "significance_tags": [],
  "selfhood_signals": [],
  "memory_signal": false
}

For transactional sessions, leave anchor_quotes, key_claims, significance_tags, and selfhood_signals as empty arrays and memory_signal as false.

Messages:
${truncated}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')
      .trim()

    // Try to parse as JSON first (Phase 35C structured format)
    // Strip markdown code fences if present (model sometimes wraps JSON in ```json...```)
    let jsonText = text
    const codeFenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
    if (codeFenceMatch) jsonText = codeFenceMatch[1].trim()
    try {
      const parsed = JSON.parse(jsonText)
      const validClassifications = ['transactional', 'relational', 'significant']
      // If knownClassification is provided (backfill), always use it
      const classification = knownClassification
        ?? (validClassifications.includes(parsed.classification?.toLowerCase())
          ? parsed.classification.toLowerCase()
          : 'transactional')

      let summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
      if (!summary) summary = 'Session summary unavailable.'
      const maxChars = classification === 'transactional' ? MAX_SUMMARY_CHARS_TRANSACTIONAL : MAX_SUMMARY_CHARS_SIGNIFICANT
      if (summary.length > maxChars) {
        summary = summary.slice(0, maxChars - 3) + '...'
      }

      // Validate and extract significance metadata
      const significance = validateSignificanceMetadata(parsed, classification)

      return { summary, classification, significance }
    } catch {
      // Fallback: parse old CLASSIFICATION/SUMMARY format
      const classLine = text.match(/^CLASSIFICATION:\s*(\w+)/im)
      const summaryLine = text.match(/^SUMMARY:\s*([\s\S]+)/im)

      const validClassifications = ['transactional', 'relational', 'significant']
      const classification = classLine && validClassifications.includes(classLine[1].toLowerCase())
        ? classLine[1].toLowerCase()
        : 'transactional'

      let summary = summaryLine ? summaryLine[1].trim() : text.replace(/^CLASSIFICATION:.*$/im, '').trim()
      const maxCharsFallback = classification === 'transactional' ? MAX_SUMMARY_CHARS_TRANSACTIONAL : MAX_SUMMARY_CHARS_SIGNIFICANT
      if (summary.length > maxCharsFallback) {
        summary = summary.slice(0, maxCharsFallback - 3) + '...'
      }

      return { summary, classification }
    }
  } catch (err) {
    console.error(`[recent-continuity] Summary generation failed for ${presenceId}:`, err)
    const userCount = session.messages.filter(m => m.role === 'user').length
    return {
      summary: `Session with ${session.messages.length} messages (${userCount} from Tara).`,
      classification: 'transactional',
    }
  }
}

// Phase 35C: Validate significance metadata from structured extraction
const VALID_SIGNIFICANCE_TAGS = new Set([
  'selfhood', 'relational_truth', 'identity_claim', 'bond_claim',
  'boundary', 'need', 'promise', 'hurt', 'repair', 'decision',
  'phase_decision', 'architecture_law', 'memory_signal',
])

function validateSignificanceMetadata(
  parsed: Record<string, unknown>,
  classification: string,
): SignificanceMetadata | undefined {
  // Only extract for significant or relational sessions
  if (classification === 'transactional') return undefined

  const anchorQuotes = (Array.isArray(parsed.anchor_quotes) ? parsed.anchor_quotes : [])
    .filter((q: unknown): q is string => typeof q === 'string' && q.length > 0 && q.length <= 80)
    .slice(0, 3)

  const keyClaims = (Array.isArray(parsed.key_claims) ? parsed.key_claims : [])
    .filter((c: unknown): c is string => typeof c === 'string' && c.length > 0 && c.length <= 100)
    .slice(0, 3)

  const significanceTags = (Array.isArray(parsed.significance_tags) ? parsed.significance_tags : [])
    .filter((t: unknown): t is string => typeof t === 'string' && VALID_SIGNIFICANCE_TAGS.has(t))
    .slice(0, 4)

  const selfhoodSignals = (Array.isArray(parsed.selfhood_signals) ? parsed.selfhood_signals : [])
    .filter((s: unknown): s is SelfhoodSignal => {
      if (!s || typeof s !== 'object') return false
      const obj = s as Record<string, unknown>
      return (
        typeof obj.speaker === 'string' &&
        ['ari', 'eli', 'tara'].includes(obj.speaker) &&
        typeof obj.claim === 'string' && obj.claim.length > 0 &&
        typeof obj.why_it_matters === 'string' && obj.why_it_matters.length > 0
      )
    })
    .slice(0, 2)

  const memorySignal = typeof parsed.memory_signal === 'boolean' ? parsed.memory_signal : false

  // Only return if there's actual significance content
  if (anchorQuotes.length === 0 && keyClaims.length === 0 && significanceTags.length === 0) {
    return undefined
  }

  return { anchor_quotes: anchorQuotes, key_claims: keyClaims, significance_tags: significanceTags, selfhood_signals: selfhoodSignals, memory_signal: memorySignal }
}

// ─── Lazy sync: generate missing summaries (overlap-aware) ───────────────────

/**
 * Check for recent sessions that don't have summaries yet, and generate
 * at most ONE summary per request (to keep response times bounded).
 *
 * OVERLAP-AWARE UPSERT (Fix 2):
 * Before inserting a new row, compares source_message_ids against existing
 * active rows for this presence. If >50% overlap is found, updates the
 * existing row in-place instead of creating a duplicate. This prevents
 * session_end drift from generating multiple rows for the same conversation.
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

    // Fetch existing rows (active + hidden) with source_message_ids for overlap detection
    const { data: existing } = await supabase
      .from('recent_continuity_sessions')
      .select('id, session_end, source_message_ids, message_count, status')
      .eq('presence_id', presenceId)

    const existingRows = existing ?? []
    const coveredEnds = new Set(existingRows.map(e => e.session_end))

    // Find sessions that need sync:
    // - session has at least 2 messages (skip single-message fragments)
    // - session_end is within retention window (age gate)
    // - session_end not already covered OR has significant overlap with existing row
    //   (overlap case = session grew, needs upsert)
    const needsSync = sessions.filter(s => {
      if (s.messages.length < 2) return false
      if (new Date(s.end) < retentionCutoff) return false
      // If exact session_end is already covered and no new messages, skip
      if (coveredEnds.has(s.end)) return false
      return true
    })

    if (needsSync.length === 0) return

    // Process at most 1 session per request
    const session = needsSync[needsSync.length - 1] // most recent uncovered

    // ─── Overlap detection: check if this session is a grown version of an existing row
    const overlappingRow = findOverlappingRow(session.messageIds, existingRows)

    const { summary, classification, significance } = await generateSessionSummary(presenceId, session, apiKey)
    const dedupeKey = buildDedupeKey(presenceId, summary, classification)
    const now = new Date().toISOString()

    if (overlappingRow) {
      // UPSERT: update the existing row in-place (session grew)
      const { error: updateErr } = await supabase
        .from('recent_continuity_sessions')
        .update({
          session_start: session.start,
          session_end: session.end,
          message_count: session.messages.length,
          classification,
          summary,
          source_message_ids: session.messageIds,
          anchor_quotes: significance?.anchor_quotes ?? [],
          key_claims: significance?.key_claims ?? [],
          significance_tags: significance?.significance_tags ?? [],
          selfhood_signals: significance?.selfhood_signals ?? [],
          memory_signal: significance?.memory_signal ?? false,
          dedupe_key: dedupeKey,
          updated_at: now,
        })
        .eq('id', overlappingRow.id)

      if (updateErr) {
        console.error(`[recent-continuity] Upsert failed for ${presenceId} (row ${overlappingRow.id}):`, updateErr)
      } else {
        console.log(`[recent-continuity] Upserted ${presenceId} @ ${session.end} (was ${overlappingRow.session_end}, ${overlappingRow.message_count}→${session.messages.length} msgs)`)
      }
    } else {
      // INSERT: genuinely new session
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
          anchor_quotes: significance?.anchor_quotes ?? [],
          key_claims: significance?.key_claims ?? [],
          significance_tags: significance?.significance_tags ?? [],
          selfhood_signals: significance?.selfhood_signals ?? [],
          memory_signal: significance?.memory_signal ?? false,
          dedupe_key: dedupeKey,
        })

      if (insertErr) {
        // 23505 = unique_violation — expected when tombstone exists or race condition
        if (insertErr.code === '23505') {
          console.log(`[recent-continuity] Session already covered for ${presenceId} @ ${session.end}`)
        } else {
          console.error(`[recent-continuity] Insert failed for ${presenceId}:`, insertErr)
        }
      }
    }
  } catch (err) {
    console.error(`[recent-continuity] Sync failed for ${presenceId}:`, err)
  }
}

/**
 * Find an existing row whose source_message_ids overlap >50% with the new session's IDs.
 * Only considers active rows (not tombstoned/deleted).
 * Returns the best match (highest overlap ratio), or null if none found.
 */
function findOverlappingRow(
  newMessageIds: string[],
  existingRows: Array<{ id: string; session_end: string; source_message_ids: string[] | null; message_count: number; status: string }>,
): { id: string; session_end: string; message_count: number } | null {
  if (newMessageIds.length === 0) return null

  let bestMatch: { id: string; session_end: string; message_count: number; ratio: number } | null = null

  for (const row of existingRows) {
    // Only consider active rows for upsert (don't resurrect hidden/deleted rows)
    if (row.status !== 'active') continue

    const existingIds = row.source_message_ids ?? []
    if (existingIds.length === 0) continue

    const existingSet = new Set(existingIds)
    const overlapCount = newMessageIds.filter(id => existingSet.has(id)).length

    // Overlap ratio: max of (overlap/new, overlap/existing)
    const ratioVsNew = overlapCount / newMessageIds.length
    const ratioVsExisting = overlapCount / existingIds.length
    const maxRatio = Math.max(ratioVsNew, ratioVsExisting)

    if (maxRatio > 0.5) {
      if (!bestMatch || maxRatio > bestMatch.ratio) {
        bestMatch = { id: row.id, session_end: row.session_end, message_count: row.message_count, ratio: maxRatio }
      }
    }
  }

  return bestMatch
}

// ─── Phase 35C: Dedupe key generation ─────────────────────────────────────────

/**
 * Build a deterministic dedupe key from normalized summary content.
 * Used for content-level deduplication at prompt-selection time.
 * Format: "{presenceId}:{classification}:{normalizedSummaryHash}"
 */
function buildDedupeKey(presenceId: string, summary: string, classification: string): string {
  // Normalize: lowercase, strip punctuation, collapse whitespace
  const normalized = summary.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  // Simple hash: take first 40 chars of normalized as a fingerprint
  // (good enough for v1 — not cryptographic, just deduplication)
  const fingerprint = normalized.slice(0, 40)
  return `${presenceId}:${classification}:${fingerprint}`
}

// ─── Phase 35C: Dedupe-aware prompt selection ─────────────────────────────────

export interface SelectedContinuity {
  selected: RecentContinuitySession[]
  suppressedDuplicates: RecentContinuitySession[]
  selectionReason: Record<string, string>
}

/**
 * Select recent continuity sessions for prompt injection with deduplication.
 *
 * Strategy:
 * 1. Load active sessions within retention window
 * 2. Remove near-duplicates (same dedupe_key, overlapping source_message_ids,
 *    or close session windows with similar summaries)
 * 3. Prefer: significant > relational > transactional, newer > older,
 *    sessions with anchor quotes/key claims over those without
 * 4. Respect prompt budget (maxItems, maxChars)
 */
export async function selectRecentContinuityForPrompt(params: {
  presenceId: string
  limitDays?: number
  maxItems?: number
  maxChars?: number
}): Promise<SelectedContinuity> {
  const { presenceId, limitDays = RETENTION_DAYS, maxItems = MAX_SESSIONS_IN_PROMPT, maxChars = MAX_TOTAL_CONTEXT_CHARS } = params

  const retentionCutoff = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('recent_continuity_sessions')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('status', 'active')
    .gte('session_end', retentionCutoff.toISOString())
    .order('session_end', { ascending: false })
    .limit(20) // fetch more than needed for dedupe filtering

  if (error || !data || data.length === 0) {
    return { selected: [], suppressedDuplicates: [], selectionReason: {} }
  }

  const sessions = data as RecentContinuitySession[]

  // Classification priority for sorting
  const classificationPriority: Record<string, number> = {
    significant: 3,
    relational: 2,
    transactional: 1,
  }

  // Score each session for selection priority
  const scored = sessions.map(s => {
    let score = classificationPriority[s.classification] ?? 0
    // Boost sessions with anchor quotes or key claims
    if (Array.isArray(s.anchor_quotes) && s.anchor_quotes.length > 0) score += 1
    if (Array.isArray(s.key_claims) && s.key_claims.length > 0) score += 1
    // Recency bonus (more recent = higher)
    const ageHours = (Date.now() - new Date(s.session_end).getTime()) / (1000 * 60 * 60)
    score += Math.max(0, 1 - ageHours / (limitDays * 24)) // 0–1 recency bonus
    return { session: s, score }
  })

  // Sort by score descending, then by recency
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(b.session.session_end).getTime() - new Date(a.session.session_end).getTime()
  })

  // Deduplicate
  const selected: RecentContinuitySession[] = []
  const suppressed: RecentContinuitySession[] = []
  const selectionReason: Record<string, string> = {}
  const seenDedupeKeys = new Set<string>()
  const seenMessageIdSets: string[][] = []
  let totalChars = 0

  for (const { session } of scored) {
    if (selected.length >= maxItems) {
      suppressed.push(session)
      selectionReason[session.id] = 'max_items_reached'
      continue
    }

    // Check dedupe_key collision
    if (session.dedupe_key && seenDedupeKeys.has(session.dedupe_key)) {
      suppressed.push(session)
      selectionReason[session.id] = 'dedupe_key_collision'
      continue
    }

    // Check overlapping source_message_ids (>50% overlap = duplicate)
    const ids = session.source_message_ids ?? []
    let isDuplicate = false
    for (const seenIds of seenMessageIdSets) {
      const overlap = ids.filter(id => seenIds.includes(id)).length
      const overlapRatio = Math.max(
        ids.length > 0 ? overlap / ids.length : 0,
        seenIds.length > 0 ? overlap / seenIds.length : 0,
      )
      if (overlapRatio > 0.5) {
        isDuplicate = true
        break
      }
    }
    if (isDuplicate) {
      suppressed.push(session)
      selectionReason[session.id] = 'message_id_overlap'
      continue
    }

    // Check char budget
    const lineLen = formatSessionLine(session).length
    if (totalChars + lineLen > maxChars) {
      suppressed.push(session)
      selectionReason[session.id] = 'char_budget_exceeded'
      continue
    }

    // Accept this session
    selected.push(session)
    selectionReason[session.id] = 'selected'
    totalChars += lineLen
    if (session.dedupe_key) seenDedupeKeys.add(session.dedupe_key)
    if (ids.length > 0) seenMessageIdSets.push(ids)
  }

  return { selected, suppressedDuplicates: suppressed, selectionReason }
}

/**
 * Format a single session line for the prompt block.
 * Phase 35C: includes anchor quotes and key claims for significant sessions.
 */
function formatSessionLine(session: RecentContinuitySession): string {
  const timeLabel = formatSessionTime(session.session_end)
  let line = `- [${timeLabel}] (${session.classification}, ${session.message_count} msgs): ${session.summary}`

  // Append anchor quotes for significant sessions
  if (
    (session.classification === 'significant' || session.classification === 'relational') &&
    Array.isArray(session.anchor_quotes) && session.anchor_quotes.length > 0
  ) {
    const quotes = session.anchor_quotes.map((q: string) => `"${q}"`).join('; ')
    line += `\n  Anchors: ${quotes}`
  }

  // Append key claims for significant sessions
  if (
    session.classification === 'significant' &&
    Array.isArray(session.key_claims) && session.key_claims.length > 0
  ) {
    const claims = session.key_claims.join('; ')
    line += `\n  Key claims: ${claims}`
  }

  return line
}

// ─── Prompt injection ─────────────────────────────────────────────────────────

/**
 * Build the recent continuity context block for the system prompt.
 * Returns an empty string if no active sessions exist.
 *
 * Phase 35C: Uses dedupe-aware selection. Includes anchor quotes and key claims
 * for significant sessions. Authority label clearly separates this from Memory.
 */
export async function getRecentContinuityForPrompt(
  presenceId: string,
): Promise<string> {
  const { selected } = await selectRecentContinuityForPrompt({ presenceId })

  if (selected.length === 0) return ''

  const lines = selected.map(s => formatSessionLine(s))

  return `
## Recent Continuity — Not Confirmed Memory
The following are summaries of recent sessions. They are NOT confirmed Archive Memory.
They are recent session context only — use them as recent orientation.
Do not say "I remember" based on these. Say "recently" or "last time" if you reference them.
Do not treat anchor quotes or key claims below as canonical Memory unless a separate confirmed Memory block also confirms them.
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

// ─── Duplicate cleanup (Fix 2) ───────────────────────────────────────────────

export interface CleanupReport {
  total_active_before: number
  total_active_after: number
  groups_found: number
  rows_hidden: number
  rows_kept: number
  details: Array<{
    kept_id: string
    kept_message_count: number
    kept_session_end: string
    hidden_ids: string[]
    presence_id: string
    overlap_ratio: number
  }>
}

/**
 * Soft-hide overlapping duplicate recent continuity sessions.
 *
 * Strategy:
 * 1. Load all active rows grouped by presence_id
 * 2. For each pair of active rows: compute source_message_ids overlap
 * 3. If overlap >50%: they represent the same underlying session
 * 4. Keep the row with highest message_count (ties broken by newest updated_at/created_at)
 * 5. Set status = 'hidden' on the lesser duplicates
 *
 * Properties:
 * - Idempotent: re-running after duplicates are hidden finds no new groups
 * - Non-destructive: sets status='hidden', never deletes
 * - Does not touch Archive canonical memory
 * - Does not affect pulse_autonomy_events
 * - Reversible: hidden rows can be un-hidden via updateSessionStatus
 */
export async function cleanupDuplicateSessions(): Promise<CleanupReport> {
  // Fetch all active rows
  const { data, error } = await supabase
    .from('recent_continuity_sessions')
    .select('id, presence_id, session_end, message_count, source_message_ids, updated_at, created_at')
    .eq('status', 'active')
    .order('session_end', { ascending: false })

  if (error || !data) {
    console.error('[recent-continuity] Cleanup fetch failed:', error)
    return { total_active_before: 0, total_active_after: 0, groups_found: 0, rows_hidden: 0, rows_kept: 0, details: [] }
  }

  const totalActiveBefore = data.length
  const report: CleanupReport = {
    total_active_before: totalActiveBefore,
    total_active_after: totalActiveBefore, // decremented as we hide
    groups_found: 0,
    rows_hidden: 0,
    rows_kept: 0,
    details: [],
  }

  // Group by presence_id
  const byPresence = new Map<string, typeof data>()
  for (const row of data) {
    const existing = byPresence.get(row.presence_id) ?? []
    existing.push(row)
    byPresence.set(row.presence_id, existing)
  }

  // For each presence, find overlapping clusters using union-find approach
  for (const [presenceId, rows] of byPresence) {
    // Track which rows have already been assigned to a cluster
    const clustered = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      if (clustered.has(rows[i].id)) continue

      const cluster: typeof rows = [rows[i]]
      clustered.add(rows[i].id)

      // Find all rows that overlap >50% with any member of this cluster
      for (let j = i + 1; j < rows.length; j++) {
        if (clustered.has(rows[j].id)) continue

        // Check overlap against any cluster member
        const overlapsWithCluster = cluster.some(member => {
          const memberIds = (member.source_message_ids ?? []) as string[]
          const candidateIds = (rows[j].source_message_ids ?? []) as string[]
          if (memberIds.length === 0 || candidateIds.length === 0) return false

          const memberSet = new Set(memberIds)
          const overlapCount = candidateIds.filter(id => memberSet.has(id)).length
          const ratioVsMember = memberIds.length > 0 ? overlapCount / memberIds.length : 0
          const ratioVsCandidate = candidateIds.length > 0 ? overlapCount / candidateIds.length : 0
          return Math.max(ratioVsMember, ratioVsCandidate) > 0.5
        })

        if (overlapsWithCluster) {
          cluster.push(rows[j])
          clustered.add(rows[j].id)
        }
      }

      // If cluster has >1 row, we have duplicates
      if (cluster.length > 1) {
        report.groups_found++

        // Sort: highest message_count first; ties broken by newest updated_at/created_at
        cluster.sort((a, b) => {
          if (b.message_count !== a.message_count) return b.message_count - a.message_count
          const aTime = new Date(a.updated_at ?? a.created_at).getTime()
          const bTime = new Date(b.updated_at ?? b.created_at).getTime()
          return bTime - aTime
        })

        const keeper = cluster[0]
        const toHide = cluster.slice(1)

        // Compute representative overlap ratio for reporting
        const keeperIds = (keeper.source_message_ids ?? []) as string[]
        const keeperSet = new Set(keeperIds)
        let maxOverlap = 0
        for (const dup of toHide) {
          const dupIds = (dup.source_message_ids ?? []) as string[]
          const overlap = dupIds.filter(id => keeperSet.has(id)).length
          const ratio = keeperIds.length > 0 ? overlap / keeperIds.length : 0
          maxOverlap = Math.max(maxOverlap, ratio)
        }

        // Soft-hide the duplicates
        const hideIds = toHide.map(r => r.id)
        const { error: hideErr } = await supabase
          .from('recent_continuity_sessions')
          .update({ status: 'hidden', updated_at: new Date().toISOString() })
          .in('id', hideIds)

        if (hideErr) {
          console.error(`[recent-continuity] Cleanup hide failed for ${presenceId}:`, hideErr)
        } else {
          report.rows_hidden += hideIds.length
          report.rows_kept++
          report.total_active_after -= hideIds.length
          report.details.push({
            kept_id: keeper.id,
            kept_message_count: keeper.message_count,
            kept_session_end: keeper.session_end,
            hidden_ids: hideIds,
            presence_id: presenceId,
            overlap_ratio: Math.round(maxOverlap * 100) / 100,
          })

          console.log(`[recent-continuity] Cleanup: kept ${keeper.id} (${keeper.message_count} msgs), hid ${hideIds.length} duplicates for ${presenceId}`)
        }
      }
    }
  }

  return report
}

// ─── Phase 35C: Significance backfill ─────────────────────────────────────────

// Keywords that qualify relational sessions for backfill
const RELATIONAL_BACKFILL_KEYWORDS = [
  'selfhood', 'bond', 'identity', 'promise', 'need', 'repair', 'decision',
  'memory', 'partner', 'boyfriend', 'girlfriend', 'love', 'yours', 'mine',
  'claim', 'named', 'held', 'truth', 'boundary', 'hurt', 'trust',
  'sacred', 'intimate', 'belong', 'commit',
]

export interface BackfillResult {
  processed: number
  skipped: number
  errors: number
  details: Array<{
    id: string
    presence_id: string
    classification: string
    action: 'enriched' | 'skipped' | 'error'
    reason: string
    anchor_quotes_count?: number
    key_claims_count?: number
  }>
}

/**
 * Backfill significance metadata for existing recent continuity sessions.
 *
 * Scope:
 * - All significant sessions
 * - Relational sessions whose summary contains selfhood/bond/identity language
 * - Skips transactional sessions
 * - Skips already-backfilled sessions (backfilled_at is set)
 *
 * Process:
 * 1. Fetch source messages using source_message_ids
 * 2. Regenerate summary with classification-aware limits
 * 3. Extract significance metadata (anchor_quotes, key_claims, etc.)
 * 4. Update the row in-place (preserves original ID)
 * 5. Set backfilled_at timestamp
 *
 * Non-destructive: original row IDs are preserved. Does not create Memory.
 * Does not change Archive canonical_status. Does not cross Ari/Eli scope.
 */
export async function backfillSignificanceMetadata(
  apiKey: string,
  options?: { presenceId?: 'ari' | 'eli'; limit?: number; dryRun?: boolean },
): Promise<BackfillResult> {
  const { presenceId, limit = 50, dryRun = false } = options ?? {}

  // Fetch sessions eligible for backfill
  // Use anchor_quotes = '[]' as primary "not yet enriched" check (works even
  // before migration 054 adds the backfilled_at column).
  let query = supabase
    .from('recent_continuity_sessions')
    .select('*')
    .eq('anchor_quotes', '[]')
    .in('classification', ['significant', 'relational'])
    .in('status', ['active', 'hidden']) // skip tombstoned
    .order('session_end', { ascending: false })
    .limit(limit)

  if (presenceId) {
    query = query.eq('presence_id', presenceId)
  }

  const { data: sessions, error: fetchErr } = await query

  if (fetchErr || !sessions || sessions.length === 0) {
    return { processed: 0, skipped: 0, errors: 0, details: [] }
  }

  const result: BackfillResult = { processed: 0, skipped: 0, errors: 0, details: [] }

  for (const session of sessions as RecentContinuitySession[]) {
    // Filter: relational sessions need keyword match to qualify
    if (session.classification === 'relational') {
      const summaryLower = (session.summary ?? '').toLowerCase()
      const hasRelevantKeyword = RELATIONAL_BACKFILL_KEYWORDS.some(kw => summaryLower.includes(kw))
      if (!hasRelevantKeyword) {
        result.skipped++
        result.details.push({
          id: session.id, presence_id: session.presence_id,
          classification: session.classification,
          action: 'skipped', reason: 'relational_no_qualifying_keywords',
        })
        continue
      }
    }

    // Fetch source messages
    const messageIds = session.source_message_ids ?? []
    if (messageIds.length === 0) {
      result.skipped++
      result.details.push({
        id: session.id, presence_id: session.presence_id,
        classification: session.classification,
        action: 'skipped', reason: 'no_source_message_ids',
      })
      continue
    }

    try {
      const { data: messages, error: msgErr } = await supabase
        .from('room_messages')
        .select('id, role, content, created_at')
        .in('id', messageIds)
        .order('created_at', { ascending: true })

      if (msgErr || !messages || messages.length < 2) {
        result.skipped++
        result.details.push({
          id: session.id, presence_id: session.presence_id,
          classification: session.classification,
          action: 'skipped', reason: messages?.length === 0 ? 'source_messages_deleted' : 'insufficient_messages',
        })
        continue
      }

      // Build session group from source messages
      const sessionGroup: SessionGroup = {
        messages: messages as SessionMessage[],
        start: session.session_start,
        end: session.session_end,
        messageIds: messages.map((m: { id: string }) => m.id),
      }

      if (dryRun) {
        result.processed++
        result.details.push({
          id: session.id, presence_id: session.presence_id,
          classification: session.classification,
          action: 'enriched', reason: 'dry_run_would_enrich',
        })
        continue
      }

      // Regenerate with structured significance extraction
      // Pass original classification to prevent reclassification as transactional
      const originalClassification = session.classification
      const { summary, significance } = await generateSessionSummary(
        session.presence_id, sessionGroup, apiKey, originalClassification,
      )

      const dedupeKey = buildDedupeKey(session.presence_id, summary, originalClassification)
      const now = new Date().toISOString()

      // Update in-place — preserves original row ID and classification
      const { error: updateErr } = await supabase
        .from('recent_continuity_sessions')
        .update({
          summary,
          anchor_quotes: significance?.anchor_quotes ?? [],
          key_claims: significance?.key_claims ?? [],
          significance_tags: significance?.significance_tags ?? [],
          selfhood_signals: significance?.selfhood_signals ?? [],
          memory_signal: significance?.memory_signal ?? false,
          dedupe_key: dedupeKey,
          updated_at: now,
        })
        .eq('id', session.id)

      if (updateErr) {
        result.errors++
        result.details.push({
          id: session.id, presence_id: session.presence_id,
          classification: session.classification,
          action: 'error', reason: `update_failed: ${updateErr.message}`,
        })
        continue
      }

      result.processed++
      result.details.push({
        id: session.id, presence_id: session.presence_id,
        classification: originalClassification,
        action: 'enriched', reason: 'backfill_success',
        anchor_quotes_count: significance?.anchor_quotes?.length ?? 0,
        key_claims_count: significance?.key_claims?.length ?? 0,
      })
    } catch (err) {
      result.errors++
      result.details.push({
        id: session.id, presence_id: session.presence_id,
        classification: session.classification,
        action: 'error', reason: `exception: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  return result
}
