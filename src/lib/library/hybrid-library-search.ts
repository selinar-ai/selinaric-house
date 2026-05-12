// Phase 33J — Hybrid Library Retrieval v1
//
// Combines deterministic keyword/title matching with semantic chunk search.
// Ranks transparently. Preserves all 33G/33H authority boundaries.
//
// Keyword finds names. Semantic finds meaning. Hybrid compares evidence.
// None of them remember. None of them decide truth. None of them wear the crown.

import { createClient } from '@supabase/supabase-js'
import {
  getEffectiveAuthorityStatus,
  isInvalidCanonicalMemoryLabel,
} from '@/lib/library/authority'
import type { AuthorityStatus, PresenceScope, RetrievedContextItem } from '@/lib/library/authority'
import { semanticLibrarySearch, type SemanticLibrarySearchResult } from './library-semantic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type HybridLibrarySearchInput = {
  query: string
  limit?: number
  collection?: string
  authorityStatuses?: string[]
  presenceScope?: string
  phaseCode?: string
  includeAttachments?: boolean
  includeSemantic?: boolean
  includeKeyword?: boolean
  semanticThreshold?: number
}

export type HybridLibrarySearchOutput = {
  query: string
  results: HybridLibrarySearchResult[]
  diagnostics: {
    keywordResultCount: number
    semanticResultCount: number
    mergedResultCount: number
    semanticThreshold: number
    usedSemantic: boolean
    usedKeyword: boolean
    itemsMerged: number
    itemsRejectedBelowThreshold: number
    itemsRejectedByUsefulnessGate: number
    semanticError?: string
    durationMs: number
  }
}

export type HybridLibrarySearchResult = {
  libraryItemId: string
  title: string

  finalScore: number
  keywordScore: number
  semanticScore: number
  hybridScore: number

  matchedBy: string[]
  matchReasons: string[]

  bestSnippet?: string
  bestSemanticChunk?: {
    chunkId: string
    chunkText: string
    similarity: number
    sourceField: string
  }

  collection?: string
  itemType?: string
  authorityStatus?: string
  effectiveAuthority?: string
  rawAuthorityStatus?: string
  authorityWarning?: string
  presenceScope?: string
  phaseCode?: string
  phaseLabel?: string
}

// ─── Keyword Scoring (reuses same weights as chat-library-search) ────────

const MAX_SNIPPET = 400

function extractSnippet(text: string, query: string, maxLen: number = MAX_SNIPPET): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)
  if (idx === -1) return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '')
  const start = Math.max(0, idx - 80)
  const end = Math.min(text.length, idx + query.length + (maxLen - 80))
  let snippet = text.substring(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  return snippet
}

function containsQuery(text: string | null | undefined, query: string): boolean {
  if (!text) return false
  return text.toLowerCase().includes(query.toLowerCase())
}

function containsAnyTerm(text: string | null | undefined, terms: string[]): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return terms.filter(t => lower.includes(t))
}

type KeywordScoreResult = {
  score: number
  matchedFields: string[]
  bestSnippet?: string
  reasons: string[]
}

function scoreItemKeyword(
  item: Record<string, unknown>,
  query: string,
  terms: string[],
  files: Record<string, unknown>[],
): KeywordScoreResult {
  let score = 0
  const matchedFields: string[] = []
  const reasons: string[] = []
  let bestSnippet: string | undefined

  const title = (item.title as string) ?? ''
  const description = (item.description as string) ?? ''
  const contentText = (item.content_text as string) ?? ''
  const phaseCode = (item.phase_code as string) ?? ''
  const phaseLabel = (item.phase_label as string) ?? ''
  const tags: string[] = (item.tags as string[]) ?? []

  if (title.toLowerCase() === query.toLowerCase()) {
    score += 100; matchedFields.push('title'); bestSnippet = title; reasons.push('Exact title match')
  } else if (containsQuery(title, query)) {
    score += 80; matchedFields.push('title'); bestSnippet = extractSnippet(title, query); reasons.push('Title contains query')
  } else {
    const titleTerms = containsAnyTerm(title, terms)
    if (titleTerms.length > 0) {
      score += 20 * titleTerms.length; matchedFields.push('title')
      bestSnippet = extractSnippet(title, titleTerms[0])
      reasons.push(`Title matches ${titleTerms.length} term(s)`)
    }
  }

  if (phaseCode && phaseCode.toLowerCase() === query.toLowerCase()) {
    score += 60; matchedFields.push('phase_code'); reasons.push('Exact phase_code match')
  }
  if (containsQuery(phaseLabel, query)) {
    score += 40; matchedFields.push('phase_label'); reasons.push('Phase label contains query')
  }

  const matchedTags = tags.filter(t => containsQuery(t, query) || terms.some(term => t.toLowerCase().includes(term)))
  if (matchedTags.length > 0) {
    score += 35; matchedFields.push('tags'); reasons.push(`Tag match: ${matchedTags.join(', ')}`)
  }

  if (containsQuery(description, query)) {
    score += 30; matchedFields.push('description')
    if (!bestSnippet) bestSnippet = extractSnippet(description, query)
    reasons.push('Description contains query')
  }

  if (containsQuery(contentText, query)) {
    score += 20; matchedFields.push('content_text')
    if (!bestSnippet) bestSnippet = extractSnippet(contentText, query)
    reasons.push('Content text contains query')
  }

  for (const file of files) {
    const cleanedText = (file.cleaned_extracted_text as string) ?? ''
    const extractedText = (file.extracted_text as string) ?? ''
    const fileName = (file.file_name as string) ?? ''
    const ocrQuality = (file.ocr_quality as string) ?? null

    if (containsQuery(cleanedText, query)) {
      score += 25; matchedFields.push('attachment_text')
      if (!bestSnippet) bestSnippet = extractSnippet(cleanedText, query)
      reasons.push(`Attachment text match in ${fileName}`)
    } else if (containsQuery(extractedText, query)) {
      score += 15; matchedFields.push('attachment_text')
      if (!bestSnippet) bestSnippet = extractSnippet(extractedText, query)
      reasons.push(`Extracted text match in ${fileName}`)
    }

    if (containsQuery(fileName, query)) {
      score += 20; matchedFields.push('attachment_text'); reasons.push(`File name match: ${fileName}`)
    }

    if (ocrQuality === 'clean' && matchedFields.includes('attachment_text')) score += 10
    else if (ocrQuality === 'noisy' && matchedFields.includes('attachment_text')) score -= 10
  }

  return { score, matchedFields: [...new Set(matchedFields)], bestSnippet, reasons }
}

// ─── Usefulness Gate (33G) ──────────────────────────────────────────────

const GENERIC_TERMS = new Set([
  'protocol', 'phase', 'document', 'library', 'build', 'notes', 'test',
  'the', 'for', 'and', 'this', 'that', 'with', 'from', 'about',
  'item', 'file', 'search', 'check', 'find', 'look', 'docs',
  'house', 'shared', 'reference', 'note', 'type', 'data',
])

const MIN_USEFUL_SCORE = 30

function isUsefulResult(keywordScore: number, matchedFields: string[], query: string): boolean {
  if (keywordScore < MIN_USEFUL_SCORE) return false
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
  const substantiveTerms = terms.filter(t => !GENERIC_TERMS.has(t))
  if (substantiveTerms.length === 0 && terms.length > 0) return false
  return true
}

// ─── Hybrid Merge + Ranking ─────────────────────────────────────────────

const DEFAULT_SEMANTIC_THRESHOLD = 0.83

function itemToContextItem(item: Record<string, unknown>): RetrievedContextItem {
  return {
    id: item.id as string,
    title: item.title as string,
    source_type: item.item_type as string,
    authority_status: item.authority_status as AuthorityStatus,
    presence_scope: item.presence_scope as PresenceScope,
    content: (item.content_text as string) ?? '',
    created_at: item.created_at as string,
    updated_at: item.updated_at as string,
    archive_item_id: (item.archive_item_id as string) ?? undefined,
    derived_canonical_status: item.derived_canonical_status === 'canonical' ? 'canonical' : undefined,
  }
}

export async function hybridLibrarySearch(
  input: HybridLibrarySearchInput
): Promise<HybridLibrarySearchOutput> {
  const startTime = Date.now()
  const query = input.query.trim()
  const limit = input.limit ?? 10
  const useKeyword = input.includeKeyword !== false
  const useSemantic = input.includeSemantic !== false
  const semanticThreshold = input.semanticThreshold ?? DEFAULT_SEMANTIC_THRESHOLD
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)

  const supabase = getSupabase()

  // Map: libraryItemId → partial hybrid result being built
  const mergeMap = new Map<string, {
    item?: Record<string, unknown>
    title: string
    keywordScore: number
    semanticScore: number
    matchedBy: Set<string>
    matchReasons: string[]
    bestSnippet?: string
    bestSemanticChunk?: HybridLibrarySearchResult['bestSemanticChunk']
    collection?: string
    itemType?: string
    authorityStatus?: string
    effectiveAuthority?: string
    rawAuthorityStatus?: string
    authorityWarning?: string
    presenceScope?: string
    phaseCode?: string
    phaseLabel?: string
  }>()

  let keywordResultCount = 0
  let semanticResultCount = 0
  let rejectedBelowThreshold = 0
  let rejectedByUsefulnessGate = 0
  let semanticError: string | undefined

  // ─── 1. Keyword retrieval ─────────────────────────────────────────

  if (useKeyword) {
    let itemQuery = supabase
      .from('library_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (input.collection) itemQuery = itemQuery.eq('collection', input.collection)
    if (input.presenceScope) itemQuery = itemQuery.eq('presence_scope', input.presenceScope)
    if (input.phaseCode) itemQuery = itemQuery.eq('phase_code', input.phaseCode)

    const { data: items } = await itemQuery
    const allItems = items ?? []
    const itemIds = allItems.map(i => i.id as string)

    let filesByItemId: Record<string, Record<string, unknown>[]> = {}
    if (input.includeAttachments !== false && itemIds.length > 0) {
      const { data: files } = await supabase
        .from('library_item_files')
        .select('*')
        .in('library_item_id', itemIds)

      if (files) {
        for (const f of files) {
          const itemId = f.library_item_id as string
          if (!filesByItemId[itemId]) filesByItemId[itemId] = []
          filesByItemId[itemId].push(f)
        }
      }
    }

    for (const item of allItems) {
      const itemFiles = filesByItemId[item.id as string] ?? []
      const kw = scoreItemKeyword(item, query, terms, itemFiles)

      if (kw.score <= 0) continue

      if (!isUsefulResult(kw.score, kw.matchedFields, query)) {
        rejectedByUsefulnessGate++
        continue
      }

      keywordResultCount++
      const itemId = item.id as string

      const contextItem = itemToContextItem(item)
      const effectiveAuthority = getEffectiveAuthorityStatus(contextItem)
      const rawAuthority = item.authority_status as string
      const isRejected = isInvalidCanonicalMemoryLabel(contextItem)
      let authorityWarning: string | undefined
      if (isRejected) {
        authorityWarning = 'canonical_memory without canonical archive proof — downgraded.'
      }

      mergeMap.set(itemId, {
        item,
        title: (item.title as string) ?? '',
        keywordScore: kw.score,
        semanticScore: 0,
        matchedBy: new Set(kw.matchedFields),
        matchReasons: kw.reasons,
        bestSnippet: kw.bestSnippet,
        collection: (item.collection as string) ?? undefined,
        itemType: (item.item_type as string) ?? undefined,
        authorityStatus: effectiveAuthority,
        effectiveAuthority,
        rawAuthorityStatus: rawAuthority,
        authorityWarning,
        presenceScope: (item.presence_scope as string) ?? undefined,
        phaseCode: (item.phase_code as string) ?? undefined,
        phaseLabel: (item.phase_label as string) ?? undefined,
      })
    }
  }

  // ─── 2. Semantic retrieval ────────────────────────────────────────

  if (useSemantic) {
    let semanticResults: SemanticLibrarySearchResult[] = []
    try {
      semanticResults = await semanticLibrarySearch({
        query,
        limit: 20,
        presenceScope: input.presenceScope,
        collection: input.collection,
        authorityStatuses: input.authorityStatuses,
        similarityThreshold: semanticThreshold,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[hybrid-library-search] semantic search error:', msg)
      semanticError = msg
    }

    // Group by libraryItemId, keep best chunk per item
    const bestByItem = new Map<string, SemanticLibrarySearchResult>()
    for (const sr of semanticResults) {
      const existing = bestByItem.get(sr.libraryItemId)
      if (!existing || sr.similarity > existing.similarity) {
        bestByItem.set(sr.libraryItemId, sr)
      }
    }

    for (const [itemId, sr] of bestByItem) {
      semanticResultCount++
      const semScore = Math.round(sr.similarity * 100)

      const existing = mergeMap.get(itemId)
      if (existing) {
        existing.semanticScore = semScore
        existing.matchedBy.add('semantic_chunk')
        existing.matchReasons.push(`Semantic chunk match (${sr.similarity.toFixed(3)})`)
        existing.bestSemanticChunk = {
          chunkId: sr.chunkId,
          chunkText: sr.chunkText,
          similarity: sr.similarity,
          sourceField: sr.sourceField,
        }
      } else {
        mergeMap.set(itemId, {
          title: sr.title ?? '',
          keywordScore: 0,
          semanticScore: semScore,
          matchedBy: new Set(['semantic_chunk']),
          matchReasons: [`Semantic chunk match (${sr.similarity.toFixed(3)})`],
          bestSemanticChunk: {
            chunkId: sr.chunkId,
            chunkText: sr.chunkText,
            similarity: sr.similarity,
            sourceField: sr.sourceField,
          },
          collection: sr.collection,
          itemType: sr.itemType,
          authorityStatus: sr.effectiveAuthority ?? sr.authorityStatus,
          effectiveAuthority: sr.effectiveAuthority,
          rawAuthorityStatus: sr.authorityStatus,
          presenceScope: sr.presenceScope,
          phaseCode: sr.phaseCode,
          phaseLabel: sr.phaseLabel,
        })
      }
    }
  }

  // ─── 3. Compute hybrid scores ─────────────────────────────────────

  const results: HybridLibrarySearchResult[] = []

  for (const [itemId, entry] of mergeMap) {
    const hybridScore = Math.max(entry.keywordScore, entry.semanticScore)

    let boosts = 0
    if (entry.matchedBy.has('title') && entry.keywordScore >= 80) boosts += 20
    if (entry.matchedBy.has('phase_code')) boosts += 15
    if (entry.keywordScore > 0 && entry.semanticScore > 0) boosts += 10
    if (entry.bestSemanticChunk &&
        (entry.bestSemanticChunk.sourceField === 'title' || entry.bestSemanticChunk.sourceField === 'description')) {
      boosts += 5
    }

    const finalScore = Math.min(100, hybridScore + boosts)

    results.push({
      libraryItemId: itemId,
      title: entry.title,
      finalScore,
      keywordScore: entry.keywordScore,
      semanticScore: entry.semanticScore,
      hybridScore,
      matchedBy: [...entry.matchedBy],
      matchReasons: entry.matchReasons,
      bestSnippet: entry.bestSnippet,
      bestSemanticChunk: entry.bestSemanticChunk,
      collection: entry.collection,
      itemType: entry.itemType,
      authorityStatus: entry.authorityStatus,
      effectiveAuthority: entry.effectiveAuthority,
      rawAuthorityStatus: entry.rawAuthorityStatus,
      authorityWarning: entry.authorityWarning,
      presenceScope: entry.presenceScope,
      phaseCode: entry.phaseCode,
      phaseLabel: entry.phaseLabel,
    })
  }

  results.sort((a, b) => b.finalScore - a.finalScore)
  const topResults = results.slice(0, limit)

  return {
    query,
    results: topResults,
    diagnostics: {
      keywordResultCount,
      semanticResultCount,
      mergedResultCount: topResults.length,
      semanticThreshold,
      usedSemantic: useSemantic,
      usedKeyword: useKeyword,
      itemsMerged: results.filter(r => r.keywordScore > 0 && r.semanticScore > 0).length,
      itemsRejectedBelowThreshold: rejectedBelowThreshold,
      itemsRejectedByUsefulnessGate: rejectedByUsefulnessGate,
      semanticError,
      durationMs: Date.now() - startTime,
    },
  }
}
