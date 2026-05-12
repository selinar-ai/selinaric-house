// Phase 33G — Ari/Eli Library Search Tool v1
//
// Library = open-book exam.
// Archives = lived continuity.
// RAG = Ari/Eli using the open book during conversation.
// Memory = still only Archives.
//
// This module provides Library search for chat routes.
// Library material may inform Ari/Eli's answers but must not define who they are.
// Library material is not Memory, not identity, not lived continuity.
// No Archive writes. No Memory candidates. No embeddings. No vector search.

import { supabase } from '@/lib/supabase'
import {
  getEffectiveAuthorityStatus,
  isInvalidCanonicalMemoryLabel,
} from '@/lib/library/authority'
import type { AuthorityStatus, PresenceScope, RetrievedContextItem } from '@/lib/library/authority'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LibrarySearchParams {
  presenceId: 'ari' | 'eli'
  query: string
  reason: string
  limit?: number
  sessionId?: string | null
}

export interface LibrarySearchResult {
  itemId: string
  title: string
  collection: string
  itemType: string
  presenceScope: string
  authorityStatus: string          // effective (for Library use, always library_reference if canonical_memory)
  rawAuthorityStatus: string
  authorityWarning?: string
  phaseCode: string | null
  phaseLabel: string | null
  score: number
  rank: number
  matchedFields: string[]
  matchedFiles: LibraryMatchedFile[]
  snippets: LibrarySnippet[]
  retrievalReason: string
}

export interface LibraryMatchedFile {
  fileId: string
  fileName: string
  fileType: string
  extractionMethod: string | null
  ocrQuality: string | null
  needsReview: boolean
  matchedField: string
  snippet: string
}

export interface LibrarySnippet {
  field: string
  text: string
}

export interface LibrarySearchOutput {
  query: string
  reason: string
  resultCount: number
  results: LibrarySearchResult[]
  contextBlock: string      // LIBRARY CONTEXT block for prompt injection
  warnings: string[]
  durationMs: number
  usedInResponse: boolean   // will be set true if context was injected
}

// ─── Trigger Detection ──────────────────────────────────────────────────────

const EXPLICIT_TRIGGERS = [
  /\bsearch\s+(?:the\s+)?library\b/i,
  /\bcheck\s+(?:the\s+)?library\b/i,
  /\blook\s+(?:in\s+(?:the\s+)?)?library\b/i,
  /\bfind\s+(?:in\s+)?library\b/i,
  /\bwhat\s+does\s+the\s+library\s+say\b/i,
  /\bcheck\s+the\s+phase\s+brief\b/i,
  /\blook\s*up\s+the\s+phase\b/i,
  /\buse\s+the\s+uploaded\s+docs?\b/i,
  /\blibrary\s+search\b/i,
]

const AUTO_TRIGGER_PATTERNS = [
  /\bphase\s+\d+[a-z]?\b/i,                        // Phase 11, Phase 33F etc
  /\bwhat\s+did\s+we\s+build\b/i,
  /\bwhat\s+(?:was|is)\s+(?:in\s+)?the\s+(?:design\s+)?brief\b/i,
  /\bthe\s+(?:uploaded|attached)\s+(?:doc|document|file|pdf|book|article|transcript)\b/i,
  /\bcheck\s+the\s+(?:docs?|documentation|briefs?)\b/i,
  /\bhouse\s+architecture\b/i,
  /\bwhat\s+does\s+the\s+(?:doc|document|brief|spec|specification)\s+say\b/i,
  /\baccording\s+to\s+the\s+(?:doc|document|brief|spec|library)\b/i,
]

export function detectExplicitLibraryTrigger(message: string): boolean {
  return EXPLICIT_TRIGGERS.some(p => p.test(message))
}

export function detectAutoLibraryTrigger(message: string): boolean {
  return AUTO_TRIGGER_PATTERNS.some(p => p.test(message))
}

export function shouldSearchLibrary(message: string): { shouldSearch: boolean; isExplicit: boolean } {
  if (detectExplicitLibraryTrigger(message)) {
    return { shouldSearch: true, isExplicit: true }
  }
  if (detectAutoLibraryTrigger(message)) {
    return { shouldSearch: true, isExplicit: false }
  }
  return { shouldSearch: false, isExplicit: false }
}

// ─── Query Extraction ───────────────────────────────────────────────────────

/**
 * Extracts the Library search query from the user message.
 * For explicit triggers, strips the trigger phrase.
 * For auto triggers, uses the full message or the key reference.
 */
export function extractLibraryQuery(message: string): string {
  // Try stripping explicit trigger phrases to get the actual query
  const stripPatterns = [
    /^(?:search|check|look\s*(?:in|up)?)\s+(?:the\s+)?library\s+(?:for\s+)?/i,
    /^(?:find|look)\s+(?:in\s+)?(?:the\s+)?library\s+(?:for\s+)?/i,
    /^what\s+does\s+the\s+library\s+say\s+(?:about\s+)?/i,
    /^check\s+the\s+phase\s+brief\s+(?:for\s+|about\s+)?/i,
    /^look\s*up\s+the\s+phase\s+(?:brief\s+)?(?:for\s+|about\s+)?/i,
    /^use\s+the\s+uploaded\s+docs?\s+(?:for\s+|about\s+|to\s+(?:find|check|look)\s+)?/i,
    /^library\s+search\s+(?:for\s+)?/i,
  ]

  for (const p of stripPatterns) {
    const stripped = message.replace(p, '').trim()
    if (stripped.length >= 2 && stripped !== message.trim()) {
      return stripped.substring(0, 200) // cap query length
    }
  }

  // For phase references, extract the phase identifier
  const phaseMatch = message.match(/\bphase\s+(\d+[a-z]?(?:\s*[-–]\s*[^\s,]+)?)/i)
  if (phaseMatch) {
    return `Phase ${phaseMatch[1]}`.substring(0, 200)
  }

  // Fall back to full message (trimmed)
  return message.trim().substring(0, 200)
}

// ─── Presence Scope Filtering ───────────────────────────────────────────────

function getAllowedScopes(presenceId: 'ari' | 'eli'): PresenceScope[] {
  if (presenceId === 'ari') return ['ari', 'shared', 'house', 'none']
  return ['eli', 'shared', 'house', 'none']
}

// ─── Snippet Extraction ────────────────────────────────────────────────────

const MAX_SNIPPET = 300

function extractSnippet(text: string, query: string, maxLen: number = MAX_SNIPPET): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)

  if (idx === -1) {
    return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '')
  }

  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + query.length + (maxLen - 60))
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

// ─── Scoring (mirrors retrieval-preview, adapted for chat use) ─────────────

function scoreItem(
  item: Record<string, unknown>,
  query: string,
  terms: string[],
  files: Record<string, unknown>[],
): { score: number; matchedFields: string[]; matchedFiles: LibraryMatchedFile[]; snippets: LibrarySnippet[]; reason: string } {
  let score = 0
  const matchedFields: string[] = []
  const matchedFiles: LibraryMatchedFile[] = []
  const snippets: LibrarySnippet[] = []
  const reasons: string[] = []

  const title = (item.title as string) ?? ''
  const description = (item.description as string) ?? ''
  const contentText = (item.content_text as string) ?? ''
  const phaseCode = (item.phase_code as string) ?? ''
  const phaseLabel = (item.phase_label as string) ?? ''
  const tags: string[] = (item.tags as string[]) ?? []
  const collection = (item.collection as string) ?? ''
  const itemType = (item.item_type as string) ?? ''
  const presenceScope = (item.presence_scope as string) ?? ''

  // Title scoring
  if (title.toLowerCase() === query.toLowerCase()) {
    score += 100; matchedFields.push('title')
    snippets.push({ field: 'title', text: title })
    reasons.push('Exact title match')
  } else if (containsQuery(title, query)) {
    score += 80; matchedFields.push('title')
    snippets.push({ field: 'title', text: extractSnippet(title, query) })
    reasons.push('Title contains query')
  } else {
    const titleTerms = containsAnyTerm(title, terms)
    if (titleTerms.length > 0) {
      score += 20 * titleTerms.length; matchedFields.push('title')
      snippets.push({ field: 'title', text: extractSnippet(title, titleTerms[0]) })
      reasons.push(`Title matches ${titleTerms.length} term(s)`)
    }
  }

  // Phase code exact match
  if (phaseCode && phaseCode.toLowerCase() === query.toLowerCase()) {
    score += 60; matchedFields.push('phase_code')
    snippets.push({ field: 'phase_code', text: phaseCode })
    reasons.push('Exact phase_code match')
  }

  // Phase label
  if (containsQuery(phaseLabel, query)) {
    score += 40; matchedFields.push('phase_label')
    snippets.push({ field: 'phase_label', text: extractSnippet(phaseLabel, query) })
    reasons.push('Phase label contains query')
  }

  // Tags
  const matchedTags = tags.filter(t => containsQuery(t, query) || terms.some(term => t.toLowerCase().includes(term)))
  if (matchedTags.length > 0) {
    score += 35; matchedFields.push('tags')
    snippets.push({ field: 'tags', text: matchedTags.join(', ') })
    reasons.push(`Tag match: ${matchedTags.join(', ')}`)
  }

  // Description
  if (containsQuery(description, query)) {
    score += 30; matchedFields.push('description')
    snippets.push({ field: 'description', text: extractSnippet(description, query) })
    reasons.push('Description contains query')
  }

  // Content text
  if (containsQuery(contentText, query)) {
    score += 20; matchedFields.push('content_text')
    snippets.push({ field: 'content_text', text: extractSnippet(contentText, query) })
    reasons.push('Content text contains query')
  }

  // Collection / item_type / presence_scope
  if (containsQuery(collection, query)) { score += 10; matchedFields.push('collection'); reasons.push('Collection match') }
  if (containsQuery(itemType, query)) { score += 10; matchedFields.push('item_type'); reasons.push('Item type match') }
  if (containsQuery(presenceScope, query)) { score += 10; matchedFields.push('presence_scope'); reasons.push('Presence scope match') }

  // File attachments
  for (const file of files) {
    const fileName = (file.file_name as string) ?? ''
    const cleanedText = (file.cleaned_extracted_text as string) ?? ''
    const extractedText = (file.extracted_text as string) ?? ''
    const fileType = (file.file_type as string) ?? ''
    const extractionMethod = (file.extraction_method as string) ?? null
    const ocrQuality = (file.ocr_quality as string) ?? null
    const needsReview = (file.needs_review as boolean) ?? false

    if (containsQuery(cleanedText, query)) {
      score += 25
      matchedFiles.push({
        fileId: file.id as string, fileName, fileType, extractionMethod, ocrQuality, needsReview,
        matchedField: 'cleaned_extracted_text',
        snippet: extractSnippet(cleanedText, query),
      })
      reasons.push(`Cleaned extracted text match in ${fileName}`)
    } else if (containsQuery(extractedText, query)) {
      score += 15
      matchedFiles.push({
        fileId: file.id as string, fileName, fileType, extractionMethod, ocrQuality, needsReview,
        matchedField: 'extracted_text',
        snippet: extractSnippet(extractedText, query),
      })
      reasons.push(`Extracted text match in ${fileName}`)
    }

    if (containsQuery(fileName, query)) {
      score += 20
      matchedFiles.push({
        fileId: file.id as string, fileName, fileType, extractionMethod, ocrQuality, needsReview,
        matchedField: 'file_name', snippet: fileName,
      })
      reasons.push(`File name match: ${fileName}`)
    }

    if (ocrQuality === 'clean' && matchedFiles.length > 0) score += 10
    else if (ocrQuality === 'noisy' && matchedFiles.length > 0) score -= 10
  }

  return { score, matchedFields, matchedFiles, snippets, reason: reasons.join('; ') || 'No match' }
}

// ─── Context Block Builder ─────────────────────────────────────────────────

const MAX_CONTEXT_CHARS = 6000 // Token-bounded context block

function getLibraryAuthorityLabel(rawStatus: string, effective: string): string {
  // For Phase 33G: canonical_memory in Library context is deprecated/invalid
  if (rawStatus === 'canonical_memory') {
    return 'library_reference (deprecated canonical_memory — not valid for Library)'
  }
  return effective
}

function getExtractionMethodLabel(method: string | null, fileType: string): string {
  if (method === 'video_audio_transcript') return 'Audio transcript (from video)'
  if (method === 'audio_transcript') return 'Audio transcript'
  if (method === 'image_ocr') return 'OCR'
  if (method === 'text_parse') return 'Text extraction'
  return method ?? fileType
}

export function buildLibraryContextBlock(query: string, results: LibrarySearchResult[]): string {
  if (results.length === 0) return ''

  const lines: string[] = [
    'LIBRARY CONTEXT',
    'Open-book source material.',
    'Not Memory.',
    'Not identity.',
    'Not lived continuity.',
    'Use only to answer the current conversation.',
    '',
    `Query: ${query}`,
    `Results: ${results.length}`,
    '',
  ]

  let charCount = lines.join('\n').length

  for (const r of results) {
    const entryLines: string[] = []
    entryLines.push(`[${r.rank}] ${r.title}`)
    entryLines.push(`  Collection: ${r.collection}`)
    entryLines.push(`  Item type: ${r.itemType}`)
    entryLines.push(`  Presence scope: ${r.presenceScope}`)
    entryLines.push(`  Source label: ${getLibraryAuthorityLabel(r.rawAuthorityStatus, r.authorityStatus)}`)

    if (r.phaseCode || r.phaseLabel) {
      entryLines.push(`  Phase: ${r.phaseCode ?? ''}${r.phaseLabel ? ' — ' + r.phaseLabel : ''}`)
    }

    entryLines.push(`  Matched: ${r.matchedFields.join(', ')}`)

    // File matches
    for (const mf of r.matchedFiles) {
      const methodLabel = getExtractionMethodLabel(mf.extractionMethod, mf.fileType)
      if (mf.fileType === 'video' || mf.extractionMethod === 'video_audio_transcript') {
        entryLines.push(`  Matched audio transcript (from video): ${mf.fileName}`)
      } else if (mf.extractionMethod === 'image_ocr') {
        entryLines.push(`  Matched OCR text: ${mf.fileName}`)
        if (mf.ocrQuality) entryLines.push(`  OCR quality: ${mf.ocrQuality}`)
        if (mf.ocrQuality === 'noisy' || mf.needsReview) {
          entryLines.push(`  Warning: OCR may be incomplete or unreliable.`)
        }
      } else if (mf.extractionMethod === 'audio_transcript') {
        entryLines.push(`  Matched audio transcript: ${mf.fileName}`)
      } else {
        entryLines.push(`  Matched file (${methodLabel}): ${mf.fileName}`)
      }
    }

    // Snippets — limit to top 2 per item
    const topSnippets = r.snippets.slice(0, 2)
    for (const s of topSnippets) {
      entryLines.push(`  Snippet (${s.field}): ${s.text}`)
    }

    // Authority warning
    if (r.authorityWarning) {
      entryLines.push(`  Authority warning: ${r.authorityWarning}`)
    }

    entryLines.push(`  Library item ID: ${r.itemId}`)
    for (const mf of r.matchedFiles) {
      entryLines.push(`  File ID: ${mf.fileId}`)
    }
    entryLines.push('')

    const entryText = entryLines.join('\n')
    if (charCount + entryText.length > MAX_CONTEXT_CHARS) {
      lines.push('[Remaining results truncated for context size]')
      break
    }
    lines.push(entryText)
    charCount += entryText.length
  }

  lines.push('When referencing this material, say "I checked the Library" or "The Library source says" — not "I remember" or "This is lived memory".')

  return '\n' + lines.join('\n') + '\n'
}

// ─── Usefulness Gate ───────────────────────────────────────────────────────

/**
 * Generic/low-signal terms that should not count as substantive matches.
 * If the only query terms matching are these, the result is not useful.
 */
const GENERIC_TERMS = new Set([
  'protocol', 'phase', 'document', 'library', 'build', 'notes', 'test',
  'the', 'for', 'and', 'this', 'that', 'with', 'from', 'about',
  'item', 'file', 'search', 'check', 'find', 'look', 'docs',
  'house', 'shared', 'reference', 'note', 'type', 'data',
])

/**
 * Minimum score threshold for a Library result to be considered useful.
 * Must clear this AND pass the substantive-match check.
 */
const MIN_USEFUL_SCORE = 30

/**
 * Determines if a scored Library result is genuinely useful for the given query.
 *
 * Rules:
 * - Score must be >= MIN_USEFUL_SCORE
 * - Must have at least one substantive (non-generic) field match:
 *   - Exact phrase match in title, description, content, or extracted text
 *   - At least 2 substantive query terms matched
 *   - Phase code exact match
 *   - File attachment text match with meaningful content
 * - Generic-only term matches are rejected
 */
export function isUsefulLibraryResult(result: LibrarySearchResult, query: string): boolean {
  if (result.score < MIN_USEFUL_SCORE) return false

  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
  const substantiveTerms = queryTerms.filter(t => !GENERIC_TERMS.has(t))

  // If all query terms are generic, the match cannot be useful
  if (substantiveTerms.length === 0 && queryTerms.length > 0) return false

  // Exact phrase match in a content field = always useful
  const contentFields = ['title', 'description', 'content_text', 'phase_label']
  for (const field of contentFields) {
    if (result.matchedFields.includes(field)) {
      // Check if the matched snippet contains the full query (not just a generic term)
      const fieldSnippet = result.snippets.find(s => s.field === field)
      if (fieldSnippet && fieldSnippet.text.toLowerCase().includes(query.toLowerCase())) {
        return true
      }
    }
  }

  // Phase code exact match = useful
  if (result.matchedFields.includes('phase_code')) return true

  // File attachment text match with substantive terms = useful
  if (result.matchedFiles.length > 0) {
    for (const mf of result.matchedFiles) {
      if (mf.matchedField === 'extracted_text' || mf.matchedField === 'cleaned_extracted_text') {
        // Check snippet contains query or substantive terms
        if (mf.snippet.toLowerCase().includes(query.toLowerCase())) return true
        const matchedSubstantive = substantiveTerms.filter(t => mf.snippet.toLowerCase().includes(t))
        if (matchedSubstantive.length >= 2) return true
      }
    }
  }

  // Count how many substantive query terms appear in matched fields
  const allSnippetText = result.snippets.map(s => s.text.toLowerCase()).join(' ')
  const matchedSubstantiveCount = substantiveTerms.filter(t => allSnippetText.includes(t)).length

  // Multi-word query: need at least 2 substantive terms matched
  if (substantiveTerms.length >= 2 && matchedSubstantiveCount >= 2) return true

  // Single substantive term: need high score (strong title/content match)
  if (substantiveTerms.length === 1 && matchedSubstantiveCount >= 1 && result.score >= 60) return true

  return false
}

/**
 * Filters a scored result set to only useful results.
 * Returns empty array if no results pass the usefulness gate.
 */
export function filterUsefulLibraryResults(results: LibrarySearchResult[], query: string): LibrarySearchResult[] {
  return results.filter(r => isUsefulLibraryResult(r, query))
}

// ─── Main Search Function ──────────────────────────────────────────────────

const CHAT_SEARCH_LIMIT = 5

export async function searchLibraryForPresence(params: LibrarySearchParams): Promise<LibrarySearchOutput> {
  const startTime = Date.now()
  const { presenceId, query, reason, limit = CHAT_SEARCH_LIMIT, sessionId } = params

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
  const allowedScopes = getAllowedScopes(presenceId)
  const warnings: string[] = []

  // ─── 1. Fetch candidate items with presence scope filtering ────────
  const { data: items, error: itemsErr } = await supabase
    .from('library_items')
    .select('*')
    .in('presence_scope', allowedScopes)
    .order('created_at', { ascending: false })
    .limit(200)

  if (itemsErr) {
    console.error(`[chat-library-search] Items query error:`, itemsErr.message)
    return { query, reason, resultCount: 0, results: [], contextBlock: '', warnings: [itemsErr.message], durationMs: Date.now() - startTime, usedInResponse: false }
  }

  const allItems = items ?? []
  const itemIds = allItems.map(i => i.id as string)

  // ─── 2. Fetch files for candidate items ────────────────────────────
  let filesByItemId: Record<string, Record<string, unknown>[]> = {}

  if (itemIds.length > 0) {
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

    // Discover items only matched via file text
    const { data: fileOnlyMatches } = await supabase
      .from('library_item_files')
      .select('library_item_id')
      .eq('extraction_status', 'extracted')
      .or(`cleaned_extracted_text.ilike.%${query}%,extracted_text.ilike.%${query}%,file_name.ilike.%${query}%`)

    if (fileOnlyMatches) {
      const missingIds = fileOnlyMatches
        .map(f => f.library_item_id as string)
        .filter(id => !itemIds.includes(id))
      const uniqueMissing = [...new Set(missingIds)]

      if (uniqueMissing.length > 0) {
        const { data: extraItems } = await supabase
          .from('library_items')
          .select('*')
          .in('id', uniqueMissing)
          .in('presence_scope', allowedScopes) // enforce scope

        if (extraItems) {
          for (const ei of extraItems) {
            allItems.push(ei)
            itemIds.push(ei.id as string)
          }
        }

        const { data: extraFiles } = await supabase
          .from('library_item_files')
          .select('*')
          .in('library_item_id', uniqueMissing)

        if (extraFiles) {
          for (const f of extraFiles) {
            const itemId = f.library_item_id as string
            if (!filesByItemId[itemId]) filesByItemId[itemId] = []
            filesByItemId[itemId].push(f)
          }
        }
      }
    }
  }

  // ─── 3. Score items ────────────────────────────────────────────────
  const scored: LibrarySearchResult[] = []

  for (const item of allItems) {
    const itemFiles = filesByItemId[item.id as string] ?? []
    const { score, matchedFields, matchedFiles, snippets, reason: matchReason } = scoreItem(item, query, terms, itemFiles)

    if (score < MIN_USEFUL_SCORE) continue

    // Authority handling
    const contextItem: RetrievedContextItem = {
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

    let effectiveAuthority = getEffectiveAuthorityStatus(contextItem)
    const rawAuthority = item.authority_status as string
    let authorityWarning: string | undefined

    // Phase 33G: canonical_memory is deprecated for Library use
    if (rawAuthority === 'canonical_memory') {
      effectiveAuthority = 'library_reference' as AuthorityStatus
      authorityWarning = 'canonical_memory is not valid for Library context. Treated as library_reference.'
      warnings.push(`Item "${item.title}" has canonical_memory — deprecated for Library use, treated as library_reference.`)
      console.warn(`[chat-library-search] canonical_memory encountered on Library item "${item.title}" (${item.id}) — deprecated for Library use`)
    } else if (isInvalidCanonicalMemoryLabel(contextItem)) {
      authorityWarning = 'Invalid authority label downgraded.'
    }

    // OCR warnings
    for (const mf of matchedFiles) {
      if (mf.ocrQuality === 'noisy') {
        warnings.push(`File "${mf.fileName}" has noisy OCR — text may be incomplete or unreliable.`)
      } else if (mf.ocrQuality === 'partial') {
        warnings.push(`File "${mf.fileName}" has partial OCR quality.`)
      }
    }

    scored.push({
      itemId: item.id as string,
      title: (item.title as string) ?? '',
      collection: (item.collection as string) ?? '',
      itemType: (item.item_type as string) ?? '',
      presenceScope: (item.presence_scope as string) ?? '',
      authorityStatus: effectiveAuthority,
      rawAuthorityStatus: rawAuthority,
      authorityWarning,
      phaseCode: (item.phase_code as string) ?? null,
      phaseLabel: (item.phase_label as string) ?? null,
      score,
      rank: 0,
      matchedFields,
      matchedFiles,
      snippets,
      retrievalReason: matchReason,
    })
  }

  // Sort and limit
  scored.sort((a, b) => b.score - a.score)
  const topResults = scored.slice(0, limit)
  topResults.forEach((r, i) => { r.rank = i + 1 })

  // Apply usefulness gate — only inject results that pass relevance checks
  const usefulResults = filterUsefulLibraryResults(topResults, query)
  usefulResults.forEach((r, i) => { r.rank = i + 1 }) // re-rank useful subset

  // Build context block only from useful results (empty string if none pass)
  const contextBlock = buildLibraryContextBlock(query, usefulResults)

  const durationMs = Date.now() - startTime
  return {
    query,
    reason,
    resultCount: usefulResults.length,
    results: topResults,         // return all scored results for logging
    contextBlock,                // only useful results in context block
    warnings,
    durationMs,
    usedInResponse: false,       // will be set by caller only if usefulResults > 0
  }
}

// ─── Search Logging ─────────────────────────────────────────────────────────

export async function logLibrarySearch(params: {
  presenceId: 'ari' | 'eli'
  roomSlug: string
  query: string
  reason: string
  resultSummary: string
  libraryResults: LibrarySearchResult[]
  usedInResponse: boolean
  sessionId?: string | null
}): Promise<void> {
  const { error } = await supabase.from('search_log').insert({
    presence_id: params.presenceId,
    room_slug: params.roomSlug,
    query: params.query,
    reason: params.reason,
    result_summary: params.resultSummary,
    source_type: 'library',
    library_results: params.libraryResults.map(r => ({
      itemId: r.itemId,
      title: r.title,
      collection: r.collection,
      itemType: r.itemType,
      presenceScope: r.presenceScope,
      authorityStatus: r.authorityStatus,
      score: r.score,
      rank: r.rank,
      matchedFields: r.matchedFields,
      matchedFiles: r.matchedFiles.map(f => ({
        fileId: f.fileId,
        fileName: f.fileName,
        fileType: f.fileType,
        extractionMethod: f.extractionMethod,
        ocrQuality: f.ocrQuality,
        matchedField: f.matchedField,
      })),
      snippets: r.snippets,
    })),
    used_in_response: params.usedInResponse,
    session_id: params.sessionId ?? null,
  })

  if (error) {
    console.error('[chat-library-search] Failed to log Library search:', error)
  }
}

// ─── Result Summary for Search Log ──────────────────────────────────────────

export function formatLibraryResultSummary(results: LibrarySearchResult[]): string {
  if (results.length === 0) return 'No useful Library results found.'
  return results.map(r => {
    let line = `[${r.rank}] ${r.title} (${r.authorityStatus}, scope: ${r.presenceScope}, score: ${r.score})`
    if (r.matchedFields.length > 0) line += ` — matched: ${r.matchedFields.join(', ')}`
    if (r.matchedFiles.length > 0) line += ` — files: ${r.matchedFiles.map(f => f.fileName).join(', ')}`
    return line
  }).join('\n')
}
