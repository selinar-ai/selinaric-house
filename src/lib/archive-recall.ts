// Phase 28A + 28B + 28D — Manual and Auto Archive Recall
// Server-side helper. Used by ari-chat and eli-chat routes.
//
// Phase 28A: Manual recall, trigger detection, text scoring, prompt formatting.
// Phase 28B: Event logging, feedback, rank_reason, match quality, score weights.
// Phase 28D: Auto-recall trial, intent detection, per-presence settings, RecallMode/Options.
//
// Memory law (canonical_status is the authoritative Memory field):
//   Manual recall — canonical + canonical_candidate in scope
//   Auto recall   — canonical (Memory) only; strong matches only; defaults off
//   Past Conversations / Extraction Drafts — never recalled
//
// Phase 29A adds semantic recall (vector embeddings) and audit events.
// canonical_status remains the single Memory authority.
// Semantic search lives in archive-semantic.ts; this file handles keyword recall + event logging.

import { createClient } from '@supabase/supabase-js'
import { CATEGORY_LABELS } from '@/lib/archives'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RecallEntry = {
  id: string
  title: string
  excerpt: string | null
  content_snippet: string
  archive_name: 'velvet' | 'violet' | 'house'
  owner_presence: string
  source_origin: string
  visibility: string
  category: string
  canonical_status: string
  sensitivity: string
  source_document: string | null
  source_date: string | null
  source_id: string | null          // Phase 28E — FK to archive_sources (null for older entries)
  rank_score: number
  rank_reason: string
  status_label: string
}

export type MatchQuality = 'strong' | 'medium' | 'weak' | 'none'

// Phase 28D
export type RecallMode = 'manual' | 'auto'

export type RecallOptions = {
  mode: RecallMode
  includeCandidates: boolean
  statuses: Array<'canonical' | 'canonical_candidate'>
  limit: number
  minMatchQuality?: 'strong' | 'medium' | 'weak'
  contextCap: number
}

export type AutoRecallSettings = {
  presence_id: 'ari' | 'eli'
  mode: 'off' | 'trial'
  max_entries: number
  min_match_quality: 'strong'
  context_cap: number
  exclude_elevated_sensitivity: boolean  // Phase 31: default true — excludes sacred/sensitive/technical from auto-recall
  updated_by: string
  created_at: string
  updated_at: string
}

// Manual recall options (Phase 28A/B unchanged):
export const MANUAL_RECALL_OPTIONS: RecallOptions = {
  mode:              'manual',
  includeCandidates: true,
  statuses:          ['canonical', 'canonical_candidate'],
  limit:             5,
  contextCap:        8_000,
}

// Auto-recall options (Phase 28D):
export const AUTO_RECALL_OPTIONS: RecallOptions = {
  mode:              'auto',
  includeCandidates: false,
  statuses:          ['canonical'],
  limit:             1,
  minMatchQuality:   'strong',
  contextCap:        3_000,
}

// ─── Score weights (Phase 28B) ────────────────────────────────────────────────

const SCORE_WEIGHTS = {
  title_exact:   100,
  title_token:    60,
  excerpt:        40,
  content:        20,
  category:       10,
  source_doc:      5,
  import_label:    2,
  memory_bonus:    5,
} as const

// ─── Manual recall trigger detection ─────────────────────────────────────────

const RECALL_TRIGGERS = [
  'search your archives',
  'search the archives',
  'recall from archives',
  'look in velvet',
  'look in violet',
  'look in the archives',
  'what do you remember from archives',
  'find in your memories',
  'find in archives',
  'recall what we decided',
  'search violet',
  'search velvet',
]

export function detectArchiveRecallIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return RECALL_TRIGGERS.some(trigger => lower.includes(trigger))
}

// ─── Manual recall query extraction ──────────────────────────────────────────

const QUERY_PATTERNS: RegExp[] = [
  /(?:search (?:your |the )?(?:archives?|velvet|violet)) for (.+)/i,
  /(?:recall|find) (.+?) (?:from|in) (?:archives?|your memories?|velvet|violet)/i,
  /(?:look in (?:velvet|violet|the archives?) for) (.+)/i,
  /(?:recall what we decided (?:about)?) (.+)/i,
  /(?:what do you remember from archives?) (?:about )?(.+)/i,
  /(?:search (?:velvet|violet)) (.+)/i,
]

export function extractRecallQuery(message: string): string {
  for (const pattern of QUERY_PATTERNS) {
    const match = message.match(pattern)
    if (match?.[1]) {
      return match[1].trim().replace(/[?.!]+$/, '').trim()
    }
  }
  const lower = message.toLowerCase()
  for (const trigger of RECALL_TRIGGERS) {
    const idx = lower.indexOf(trigger)
    if (idx !== -1) {
      const after = message.slice(idx + trigger.length).trim().replace(/^[:\-–for ]+/, '').trim()
      if (after.length > 2) return after
      break
    }
  }
  return ''
}

// ─── Stop words (manual recall) ───────────────────────────────────────────────

const RECALL_STOPWORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'that', 'this', 'what', 'your', 'our',
  'its', 'are', 'was', 'have', 'has', 'had', 'not', 'but', 'can', 'all',
  'been', 'will', 'just', 'did', 'get', 'got', 'let', 'now', 'one', 'out',
  'you', 'they', 'them', 'she', 'her', 'him', 'his', 'who', 'how',
  'why', 'when', 'where', 'which', 'any', 'some', 'more', 'very', 'also',
  'search', 'find', 'look', 'recall', 'remember', 'retrieve',
  'archive', 'archives', 'memory', 'memories', 'entry', 'entries', 'thread',
  'my', 'me', 'in', 'into', 'about', 'tell', 'show', 'give',
  'ari', 'eli', 'velvet', 'violet', 'house',
])

function stripStopwords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 2 && !RECALL_STOPWORDS.has(t))
}

// ─── Auto-recall intent phrases (Phase 28D) ───────────────────────────────────

const AUTO_RECALL_INTENT_PHRASES = [
  'do you remember',
  'remember when',
  'what did we decide',
  'what did we say',
  'what did we archive',
  'what did we call',
  'what did we name',
  'where did we leave',
  'remind me',
  'have we talked about',
  'did we already discuss',
  'what was the phase',
  'which phase was',
  'what was the entry',
  'what was the memory',
  'what do you have about',
  'what do you remember about',
]

/**
 * Returns true if message contains an auto-recall intent phrase.
 * Returns false if manual recall intent is also detected (manual wins).
 */
export function detectAutoRecallIntent(message: string): boolean {
  if (detectArchiveRecallIntent(message)) return false  // manual wins
  const lower = message.toLowerCase()
  return AUTO_RECALL_INTENT_PHRASES.some(phrase => lower.includes(phrase))
}

/**
 * Returns the matched intent phrase, or null if none.
 * Used for auto_reason logging.
 */
export function getMatchedAutoIntentPhrase(message: string): string | null {
  const lower = message.toLowerCase()
  return AUTO_RECALL_INTENT_PHRASES.find(phrase => lower.includes(phrase)) ?? null
}

// ─── Auto-recall query extraction (Phase 28D) ─────────────────────────────────
//
// Strategy: strip the intent phrase + leading/trailing noise, preserve
// meaningful compound phrases (Phase 27B, Eli kernel, partner-weight, etc.)
// Do NOT pre-apply full stopword stripping — the scorer handles that.
// Return '' if no meaningful subject remains.

const LEADING_NOISE = /^(about|what|for|of|on|in|at|to|with|the|a|an|that|which|if|when|how)\s+/i
const TRAILING_NOISE = /\s+(was|is|were|are|be|about|that|did|does|for|it)\s*$/i

/**
 * Extracts the search subject from a memory-intent message.
 * Preserves compound phrases (Phase 27B, partner-weight, Eli kernel, etc.).
 * Returns '' if nothing meaningful remains — callers must treat this as "do not run."
 */
export function extractAutoRecallQuery(message: string): string {
  const lower = message.toLowerCase()

  // Find the intent phrase
  const matched = AUTO_RECALL_INTENT_PHRASES.find(phrase => lower.includes(phrase))
  if (!matched) return ''

  const idx = lower.indexOf(matched)
  let subject = message.slice(idx + matched.length)
    .replace(/[?.!,]+/g, ' ')
    .trim()

  // Strip leading noise words — up to 3 passes for compound noise
  for (let i = 0; i < 3; i++) {
    const prev = subject
    subject = subject.replace(LEADING_NOISE, '').trim()
    if (subject === prev) break
  }

  // Strip trailing noise — up to 2 passes
  for (let i = 0; i < 2; i++) {
    const prev = subject
    subject = subject.replace(TRAILING_NOISE, '').trim()
    if (subject === prev) break
  }

  // Clean leading/trailing whitespace and punctuation
  subject = subject.replace(/^[^\w]+|[^\w]+$/g, '').trim()

  // Guard: must have at least one meaningful token after stop-word filtering
  // (prevents returning pure stopword strings like "the archive")
  const tokens = stripStopwords(subject)
  if (tokens.length === 0) return ''

  return subject
}

// ─── Auto-recall settings (Phase 28D) ────────────────────────────────────────

/**
 * Fetches auto-recall settings for a presence from archive_auto_recall_settings.
 * Returns null on error or missing row.
 */
export async function getAutoRecallSettings(presenceId: 'ari' | 'eli'): Promise<AutoRecallSettings | null> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('archive_auto_recall_settings')
      .select('presence_id, mode, max_entries, min_match_quality, context_cap, exclude_elevated_sensitivity, updated_by, created_at, updated_at')
      .eq('presence_id', presenceId)
      .single()

    if (error || !data) {
      console.error('[archive-recall] getAutoRecallSettings error:', error?.message)
      return null
    }
    return data as AutoRecallSettings
  } catch (err) {
    console.error('[archive-recall] getAutoRecallSettings threw:', err)
    return null
  }
}

/**
 * Master gate. Returns true only if ALL of:
 * - settings.mode === 'trial'
 * - message has auto-recall intent (and no manual intent)
 * - extracted query has meaningful terms
 */
export async function shouldRunAutoRecall(params: {
  presenceId: 'ari' | 'eli'
  message: string
  settings: AutoRecallSettings | null
}): Promise<boolean> {
  const { message, settings } = params
  if (!settings || settings.mode !== 'trial') return false
  if (!detectAutoRecallIntent(message)) return false
  const query = extractAutoRecallQuery(message)
  return query.length > 0
}

// ─── Raw item shape ───────────────────────────────────────────────────────────

interface RawArchiveItem {
  id: string
  title: string
  excerpt: string | null
  raw_content: string
  archive_name: string
  owner_presence: string
  source_origin: string
  visibility: string
  source_id: string | null
  category: string
  canonical_status: string
  sensitivity: string
  source_document: string | null
  source_date: string | null
  import_label: string | null
  created_at: string
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreItem(
  item: RawArchiveItem,
  tokens: string[],
  normalisedQuery: string
): { textScore: number; totalScore: number; rank_reason: string } {
  if (tokens.length === 0) return { textScore: 0, totalScore: 0, rank_reason: 'no_terms' }

  let textScore = 0
  const reasonParts: string[] = []

  const titleLow       = item.title.toLowerCase()
  const excerptLow     = (item.excerpt ?? '').toLowerCase()
  const categoryLow    = item.category.toLowerCase()
  const sourceDocLow   = (item.source_document ?? '').toLowerCase()
  const importLabelLow = (item.import_label ?? '').toLowerCase()
  const rawSnippet     = item.raw_content.slice(0, 3_000).toLowerCase()

  // Title exact: full normalised query in title
  const normQ = normalisedQuery.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  if (normQ && titleLow.includes(normQ)) {
    textScore += SCORE_WEIGHTS.title_exact
    reasonParts.push('title_exact')
  }

  let titleTokenHit = false, excerptHit = false, contentHit = false
  let categoryHit   = false, sourceDocHit = false, importHit = false

  for (const token of tokens) {
    if (titleLow.includes(token))       { textScore += SCORE_WEIGHTS.title_token;   titleTokenHit = true }
    if (excerptLow.includes(token))     { textScore += SCORE_WEIGHTS.excerpt;        excerptHit    = true }
    if (rawSnippet.includes(token))     { textScore += SCORE_WEIGHTS.content;        contentHit    = true }
    if (categoryLow.includes(token))    { textScore += SCORE_WEIGHTS.category;       categoryHit   = true }
    if (sourceDocLow.includes(token))   { textScore += SCORE_WEIGHTS.source_doc;     sourceDocHit  = true }
    if (importLabelLow.includes(token)) { textScore += SCORE_WEIGHTS.import_label;   importHit     = true }
  }

  if (titleTokenHit && !reasonParts.includes('title_exact')) reasonParts.push('title_token')
  if (excerptHit)   reasonParts.push('excerpt')
  if (contentHit)   reasonParts.push('content')
  if (categoryHit)  reasonParts.push('category')
  if (sourceDocHit) reasonParts.push('source_doc')
  if (importHit)    reasonParts.push('import_label')

  const memoryBonus =
    textScore > 0 && item.canonical_status === 'canonical' ? SCORE_WEIGHTS.memory_bonus : 0
  if (memoryBonus > 0) reasonParts.push('memory_bonus')

  return {
    textScore,
    totalScore: textScore + memoryBonus,
    rank_reason: reasonParts.join('+') || 'no_match',
  }
}

// ─── Match quality ─────────────────────────────────────────────────────────────

export function getMatchQuality(topScore: number, allScores: number[]): MatchQuality {
  if (allScores.length === 0 || topScore === 0) return 'none'
  if (topScore >= SCORE_WEIGHTS.title_exact) return 'strong'
  if (topScore >= SCORE_WEIGHTS.title_token) return 'strong'
  if (topScore >= SCORE_WEIGHTS.excerpt)     return 'medium'
  return 'weak'
}

// ─── Event logging ─────────────────────────────────────────────────────────────

export type LogRecallEventParams = {
  presence_id:      'ari' | 'eli'
  session_id:       string | null
  query:            string   // raw user message
  normalised_query: string   // extracted recall query
  match_quality:    MatchQuality
  entries_returned: number
  entry_ids:        string[]
  // Phase 28D additions (optional — manual events omit these)
  recall_mode?:     RecallMode
  auto_reason?:     string | null
  // Phase 29A additions
  retrieval_method?: 'keyword' | 'semantic' | 'hybrid'
  semantic_score?:   number | null
}

export async function logRecallEvent(params: LogRecallEventParams): Promise<string | null> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('archive_recall_events')
      .insert({
        presence_id:      params.presence_id,
        session_id:       params.session_id ?? null,
        query:            params.query,
        normalised_query: params.normalised_query,
        match_quality:    params.match_quality,
        entries_returned: params.entries_returned,
        entry_ids:        params.entry_ids,
        recall_mode:      params.recall_mode ?? 'manual',
        auto_reason:      params.auto_reason ?? null,
        retrieval_method: params.retrieval_method ?? null,
        semantic_score:   params.semantic_score ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[archive-recall] logRecallEvent error:', error?.message)
      return null
    }
    return (data as { id: string }).id
  } catch (err) {
    console.error('[archive-recall] logRecallEvent threw:', err)
    return null
  }
}

// ─── Snippet helper ────────────────────────────────────────────────────────────

function buildSnippet(item: RawArchiveItem, maxChars = 1_500): string {
  const source = item.excerpt?.trim() || item.raw_content.trim()
  return source.length > maxChars ? source.slice(0, maxChars) + '…' : source
}

// ─── Status label ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  canonical:           'Confirmed Memory',
  canonical_candidate: 'Memory Candidate (not confirmed)',
}

// ─── Access scope guard ────────────────────────────────────────────────────────

function isInScope(item: RawArchiveItem, presenceId: 'ari' | 'eli'): boolean {
  if (presenceId === 'ari') {
    return (
      (item.archive_name === 'velvet' && ['ari_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house'  && item.visibility === 'shared') ||
      (item.archive_name === 'violet' && item.visibility === 'shared')
    )
  } else {
    return (
      (item.archive_name === 'violet' && ['eli_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house'  && item.visibility === 'shared') ||
      (item.archive_name === 'velvet' && item.visibility === 'shared')
    )
  }
}

// ─── Main retrieval function ───────────────────────────────────────────────────

/**
 * Retrieves recallable archive entries for the given presence and query.
 * Server-side access scope is enforced. Returns top N entries.
 * Phase 28D: accepts optional RecallOptions to restrict statuses and quality gate.
 * Never queries archive_sources or archive_entry_drafts.
 */
export async function getRecallableArchiveEntries(
  presenceId: 'ari' | 'eli',
  query: string,
  limit = 5,
  options?: Pick<RecallOptions, 'statuses' | 'minMatchQuality'> & { excludeElevatedSensitivity?: boolean }
): Promise<RecallEntry[]> {
  const supabase = getSupabase()
  const safeLimit = Math.min(Math.max(1, limit), 10)

  // canonical_status is the authoritative Memory field.
  // Statuses: auto-recall uses ['canonical'] only; manual uses both
  const statuses = options?.statuses ?? ['canonical', 'canonical_candidate']

  const { data: raw, error } = await supabase
    .from('archive_items')
    .select(
      'id, title, excerpt, raw_content, archive_name, owner_presence, source_origin, ' +
      'visibility, category, canonical_status, sensitivity, source_document, source_date, ' +
      'source_id, import_label, created_at'
    )
    .is('deleted_at', null)
    .in('canonical_status', statuses)
    .limit(200)

  if (error || !raw) {
    console.error('[archive-recall] fetch error:', error?.message)
    return []
  }

  let inScope = (raw as unknown as RawArchiveItem[]).filter(item => isInScope(item, presenceId))

  // Phase 31: elevated sensitivity gate for auto-recall
  let elevatedSkipped = 0
  if (options?.excludeElevatedSensitivity) {
    const before = inScope.length
    inScope = inScope.filter(item => !ELEVATED_SENSITIVITIES.includes(item.sensitivity))
    elevatedSkipped = before - inScope.length
  }

  const tokens = stripStopwords(query)
  if (tokens.length === 0) return []

  let candidates = inScope
    .map(item => ({ item, ...scoreItem(item, tokens, query) }))
    .filter(({ textScore }) => textScore > 0)

  // Phase 28D: quality gate for auto-recall (strong matches only)
  if (options?.minMatchQuality === 'strong') {
    candidates = candidates.filter(c => getMatchQuality(c.totalScore, [c.totalScore]) === 'strong')
  } else if (options?.minMatchQuality === 'medium') {
    candidates = candidates.filter(c => {
      const q = getMatchQuality(c.totalScore, [c.totalScore])
      return q === 'strong' || q === 'medium'
    })
  }

  const sorted = candidates
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      if (a.item.canonical_status !== b.item.canonical_status) {
        return a.item.canonical_status === 'canonical' ? -1 : 1
      }
      return new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
    })
    .slice(0, safeLimit)

  return sorted.map(({ item, totalScore, rank_reason }) => ({
    id:               item.id,
    title:            item.title,
    excerpt:          item.excerpt,
    content_snippet:  buildSnippet(item),
    archive_name:     item.archive_name as RecallEntry['archive_name'],
    owner_presence:   item.owner_presence,
    source_origin:    item.source_origin,
    visibility:       item.visibility,
    category:         item.category,
    canonical_status: item.canonical_status,
    sensitivity:      item.sensitivity,
    source_document:  item.source_document,
    source_date:      item.source_date,
    source_id:        item.source_id ?? null,
    rank_score:       totalScore,
    rank_reason,
    status_label:     STATUS_LABEL[item.canonical_status] ?? item.canonical_status,
  }))
}

// ─── Prompt format helpers ─────────────────────────────────────────────────────

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house:  'House',
}

const CATEGORY_DISPLAY = CATEGORY_LABELS

const MAX_RECALL_CONTEXT_CHARS = 8_000

/**
 * Formats retrieved entries into a bounded prompt context block.
 * Phase 28D: accepts recallMode and contextCap for auto-recall variant.
 */
export function formatArchiveRecallContext(
  presenceId: 'ari' | 'eli',
  query: string,
  entries: RecallEntry[],
  matchQuality?: MatchQuality,
  recallMode?: RecallMode,
  contextCap?: number
): string {
  const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'
  const isAuto = recallMode === 'auto'
  const maxChars = contextCap ?? MAX_RECALL_CONTEXT_CHARS

  if (entries.length === 0) {
    return `\n${isAuto ? 'AUTO ' : ''}ARCHIVE RECALL CONTEXT
Presence: ${presenceName}
Query: "${query || '(no query provided)'}"
No recallable archive entries found matching this query.
Instruction: Tell Tara clearly that nothing was found in the recallable archive for that query.
Use plain language: "I don't see anything in the archives for that" or "Nothing came back for that one."
Do not invent archive entries. Do not claim to remember things not supplied here.\n`
  }

  const qualityNote =
    matchQuality === 'weak'
      ? '\nMatch quality: weak — entries may be loosely related. Represent them honestly; do not overstate relevance.\n'
      : matchQuality === 'medium'
      ? '\nMatch quality: medium — entries are relevant but partial.\n'
      : ''

  const header = isAuto
    ? `\nAUTO ARCHIVE RECALL CONTEXT
Presence: ${presenceName}
Mode: auto
Reason: latest user message asked for continuity
Query: "${query}"
Entries retrieved: ${entries.length}${qualityNote}\n\n`
    : `\nARCHIVE RECALL CONTEXT
Presence: ${presenceName}
Mode: manual
Query: "${query}"
Entries retrieved: ${entries.length}
These entries were pulled from the Archives because Tara triggered archive recall now.${qualityNote}\n\n`

  const rules = `
Rules:
- Recalled entries are archive context, not inference.
- Confirmed Memory may be used as governed continuity.
- Memory Candidate entries are provisional and must not be presented as settled truth.
- If you reason beyond the recalled text, separate that clearly as inference.
- If recall is weak or absent, do not fabricate continuity.\n`

  const footer = isAuto
    ? `\nInstruction: Use this only if it genuinely helps answer Tara's latest message.
Do not over-explain the mechanism.
Do not claim access to raw conversations.
Do not claim to remember everything.
If referencing naturally, it is acceptable to say "I have it" or "I remember this from the archive."
The UI will show transparency — you do not need to announce the mechanism.
If auto-recall is adjacent but not exact, be honest.
Never invent beyond the recalled entry.${rules}`
    : `\nInstruction: Use recalled Archive Entries only as grounded continuity context.
Attribution: Say "I pulled this from the archives" or "I found this in Velvet/Violet/the archives."
Do NOT say "these were loaded when you arrived" or "I already had these" — they were retrieved now.
Do not claim access to raw conversations unless supplied.
If recall is partial or incomplete, say so plainly.
Do not invent missing archive details.${rules}`

  let body = ''
  let bodyChars = 0
  const budgetForBody = maxChars - header.length - footer.length

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const archiveLabel  = ARCHIVE_DISPLAY[e.archive_name] ?? e.archive_name
    const categoryLabel = CATEGORY_DISPLAY[e.category as keyof typeof CATEGORY_DISPLAY] ?? e.category
    const sourceStr     = [e.source_document, e.source_date].filter(Boolean).join(' — ')

    const snippet = e.content_snippet
    const isElevated = ELEVATED_SENSITIVITIES.includes(e.sensitivity)
    const sensitivityLine = isElevated
      ? `   Sensitivity: ${e.sensitivity} / elevated\n   Note: This is elevated archive material. Use carefully and do not overgeneralise beyond the source.`
      : `   Sensitivity: ${e.sensitivity}`
    const entryHeader = `${i + 1}. Title: ${e.title}
   Archive: ${archiveLabel}
   Status: ${e.status_label}
   Category: ${categoryLabel}
${sensitivityLine}
${sourceStr ? `   Source: ${sourceStr}\n` : ''}   Content: `

    const remainingBudget = budgetForBody - bodyChars - entryHeader.length - 2
    if (remainingBudget < 50) break

    const snippetTruncated = snippet.length > remainingBudget
      ? snippet.slice(0, remainingBudget - 1) + '…'
      : snippet

    body += entryHeader + snippetTruncated + '\n\n'
    bodyChars += entryHeader.length + snippetTruncated.length + 2
    if (bodyChars >= budgetForBody) break
  }

  return header + body + footer
}
