// Phase 29A — Archive Semantic Recall helpers
//
// Provides:
//   buildEmbedContent        — builds text to embed from an archive_item
//   generateArchiveEmbedding — OpenAI text-embedding-3-small (1536 dims)
//   semanticSearch           — calls match_archive_embeddings RPC
//   getEmbedBackfillPreview  — counts eligible items, already embedded, to embed,
//                              elevated_sensitivity_count (sacred | sensitive | technical)
//   runEmbedBackfillLogic    — shared backfill business logic (used by route + server action)
//
// Eligibility (Option B): canonical_status IN ('canonical','canonical_candidate')
//                         AND deleted_at IS NULL
// No eligible_for_embedding gate in Phase 29A.
//
// Sensitivity: uses ELEVATED_SENSITIVITIES from archive-memory.ts
//   ('sacred' | 'sensitive' | 'technical') — all three require confirmedSensitive=true

import { createClient } from '@supabase/supabase-js'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SemanticCandidate {
  archive_item_id: string
  title: string
  excerpt: string | null
  archive_name: string
  owner_presence: string
  visibility: string
  category: string
  canonical_status: string
  sensitivity: string
  source_document: string | null
  source_date: string | null
  source_id: string | null
  similarity: number
}

export interface EmbedBackfillPreview {
  total_eligible: number
  total_already_embedded: number
  to_embed: number
  elevated_sensitivity_count: number
}

export interface BackfillResult {
  processed: number
  skipped: number
  errors: number
}

// ─── buildEmbedContent ────────────────────────────────────────────────────────

/**
 * Builds the text to embed for an archive_item.
 * Concatenates: title + excerpt + raw_content (first 2000 chars).
 */
export function buildEmbedContent(item: {
  title: string
  excerpt: string | null
  raw_content: string
}): string {
  return [
    item.title.trim(),
    (item.excerpt ?? '').trim(),
    item.raw_content.slice(0, 2_000).trim(),
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── generateArchiveEmbedding ────────────────────────────────────────────────

/**
 * Generates a 1536-dimensional embedding using text-embedding-3-small.
 * Dynamic import mirrors the pattern in memory-graph.ts.
 */
export async function generateArchiveEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey })

  const response = await client.embeddings.create({
    model:      'text-embedding-3-small',
    input:      text,
    dimensions: 1536,
  })

  return response.data[0].embedding
}

// ─── semanticSearch ───────────────────────────────────────────────────────────

/**
 * Calls match_archive_embeddings RPC and returns candidates.
 * The RPC enforces eligibility (canonical/canonical_candidate + not deleted).
 * Access-scope (velvet/violet/house visibility rules) must be applied by the caller.
 */
export async function semanticSearch(params: {
  queryEmbedding: number[]
  limit?:         number
  matchThreshold?: number
}): Promise<SemanticCandidate[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('match_archive_embeddings', {
    query_embedding:  params.queryEmbedding,
    match_threshold:  params.matchThreshold ?? 0.5,
    match_count:      params.limit ?? 10,
    filter_presences: null,
  })

  if (error || !data) {
    console.error('[archive-semantic] semanticSearch RPC error:', error?.message)
    return []
  }

  return data as SemanticCandidate[]
}

// ─── getEmbedBackfillPreview ─────────────────────────────────────────────────

/**
 * Returns counts for the backfill preview card.
 * elevated_sensitivity_count: items in to_embed set with elevated sensitivity.
 */
export async function getEmbedBackfillPreview(): Promise<EmbedBackfillPreview> {
  const supabase = getSupabase()

  const { data: eligible, error: eligibleErr } = await supabase
    .from('archive_items')
    .select('id, sensitivity')
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])

  if (eligibleErr || !eligible) {
    console.error('[archive-semantic] preview eligible error:', eligibleErr?.message)
    return { total_eligible: 0, total_already_embedded: 0, to_embed: 0, elevated_sensitivity_count: 0 }
  }

  const eligibleIds = eligible.map(e => e.id)

  const { data: embedded, error: embeddedErr } = eligibleIds.length > 0
    ? await supabase
        .from('archive_item_embeddings')
        .select('archive_item_id')
        .in('archive_item_id', eligibleIds)
    : { data: [], error: null }

  if (embeddedErr) {
    console.error('[archive-semantic] preview embedded error:', embeddedErr.message)
  }

  const embeddedSet = new Set(((embedded ?? []) as { archive_item_id: string }[]).map(e => e.archive_item_id))
  const toEmbed = eligible.filter(e => !embeddedSet.has(e.id))
  const elevatedCount = toEmbed.filter(e => ELEVATED_SENSITIVITIES.includes(e.sensitivity)).length

  return {
    total_eligible:        eligible.length,
    total_already_embedded: embeddedSet.size,
    to_embed:              toEmbed.length,
    elevated_sensitivity_count: elevatedCount,
  }
}

// ─── runEmbedBackfillLogic ────────────────────────────────────────────────────

/**
 * Shared backfill logic used by both the API route (CRON_SECRET POST)
 * and the Server Action (UI execute button).
 *
 * confirmedSensitive: if false, elevated-sensitivity items are skipped.
 * If true, all eligible items (including elevated) are embedded.
 */
export async function runEmbedBackfillLogic(
  confirmedSensitive: boolean
): Promise<BackfillResult> {
  const supabase = getSupabase()

  // Fetch eligible items with content for embedding
  const { data: eligible, error: eligibleErr } = await supabase
    .from('archive_items')
    .select('id, title, excerpt, raw_content, sensitivity, canonical_status')
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])

  if (eligibleErr || !eligible) {
    throw new Error(`Failed to fetch eligible items: ${eligibleErr?.message}`)
  }

  // Get IDs already embedded
  const eligibleIds = eligible.map(e => e.id)
  const { data: embedded } = eligibleIds.length > 0
    ? await supabase
        .from('archive_item_embeddings')
        .select('archive_item_id')
        .in('archive_item_id', eligibleIds)
    : { data: [] }

  const embeddedSet = new Set(((embedded ?? []) as { archive_item_id: string }[]).map(e => e.archive_item_id))

  // Items not yet embedded
  let toEmbed = eligible.filter(e => !embeddedSet.has(e.id))

  let skipped = 0

  // Skip elevated sensitivity items unless confirmed
  if (!confirmedSensitive) {
    const before = toEmbed.length
    toEmbed = toEmbed.filter(e => !ELEVATED_SENSITIVITIES.includes(e.sensitivity))
    skipped = before - toEmbed.length
  }

  let processed = 0
  let errors    = 0

  type EligibleItem = {
    id: string
    title: string
    excerpt: string | null
    raw_content: string
    sensitivity: string
    canonical_status: string
  }

  for (const item of toEmbed as EligibleItem[]) {
    try {
      const text      = buildEmbedContent(item)
      const embedding = await generateArchiveEmbedding(text)

      const { error: upsertErr } = await supabase
        .from('archive_item_embeddings')
        .upsert(
          {
            archive_item_id: item.id,
            embedding,
            model:            'text-embedding-3-small',
            dimensions:       1536,
            canonical_status: item.canonical_status,
            updated_at:       new Date().toISOString(),
          },
          { onConflict: 'archive_item_id' }
        )

      if (upsertErr) {
        console.error(`[embed-backfill] upsert error for ${item.id}:`, upsertErr.message)
        errors++
      } else {
        processed++
      }
    } catch (err) {
      console.error(`[embed-backfill] embedding error for ${item.id}:`, err)
      errors++
    }
  }

  return { processed, skipped, errors }
}
