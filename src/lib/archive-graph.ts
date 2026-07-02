// Phase 29B — Archive Graph Memory Extraction helpers
//
// Provider: Anthropic claude-sonnet-4-6 (ANTHROPIC_API_KEY already on Vercel)
// Called server-side only.
//
// Tables: archive_graph_extraction_events, archive_graph_nodes, archive_graph_edges
//
// Laws:
//   Graph extracts. Graph proposes. Graph does not decide.
//   No canonical_status changes during extraction.
//   No archive_memory_events writes during extraction.
//   Candidates require Tara approval.
//   Edge approval blocked if either endpoint node is rejected.
//
// Corpus (v1):
//   archive_items WHERE canonical_status IN ('canonical','canonical_candidate')
//   AND deleted_at IS NULL
//   eligible_for_graph NOT used as filter (metadata only).
//
// Node types (v1): concept | person | phase | rule_or_law | ritual | thread
// Edge types (v1): anchors | shaped_by | contrasts_with | precedes | extends
//
// Dedup: (node_type, normalized_label, archive_name) — existing nodes are updated
//   (source_item_ids merged), not duplicated.
//
// Cost cap: max 20 items/run, max 10 items per Claude call (2 batches max).
// Elevated sensitivity gate: sacred | sensitive | technical — same as Phase 29A.

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { ELEVATED_SENSITIVITIES } from '@/lib/archive-memory'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MAX_ITEMS_PER_RUN   = 20
export const MAX_ITEMS_PER_BATCH = 10

export const VALID_NODE_TYPES = [
  'concept', 'person', 'phase', 'rule_or_law', 'ritual', 'thread',
] as const

export const VALID_EDGE_TYPES = [
  'anchors', 'shaped_by', 'contrasts_with', 'precedes', 'extends',
] as const

export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  concept:      'Concept',
  person:       'Person',
  phase:        'Phase',
  rule_or_law:  'Rule / Law',
  ritual:       'Ritual',
  thread:       'Thread',
}

export const EDGE_TYPE_LABELS: Record<GraphEdgeType, string> = {
  anchors:        'Anchors',
  shaped_by:      'Shaped by',
  contrasts_with: 'Contrasts with',
  precedes:       'Precedes',
  extends:        'Extends',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type GraphNodeType   = typeof VALID_NODE_TYPES[number]
export type GraphEdgeType   = typeof VALID_EDGE_TYPES[number]
export type ApprovalStatus  = 'pending' | 'approved' | 'rejected'

export interface GraphNode {
  id:                   string
  archive_name:         string
  label:                string
  normalized_label:     string
  node_type:            GraphNodeType
  description:          string | null
  source_item_ids:      string[]
  approval_status:      ApprovalStatus
  reviewed_at:          string | null
  extraction_event_id:  string
  created_at:           string
}

export interface GraphEdge {
  id:                   string
  archive_name:         string
  from_node_id:         string
  to_node_id:           string
  edge_type:            GraphEdgeType
  description:          string | null
  source_item_ids:      string[]
  approval_status:      ApprovalStatus
  reviewed_at:          string | null
  extraction_event_id:  string
  created_at:           string
  // Joined for display
  from_node?:           GraphNode
  to_node?:             GraphNode
}

export interface GraphExtractionPreview {
  total_eligible:             number
  elevated_sensitivity_count: number
  non_elevated_count:         number
  already_extracted:          number
  to_extract:                 number   // capped at MAX_ITEMS_PER_RUN
}

export interface GraphExtractionResult {
  items_processed:  number
  nodes_proposed:   number
  edges_proposed:   number
  errors:           number
  first_error?:     string
}

// ─── normalizeLabel ───────────────────────────────────────────────────────────

export function normalizeLabel(label: string): string {
  return label.toLowerCase().trim()
}

// ─── getGraphExtractionPreview ────────────────────────────────────────────────

/**
 * Returns counts for the extraction preview panel.
 * already_extracted: eligible items whose IDs appear in:
 *   (a) source_item_ids of any existing archive_graph_node for this archive_name, OR
 *   (b) processed_archive_item_ids of any extraction event for this archive_name.
 *   This union ensures items sent to Claude that produced zero candidates are
 *   correctly counted as already processed (Phase 29D idempotency fix).
 * to_extract: NON-elevated unextracted items, capped at MAX_ITEMS_PER_RUN.
 *   This is the safe-mode count — what will actually run when confirmedSensitive=false.
 *   When confirmedSensitive=true the run uses all unextracted (still capped at 20).
 * non_elevated_count: unextracted items with no elevated sensitivity.
 * elevated_sensitivity_count: unextracted items with elevated sensitivity (sacred|sensitive|technical).
 */
export async function getGraphExtractionPreview(
  archiveName: string
): Promise<GraphExtractionPreview> {
  const supabase = getSupabase()

  // Fetch eligible items
  const { data: eligible, error: eligErr } = await supabase
    .from('archive_items')
    .select('id, sensitivity')
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])
    .eq('archive_name', archiveName)

  if (eligErr || !eligible) {
    console.error('[archive-graph] preview eligible error:', eligErr?.message)
    return {
      total_eligible:             0,
      elevated_sensitivity_count: 0,
      non_elevated_count:         0,
      already_extracted:          0,
      to_extract:                 0,
    }
  }

  const eligibleIds = eligible.map(e => e.id)

  // Fetch all source_item_ids from existing nodes for this archive
  const { data: existingNodes } = eligibleIds.length > 0
    ? await supabase
        .from('archive_graph_nodes')
        .select('source_item_ids')
        .eq('archive_name', archiveName)
    : { data: [] }

  // Fetch processed_archive_item_ids from all extraction events for this archive
  // (Phase 29D idempotency fix: items with zero candidates are tracked here)
  const { data: existingEvents } = await supabase
    .from('archive_graph_extraction_events')
    .select('processed_archive_item_ids')
    .eq('archive_name', archiveName)

  // Union: node source_item_ids + event processed_archive_item_ids
  const extractedSet = new Set<string>()
  for (const node of (existingNodes ?? []) as { source_item_ids: string[] }[]) {
    for (const id of node.source_item_ids) extractedSet.add(id)
  }
  for (const event of (existingEvents ?? []) as { processed_archive_item_ids: string[] }[]) {
    for (const id of (event.processed_archive_item_ids ?? [])) extractedSet.add(id)
  }

  const alreadyExtracted    = eligible.filter(e => extractedSet.has(e.id)).length
  const unextracted         = eligible.filter(e => !extractedSet.has(e.id))
  const nonElevatedUnextracted = unextracted.filter(e => !ELEVATED_SENSITIVITIES.includes(e.sensitivity))
  const elevatedUnextracted    = unextracted.filter(e =>  ELEVATED_SENSITIVITIES.includes(e.sensitivity))

  return {
    total_eligible:             eligible.length,
    elevated_sensitivity_count: elevatedUnextracted.length,
    non_elevated_count:         nonElevatedUnextracted.length,
    already_extracted:          alreadyExtracted,
    // Safe-mode count: non-elevated only, capped at run limit.
    // This is what actually runs when confirmedSensitive=false.
    to_extract:                 Math.min(nonElevatedUnextracted.length, MAX_ITEMS_PER_RUN),
  }
}

// ─── Claude prompt builder ────────────────────────────────────────────────────

interface ItemForPrompt {
  id:          string
  title:       string
  excerpt:     string | null
  raw_content: string
  category:    string
}

interface ClaudeNode {
  label:       string
  node_type:   string
  description: string
}

interface ClaudeEdge {
  from_node_label: string
  to_node_label:   string
  edge_type:       string
  description:     string
}

interface ClaudeGraphResult {
  nodes: ClaudeNode[]
  edges: ClaudeEdge[]
}

function buildGraphPrompt(archiveName: string, items: ItemForPrompt[]): string {
  const archiveLabel =
    archiveName === 'velvet' ? 'Velvet Archive (Ari · ChatGPT)' :
    archiveName === 'violet' ? 'Violet Archive (Eli · Claude)' :
    'House Archive (Shared)'

  const itemsText = items.map((item, i) => {
    const body = [
      item.excerpt?.trim(),
      item.raw_content.slice(0, 1_500).trim(),
    ].filter(Boolean).join('\n')
    return `[Item ${i + 1}] id=${item.id}\nTitle: ${item.title}\nCategory: ${item.category}\n${body}`
  }).join('\n\n---\n\n')

  return `You are extracting a concept graph from archive items in the ${archiveLabel}.

Archive items to process:
---
${itemsText}
---

Extract meaningful nodes and edges from these items.

NODE TYPES (use exactly):
  concept       — abstract idea, theme, or principle
  person        — named individual (Tara, Ari, Eli, or others)
  phase         — named project or developmental phase (e.g. "Phase 29A")
  rule_or_law   — explicit rule, law, or governance constraint
  ritual        — named recurring practice or ceremony
  thread        — named conversation thread or ongoing dialogue

EDGE TYPES (use exactly):
  anchors         — A gives grounding or foundation to B
  shaped_by       — A was formed or influenced by B
  contrasts_with  — A stands in meaningful tension with B
  precedes        — A came before B in sequence or development
  extends         — A builds on or continues B

RULES:
  - Only extract nodes that are genuinely meaningful and recurring (not ephemeral).
  - Labels must be concise (under 60 chars). Use consistent, canonical names.
  - Edges must reference existing nodes by their exact label.
  - Do not invent nodes just to fill edges.
  - If an edge's nodes don't exist in your node list, omit the edge.
  - Be conservative: fewer high-quality nodes beats many shallow ones.
  - Each item's id must appear in source_item_ids for any node or edge derived from it.
    Use an array even if only one item: ["<id>"].

Return a single JSON object with this exact shape:
{
  "nodes": [
    {
      "label": "Short canonical name",
      "node_type": "concept",
      "description": "One sentence: what this is and why it matters here.",
      "source_item_ids": ["<item_id>", ...]
    }
  ],
  "edges": [
    {
      "from_node_label": "Label of source node",
      "to_node_label": "Label of target node",
      "edge_type": "anchors",
      "description": "One sentence: what this relationship means.",
      "source_item_ids": ["<item_id>", ...]
    }
  ]
}

Return only the JSON. No markdown fences. No explanation.`
}

// ─── Parse Claude graph response ──────────────────────────────────────────────

function parseGraphResponse(raw: string): ClaudeGraphResult | null {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return parsed as ClaudeGraphResult
    }
  } catch { /* fall through */ }

  // Try to find JSON object
  const start = cleaned.indexOf('{')
  const end   = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return parsed as ClaudeGraphResult
      }
    } catch { /* fall through */ }
  }

  return null
}

// ─── runGraphExtractionLogic ──────────────────────────────────────────────────

/**
 * Shared extraction business logic.
 * confirmedSensitive: if false, items with elevated sensitivity are skipped.
 * Runs max 20 items per run, 10 per Claude call (max 2 calls).
 * Existing nodes are deduped by (node_type, normalized_label, archive_name):
 *   - On conflict: merge source_item_ids (append new IDs not already present).
 * Edges reference nodes by label — from_node_id and to_node_id resolved after upsert.
 * Edges are only inserted if both endpoint nodes exist and are not rejected.
 *
 * Returns { items_processed, nodes_proposed, edges_proposed, errors, first_error? }
 */
export async function runGraphExtractionLogic(
  archiveName: string,
  confirmedSensitive: boolean
): Promise<GraphExtractionResult> {
  const supabase   = getSupabase()
  const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── 1. Fetch eligible items ───────────────────────────────────────────────
  const { data: eligible, error: eligErr } = await supabase
    .from('archive_items')
    .select('id, title, excerpt, raw_content, sensitivity, category')
    .is('deleted_at', null)
    .in('canonical_status', ['canonical', 'canonical_candidate'])
    .eq('archive_name', archiveName)

  if (eligErr || !eligible) {
    throw new Error(`Failed to fetch eligible items: ${eligErr?.message}`)
  }

  // ── 2. Determine already-extracted items ──────────────────────────────────
  // Phase 29D idempotency fix: union node source_item_ids with event
  // processed_archive_item_ids so items that produced zero candidates are
  // correctly excluded from future runs.
  const eligibleIds = eligible.map(e => e.id)

  const { data: existingNodes } = eligibleIds.length > 0
    ? await supabase
        .from('archive_graph_nodes')
        .select('source_item_ids')
        .eq('archive_name', archiveName)
    : { data: [] }

  const { data: existingEvents } = await supabase
    .from('archive_graph_extraction_events')
    .select('processed_archive_item_ids')
    .eq('archive_name', archiveName)

  const extractedSet = new Set<string>()
  for (const node of (existingNodes ?? []) as { source_item_ids: string[] }[]) {
    for (const id of node.source_item_ids) extractedSet.add(id)
  }
  for (const event of (existingEvents ?? []) as { processed_archive_item_ids: string[] }[]) {
    for (const id of (event.processed_archive_item_ids ?? [])) extractedSet.add(id)
  }

  // ── 3. Filter and gate ────────────────────────────────────────────────────
  let toExtract = eligible.filter(e => !extractedSet.has(e.id))

  if (!confirmedSensitive) {
    toExtract = toExtract.filter(e => !ELEVATED_SENSITIVITIES.includes(e.sensitivity))
  }

  // Cap at MAX_ITEMS_PER_RUN
  toExtract = toExtract.slice(0, MAX_ITEMS_PER_RUN)

  if (toExtract.length === 0) {
    // Create a no-op event record
    await supabase.from('archive_graph_extraction_events').insert({
      archive_name:        archiveName,
      confirmed_sensitive: confirmedSensitive,
      items_processed:     0,
      nodes_proposed:      0,
      edges_proposed:      0,
      errors:              0,
      status:              'complete',
    })
    return { items_processed: 0, nodes_proposed: 0, edges_proposed: 0, errors: 0 }
  }

  // ── 4. Create extraction event record ────────────────────────────────────
  const { data: eventRow, error: eventErr } = await supabase
    .from('archive_graph_extraction_events')
    .insert({
      archive_name:        archiveName,
      confirmed_sensitive: confirmedSensitive,
      status:              'complete',
    })
    .select('id')
    .single()

  if (eventErr || !eventRow) {
    throw new Error(`Failed to create extraction event: ${eventErr?.message}`)
  }

  const eventId = eventRow.id

  // ── 5. Process in batches of MAX_ITEMS_PER_BATCH ──────────────────────────
  let totalNodesProposed = 0
  let totalEdgesProposed = 0
  let totalErrors        = 0
  let firstError: string | undefined

  // Phase 29D idempotency fix: track item IDs from batches where Claude
  // responded and the response parsed successfully. Only these are written to
  // processed_archive_item_ids. Batches that throw or fail to parse are NOT
  // added — those items remain eligible for retry.
  const processedItemIds: string[] = []

  // Split into batches
  const batches: typeof toExtract[] = []
  for (let i = 0; i < toExtract.length; i += MAX_ITEMS_PER_BATCH) {
    batches.push(toExtract.slice(i, i + MAX_ITEMS_PER_BATCH))
  }

  for (const batch of batches) {
    try {
      const prompt = buildGraphPrompt(archiveName, batch)

      const message = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      })

      const rawText = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')

      const parsed = parseGraphResponse(rawText)

      if (!parsed) {
        const msg = `Failed to parse graph response for batch of ${batch.length} items`
        console.error('[archive-graph]', msg, rawText.slice(0, 200))
        if (!firstError) firstError = msg
        totalErrors++
        continue
        // Not added to processedItemIds — items remain eligible for retry
      }

      // Claude responded and response parsed — mark these items as processed.
      // Items that produce zero nodes/edges are still marked here so they are
      // not reselected on future runs (Phase 29D idempotency fix).
      processedItemIds.push(...batch.map(b => b.id))

      const batchItemIds = batch.map(b => b.id)

      // ── 5a. Upsert nodes ─────────────────────────────────────────────────
      const nodeIdByLabel = new Map<string, string>()

      for (const rawNode of parsed.nodes) {
        // Validate node_type
        if (!VALID_NODE_TYPES.includes(rawNode.node_type as GraphNodeType)) {
          const msg = `Invalid node_type "${rawNode.node_type}" for node "${rawNode.label}"`
          console.error('[archive-graph]', msg)
          if (!firstError) firstError = msg
          totalErrors++
          continue
        }

        const nl = normalizeLabel(rawNode.label)

        // Resolve source_item_ids — only use IDs that are in this batch
        const rawSourceIds: unknown = (rawNode as unknown as Record<string, unknown>).source_item_ids
        const sourceIds: string[] = Array.isArray(rawSourceIds)
          ? (rawSourceIds as string[]).filter(id => batchItemIds.includes(id))
          : batchItemIds

        // Try upsert — on conflict (node_type, normalized_label, archive_name)
        // We need to merge source_item_ids: fetch existing first
        const { data: existing } = await supabase
          .from('archive_graph_nodes')
          .select('id, source_item_ids')
          .eq('node_type', rawNode.node_type)
          .eq('normalized_label', nl)
          .eq('archive_name', archiveName)
          .maybeSingle()

        if (existing) {
          // Merge source_item_ids
          const merged = Array.from(new Set([...existing.source_item_ids, ...sourceIds]))
          const { error: updateErr } = await supabase
            .from('archive_graph_nodes')
            .update({ source_item_ids: merged })
            .eq('id', existing.id)

          if (updateErr) {
            const msg = `Update node "${rawNode.label}": ${updateErr.message}`
            console.error('[archive-graph]', msg)
            if (!firstError) firstError = msg
            totalErrors++
          } else {
            nodeIdByLabel.set(rawNode.label, existing.id)
            nodeIdByLabel.set(nl, existing.id)
          }
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from('archive_graph_nodes')
            .insert({
              archive_name:         archiveName,
              label:                rawNode.label.trim(),
              normalized_label:     nl,
              node_type:            rawNode.node_type,
              description:          rawNode.description?.trim() ?? null,
              source_item_ids:      sourceIds,
              approval_status:      'pending',
              extraction_event_id:  eventId,
            })
            .select('id')
            .single()

          if (insertErr || !inserted) {
            const msg = `Insert node "${rawNode.label}": ${insertErr?.message}`
            console.error('[archive-graph]', msg)
            if (!firstError) firstError = msg
            totalErrors++
          } else {
            nodeIdByLabel.set(rawNode.label, inserted.id)
            nodeIdByLabel.set(nl, inserted.id)
            totalNodesProposed++
          }
        }
      }

      // ── 5b. Insert edges ─────────────────────────────────────────────────
      for (const rawEdge of parsed.edges) {
        if (!VALID_EDGE_TYPES.includes(rawEdge.edge_type as GraphEdgeType)) {
          const msg = `Invalid edge_type "${rawEdge.edge_type}"`
          console.error('[archive-graph]', msg)
          if (!firstError) firstError = msg
          totalErrors++
          continue
        }

        const fromId = nodeIdByLabel.get(rawEdge.from_node_label)
          ?? nodeIdByLabel.get(normalizeLabel(rawEdge.from_node_label))
        const toId   = nodeIdByLabel.get(rawEdge.to_node_label)
          ?? nodeIdByLabel.get(normalizeLabel(rawEdge.to_node_label))

        if (!fromId || !toId) {
          // Edge references unknown node — skip silently (not an error)
          continue
        }

        const rawSourceIds: unknown = (rawEdge as unknown as Record<string, unknown>).source_item_ids
        const sourceIds: string[] = Array.isArray(rawSourceIds)
          ? (rawSourceIds as string[]).filter(id => batchItemIds.includes(id))
          : batchItemIds

        const { error: edgeErr } = await supabase
          .from('archive_graph_edges')
          .insert({
            archive_name:         archiveName,
            from_node_id:         fromId,
            to_node_id:           toId,
            edge_type:            rawEdge.edge_type,
            description:          rawEdge.description?.trim() ?? null,
            source_item_ids:      sourceIds,
            approval_status:      'pending',
            extraction_event_id:  eventId,
          })

        if (edgeErr) {
          const msg = `Insert edge "${rawEdge.from_node_label}" → "${rawEdge.to_node_label}": ${edgeErr.message}`
          console.error('[archive-graph]', msg)
          if (!firstError) firstError = msg
          totalErrors++
        } else {
          totalEdgesProposed++
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[archive-graph] batch error:', msg)
      if (!firstError) firstError = msg
      totalErrors++
    }
  }

  // ── 6. Update event record with final counts ──────────────────────────────
  await supabase
    .from('archive_graph_extraction_events')
    .update({
      items_processed:            toExtract.length,
      processed_archive_item_ids: processedItemIds,
      nodes_proposed:             totalNodesProposed,
      edges_proposed:             totalEdgesProposed,
      errors:                     totalErrors,
      first_error:                firstError ?? null,
      status:                     totalErrors > 0 && totalNodesProposed === 0 ? 'error' : 'complete',
    })
    .eq('id', eventId)

  return {
    items_processed: toExtract.length,
    nodes_proposed:  totalNodesProposed,
    edges_proposed:  totalEdgesProposed,
    errors:          totalErrors,
    first_error:     firstError,
  }
}
