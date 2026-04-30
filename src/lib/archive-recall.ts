// Phase 28A — Manual Archive Recall
// Server-side helper. Used by ari-chat and eli-chat routes.
// Enforces server-side access scope — never trust the client for scope decisions.
//
// Memory law:
//   Past Conversations  → never recalled (archive_sources not queried)
//   Extraction Drafts   → never recalled (archive_entry_drafts not queried)
//   Archive Entries     → recalled if recallable (canonical or canonical_candidate, in scope)
//
// Search: text match on title + excerpt + category + source_document (Phase 28A)
// No embeddings, no vector search, no graph — those are Phase 29+

import { createClient } from '@supabase/supabase-js'
import { CATEGORY_LABELS } from '@/lib/archives'

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
}

// ─── Trigger detection ────────────────────────────────────────────────────────

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

/**
 * Returns true if the message contains a manual recall trigger phrase.
 * Only the latest user message is checked — not full history.
 */
export function detectArchiveRecallIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return RECALL_TRIGGERS.some(trigger => lower.includes(trigger))
}

// ─── Query extraction ─────────────────────────────────────────────────────────

const QUERY_PATTERNS: RegExp[] = [
  /(?:search (?:your |the )?(?:archives?|velvet|violet)) for (.+)/i,
  /(?:recall|find) (.+?) (?:from|in) (?:archives?|your memories?|velvet|violet)/i,
  /(?:look in (?:velvet|violet|the archives?) for) (.+)/i,
  /(?:recall what we decided (?:about)?) (.+)/i,
  /(?:what do you remember from archives?) (?:about )?(.+)/i,
  /(?:search (?:velvet|violet)) (.+)/i,
]

/**
 * Extracts the search query from a recall-triggered message.
 * e.g. "search your archives for the naming thread" → "naming thread"
 * Falls back to the full message if extraction is ambiguous.
 */
export function extractRecallQuery(message: string): string {
  for (const pattern of QUERY_PATTERNS) {
    const match = message.match(pattern)
    if (match?.[1]) {
      return match[1].trim().replace(/[?.!]+$/, '').trim()
    }
  }
  // Fall back: strip trigger phrases and return remainder
  const lower = message.toLowerCase()
  for (const trigger of RECALL_TRIGGERS) {
    const idx = lower.indexOf(trigger)
    if (idx !== -1) {
      const after = message.slice(idx + trigger.length).trim().replace(/^[:\-–for ]+/, '').trim()
      if (after.length > 2) return after
    }
  }
  return message.trim()
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Extract meaningful search terms (>2 chars, skip stop words) */
function extractTerms(query: string): string[] {
  const STOP = new Set(['the', 'and', 'for', 'from', 'with', 'that', 'this', 'what', 'your'])
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 2 && !STOP.has(t))
}

interface RawArchiveItem {
  id: string
  title: string
  excerpt: string | null
  raw_content: string
  archive_name: string
  owner_presence: string
  source_origin: string
  visibility: string
  category: string
  canonical_status: string
  sensitivity: string
  source_document: string | null
  source_date: string | null
  import_label: string | null
  created_at: string
}

function scoreItem(item: RawArchiveItem, terms: string[]): number {
  if (terms.length === 0) return 1  // no terms → include everything

  let score = 0
  const title = item.title.toLowerCase()
  const excerpt = (item.excerpt ?? '').toLowerCase()
  const category = item.category.toLowerCase()
  const sourceDoc = (item.source_document ?? '').toLowerCase()
  const importLabel = (item.import_label ?? '').toLowerCase()
  // Only check first 3,000 chars of raw_content to keep scoring fast
  const rawSnippet = item.raw_content.slice(0, 3_000).toLowerCase()

  for (const term of terms) {
    if (title.includes(term)) score += 3
    if (excerpt.includes(term)) score += 2
    if (rawSnippet.includes(term)) score += 1
    if (category.includes(term)) score += 1
    if (sourceDoc.includes(term)) score += 1
    if (importLabel.includes(term)) score += 0.5
  }

  // Prefer canonical over canonical_candidate
  if (item.canonical_status === 'canonical') score += 0.5

  return score
}

function buildSnippet(item: RawArchiveItem, maxChars = 1_500): string {
  const source = item.excerpt?.trim() || item.raw_content.trim()
  return source.length > maxChars ? source.slice(0, maxChars) + '…' : source
}

// ─── Access scope guard ────────────────────────────────────────────────────────

function isInScope(item: RawArchiveItem, presenceId: 'ari' | 'eli'): boolean {
  if (presenceId === 'ari') {
    return (
      (item.archive_name === 'velvet' && ['ari_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house' && item.visibility === 'shared') ||
      (item.archive_name === 'violet' && item.visibility === 'shared')
    )
  } else {
    return (
      (item.archive_name === 'violet' && ['eli_only', 'shared'].includes(item.visibility)) ||
      (item.archive_name === 'house' && item.visibility === 'shared') ||
      (item.archive_name === 'velvet' && item.visibility === 'shared')
    )
  }
}

// ─── Main retrieval function ───────────────────────────────────────────────────

/**
 * Retrieves recallable archive entries for the given presence and query.
 * Server-side access scope is enforced. Returns top N entries.
 * Never queries archive_sources or archive_entry_drafts.
 */
export async function getRecallableArchiveEntries(
  presenceId: 'ari' | 'eli',
  query: string,
  limit = 5
): Promise<RecallEntry[]> {
  const supabase = getSupabase()
  const safeLimit = Math.min(Math.max(1, limit), 10)

  // Fetch all recallable candidates (small archive in Phase 28A)
  // archive_items only — never archive_sources or archive_entry_drafts
  const { data: raw, error } = await supabase
    .from('archive_items')
    .select(
      'id, title, excerpt, raw_content, archive_name, owner_presence, source_origin, ' +
      'visibility, category, canonical_status, sensitivity, source_document, source_date, ' +
      'import_label, created_at'
    )
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])
    .limit(200)   // generous ceiling; filtered & ranked below

  if (error || !raw) {
    console.error('[archive-recall] fetch error:', error?.message)
    return []
  }

  // Apply server-side access scope guard
  const inScope = (raw as unknown as RawArchiveItem[]).filter(item => isInScope(item, presenceId))

  // Score by query relevance
  const terms = extractTerms(query)
  const scored = inScope
    .map(item => ({ item, score: scoreItem(item, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // Tiebreak: canonical > candidate, then newer first
      if (a.item.canonical_status !== b.item.canonical_status) {
        return a.item.canonical_status === 'canonical' ? -1 : 1
      }
      return new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
    })
    .slice(0, safeLimit)

  // If no scored results and query terms are present, return nothing
  // If no terms (bare trigger phrase), return top N by canonicality + recency
  const candidates = scored.length > 0
    ? scored.map(({ item }) => item)
    : (terms.length === 0
        ? inScope
            .sort((a, b) => {
              if (a.canonical_status !== b.canonical_status) {
                return a.canonical_status === 'canonical' ? -1 : 1
              }
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            })
            .slice(0, safeLimit)
        : [])

  // Build RecallEntry shape — never expose full raw_content
  return candidates.map(item => ({
    id: item.id,
    title: item.title,
    excerpt: item.excerpt,
    content_snippet: buildSnippet(item),
    archive_name: item.archive_name as RecallEntry['archive_name'],
    owner_presence: item.owner_presence,
    source_origin: item.source_origin,
    visibility: item.visibility,
    category: item.category,
    canonical_status: item.canonical_status,
    sensitivity: item.sensitivity,
    source_document: item.source_document,
    source_date: item.source_date,
  }))
}

// ─── Prompt format helpers ─────────────────────────────────────────────────────

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house: 'House',
}

const STATUS_DISPLAY: Record<string, string> = {
  canonical: 'Memory',
  canonical_candidate: 'Memory candidate',
}

const CATEGORY_DISPLAY = CATEGORY_LABELS

const MAX_RECALL_CONTEXT_CHARS = 8_000

/**
 * Formats retrieved entries into a bounded prompt context block.
 * Hard cap: 8,000 characters total injected context.
 */
export function formatArchiveRecallContext(
  presenceId: 'ari' | 'eli',
  query: string,
  entries: RecallEntry[]
): string {
  const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'

  if (entries.length === 0) {
    return `\nARCHIVE RECALL CONTEXT
Presence: ${presenceName}
Query: "${query}"
No recallable archive entries found matching this query.
Instruction: Say clearly that no matching archive material was found in the archive.
You may still answer from current chat context if useful, but you must clearly
separate that from archive recall. Do not invent archive entries.\n`
  }

  const header = `\nARCHIVE RECALL CONTEXT
Presence: ${presenceName}
Query: "${query}"
Entries retrieved: ${entries.length}\n\n`

  const footer = `\nInstruction: Use recalled Archive Entries only as grounded continuity context.
Do not claim access to raw conversations unless supplied.
If recall is partial or incomplete, say so plainly.
Do not invent missing archive details.
Memory candidate items are not fully approved — represent them accurately.\n`

  let body = ''
  let bodyChars = 0
  const budgetForBody = MAX_RECALL_CONTEXT_CHARS - header.length - footer.length

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const archiveLabel = ARCHIVE_DISPLAY[e.archive_name] ?? e.archive_name
    const statusLabel = STATUS_DISPLAY[e.canonical_status] ?? e.canonical_status
    const categoryLabel = CATEGORY_DISPLAY[e.category as keyof typeof CATEGORY_DISPLAY] ?? e.category

    const sourceStr = [e.source_document, e.source_date].filter(Boolean).join(' — ')

    const snippet = e.content_snippet
    // Truncate snippet to fit remaining budget
    const entryHeader = `${i + 1}. Title: ${e.title}
   Archive: ${archiveLabel}
   Status: ${statusLabel}
   Category: ${categoryLabel}
   Sensitivity: ${e.sensitivity}
${sourceStr ? `   Source: ${sourceStr}\n` : ''}   Content: `

    const remainingBudget = budgetForBody - bodyChars - entryHeader.length - 2 // 2 for \n\n
    if (remainingBudget < 50) break  // not enough room for meaningful content

    const snippetTruncated = snippet.length > remainingBudget
      ? snippet.slice(0, remainingBudget - 1) + '…'
      : snippet

    body += entryHeader + snippetTruncated + '\n\n'
    bodyChars += entryHeader.length + snippetTruncated.length + 2

    if (bodyChars >= budgetForBody) break
  }

  return header + body + footer
}
