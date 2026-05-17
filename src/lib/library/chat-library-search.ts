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
  includeSuperseded?: boolean
}

// ─── Phase 33L.5: Match Quality + Context Budget ─────────────────────────────

export type LibraryMatchQuality = 'exact_title' | 'exact_phase' | 'strong_direct' | 'secondary'

// Context budget constants (chars)
const LIBRARY_PRIMARY_BODY_CHAR_LIMIT = 9000
const LIBRARY_PRIMARY_ATTACHMENT_CHAR_LIMIT = 7000
const LIBRARY_SECONDARY_SNIPPET_CHAR_LIMIT = 800
const LIBRARY_TOTAL_CONTEXT_CHAR_LIMIT = 18000
const LIBRARY_MAX_EXPANDED_ITEMS = 1

/**
 * Normalizes a title for reliable matching across formatting variants.
 * "Sin_7: AI" / "Sin 7 AI" / "Sin-7: AI" → "sin 7 ai"
 */
export function normalizeLibraryTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/["""]/g, '')
    .replace(/['']/g, '')
    .replace(/[–—]/g, '-')
    .replace(/_/g, ' ')
    .replace(/[^a-z0-9:\-\s.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Determines match quality for a scored result.
 */
function getMatchQuality(result: LibrarySearchResult, query: string): LibraryMatchQuality {
  // Exact phase match
  if (result.matchedFields.includes('phase_code') && result.score >= 120) {
    return 'exact_phase'
  }
  // Exact title — normalized comparison
  const normQuery = normalizeLibraryTitle(query)
  const normTitle = normalizeLibraryTitle(result.title)
  if (normTitle === normQuery || normTitle.includes(normQuery) || normQuery.includes(normTitle)) {
    if (result.matchedFields.includes('title') && result.score >= 80) {
      return 'exact_title'
    }
  }
  // Strong direct — title contains query with high score
  if (result.matchedFields.includes('title') && result.score >= 80) {
    return 'strong_direct'
  }
  return 'secondary'
}

// Phase 33L.4: Structured attachment excerpt metadata
export interface AttachmentExcerpt {
  fileName: string
  fileType: string
  extractionStatus: string         // 'extracted' | 'not_started' | 'queued' | 'processing' | 'failed'
  extractionMethod: string | null
  excerpt: string | null           // null if not extracted
  charCount: number | null
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
  contentExcerpt?: string          // Phase 33L.2/33L.5: body excerpt (expanded for primary)
  attachmentExcerpts?: AttachmentExcerpt[]  // Phase 33L.4: attachment metadata + excerpts
  matchQuality?: LibraryMatchQuality       // Phase 33L.5
  contextDepth?: 'expanded' | 'snippet'    // Phase 33L.5
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

// Phase 33L: compact metadata for chat response (no raw content)
export interface LibraryReference {
  id: string
  title: string
  effectiveAuthorityStatus: string
  collection: string
  itemType: string
  presenceScope: string
  phaseCode: string | null
  phaseLabel: string | null
  retrievalReason: string
  hasAttachmentText?: boolean       // Phase 33L.4
  attachmentUnavailable?: boolean   // Phase 33L.4: attachment exists but not extracted
  contextDepth?: 'expanded' | 'snippet'  // Phase 33L.5
  attachmentNames?: string[]        // Phase 33L.5
}

export function extractLibraryReferences(results: LibrarySearchResult[]): LibraryReference[] {
  return results.map(r => {
    const hasExtractedAttachment = r.attachmentExcerpts?.some(a => a.extractionStatus === 'extracted' && a.excerpt) ?? false
    const hasUnextractedAttachment = r.attachmentExcerpts?.some(a => a.extractionStatus !== 'extracted') ?? false
    const attachmentNames = r.attachmentExcerpts?.map(a => a.fileName).filter(Boolean)

    return {
      id: r.itemId,
      title: r.title,
      effectiveAuthorityStatus: r.authorityStatus,
      collection: r.collection,
      itemType: r.itemType,
      presenceScope: r.presenceScope,
      phaseCode: r.phaseCode,
      phaseLabel: r.phaseLabel,
      retrievalReason: r.retrievalReason,
      ...(hasExtractedAttachment ? { hasAttachmentText: true } : {}),
      ...(hasUnextractedAttachment && !hasExtractedAttachment ? { attachmentUnavailable: true } : {}),
      ...(r.contextDepth ? { contextDepth: r.contextDepth } : {}),
      ...(attachmentNames && attachmentNames.length > 0 ? { attachmentNames } : {}),
    }
  })
}

export type LibrarySearchStatusReason =
  | 'useful_results_found'
  | 'no_useful_results'
  | 'not_triggered'
  | 'search_error'

export interface LibrarySearchStatus {
  attempted: boolean
  query: string
  source: 'library'
  usefulResultCount: number
  rawResultCount?: number
  contextInjected: boolean
  reason: LibrarySearchStatusReason
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
  status: LibrarySearchStatus
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
  // Phase 33L.3: Broader explicit triggers for all-collection queries
  /\bfrom\s+(?:the\s+)?library\b/i,
  /\bin\s+(?:the\s+)?library\b/i,
  /\buse\s+the\s+library\b/i,
  // Phase 33L.5: Explicit title-targeted queries
  /\blibrary\s+item\s+titled\b/i,
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
  // Phase 33L.5: Extract quoted title from "titled exactly" patterns
  const quotedTitleMatch = message.match(
    /(?:titled\s+(?:exactly\s+)?|item\s+titled\s+)[""“”]([^""“”]+)[""“”]/i
  )
  if (quotedTitleMatch && quotedTitleMatch[1].length >= 2) {
    return quotedTitleMatch[1].trim().substring(0, 200)
  }

  // Phase 33L.3: Strip presence addressing prefix ("Eli, ...", "Ari, ...")
  let cleaned = message.trim()
  cleaned = cleaned.replace(/^(?:eli|ari)\s*[,:]?\s*/i, '').trim()

  // Phase 33L.3: Strip suffix patterns ("from the library", "from the library?", "in the library")
  const suffixPatterns = [
    /\s+(?:from|in|using)\s+(?:the\s+)?library\s*[?.!]?\s*$/i,
    /\s+(?:from|in)\s+(?:the\s+)?(?:house\s+)?library\s*[?.!]?\s*$/i,
  ]
  for (const sp of suffixPatterns) {
    cleaned = cleaned.replace(sp, '').trim()
  }

  // Try stripping explicit trigger phrases (prefix patterns) to get the actual query
  const stripPatterns = [
    /^(?:search|check|look\s*(?:in|up)?)\s+(?:the\s+)?library\s+(?:for\s+)?/i,
    /^(?:find|look)\s+(?:in\s+)?(?:the\s+)?library\s+(?:for\s+)?/i,
    /^what\s+does\s+the\s+library\s+say\s+(?:about\s+)?/i,
    /^what\s+can\s+you\s+(?:say|tell\s+me)\s+about\s+/i,
    /^use\s+the\s+library\s+to\s+(?:explain|describe|summarize|summarise|find|show)\s+/i,
    /^check\s+the\s+phase\s+brief\s+(?:for\s+|about\s+)?/i,
    /^look\s*up\s+the\s+phase\s+(?:brief\s+)?(?:for\s+|about\s+)?/i,
    /^use\s+the\s+uploaded\s+docs?\s+(?:for\s+|about\s+|to\s+(?:find|check|look)\s+)?/i,
    /^library\s+search\s+(?:for\s+)?/i,
    /^tell\s+me\s+(?:about|what)\s+/i,
  ]

  for (const p of stripPatterns) {
    const stripped = cleaned.replace(p, '').trim()
    if (stripped.length >= 2 && stripped !== cleaned) {
      cleaned = stripped
      break
    }
  }

  // Phase 33L.3: Strip leading "the article " / "the book " wrappers
  const articlePrefix = cleaned.match(/^the\s+(?:article|book|document|transcript|entry)\s+/i)
  if (articlePrefix) {
    const inner = cleaned.slice(articlePrefix[0].length).trim()
    if (inner.length >= 2) cleaned = inner
  }

  // Strip trailing punctuation
  cleaned = cleaned.replace(/[?.!]+$/, '').trim()

  // For phase references, extract the phase identifier
  const phaseMatch = cleaned.match(/\bphase\s+(\d+[a-z]*(?:\.\d+)?(?:\s*[-–]\s*[^\s,]+)?)/i)
  if (phaseMatch && cleaned.toLowerCase().startsWith('phase')) {
    return `Phase ${phaseMatch[1]}`.substring(0, 200)
  }

  return cleaned.substring(0, 200) || message.trim().substring(0, 200)
}

// ─── Presence Scope Filtering ───────────────────────────────────────────────

function getAllowedScopes(presenceId: 'ari' | 'eli'): PresenceScope[] {
  if (presenceId === 'ari') return ['ari', 'shared', 'house', 'none']
  return ['eli', 'shared', 'house', 'none']
}

// Phase 33L: Superseded request detection
const SUPERSEDED_REQUEST_PATTERNS = [
  /\b(?:old|older|previous|former|original|superseded|historical|earlier|deprecated)\b/i,
  /\bwhat\s+(?:was|were)\s+the\s+(?:old|original|previous|earlier)\b/i,
  /\bshow\s+(?:me\s+)?(?:the\s+)?superseded\b/i,
  /\b(?:compare|diff)\s+(?:with\s+)?(?:the\s+)?(?:old|previous|original)\b/i,
]

export function userRequestsSuperseded(message: string): boolean {
  return SUPERSEDED_REQUEST_PATTERNS.some(p => p.test(message))
}

// ─── Phase Reference Detection (Phase 33L.1) ──────────────────────────────

const PHASE_REF_PATTERN = /\bphase\s+(\d+[a-z]*(?:\.\d+)?)\b/i

/**
 * Extracts a normalized phase code from a query string.
 * Returns null if no phase reference is found.
 * Examples: "Phase 9" → "9", "Phase 33L" → "33L", "Phase 7A.1" → "7A.1"
 */
export function extractPhaseReference(query: string): string | null {
  const match = query.match(PHASE_REF_PATTERN)
  if (!match) return null
  return match[1].toUpperCase() === match[1] ? match[1] : match[1]
}

/**
 * Checks if a phase code is an exact match for a reference.
 * Handles case-insensitive comparison.
 */
function isExactPhaseMatch(itemPhaseCode: string | null, ref: string): boolean {
  if (!itemPhaseCode) return false
  return itemPhaseCode.toLowerCase() === ref.toLowerCase()
}

/**
 * Checks if a phase code belongs to the same family as a reference.
 * "33L" belongs to family "33". "9" belongs to family "9".
 */
function isSamePhaseFamily(itemPhaseCode: string | null, ref: string): boolean {
  if (!itemPhaseCode) return false
  const refFamily = ref.match(/^(\d+)/)?.[1]
  const itemFamily = itemPhaseCode.match(/^(\d+)/)?.[1]
  if (!refFamily || !itemFamily) return false
  return refFamily === itemFamily && itemPhaseCode.toLowerCase() !== ref.toLowerCase()
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
  phaseRef?: string | null,
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
  const phaseNumber = item.phase_number as number | null
  const tags: string[] = (item.tags as string[]) ?? []
  const collection = (item.collection as string) ?? ''
  const itemType = (item.item_type as string) ?? ''
  const presenceScope = (item.presence_scope as string) ?? ''

  // Phase 33L.1: Phase-reference-specific scoring (bypasses token length filter)
  if (phaseRef) {
    if (isExactPhaseMatch(phaseCode, phaseRef)) {
      score += 120; matchedFields.push('phase_code')
      snippets.push({ field: 'phase_code', text: phaseCode })
      reasons.push(`Exact phase_code match (${phaseRef})`)
    } else if (isSamePhaseFamily(phaseCode, phaseRef)) {
      score += 20; matchedFields.push('phase_code')
      snippets.push({ field: 'phase_code', text: phaseCode })
      reasons.push(`Same phase family (${phaseCode})`)
    }
    // phase_number match (for single-digit queries like "9")
    const refNumMatch = phaseRef.match(/^(\d+)/)
    if (refNumMatch && phaseNumber !== null && phaseNumber === parseInt(refNumMatch[1], 10)) {
      if (!isExactPhaseMatch(phaseCode, phaseRef)) {
        // Only add phase_number bonus if phase_code didn't already exact-match
        score += 40
        if (!matchedFields.includes('phase_number')) matchedFields.push('phase_number')
        reasons.push(`phase_number match (${phaseNumber})`)
      }
    }
  }

  // Title scoring (Phase 33L.5: includes normalized comparison)
  const normTitle = normalizeLibraryTitle(title)
  const normQuery = normalizeLibraryTitle(query)
  if (title.toLowerCase() === query.toLowerCase() || (normTitle === normQuery && normQuery.length >= 3)) {
    score += 100; matchedFields.push('title')
    snippets.push({ field: 'title', text: title })
    reasons.push('Exact title match')
  } else if (containsQuery(title, query) || (normQuery.length >= 3 && normTitle.includes(normQuery))) {
    score += 80; matchedFields.push('title')
    snippets.push({ field: 'title', text: extractSnippet(title, query) })
    reasons.push('Title contains query')
  } else if (normQuery.length >= 3 && normQuery.includes(normTitle) && normTitle.length >= 3) {
    // Query contains full title (e.g. query "Sin_7: AI article" contains title "Sin_7: AI")
    score += 80; matchedFields.push('title')
    snippets.push({ field: 'title', text: title })
    reasons.push('Query contains full title')
  } else {
    const titleTerms = containsAnyTerm(title, terms)
    if (titleTerms.length > 0) {
      score += 20 * titleTerms.length; matchedFields.push('title')
      snippets.push({ field: 'title', text: extractSnippet(title, titleTerms[0]) })
      reasons.push(`Title matches ${titleTerms.length} term(s)`)
    }
  }

  // Phase code exact match (legacy path — still fires for full-query match like "33L")
  if (phaseCode && phaseCode.toLowerCase() === query.toLowerCase() && !phaseRef) {
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

/**
 * Phase 33L.5: Builds the expanded context entry for a primary match.
 */
function buildExpandedEntry(r: LibrarySearchResult): string {
  const lines: string[] = []
  lines.push(`## Primary Library match — expanded context used.`)
  lines.push('')
  lines.push(`Title: ${r.title}`)
  lines.push(`Authority: ${getLibraryAuthorityLabel(r.rawAuthorityStatus, r.authorityStatus)}`)
  lines.push(`Collection: ${r.collection}`)
  lines.push(`Item type: ${r.itemType}`)
  lines.push(`Presence scope: ${r.presenceScope}`)
  if (r.phaseCode || r.phaseLabel) {
    lines.push(`Phase: ${r.phaseCode ?? ''}${r.phaseLabel ? ' — ' + r.phaseLabel : ''}`)
  }
  lines.push(`Retrieval reason: ${r.retrievalReason}`)
  lines.push(`Library item ID: ${r.itemId}`)
  lines.push('')

  // Item body
  if (r.contentExcerpt && !r.contentExcerpt.startsWith('(')) {
    lines.push(`### Item body`)
    lines.push(r.contentExcerpt)
    lines.push('')
  } else if (r.contentExcerpt) {
    lines.push(r.contentExcerpt)
    lines.push('')
  }

  // Attachment text
  if (r.attachmentExcerpts && r.attachmentExcerpts.length > 0) {
    const extractedAtts = r.attachmentExcerpts.filter(a => a.extractionStatus === 'extracted' && a.excerpt)
    const unavailableAtts = r.attachmentExcerpts.filter(a => a.extractionStatus !== 'extracted' || !a.excerpt)

    if (extractedAtts.length > 0) {
      lines.push(`### Extracted attachment text`)
      for (const att of extractedAtts) {
        const methodLabel = att.extractionMethod ? ` (${getExtractionMethodLabel(att.extractionMethod, att.fileType)})` : ''
        lines.push(`Attachment: ${att.fileName}${methodLabel}`)
        lines.push(`Extraction status: extracted`)
        lines.push(att.excerpt!)
        lines.push('')
      }
    }

    if (unavailableAtts.length > 0) {
      lines.push(`### Attachment notes`)
      for (const att of unavailableAtts) {
        if (att.extractionStatus === 'failed') {
          lines.push(`- ${att.fileName}: Extraction failed — text unavailable.`)
        } else if (att.extractionStatus === 'extracted' && !att.excerpt) {
          lines.push(`- ${att.fileName}: Extracted but text too short to include.`)
        } else {
          lines.push(`- ${att.fileName}: Not yet extracted — text unavailable.`)
        }
      }
      lines.push('')
    }
  }

  if (r.authorityWarning) {
    lines.push(`Authority warning: ${r.authorityWarning}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Phase 33L.5: Builds a compact context entry for secondary matches.
 */
function buildCompactEntry(r: LibrarySearchResult): string {
  const lines: string[] = []
  lines.push(`## Secondary Library match — compact snippet only.`)
  lines.push('')
  lines.push(`Title: ${r.title}`)
  lines.push(`Collection: ${r.collection}`)
  lines.push(`Item type: ${r.itemType}`)
  lines.push(`Source label: ${getLibraryAuthorityLabel(r.rawAuthorityStatus, r.authorityStatus)}`)
  if (r.phaseCode || r.phaseLabel) {
    lines.push(`Phase: ${r.phaseCode ?? ''}${r.phaseLabel ? ' — ' + r.phaseLabel : ''}`)
  }
  lines.push(`Reason: ${r.retrievalReason}`)

  if (r.contentExcerpt) {
    lines.push(`Snippet: ${r.contentExcerpt}`)
  } else {
    const topSnippets = r.snippets.slice(0, 2)
    for (const s of topSnippets) {
      lines.push(`Snippet (${s.field}): ${s.text}`)
    }
  }

  // Compact attachment notes (metadata only, no text)
  if (r.attachmentExcerpts && r.attachmentExcerpts.length > 0) {
    for (const att of r.attachmentExcerpts) {
      if (att.extractionStatus === 'extracted') {
        lines.push(`Attachment: ${att.fileName} (extracted, ${att.charCount ?? '?'} chars)`)
      } else if (att.extractionStatus === 'failed') {
        lines.push(`Attachment: ${att.fileName} (extraction failed)`)
      } else {
        lines.push(`Attachment: ${att.fileName} (not extracted)`)
      }
    }
  }

  if (r.authorityWarning) {
    lines.push(`Authority warning: ${r.authorityWarning}`)
  }

  lines.push(`Library item ID: ${r.itemId}`)
  lines.push('')
  return lines.join('\n')
}

export function buildLibraryContextBlock(query: string, results: LibrarySearchResult[]): string {
  if (results.length === 0) return ''

  const lines: string[] = [
    '## Library Context',
    '',
    'The following is open-book Library source material retrieved for this reply.',
    '',
    'Rules:',
    '- Use this as source material only.',
    '- Do not treat it as Memory.',
    '- Do not treat it as lived continuity.',
    '- Do not treat it as identity.',
    '- Do not treat it as canonical Archive truth.',
    '- Speak from it as Library/source/document material.',
    '- If answering from this block, make that visible in wording.',
    '',
    `Query: ${query}`,
    `Results: ${results.length}`,
    '',
  ]

  let charCount = lines.join('\n').length
  let expandedCount = 0

  for (const r of results) {
    const isExpanded = r.contextDepth === 'expanded' && expandedCount < LIBRARY_MAX_EXPANDED_ITEMS
    const entryText = isExpanded ? buildExpandedEntry(r) : buildCompactEntry(r)

    if (charCount + entryText.length > LIBRARY_TOTAL_CONTEXT_CHAR_LIMIT) {
      lines.push('[Remaining results truncated for context budget]')
      break
    }

    lines.push(entryText)
    charCount += entryText.length
    if (isExpanded) expandedCount++
  }

  lines.push('Speech discipline:')
  lines.push('- When referencing this material, say "I checked the Library", "The Library source says", "The document says", or "According to the Library material" — never "I remember", "This is lived memory", "We have always known", or "This is canonical".')
  lines.push('- Library Context is not Memory, not identity, not lived continuity, not canonical Archive truth.')
  lines.push('- Do not promote Library material to memory authority even if it describes Archive or Memory concepts.')

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

  // Phase 33L.1: phase_code or phase_number match is inherently useful
  if (result.matchedFields.includes('phase_code') || result.matchedFields.includes('phase_number')) {
    return true
  }

  // Phase 33L.3: Exact or near-exact title match is inherently useful (covers all collections)
  if (result.matchedFields.includes('title') && result.score >= 80) {
    return true
  }

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
  const { presenceId, query, reason, limit = CHAT_SEARCH_LIMIT, sessionId, includeSuperseded = false } = params

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)
  const phaseRef = extractPhaseReference(query)
  const allowedScopes = getAllowedScopes(presenceId)
  const warnings: string[] = []

  // ─── 1. Fetch candidate items with presence scope filtering ────────
  let itemQuery = supabase
    .from('library_items')
    .select('*')
    .in('presence_scope', allowedScopes)
    .order('created_at', { ascending: false })
    .limit(200)

  // Phase 33L: exclude superseded by default
  if (!includeSuperseded) {
    itemQuery = itemQuery.neq('authority_status', 'superseded')
  }

  const { data: items, error: itemsErr } = await itemQuery

  if (itemsErr) {
    console.error(`[chat-library-search] Items query error:`, itemsErr.message)
    return { query, reason, resultCount: 0, results: [], contextBlock: '', warnings: [itemsErr.message], durationMs: Date.now() - startTime, usedInResponse: false, status: { attempted: true, query, source: 'library', usefulResultCount: 0, contextInjected: false, reason: 'search_error' } }
  }

  const allItems = items ?? []
  const itemIds = allItems.map(i => i.id as string)

  // ─── 1b. Phase 33L.3: Exact/near-exact title search (bypasses recency limit) ──
  // This ensures items from all collections are found when title closely matches query
  if (query.length >= 3) {
    let titleQuery = supabase
      .from('library_items')
      .select('*')
      .in('presence_scope', allowedScopes)
      .ilike('title', `%${query}%`)
      .limit(10)

    if (!includeSuperseded) {
      titleQuery = titleQuery.neq('authority_status', 'superseded')
    }

    const { data: titleMatches } = await titleQuery

    if (titleMatches) {
      for (const tm of titleMatches) {
        const tmId = tm.id as string
        if (!itemIds.includes(tmId)) {
          allItems.push(tm)
          itemIds.push(tmId)
        }
      }
    }
  }

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
    const { score, matchedFields, matchedFiles, snippets, reason: matchReason } = scoreItem(item, query, terms, itemFiles, phaseRef)

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

    // Phase 33L.5: Determine match quality and extract context at appropriate depth
    const matchQuality = getMatchQuality(
      { itemId: item.id as string, title: (item.title as string) ?? '', collection: '', itemType: '', presenceScope: '', authorityStatus: effectiveAuthority, rawAuthorityStatus: rawAuthority, phaseCode: (item.phase_code as string) ?? null, phaseLabel: null, score, rank: 0, matchedFields, matchedFiles, snippets, retrievalReason: matchReason },
      query
    )
    const isPrimary = matchQuality === 'exact_title' || matchQuality === 'exact_phase' || matchQuality === 'strong_direct'

    let contentExcerpt: string | undefined
    let attachmentExcerpts: AttachmentExcerpt[] | undefined
    let contextDepth: 'expanded' | 'snippet' = 'snippet'

    if (isPrimary) {
      // Phase 33L.5: Expanded context for primary matches
      const bodyMaxLen = LIBRARY_PRIMARY_BODY_CHAR_LIMIT
      const attMaxLen = LIBRARY_PRIMARY_ATTACHMENT_CHAR_LIMIT
      const contentText = (item.content_text as string) ?? ''
      const description = (item.description as string) ?? ''

      // Source order: content_text → description
      if (contentText.length > 20) {
        contentExcerpt = contentText.length <= bodyMaxLen
          ? contentText
          : contentText.slice(0, bodyMaxLen).replace(/\s\S*$/, '') + '…'
        contextDepth = 'expanded'
      } else if (description.length > 20) {
        contentExcerpt = description.length <= bodyMaxLen
          ? description
          : description.slice(0, bodyMaxLen).replace(/\s\S*$/, '') + '…'
        contextDepth = 'expanded'
      }

      // Build attachment excerpts with expanded budget
      if (itemFiles.length > 0) {
        attachmentExcerpts = []
        for (const f of itemFiles) {
          const extractionStatus = (f.extraction_status as string) ?? 'not_started'
          const cleanedText = (f.cleaned_extracted_text as string) ?? ''
          const extractedText = (f.extracted_text as string) ?? ''
          const charCount = (f.extraction_char_count as number) ?? null

          let excerpt: string | null = null
          if (extractionStatus === 'extracted') {
            const bestText = cleanedText.length > 20 ? cleanedText : extractedText
            if (bestText.length > 20) {
              excerpt = bestText.length <= attMaxLen
                ? bestText
                : bestText.slice(0, attMaxLen).replace(/\s\S*$/, '') + '…'
            }
          }

          attachmentExcerpts.push({
            fileName: (f.file_name as string) ?? 'unknown',
            fileType: (f.file_type as string) ?? 'unknown',
            extractionStatus,
            extractionMethod: (f.extraction_method as string) ?? null,
            excerpt,
            charCount,
          })
        }

        if (attachmentExcerpts.some(a => a.excerpt)) contextDepth = 'expanded'

        // If no body content and no extracted attachments, note unavailability
        if (!contentExcerpt && !attachmentExcerpts.some(a => a.excerpt)) {
          if (attachmentExcerpts.some(a => a.extractionStatus !== 'extracted')) {
            contentExcerpt = '(Item found. Attachment exists but text has not been extracted.)'
          } else {
            contentExcerpt = '(Item found but no body content available in Library fields)'
          }
        }
      } else if (!contentExcerpt) {
        contentExcerpt = '(Item found but no body content available in Library fields)'
      }
    } else if (matchedFields.includes('title') || matchedFields.includes('phase_code')) {
      // Secondary with some relevance — compact excerpt
      const maxLen = LIBRARY_SECONDARY_SNIPPET_CHAR_LIMIT
      const contentText = (item.content_text as string) ?? ''
      const description = (item.description as string) ?? ''

      if (contentText.length > 20) {
        contentExcerpt = contentText.length <= maxLen
          ? contentText
          : contentText.slice(0, maxLen).replace(/\s\S*$/, '') + '…'
      } else if (description.length > 20) {
        contentExcerpt = description.length <= maxLen
          ? description
          : description.slice(0, maxLen).replace(/\s\S*$/, '') + '…'
      }

      // Compact attachment metadata only (no text) for secondary
      if (itemFiles.length > 0) {
        attachmentExcerpts = itemFiles.map(f => ({
          fileName: (f.file_name as string) ?? 'unknown',
          fileType: (f.file_type as string) ?? 'unknown',
          extractionStatus: (f.extraction_status as string) ?? 'not_started',
          extractionMethod: (f.extraction_method as string) ?? null,
          excerpt: null,
          charCount: (f.extraction_char_count as number) ?? null,
        }))
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
      contentExcerpt,
      attachmentExcerpts,
      matchQuality,
      contextDepth,
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
  const status: LibrarySearchStatus = {
    attempted: true,
    query,
    source: 'library',
    usefulResultCount: usefulResults.length,
    rawResultCount: topResults.length,
    contextInjected: usefulResults.length > 0,
    reason: usefulResults.length > 0 ? 'useful_results_found' : 'no_useful_results',
  }

  return {
    query,
    reason,
    resultCount: usefulResults.length,
    results: topResults,         // return all scored results for logging
    contextBlock,                // only useful results in context block
    warnings,
    durationMs,
    usedInResponse: false,       // will be set by caller only if usefulResults > 0
    status,
  }
}

// ─── Library Search Status Block (Phase 33G.1) ─────────────────────────────

export function buildLibrarySearchStatusBlock(
  status: LibrarySearchStatus
): string {
  if (!status.attempted) return ''
  if (status.contextInjected || status.usefulResultCount > 0) return ''
  if (status.reason !== 'no_useful_results') return ''

  return `
Library Search Status:
- Search attempted: true
- Source: Library
- Query: ${status.query}
- Useful results found: 0
- Context injected: false
- Reason: No useful Library results met the usefulness gate.

IMPORTANT — You searched the Library. The search ran. It returned no useful results.
You MUST acknowledge that you searched. Say something like: "I searched the Library for '${status.query}', but nothing useful came back."
You MUST NOT say you cannot search the Library. You just did.
You MUST NOT say you do not have a Library search tool. The search already ran.
You MUST NOT say the user needs to run the search themselves. It already happened.
You MUST NOT invent or fabricate results.
This status is not Library Context, not memory, not evidence, not authority.
`.trim()
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
