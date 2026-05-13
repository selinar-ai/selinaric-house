// Phase 33I — Library Semantic Index
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
// Reuses embed-text Edge Function (gte-small, 384 dims) from Phase 29A.
// No Memory writes. No Archive writes. No canonical_status changes.

import { createClient } from '@supabase/supabase-js'
import { chunkLibraryItem, type LibraryChunk } from './chunk-library-item'
import { classifyChunkQuality } from './chunk-quality'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Embedding Generation ─────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')

  const embedSecret = process.env.EMBED_TEXT_SECRET
  if (!embedSecret) throw new Error('EMBED_TEXT_SECRET is not set')

  const res = await fetch(`${supabaseUrl}/functions/v1/embed-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-embed-secret': embedSecret,
    },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`embed-text error ${res.status}: ${detail}`)
  }

  const data = await res.json() as { embedding?: unknown }
  if (!Array.isArray(data.embedding)) {
    throw new Error(`embed-text returned unexpected shape: ${JSON.stringify(data)}`)
  }

  return data.embedding as number[]
}

// ─── Index a single Library item ──────────────────────────────────────────

export interface IndexResult {
  libraryItemId: string
  title: string
  chunksCreated: number
  chunksSkipped: number
  errors: number
  firstError?: string
}

export async function indexLibraryItem(libraryItemId: string): Promise<IndexResult> {
  const supabase = getSupabase()

  const { data: item, error: itemErr } = await supabase
    .from('library_items')
    .select('id, title, description, content_text, collection, item_type, authority_status, presence_scope, phase_code, phase_label')
    .eq('id', libraryItemId)
    .single()

  if (itemErr || !item) {
    return { libraryItemId, title: '', chunksCreated: 0, chunksSkipped: 0, errors: 1, firstError: itemErr?.message ?? 'Item not found' }
  }

  const { data: files } = await supabase
    .from('library_item_files')
    .select('id, file_name, extracted_text, cleaned_extracted_text, extraction_method, extraction_status')
    .eq('library_item_id', libraryItemId)
    .in('extraction_status', ['extracted'])

  const attachmentTexts: { sourceField: string; text: string }[] = []
  for (const f of files ?? []) {
    const text = (f.cleaned_extracted_text as string) || (f.extracted_text as string)
    if (!text?.trim()) continue

    let sourceField = 'attachment_text'
    if (f.extraction_method === 'image_ocr') sourceField = 'ocr_text'
    else if (f.extraction_method === 'audio_transcript' || f.extraction_method === 'video_audio_transcript') sourceField = 'transcript_text'

    attachmentTexts.push({ sourceField, text })
  }

  const chunks = chunkLibraryItem({
    libraryItemId,
    title: item.title as string,
    description: item.description as string | null,
    contentText: item.content_text as string | null,
    attachmentTexts,
  })

  if (chunks.length === 0) {
    return { libraryItemId, title: item.title as string, chunksCreated: 0, chunksSkipped: 0, errors: 0 }
  }

  const { data: existing } = await supabase
    .from('library_chunks')
    .select('chunk_hash')
    .eq('library_item_id', libraryItemId)

  const existingHashes = new Set((existing ?? []).map(r => r.chunk_hash as string))

  let created = 0
  let skipped = 0
  let errors = 0
  let firstError: string | undefined

  for (const chunk of chunks) {
    if (existingHashes.has(chunk.chunkHash)) {
      skipped++
      continue
    }

    try {
      const embedding = await generateEmbedding(chunk.chunkText)

      const quality = classifyChunkQuality(chunk.chunkText, chunk.sourceField, item.title as string)

      const { error: insertErr } = await supabase.from('library_chunks').insert({
        library_item_id: libraryItemId,
        chunk_index: chunk.chunkIndex,
        chunk_text: chunk.chunkText,
        chunk_hash: chunk.chunkHash,
        source_field: chunk.sourceField,
        source_label: chunk.sourceField,
        collection: item.collection,
        item_type: item.item_type,
        authority_status: item.authority_status,
        effective_authority: item.authority_status,
        presence_scope: item.presence_scope,
        phase_code: item.phase_code,
        phase_label: item.phase_label,
        embedding: JSON.stringify(embedding),
        embedding_model: 'gte-small',
        embedding_provider: 'supabase_gte_small',
        embedding_dim: 384,
        char_count: chunk.charCount,
        token_estimate: chunk.tokenEstimate,
        chunk_quality: quality,
        is_code_artifact: quality === 'code_artifact' || quality === 'ui_artifact' || quality === 'prompt_artifact',
        is_title_only: quality === 'title_only',
      })

      if (insertErr) {
        errors++
        if (!firstError) firstError = insertErr.message
      } else {
        created++
      }
    } catch (err) {
      errors++
      if (!firstError) firstError = err instanceof Error ? err.message : String(err)
    }
  }

  return { libraryItemId, title: item.title as string, chunksCreated: created, chunksSkipped: skipped, errors, firstError }
}

// ─── Semantic Search ──────────────────────────────────────────────────────

const DEFAULT_SIMILARITY_THRESHOLD = 0.83
const DEFAULT_MATCH_COUNT = 10

export interface SemanticLibrarySearchInput {
  query: string
  limit?: number
  presenceScope?: string
  collection?: string
  authorityStatuses?: string[]
  similarityThreshold?: number
}

export interface SemanticLibrarySearchResult {
  chunkId: string
  libraryItemId: string
  title: string
  chunkText: string
  similarity: number
  sourceField: string
  collection?: string
  itemType?: string
  authorityStatus?: string
  effectiveAuthority?: string
  presenceScope?: string
  phaseCode?: string
  phaseLabel?: string
}

export async function semanticLibrarySearch(
  input: SemanticLibrarySearchInput
): Promise<SemanticLibrarySearchResult[]> {
  const threshold = input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD
  const limit = input.limit ?? DEFAULT_MATCH_COUNT

  const queryEmbedding = await generateEmbedding(input.query)
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('match_library_chunks', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: threshold,
    match_count: limit,
  })

  if (error) {
    console.error('[library-semantic] match_library_chunks RPC error:', error.message)
    return []
  }

  let results = (data ?? []) as Array<Record<string, unknown>>

  if (input.presenceScope) {
    results = results.filter(r => r.presence_scope === input.presenceScope || r.presence_scope === 'shared' || r.presence_scope === 'house')
  }
  if (input.collection) {
    results = results.filter(r => r.collection === input.collection)
  }
  if (input.authorityStatuses?.length) {
    results = results.filter(r => input.authorityStatuses!.includes(r.effective_authority as string))
  }

  return results.map(r => ({
    chunkId: r.chunk_id as string,
    libraryItemId: r.library_item_id as string,
    title: r.title as string,
    chunkText: r.chunk_text as string,
    similarity: r.similarity as number,
    sourceField: r.source_field as string,
    collection: r.collection as string | undefined,
    itemType: r.item_type as string | undefined,
    authorityStatus: r.authority_status as string | undefined,
    effectiveAuthority: r.effective_authority as string | undefined,
    presenceScope: r.presence_scope as string | undefined,
    phaseCode: r.phase_code as string | undefined,
    phaseLabel: r.phase_label as string | undefined,
  }))
}
