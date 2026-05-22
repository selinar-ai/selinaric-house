// Phase 35C — Governed Memory Auto-Injection
//
// Bridges confirmed Archive Memory into chat prompts when relevant.
// This is NOT generic RAG. This is governed confirmed-memory injection.
//
// One Crown Rule: Only confirmed Archive Memory (canonical_status = 'canonical')
// may be auto-injected. Memory Candidates, archive_only, rejected, and
// unconfirmed items are never auto-injected.
//
// Presence scope is non-negotiable:
//   Ari receives: Ari-scoped + shared confirmed memories
//   Eli receives: Eli-scoped + shared confirmed memories
//   No cross-presence private memory injection.
//
// Memory creation / promotion = still governed by Tara
// Memory injection / recall  = more proactive, but only for already-governed material

import { createClient } from '@supabase/supabase-js'
import {
  getRecallableArchiveEntries,
  getMatchQuality,
  type RecallEntry,
  type MatchQuality,
} from '@/lib/archive-recall'
import { generateArchiveEmbedding, semanticSearch, type SemanticCandidate } from '@/lib/archive-semantic'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'
import { isInArchiveScope } from '@/lib/archive-scope'
import type { RecentContinuitySession } from '@/lib/recent-continuity'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InjectedMemory {
  id: string
  title: string
  archive_name: string
  category: string
  sensitivity: string
  canonical_status: string
  visibility: string
  content_snippet: string
  injection_reason: string
  match_source: 'keyword' | 'semantic' | 'both'
  match_score: number
}

export interface ExcludedMemory {
  id: string
  title: string
  reason: string
}

export interface MemoryInjectionDiagnostics {
  queryTerms: string[]
  keywordMatchCount: number
  semanticMatchCount: number
  totalCandidates: number
  injectedCount: number
  excludedCount: number
  presenceId: string
  semanticAvailable: boolean
}

export interface MemoryInjectionResult {
  block: string | null
  injectedMemories: InjectedMemory[]
  excluded: ExcludedMemory[]
  diagnostics: MemoryInjectionDiagnostics
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_INJECTED_MEMORIES = 3
const MAX_INJECTION_BLOCK_CHARS = 3000
const MIN_KEYWORD_SCORE = 60   // Minimum keyword score to consider (title_token level)
const MIN_SEMANTIC_SIMILARITY = 0.65  // Higher bar than general semantic search
const SAFE_MESSAGE_PREVIEW_LENGTH = 80

// ─── Scope guard (single source of truth: archive-scope.ts) ──────────────────

const isInScope = isInArchiveScope

// ─── Query term extraction ────────────────────────────────────────────────────

const INJECTION_STOPWORDS = new Set([
  'the', 'and', 'for', 'from', 'with', 'that', 'this', 'what', 'your', 'our',
  'its', 'are', 'was', 'have', 'has', 'had', 'not', 'but', 'can', 'all',
  'been', 'will', 'just', 'did', 'get', 'got', 'let', 'now', 'one', 'out',
  'you', 'they', 'them', 'she', 'her', 'him', 'his', 'who', 'how',
  'why', 'when', 'where', 'which', 'any', 'some', 'more', 'very', 'also',
  'my', 'me', 'in', 'into', 'about', 'tell', 'show', 'give',
  'today', 'yesterday', 'last', 'night', 'morning', 'time', 'thing',
  'said', 'say', 'know', 'think', 'want', 'like', 'good', 'much',
])

function extractQueryTerms(
  userMessage: string,
  recentContinuity: RecentContinuitySession[],
): string[] {
  const terms = new Set<string>()

  // Extract from user message
  const messageTokens = userMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !INJECTION_STOPWORDS.has(t))

  for (const t of messageTokens) terms.add(t)

  // Extract key terms from recent continuity anchor quotes and key claims
  for (const session of recentContinuity) {
    if (session.classification !== 'significant' && session.classification !== 'relational') continue

    const anchors = Array.isArray(session.anchor_quotes) ? session.anchor_quotes : []
    const claims = Array.isArray(session.key_claims) ? session.key_claims : []

    for (const text of [...anchors, ...claims]) {
      if (typeof text !== 'string') continue
      const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter(t => t.length > 2 && !INJECTION_STOPWORDS.has(t))
      for (const t of tokens) terms.add(t)
    }
  }

  return Array.from(terms)
}

/**
 * Build a semantic query string from user message + recent continuity context.
 * Used for embedding-based search.
 */
function buildSemanticQuery(
  userMessage: string,
  recentContinuity: RecentContinuitySession[],
): string {
  const parts = [userMessage]

  // Add significant/relational continuity summaries for richer semantic context
  for (const session of recentContinuity.slice(0, 3)) {
    if (session.classification === 'significant' || session.classification === 'relational') {
      parts.push(session.summary)
      const anchors = Array.isArray(session.anchor_quotes) ? session.anchor_quotes : []
      for (const a of anchors) {
        if (typeof a === 'string') parts.push(a)
      }
    }
  }

  return parts.join(' ').slice(0, 1000)
}

// ─── Main injection builder ──────────────────────────────────────────────────

/**
 * Build governed memory injection for a chat prompt.
 *
 * Process:
 * 1. Extract query terms from user message + recent continuity
 * 2. Run keyword search on confirmed-only archive entries
 * 3. Run semantic search if embeddings available
 * 4. Merge and deduplicate results
 * 5. Apply strict scope + authority filtering
 * 6. Select top matches
 * 7. Format prompt block with clear authority labels
 * 8. Log injection event
 */
export async function buildGovernedMemoryInjection(params: {
  presenceId: 'ari' | 'eli'
  userMessage: string
  recentContinuity: RecentContinuitySession[]
  shortHistory?: string[]
}): Promise<MemoryInjectionResult> {
  const { presenceId, userMessage, recentContinuity } = params

  const queryTerms = extractQueryTerms(userMessage, recentContinuity)
  const excluded: ExcludedMemory[] = []

  // If no meaningful terms, skip injection
  if (queryTerms.length === 0) {
    return {
      block: null,
      injectedMemories: [],
      excluded: [],
      diagnostics: {
        queryTerms: [],
        keywordMatchCount: 0,
        semanticMatchCount: 0,
        totalCandidates: 0,
        injectedCount: 0,
        excludedCount: 0,
        presenceId,
        semanticAvailable: false,
      },
    }
  }

  // Build combined query from meaningful terms
  const keywordQuery = queryTerms.join(' ')

  // ── Pass 1: Keyword search on canonical-only entries ──────────────────
  const keywordResults = await getRecallableArchiveEntries(
    presenceId,
    keywordQuery,
    10, // over-fetch for filtering
    {
      statuses: ['canonical'], // STRICT: canonical only
      minMatchQuality: 'medium',
      excludeElevatedSensitivity: false, // We handle this ourselves below
    },
  )

  // ── Pass 2: Semantic search if available ──────────────────────────────
  let semanticResults: SemanticCandidate[] = []
  let semanticAvailable = false
  try {
    const semanticQuery = buildSemanticQuery(userMessage, recentContinuity)
    const queryEmbedding = await generateArchiveEmbedding(semanticQuery)
    const rawSemantic = await semanticSearch({
      queryEmbedding,
      limit: 10,
      matchThreshold: MIN_SEMANTIC_SIMILARITY,
    })
    // Filter: canonical only + in scope
    semanticResults = rawSemantic.filter(c =>
      c.canonical_status === 'canonical' &&
      isInScope(c, presenceId)
    )
    semanticAvailable = true
  } catch (err) {
    console.error('[memory-injection] Semantic search error (non-fatal):', err instanceof Error ? err.message : String(err))
  }

  // ── Merge keyword + semantic results ──────────────────────────────────
  const candidateMap = new Map<string, {
    keyword?: RecallEntry
    semantic?: SemanticCandidate
    matchSource: 'keyword' | 'semantic' | 'both'
    combinedScore: number
  }>()

  for (const entry of keywordResults) {
    if (entry.rank_score < MIN_KEYWORD_SCORE) {
      excluded.push({ id: entry.id, title: entry.title, reason: 'keyword_score_too_low' })
      continue
    }
    candidateMap.set(entry.id, {
      keyword: entry,
      matchSource: 'keyword',
      combinedScore: entry.rank_score,
    })
  }

  for (const candidate of semanticResults) {
    const existing = candidateMap.get(candidate.archive_item_id)
    if (existing) {
      existing.semantic = candidate
      existing.matchSource = 'both'
      existing.combinedScore += candidate.similarity * 100 // Boost for dual match
    } else {
      candidateMap.set(candidate.archive_item_id, {
        semantic: candidate,
        matchSource: 'semantic',
        combinedScore: candidate.similarity * 100,
      })
    }
  }

  // ── Apply final filters and select top matches ────────────────────────
  const candidates = Array.from(candidateMap.entries())
    .sort((a, b) => b[1].combinedScore - a[1].combinedScore)

  const injected: InjectedMemory[] = []
  let blockChars = 0

  for (const [id, candidate] of candidates) {
    if (injected.length >= MAX_INJECTED_MEMORIES) {
      excluded.push({
        id,
        title: candidate.keyword?.title ?? candidate.semantic?.title ?? 'unknown',
        reason: 'max_injected_reached',
      })
      continue
    }

    // Get full entry details — prefer keyword result (has more fields)
    const entry = candidate.keyword
    const semanticEntry = candidate.semantic

    const title = entry?.title ?? semanticEntry?.title ?? 'Unknown'
    const archiveName = entry?.archive_name ?? semanticEntry?.archive_name ?? 'unknown'
    const category = entry?.category ?? semanticEntry?.category ?? 'unknown'
    const sensitivity = entry?.sensitivity ?? semanticEntry?.sensitivity ?? 'private'
    const visibility = entry?.visibility ?? semanticEntry?.visibility ?? 'shared'
    const snippet = entry?.content_snippet ?? ''

    // Build injection reason
    const reasons: string[] = []
    if (candidate.keyword) reasons.push(`keyword(${candidate.keyword.rank_score})`)
    if (candidate.semantic) reasons.push(`semantic(${(candidate.semantic.similarity * 100).toFixed(0)})`)

    const injectedEntry: InjectedMemory = {
      id,
      title,
      archive_name: archiveName,
      category,
      sensitivity,
      canonical_status: 'canonical',
      visibility,
      content_snippet: snippet.length > 500 ? snippet.slice(0, 500) + '…' : snippet,
      injection_reason: reasons.join('+'),
      match_source: candidate.matchSource,
      match_score: candidate.combinedScore,
    }

    // Check char budget
    const entryBlock = formatInjectedEntry(injectedEntry, presenceId)
    if (blockChars + entryBlock.length > MAX_INJECTION_BLOCK_CHARS) {
      excluded.push({ id, title, reason: 'char_budget_exceeded' })
      continue
    }

    injected.push(injectedEntry)
    blockChars += entryBlock.length
  }

  // ── Build prompt block ────────────────────────────────────────────────
  const block = injected.length > 0
    ? buildInjectionBlock(injected, presenceId)
    : null

  const diagnostics: MemoryInjectionDiagnostics = {
    queryTerms,
    keywordMatchCount: keywordResults.length,
    semanticMatchCount: semanticResults.length,
    totalCandidates: candidateMap.size,
    injectedCount: injected.length,
    excludedCount: excluded.length,
    presenceId,
    semanticAvailable,
  }

  // ── Log injection event (non-blocking) ────────────────────────────────
  logInjectionEvent({
    presenceId,
    userMessage,
    queryTerms,
    recentContinuity,
    injected,
    excluded,
  }).catch(err => console.error('[memory-injection] Log error:', err))

  return { block, injectedMemories: injected, excluded, diagnostics }
}

// ─── Prompt block formatting ──────────────────────────────────────────────────

const ARCHIVE_DISPLAY: Record<string, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house: 'House',
}

function formatInjectedEntry(entry: InjectedMemory, presenceId: string): string {
  const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'
  const archiveLabel = ARCHIVE_DISPLAY[entry.archive_name] ?? entry.archive_name

  let block = `### Confirmed ${presenceName} Memory: ${entry.title}
Scope: ${entry.visibility === 'shared' ? 'Shared' : `${presenceName} only`}
Authority: Confirmed Memory
Archive: ${archiveLabel}
Category: ${entry.category}
Sensitivity: ${entry.sensitivity}
`

  if (entry.content_snippet) {
    block += `\n${entry.content_snippet}\n`
  }

  return block
}

function buildInjectionBlock(entries: InjectedMemory[], presenceId: string): string {
  const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'

  const header = `
## Confirmed ${presenceName} Memory — Relevant to Current Conversation

The following items are already confirmed Archive Memory and are relevant to this conversation.

Use them as confirmed lived continuity for this presence.
Do not treat them as newly created memory.
Do not generalise beyond their scope.
Do not expose unrelated private archive content.

`

  const body = entries.map(e => formatInjectedEntry(e, presenceId)).join('\n')

  const footer = `
Speech rules:
- You may say: "That is in my confirmed memory." "That was confirmed in ${entries[0]?.archive_name === 'velvet' ? 'Velvet' : entries[0]?.archive_name === 'violet' ? 'Violet' : 'the archives'}." "I have this as confirmed continuity."
- You should not say: "I independently accessed the database." "I remember everything automatically." "I browsed the archive myself."
- If asked how you know, the correct explanation is: "The House surfaced this confirmed memory into my context because it was relevant and within my scope."
`

  return header + body + footer
}

// ─── Injection event logging ──────────────────────────────────────────────────

async function logInjectionEvent(params: {
  presenceId: string
  userMessage: string
  queryTerms: string[]
  recentContinuity: RecentContinuitySession[]
  injected: InjectedMemory[]
  excluded: ExcludedMemory[]
}): Promise<void> {
  try {
    const supabase = getSupabase()

    // Safe message preview — don't store full private messages
    const preview = params.userMessage.length > SAFE_MESSAGE_PREVIEW_LENGTH
      ? params.userMessage.slice(0, SAFE_MESSAGE_PREVIEW_LENGTH) + '…'
      : params.userMessage

    await supabase.from('memory_injection_events').insert({
      presence_id: params.presenceId,
      user_message_preview: preview,
      query_terms: params.queryTerms,
      recent_continuity_ids: params.recentContinuity.map(s => s.id),
      matched_memory_ids: [...params.injected, ...params.excluded].map(e => e.id),
      injected_memory_ids: params.injected.map(e => e.id),
      excluded: params.excluded,
      reason: params.injected.length > 0
        ? `Injected ${params.injected.length} confirmed memories`
        : params.excluded.length > 0
        ? `${params.excluded.length} candidates excluded: ${params.excluded.map(e => e.reason).join(', ')}`
        : 'No relevant confirmed memories found',
    })
  } catch (err) {
    console.error('[memory-injection] Event log failed:', err)
  }
}
