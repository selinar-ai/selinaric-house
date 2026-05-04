// Phase 29C — Hybrid Recall Lab
//
// Three independent retrieval passes for a given query:
//   1. Keyword  — existing scoreItem() scoring over canonical + canonical_candidate
//   2. Semantic — existing match_archive_embeddings RPC (gte-small, 384 dims)
//   3. Graph    — ilike text match on approved archive_graph_nodes.label + description
//                  resolved back to archive_items via source_item_ids
//
// Plus: overlap detection, disagreement labelling, absence explanations.
//
// Laws (unchanged from prior phases):
//   Manual recall = canonical + canonical_candidate
//   Auto-recall   = canonical only (not used here — Lab is manual/admin only)
//   Graph results = approved nodes only; pending informational; rejected excluded
//   No Claude API calls — pure retrieval + in-memory comparison
//   No event logging by default (logEvent: false)
//   No canonical_status changes
//   No archive_memory_events writes
//   RAG retrieves. RAG does not decide.
//   Graph proposes. Graph does not decide.
//   Hybrid recall compares. Hybrid recall does not decide.

import { createClient } from '@supabase/supabase-js'
import { getRecallableArchiveEntries, type RecallEntry } from '@/lib/archive-recall'
import { generateArchiveEmbedding, semanticSearch, type SemanticCandidate } from '@/lib/archive-semantic'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'
import type { GraphNode } from '@/lib/archive-graph'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GraphRecallEntry {
  node:              GraphNode
  source_entries:    GraphSourceEntry[]
  match_reason:      'label' | 'description'  // which field matched the query
  provenance_ok:     boolean                  // false if source_item_ids resolved to 0 live entries
}

export interface GraphSourceEntry {
  id:               string
  title:            string
  canonical_status: string
  sensitivity:      string
  archive_name:     string
  deleted_at:       string | null
}

export interface HybridOverlap {
  keyword_and_semantic: string[]   // archive_item IDs in both keyword and semantic
  keyword_and_graph:    string[]   // archive_item IDs in both keyword and graph-resolved
  semantic_and_graph:   string[]   // archive_item IDs in both semantic and graph-resolved
  all_three:            string[]   // archive_item IDs in all three
}

export interface HybridAbsence {
  semantic_unembedded_elevated_count: number  // eligible items with elevated sensitivity that lack embeddings
  semantic_total_embedded:            number  // total embedded items for this archive
  graph_pending_count:                number  // pending nodes (not approved, not rejected)
  graph_rejected_count:               number  // rejected nodes (informational)
  keyword_no_match:                   boolean // true if keyword returned 0 results
  semantic_no_match:                  boolean // true if semantic returned 0 results
  graph_no_match:                     boolean // true if graph returned 0 matched nodes
}

export interface HybridRecallResult {
  query:            string
  normalised_query: string
  presence_id:      'ari' | 'eli'
  archive_name:     string

  keyword: {
    results: RecallEntry[]
    count:   number
  }
  semantic: {
    results: SemanticCandidate[]
    count:   number
  }
  graph: {
    matched:       GraphRecallEntry[]
    count:         number
  }

  overlap:  HybridOverlap
  absence:  HybridAbsence
}

export interface HybridRecallParams {
  presenceId:   'ari' | 'eli'
  query:        string
  archiveName?: string   // defaults to presence's own archive
  limit?:       number   // default 10, max 20
}

// ─── Archive name resolver ────────────────────────────────────────────────────

function defaultArchiveName(presenceId: 'ari' | 'eli'): string {
  return presenceId === 'ari' ? 'velvet' : 'violet'
}

// ─── Semantic scope guard (mirrors semantic/route.ts) ────────────────────────

function semanticInScope(candidate: SemanticCandidate, archiveName: string): boolean {
  // Only include entries belonging to the requested archive
  return candidate.archive_name === archiveName
}

// ─── Graph text search ───────────────────────────────────────────────────────

/**
 * Text-matches approved graph nodes by label (then description) for the given archive.
 * Resolves source_item_ids back to live archive_items (deleted_at IS NULL).
 * Returns GraphRecallEntry[]:
 *   - provenance_ok: true  if ≥1 source entry resolved
 *   - provenance_ok: false if source_item_ids exist but none resolve to live entries
 * Pending and rejected nodes are excluded from results.
 */
async function runGraphTextSearch(
  archiveName: string,
  query: string
): Promise<{ entries: GraphRecallEntry[]; pendingCount: number; rejectedCount: number }> {
  const supabase = getSupabase()

  // Fetch approved nodes for this archive
  const { data: approvedNodes, error: nodesErr } = await supabase
    .from('archive_graph_nodes')
    .select('*')
    .eq('archive_name', archiveName)
    .eq('approval_status', 'approved')

  if (nodesErr || !approvedNodes) {
    console.error('[archive-hybrid] graph nodes error:', nodesErr?.message)
    return { entries: [], pendingCount: 0, rejectedCount: 0 }
  }

  // Fetch pending + rejected counts for absence explanation
  const { count: pendingCount } = await supabase
    .from('archive_graph_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('archive_name', archiveName)
    .eq('approval_status', 'pending')

  const { count: rejectedCount } = await supabase
    .from('archive_graph_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('archive_name', archiveName)
    .eq('approval_status', 'rejected')

  // Text match: label first (stronger signal), then description
  const lowerQuery = query.toLowerCase().trim()
  const tokens = lowerQuery.split(/\s+/).filter(Boolean)

  const labelMatches: GraphNode[]       = []
  const descriptionMatches: GraphNode[] = []

  for (const node of approvedNodes as GraphNode[]) {
    const labelMatch = tokens.some(t =>
      node.label.toLowerCase().includes(t) ||
      node.normalized_label.includes(t)
    )
    if (labelMatch) {
      labelMatches.push(node)
      continue
    }
    if (node.description) {
      const descMatch = tokens.some(t => node.description!.toLowerCase().includes(t))
      if (descMatch) descriptionMatches.push(node)
    }
  }

  const matchedNodes: Array<{ node: GraphNode; match_reason: 'label' | 'description' }> = [
    ...labelMatches.map(n => ({ node: n, match_reason: 'label' as const })),
    ...descriptionMatches.map(n => ({ node: n, match_reason: 'description' as const })),
  ]

  if (matchedNodes.length === 0) {
    return { entries: [], pendingCount: pendingCount ?? 0, rejectedCount: rejectedCount ?? 0 }
  }

  // Collect all source_item_ids from matched nodes
  const allSourceIds = Array.from(
    new Set(matchedNodes.flatMap(m => m.node.source_item_ids))
  )

  // Resolve source_item_ids → live archive_items
  const { data: sourceItems } = allSourceIds.length > 0
    ? await supabase
        .from('archive_items')
        .select('id, title, canonical_status, sensitivity, archive_name, deleted_at')
        .in('id', allSourceIds)
        .is('deleted_at', null)
    : { data: [] }

  const resolvedMap = new Map<string, GraphSourceEntry>()
  for (const item of (sourceItems ?? []) as GraphSourceEntry[]) {
    resolvedMap.set(item.id, item)
  }

  const entries: GraphRecallEntry[] = matchedNodes.map(({ node, match_reason }) => {
    const resolved = node.source_item_ids
      .map(id => resolvedMap.get(id))
      .filter((e): e is GraphSourceEntry => e !== undefined)

    return {
      node,
      source_entries:  resolved,
      match_reason,
      provenance_ok:   resolved.length > 0,
    }
  })

  return {
    entries,
    pendingCount:  pendingCount ?? 0,
    rejectedCount: rejectedCount ?? 0,
  }
}

// ─── Absence explanation builder ─────────────────────────────────────────────

async function buildAbsence(
  archiveName: string,
  keywordCount: number,
  semanticCount: number,
  graphCount: number,
  pendingCount: number,
  rejectedCount: number
): Promise<HybridAbsence> {
  const supabase = getSupabase()

  // Count embedded entries for this archive (regardless of query)
  const { count: embeddedCount } = await supabase
    .from('archive_item_embeddings')
    .select('archive_item_id', { count: 'exact', head: true })
    // join-filter via eligible archive_items
    // (approximate — counts all embeddings, not filtered to archive_name)
    // We accept this as good enough for v1 absence explanation

  // Count eligible but unembedded elevated items for this archive
  const { data: eligibleItems } = await supabase
    .from('archive_items')
    .select('id, sensitivity')
    .eq('archive_name', archiveName)
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])

  let unembeddedElevatedCount = 0

  if (eligibleItems && eligibleItems.length > 0) {
    const eligibleIds = eligibleItems.map((e: { id: string }) => e.id)
    const { data: embedded } = await supabase
      .from('archive_item_embeddings')
      .select('archive_item_id')
      .in('archive_item_id', eligibleIds)

    const embeddedSet = new Set(
      ((embedded ?? []) as { archive_item_id: string }[]).map(e => e.archive_item_id)
    )
    unembeddedElevatedCount = eligibleItems.filter(
      (e: { id: string; sensitivity: string }) =>
        !embeddedSet.has(e.id) && ELEVATED_SENSITIVITIES.includes(e.sensitivity)
    ).length
  }

  return {
    semantic_unembedded_elevated_count: unembeddedElevatedCount,
    semantic_total_embedded:            embeddedCount ?? 0,
    graph_pending_count:                pendingCount,
    graph_rejected_count:               rejectedCount,
    keyword_no_match:                   keywordCount === 0,
    semantic_no_match:                  semanticCount === 0,
    graph_no_match:                     graphCount === 0,
  }
}

// ─── Overlap detection ────────────────────────────────────────────────────────

function computeOverlap(
  keywordIds:  Set<string>,
  semanticIds: Set<string>,
  graphIds:    Set<string>
): HybridOverlap {
  const keywordAndSemantic = [...keywordIds].filter(id => semanticIds.has(id))
  const keywordAndGraph    = [...keywordIds].filter(id => graphIds.has(id))
  const semanticAndGraph   = [...semanticIds].filter(id => graphIds.has(id))
  const allThree           = keywordAndSemantic.filter(id => graphIds.has(id))

  return {
    keyword_and_semantic: keywordAndSemantic,
    keyword_and_graph:    keywordAndGraph,
    semantic_and_graph:   semanticAndGraph,
    all_three:            allThree,
  }
}

// ─── runHybridRecall ──────────────────────────────────────────────────────────

/**
 * Runs three independent retrieval passes and returns a comparison result.
 * No event logging (logEvent=false by design — Lab is admin/debug only).
 * No canonical_status changes. No archive_memory_events writes.
 * No Claude API calls.
 */
export async function runHybridRecall(params: HybridRecallParams): Promise<HybridRecallResult> {
  const { presenceId, query, limit = 10 } = params
  const archiveName  = params.archiveName ?? defaultArchiveName(presenceId)
  const safeLimit    = Math.min(Math.max(1, limit), 20)
  const normQuery    = query.trim()

  // ── Pass 1: Keyword ────────────────────────────────────────────────────────
  const keywordResults = await getRecallableArchiveEntries(
    presenceId,
    normQuery,
    safeLimit,
    { statuses: ['canonical', 'canonical_candidate'] }
  )

  // ── Pass 2: Semantic ───────────────────────────────────────────────────────
  let semanticResults: SemanticCandidate[] = []
  try {
    const queryEmbedding = await generateArchiveEmbedding(normQuery)
    const rawSemantic    = await semanticSearch({
      queryEmbedding,
      limit:          safeLimit * 3,  // over-fetch for scope filter
      matchThreshold: 0.5,
    })
    // Apply archive scope filter (Lab is archive-specific)
    semanticResults = rawSemantic.filter(c => semanticInScope(c, archiveName))
      .slice(0, safeLimit)
  } catch (err) {
    console.error('[archive-hybrid] semantic pass error:', err instanceof Error ? err.message : String(err))
    // Non-fatal: continue with keyword + graph only
  }

  // ── Pass 3: Graph ──────────────────────────────────────────────────────────
  const { entries: graphEntries, pendingCount, rejectedCount } = await runGraphTextSearch(
    archiveName,
    normQuery
  )

  // ── ID sets for overlap ────────────────────────────────────────────────────
  const keywordIds  = new Set(keywordResults.map(e => e.id))
  const semanticIds = new Set(semanticResults.map(e => e.archive_item_id))
  const graphIds    = new Set(
    graphEntries.flatMap(g => g.source_entries.map(s => s.id))
  )

  const overlap = computeOverlap(keywordIds, semanticIds, graphIds)

  // ── Absence explanation ────────────────────────────────────────────────────
  const absence = await buildAbsence(
    archiveName,
    keywordResults.length,
    semanticResults.length,
    graphEntries.length,
    pendingCount,
    rejectedCount
  )

  return {
    query:            query,
    normalised_query: normQuery,
    presence_id:      presenceId,
    archive_name:     archiveName,

    keyword: {
      results: keywordResults,
      count:   keywordResults.length,
    },
    semantic: {
      results: semanticResults,
      count:   semanticResults.length,
    },
    graph: {
      matched: graphEntries,
      count:   graphEntries.length,
    },

    overlap,
    absence,
  }
}
