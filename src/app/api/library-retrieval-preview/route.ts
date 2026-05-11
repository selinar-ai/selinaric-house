// Phase 33F — Library Retrieval Preview API
//
// POST /api/library-retrieval-preview
//
// Deterministic retrieval scoring against Library items and extracted attachment text.
// Returns ranked results with match snippets, authority handling, and copyable preview block.
//
// Retrieval is not Memory. RAG preview is not chat injection.
// Extracted text is not lived continuity.
// No embeddings. No vector search. No Ari/Eli chat injection. No Memory Review.
// No auto-promotion. No model-generated summaries.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  getEffectiveAuthorityStatus,
  isInvalidCanonicalMemoryLabel,
} from '@/lib/library/authority'
import type { AuthorityStatus, PresenceScope, RetrievedContextItem } from '@/lib/library/authority'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Filters = {
  collection?: string
  item_type?: string
  authority_status?: string
  presence_scope?: string
  phase_code?: string
  file_type?: string
  extraction_status?: string
  ocr_quality?: string
}

type MatchedFile = {
  file_id: string
  file_name: string
  file_type: string
  extraction_method: string | null
  extraction_status: string | null
  ocr_quality: string | null
  needs_review: boolean | null
  matched_field: 'extracted_text' | 'cleaned_extracted_text' | 'file_name'
  snippet: string
}

type Snippet = {
  field: string
  text: string
}

type RetrievalResult = {
  item: Record<string, unknown>
  effective_authority_status: string
  raw_authority_status: string
  authority_warning?: string
  score: number
  rank: number
  matched_fields: string[]
  matched_files: MatchedFile[]
  snippets: Snippet[]
  retrieval_reason: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MAX_SNIPPET = 400

function extractSnippet(text: string, query: string, maxLen: number = MAX_SNIPPET): string {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)

  if (idx === -1) {
    return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '')
  }

  const start = Math.max(0, idx - 80)
  const end = Math.min(text.length, idx + query.length + (maxLen - 80))
  let snippet = text.substring(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'
  return snippet
}

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

function containsQuery(text: string | null | undefined, query: string): boolean {
  if (!text) return false
  return text.toLowerCase().includes(query.toLowerCase())
}

function containsAnyTerm(text: string | null | undefined, terms: string[]): string[] {
  if (!text) return []
  const lower = text.toLowerCase()
  return terms.filter(t => lower.includes(t))
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreItem(
  item: Record<string, unknown>,
  query: string,
  terms: string[],
  files: Record<string, unknown>[],
): { score: number; matchedFields: string[]; matchedFiles: MatchedFile[]; snippets: Snippet[]; reason: string } {
  let score = 0
  const matchedFields: string[] = []
  const matchedFiles: MatchedFile[] = []
  const snippets: Snippet[] = []
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
    score += 100
    matchedFields.push('title')
    snippets.push({ field: 'title', text: title })
    reasons.push('Exact title match')
  } else if (containsQuery(title, query)) {
    score += 80
    matchedFields.push('title')
    snippets.push({ field: 'title', text: extractSnippet(title, query) })
    reasons.push('Title contains query')
  } else {
    const titleTerms = containsAnyTerm(title, terms)
    if (titleTerms.length > 0) {
      score += 20 * titleTerms.length
      matchedFields.push('title')
      snippets.push({ field: 'title', text: extractSnippet(title, titleTerms[0]) })
      reasons.push(`Title matches ${titleTerms.length} term(s)`)
    }
  }

  // Phase code exact match
  if (phaseCode && phaseCode.toLowerCase() === query.toLowerCase()) {
    score += 60
    matchedFields.push('phase_code')
    snippets.push({ field: 'phase_code', text: phaseCode })
    reasons.push('Exact phase_code match')
  }

  // Phase label
  if (containsQuery(phaseLabel, query)) {
    score += 40
    matchedFields.push('phase_label')
    snippets.push({ field: 'phase_label', text: extractSnippet(phaseLabel, query) })
    reasons.push('Phase label contains query')
  }

  // Tags
  const matchedTags = tags.filter(t => containsQuery(t, query) || terms.some(term => t.toLowerCase().includes(term)))
  if (matchedTags.length > 0) {
    score += 35
    matchedFields.push('tags')
    snippets.push({ field: 'tags', text: matchedTags.join(', ') })
    reasons.push(`Tag match: ${matchedTags.join(', ')}`)
  }

  // Description
  if (containsQuery(description, query)) {
    score += 30
    matchedFields.push('description')
    snippets.push({ field: 'description', text: extractSnippet(description, query) })
    reasons.push('Description contains query')
  }

  // Content text
  if (containsQuery(contentText, query)) {
    score += 20
    matchedFields.push('content_text')
    snippets.push({ field: 'content_text', text: extractSnippet(contentText, query) })
    reasons.push('Content text contains query')
  }

  // Collection / item_type / presence_scope (term match, lower boost)
  if (containsQuery(collection, query)) {
    score += 10
    matchedFields.push('collection')
    reasons.push('Collection match')
  }
  if (containsQuery(itemType, query)) {
    score += 10
    matchedFields.push('item_type')
    reasons.push('Item type match')
  }
  if (containsQuery(presenceScope, query)) {
    score += 10
    matchedFields.push('presence_scope')
    reasons.push('Presence scope match')
  }

  // File attachments
  for (const file of files) {
    const fileName = (file.file_name as string) ?? ''
    const cleanedText = (file.cleaned_extracted_text as string) ?? ''
    const extractedText = (file.extracted_text as string) ?? ''
    const fileType = (file.file_type as string) ?? ''
    const extractionMethod = (file.extraction_method as string) ?? null
    const extractionStatus = (file.extraction_status as string) ?? null
    const ocrQuality = (file.ocr_quality as string) ?? null
    const needsReview = (file.needs_review as boolean) ?? null

    // Prefer cleaned text over raw
    if (containsQuery(cleanedText, query)) {
      score += 25
      matchedFiles.push({
        file_id: file.id as string,
        file_name: fileName,
        file_type: fileType,
        extraction_method: extractionMethod,
        extraction_status: extractionStatus,
        ocr_quality: ocrQuality,
        needs_review: needsReview,
        matched_field: 'cleaned_extracted_text',
        snippet: extractSnippet(cleanedText, query),
      })
      reasons.push(`Cleaned extracted text match in ${fileName}`)
    } else if (containsQuery(extractedText, query)) {
      score += 15
      matchedFiles.push({
        file_id: file.id as string,
        file_name: fileName,
        file_type: fileType,
        extraction_method: extractionMethod,
        extraction_status: extractionStatus,
        ocr_quality: ocrQuality,
        needs_review: needsReview,
        matched_field: 'extracted_text',
        snippet: extractSnippet(extractedText, query),
      })
      reasons.push(`Extracted text match in ${fileName}`)
    }

    if (containsQuery(fileName, query)) {
      score += 20
      matchedFiles.push({
        file_id: file.id as string,
        file_name: fileName,
        file_type: fileType,
        extraction_method: extractionMethod,
        extraction_status: extractionStatus,
        ocr_quality: ocrQuality,
        needs_review: needsReview,
        matched_field: 'file_name',
        snippet: fileName,
      })
      reasons.push(`File name match: ${fileName}`)
    }

    // OCR quality penalty/boost
    if (ocrQuality === 'clean' && matchedFiles.length > 0) {
      score += 10
    } else if (ocrQuality === 'noisy' && matchedFiles.length > 0) {
      score -= 10
    }
  }

  return {
    score,
    matchedFields,
    matchedFiles,
    snippets,
    reason: reasons.join('; ') || 'No match',
  }
}

// ─── Preview Block Builder ──────────────────────────────────────────────────

function buildPreviewBlock(query: string, results: RetrievalResult[]): string {
  const lines: string[] = [
    'LIBRARY CONTEXT PREVIEW',
    'Preview only. Not Memory. Not sent to Ari/Eli chat.',
    '',
    `Query: ${query}`,
    '',
    `Retrieved results: ${results.length}`,
    '',
  ]

  for (const r of results) {
    const item = r.item
    lines.push(`[${r.rank}] ${item.title}`)
    lines.push(`Collection: ${item.collection}`)
    lines.push(`Item type: ${item.item_type}`)
    lines.push(`Presence scope: ${item.presence_scope}`)
    lines.push(`Authority status: ${r.effective_authority_status}`)

    if (item.phase_code || item.phase_label) {
      lines.push(`Phase: ${item.phase_code ?? ''}${item.phase_label ? ' — ' + item.phase_label : ''}`)
    }

    lines.push(`Matched fields: ${r.matched_fields.join(', ')}`)

    if (r.matched_files.length > 0) {
      lines.push(`Matched files: ${r.matched_files.map(f => f.file_name).join(', ')}`)
    }

    lines.push(`Score: ${r.score}`)
    lines.push(`Reason: ${r.retrieval_reason}`)

    if (r.snippets.length > 0) {
      lines.push('')
      lines.push('Snippet:')
      lines.push(r.snippets[0].text)
    }

    if (r.authority_warning) {
      lines.push('')
      lines.push('Authority warning:')
      lines.push(r.authority_warning)
    }

    lines.push('')
    lines.push(`Source: Library item ID: ${item.id}`)
    if (r.matched_files.length > 0) {
      for (const mf of r.matched_files) {
        lines.push(`File ID: ${mf.file_id}`)
      }
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  lines.push('')
  lines.push('Use as Library Context only. Do not treat as lived memory unless separately verified by archive_items.canonical_status = canonical.')

  return lines.join('\n')
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const supabase = getSupabase()

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const query = (body.query as string)?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  }

  const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 50)
  const filters = (body.filters as Filters) ?? {}
  const includeAttachments = body.include_attachments !== false
  const saveRun = body.save_run === true

  // Normalise query into terms
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length >= 2)

  // ─── 1. Fetch candidate Library items ─────────────────────────────────

  let itemQuery = supabase
    .from('library_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200) // fetch a reasonable candidate pool

  // Apply filters
  if (filters.collection) itemQuery = itemQuery.eq('collection', filters.collection)
  if (filters.item_type) itemQuery = itemQuery.eq('item_type', filters.item_type)
  if (filters.authority_status) itemQuery = itemQuery.eq('authority_status', filters.authority_status)
  if (filters.presence_scope) itemQuery = itemQuery.eq('presence_scope', filters.presence_scope)
  if (filters.phase_code) itemQuery = itemQuery.eq('phase_code', filters.phase_code)

  const { data: items, error: itemsErr } = await itemQuery

  if (itemsErr) {
    console.error('[library-retrieval-preview] Items query error:', itemsErr.message)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  const allItems = items ?? []
  const itemIds = allItems.map(i => i.id as string)

  // ─── 2. Fetch files for all candidate items ──────────────────────────

  let filesByItemId: Record<string, Record<string, unknown>[]> = {}

  if (includeAttachments && itemIds.length > 0) {
    let fileQuery = supabase
      .from('library_item_files')
      .select('*')
      .in('library_item_id', itemIds)

    if (filters.file_type) fileQuery = fileQuery.eq('file_type', filters.file_type)
    if (filters.extraction_status) fileQuery = fileQuery.eq('extraction_status', filters.extraction_status)
    if (filters.ocr_quality) fileQuery = fileQuery.eq('ocr_quality', filters.ocr_quality)

    const { data: files } = await fileQuery
    if (files) {
      for (const f of files) {
        const itemId = f.library_item_id as string
        if (!filesByItemId[itemId]) filesByItemId[itemId] = []
        filesByItemId[itemId].push(f)
      }
    }

    // Also find items that only match via attachment text (not in initial item set)
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
        let extraQuery = supabase.from('library_items').select('*').in('id', uniqueMissing)
        if (filters.collection) extraQuery = extraQuery.eq('collection', filters.collection)
        if (filters.authority_status) extraQuery = extraQuery.eq('authority_status', filters.authority_status)
        if (filters.presence_scope) extraQuery = extraQuery.eq('presence_scope', filters.presence_scope)

        const { data: extraItems } = await extraQuery
        if (extraItems) {
          for (const ei of extraItems) {
            allItems.push(ei)
            itemIds.push(ei.id as string)
          }
        }

        // Fetch files for the extra items
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

  // ─── 3. Score each item ───────────────────────────────────────────────

  const scoredResults: RetrievalResult[] = []
  const warnings: string[] = []

  for (const item of allItems) {
    const itemFiles = filesByItemId[item.id as string] ?? []
    const { score, matchedFields, matchedFiles, snippets, reason } = scoreItem(item, query, terms, itemFiles)

    if (score <= 0) continue

    // Authority handling — One Crown Rule
    const contextItem = itemToContextItem(item)
    const effectiveAuthority = getEffectiveAuthorityStatus(contextItem)
    const rawAuthority = item.authority_status as string
    const isRejected = isInvalidCanonicalMemoryLabel(contextItem)

    let authorityWarning: string | undefined
    if (isRejected) {
      authorityWarning = 'Original label rejected: canonical_memory without canonical archive proof. Effective authority: archive_only.'
      warnings.push(`Item "${item.title}" has invalid canonical_memory label — downgraded to archive_only.`)
    }

    // OCR warnings
    for (const mf of matchedFiles) {
      if (mf.ocr_quality === 'noisy') {
        warnings.push(`File "${mf.file_name}" has noisy OCR — text may be incomplete or unreliable.`)
      }
    }

    scoredResults.push({
      item,
      effective_authority_status: effectiveAuthority,
      raw_authority_status: rawAuthority,
      authority_warning: authorityWarning,
      score,
      rank: 0, // set after sort
      matched_fields: matchedFields,
      matched_files: matchedFiles,
      snippets,
      retrieval_reason: reason,
    })
  }

  // Sort descending by score
  scoredResults.sort((a, b) => b.score - a.score)

  // Apply limit and set ranks
  const topResults = scoredResults.slice(0, limit)
  topResults.forEach((r, i) => { r.rank = i + 1 })

  // ─── 4. Build preview block ───────────────────────────────────────────

  const previewBlock = buildPreviewBlock(query, topResults)

  // ─── 5. Optionally log retrieval run ──────────────────────────────────

  if (saveRun) {
    await supabase.from('library_retrieval_runs').insert({
      query,
      filters,
      result_count: topResults.length,
      preview_text: previewBlock.substring(0, 10000), // cap stored preview
    }).select()
  }

  const durationMs = Date.now() - startTime

  return NextResponse.json({
    query,
    result_count: topResults.length,
    results: topResults,
    preview_block: previewBlock,
    warnings,
    duration_ms: durationMs,
  })
}
