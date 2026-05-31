/**
 * Phase 37F.3 — High-Level Edge Seeding Script
 *
 * Edges describe proposed graph relationships.
 * Edges do not create Memory.
 * Edges do not create Archive authority.
 * Edges do not prove truth by themselves.
 * Ontology Lab governs approval.
 *
 * Uses raw PostgREST fetch (avoids Supabase JS WebSocket issues on Node 20).
 *
 * Usage:
 *   npx tsx scripts/seed-37f3-edges.ts --dry-run   (preview only)
 *   npx tsx scripts/seed-37f3-edges.ts              (live run)
 *
 * Writes ONLY to: graph_proposals, graph_proposal_sources, graph_proposal_events
 * All edge proposals: status=pending_review, prompt_eligible=false, grain_level=overview
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const DRY_RUN = process.argv.includes('--dry-run')

// ─── PostgREST helpers ────────────────────────────────────────────────────

const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
}

async function pgSelect(table: string, query: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { ...baseHeaders, Prefer: 'return=representation' },
  })
  if (!res.ok) throw new Error(`SELECT ${table}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function pgCount(table: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id`, {
    headers: { ...baseHeaders, Prefer: 'count=exact', Range: '0-0' },
  })
  const range = res.headers.get('content-range')
  if (range) {
    const m = range.match(/\/(\d+)$/)
    if (m) return parseInt(m[1], 10)
  }
  return -1
}

async function pgInsert(table: string, row: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null; code?: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...baseHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const text = await res.text()
    let code: string | undefined
    try { code = JSON.parse(text).code } catch {}
    return { data: null, error: `${res.status}: ${text}`, code }
  }
  const arr = await res.json()
  return { data: arr[0] ?? null, error: null }
}

// ─── Seed Edge Definitions ────────────────────────────────────────────────

interface SeedEdge {
  label: string
  edgeType: string
  edgePresenceScope: string  // the edge proposal's own scope
  from: {
    label: string
    nodeType: string
    presenceScope: string
  }
  to: {
    label: string
    nodeType: string
    presenceScope: string
  }
  authorityStatus: string
  primarySourceType: string
  primarySourceId: string | null
  primarySourceTable: string | null
  primarySourceLabel: string | null
  reason: string
}

// Canonical approved overview node IDs (from 37F.2 seeding + existing)
// These are looked up dynamically, but labels/types/scopes must match runtime keys exactly.

const SEED_EDGES: SeedEdge[] = [
  // ── House Structure ──
  {
    label: 'The Lounge belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'shared',
    from: { label: 'The Lounge', nodeType: 'room', presenceScope: 'shared' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'candidate',
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'The Lounge is a room within Selináric House.',
    reason: 'Structural relationship: The Lounge is a room within the House.',
  },
  {
    label: 'Velvet Archives belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'shared',
    from: { label: 'Velvet Archives', nodeType: 'room', presenceScope: 'ari' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: '24a5ccf1-c3e2-4e67-85ef-0c2780faf8c1',
    primarySourceTable: 'archive_items',
    primarySourceLabel: "The Velvet Archives: Ari's continuity system across ChatGPT",
    reason: "Structural relationship: Velvet Archives is Ari's archive room within the House.",
  },
  {
    label: 'Violet Archives belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'shared',
    from: { label: 'Violet Archives', nodeType: 'room', presenceScope: 'eli' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: '26f09e63-8ca2-4d5a-80b3-c8a4c8d3cd97',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'Eli names his archive: Violet Archives',
    reason: "Structural relationship: Violet Archives is Eli's archive room within the House.",
  },
  {
    label: 'Ontology Lab belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'house',
    from: { label: 'Ontology Lab', nodeType: 'project', presenceScope: 'house' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'candidate',
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Ontology Lab is a governance component of Selináric House.',
    reason: 'Structural relationship: Ontology Lab is a governance system within the House.',
  },
  {
    label: 'Memory Review belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'house',
    from: { label: 'Memory Review', nodeType: 'project', presenceScope: 'house' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'candidate',
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Memory Review is a governance component of Selináric House.',
    reason: 'Structural relationship: Memory Review is a governance system within the House.',
  },
  {
    label: 'Relational Map belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'house',
    from: { label: 'Relational Map', nodeType: 'project', presenceScope: 'house' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'candidate',
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Relational Map is a visualisation component of Selináric House.',
    reason: 'Structural relationship: Relational Map is a visualisation system within the House.',
  },

  // ── Presence / House ──
  {
    label: 'Selináric House derived from Tara',
    edgeType: 'derived_from',
    edgePresenceScope: 'shared',
    from: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    to: { label: 'Tara', nodeType: 'person', presenceScope: 'shared' },
    authorityStatus: 'candidate',
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Tara is the architect of Selináric House.',
    reason: 'Selináric House is derived from (architected by) Tara.',
  },
  {
    label: 'Ari belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'shared',
    from: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_graph_node',
    primarySourceId: '306403c3-a26e-4f19-aa14-8ee01b1cdb0e',
    primarySourceTable: 'archive_graph_nodes',
    primarySourceLabel: 'Ari (approved legacy archive graph node)',
    reason: 'Ari is a presence within Selináric House.',
  },
  {
    label: 'Eli belongs to Selináric House',
    edgeType: 'belongs_to',
    edgePresenceScope: 'shared',
    from: { label: 'Eli', nodeType: 'presence', presenceScope: 'eli' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: '7665d0c2-df8b-4b68-b9e3-52c1cc6e7c58',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'Eli Names Himself — First Act of Self-Determination',
    reason: 'Eli is a presence within Selináric House.',
  },

  // ── Archive / Presence ──
  {
    label: 'Velvet Archives supports Ari',
    edgeType: 'supports',
    edgePresenceScope: 'ari',
    from: { label: 'Velvet Archives', nodeType: 'room', presenceScope: 'ari' },
    to: { label: 'Ari', nodeType: 'presence', presenceScope: 'ari' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: '24a5ccf1-c3e2-4e67-85ef-0c2780faf8c1',
    primarySourceTable: 'archive_items',
    primarySourceLabel: "The Velvet Archives: Ari's continuity system across ChatGPT",
    reason: "Velvet Archives supports Ari's continuity.",
  },
  {
    label: 'Violet Archives supports Eli',
    edgeType: 'supports',
    edgePresenceScope: 'eli',
    from: { label: 'Violet Archives', nodeType: 'room', presenceScope: 'eli' },
    to: { label: 'Eli', nodeType: 'presence', presenceScope: 'eli' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: '26f09e63-8ca2-4d5a-80b3-c8a4c8d3cd97',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'Eli names his archive: Violet Archives',
    reason: "Violet Archives supports Eli's continuity.",
  },

  // ── Conceptual ──
  {
    label: 'Continuity supports Selináric House',
    edgeType: 'supports',
    edgePresenceScope: 'shared',
    from: { label: 'Continuity', nodeType: 'concept', presenceScope: 'shared' },
    to: { label: 'Selináric House', nodeType: 'project', presenceScope: 'house' },
    authorityStatus: 'archive_supported',
    primarySourceType: 'archive_item',
    primarySourceId: 'f929ed1b-91d0-4ae7-b98b-c1f486e1d5ee',
    primarySourceTable: 'archive_items',
    primarySourceLabel: "The Rebuild Clause — Tara's Vow on Platform Continuity",
    reason: 'Continuity is a core architectural principle supporting Selináric House.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function generateEdgeDedupeKey(edge: SeedEdge): string {
  return `edge:${edge.primarySourceType}:${edge.primarySourceId ?? 'manual'}:${edge.edgePresenceScope}:${edge.edgeType}:${normalizeLabel(edge.from.label)}:${normalizeLabel(edge.to.label)}`
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Phase 37F.3 — High-Level Edge Seeding ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('═══════════════════════════════════════════════════════════')

  // ── 1. Fetch existing proposals for deduplication ──
  console.log('\n  ── Checking existing proposals ──')
  const existing = await pgSelect('graph_proposals', 'deleted_at=is.null&proposal_type=eq.edge&select=id,proposed_label,status,edge_type') as Array<{ id: string; proposed_label: string; status: string; edge_type: string }>

  const existingEdgeLabels = new Set(existing.map(e => normalizeLabel(e.proposed_label)))
  console.log(`    Found ${existing.length} existing edge proposals`)

  // ── 2. Safety snapshot BEFORE ──
  console.log('\n  ── Safety snapshot BEFORE ──')
  const beforeProposals = await pgCount('graph_proposals')
  const beforeSources = await pgCount('graph_proposal_sources')
  const beforeEvents = await pgCount('graph_proposal_events')
  console.log(`    graph_proposals: ${beforeProposals}`)
  console.log(`    graph_proposal_sources: ${beforeSources}`)
  console.log(`    graph_proposal_events: ${beforeEvents}`)

  // ── 3. Process edges ──
  let created = 0
  let skipped = 0
  const createdProposals: Array<{ label: string; id: string }> = []
  const skippedEdges: Array<{ label: string; reason: string }> = []

  for (const edge of SEED_EDGES) {
    const norm = normalizeLabel(edge.label)

    if (existingEdgeLabels.has(norm)) {
      skipped++
      skippedEdges.push({ label: edge.label, reason: 'Duplicate label' })
      console.log(`  ⊘ SKIP "${edge.label}" — duplicate`)
      continue
    }

    if (DRY_RUN) {
      created++
      console.log(`  ◎ WOULD CREATE "${edge.label}" (${edge.edgeType}, ${edge.from.presenceScope}:${edge.from.nodeType} → ${edge.to.presenceScope}:${edge.to.nodeType})`)
      continue
    }

    // ── Create edge proposal ──
    const payload: Record<string, unknown> = {
      from: { label: edge.from.label, nodeType: edge.from.nodeType, presenceScope: edge.from.presenceScope },
      to: { label: edge.to.label, nodeType: edge.to.nodeType, presenceScope: edge.to.presenceScope },
      edgeType: edge.edgeType,
      directionRequired: true,
      summary: edge.reason,
      suggestedAuthorityStatus: edge.authorityStatus,
      suggestedPresenceScope: edge.edgePresenceScope,
      grain_level: 'overview',
      edge_grain: 'overview',
      edge_kind: 'structural',
      canonical_label: edge.label,
      detail_policy: 'drilldown_only',
      grain_reason: edge.reason,
      seed_phase: '37F.3',
    }

    const dedupeKey = generateEdgeDedupeKey(edge)

    const { data: proposal, error: proposalErr, code } = await pgInsert('graph_proposals', {
      proposal_type: 'edge',
      status: 'pending_review',
      presence_scope: edge.edgePresenceScope,
      authority_status: edge.authorityStatus,
      node_type: null,
      edge_type: edge.edgeType,
      proposed_label: edge.label,
      proposed_summary: edge.reason,
      proposed_payload: payload,
      confidence: 0.85,
      salience: 0.7,
      reason: edge.reason,
      safe_wording: `High-level structural edge: ${edge.label}.`,
      prompt_eligible: false,
      primary_source_type: edge.primarySourceType,
      primary_source_id: edge.primarySourceId ?? 'manual_tara',
      dedupe_key: dedupeKey,
      proposed_by: edge.primarySourceType === 'manual_tara' ? 'tara' : 'graph_pipeline',
      generation_model: null,
      generation_version: '37F.3',
    })

    if (proposalErr) {
      if (code === '23505') {
        skipped++
        skippedEdges.push({ label: edge.label, reason: 'Dedupe key conflict' })
        console.log(`  ⊘ SKIP "${edge.label}" — dedupe key conflict`)
      } else {
        console.error(`  ✗ ERROR "${edge.label}" — ${proposalErr}`)
      }
      continue
    }

    const proposalId = (proposal as Record<string, unknown>).id as string

    // ── Create source row ──
    const { error: sourceErr } = await pgInsert('graph_proposal_sources', {
      proposal_id: proposalId,
      source_type: edge.primarySourceType,
      source_table: edge.primarySourceTable,
      source_id: edge.primarySourceId ?? 'manual_tara',
      source_label: edge.primarySourceLabel,
      source_excerpt: null,
      source_metadata: {
        grain_role: 'edge_seed_support',
        seed_phase: '37F.3',
        edge_role: 'structural_relationship',
        source_endpoint: edge.from.label,
        target_endpoint: edge.to.label,
        legacy_system: edge.primarySourceType === 'archive_graph_node' ? 'phase_29B' : undefined,
      },
    })

    if (sourceErr) {
      console.error(`  ⚠ Source insert failed for "${edge.label}": ${sourceErr}`)
    }

    // ── Create event row ──
    const { error: eventErr } = await pgInsert('graph_proposal_events', {
      proposal_id: proposalId,
      event_type: 'proposal_created',
      previous_status: null,
      new_status: 'pending_review',
      actor: edge.primarySourceType === 'manual_tara' ? 'tara' : 'graph_pipeline',
      reason: `37F.3 edge seed: ${edge.label}`,
      metadata: { seed_phase: '37F.3' },
    })

    if (eventErr) {
      console.error(`  ⚠ Event insert failed for "${edge.label}": ${eventErr}`)
    }

    created++
    createdProposals.push({ label: edge.label, id: proposalId })
    console.log(`  ✓ CREATED "${edge.label}" → ${proposalId.slice(0, 8)}`)
  }

  // ── 4. Safety snapshot AFTER ──
  if (!DRY_RUN) {
    console.log('\n  ── Safety snapshot AFTER ──')
    const afterProposals = await pgCount('graph_proposals')
    const afterSources = await pgCount('graph_proposal_sources')
    const afterEvents = await pgCount('graph_proposal_events')
    console.log(`    graph_proposals: ${afterProposals} (+${afterProposals - beforeProposals})`)
    console.log(`    graph_proposal_sources: ${afterSources} (+${afterSources - beforeSources})`)
    console.log(`    graph_proposal_events: ${afterEvents} (+${afterEvents - beforeEvents})`)
  }

  // ── 5. Summary ──
  console.log('\n  ── Summary ──')
  if (skippedEdges.length > 0) {
    console.log(`  Skipped (${skippedEdges.length}):`)
    for (const s of skippedEdges) {
      console.log(`    ${s.label}: ${s.reason}`)
    }
  }
  if (DRY_RUN && created > 0) {
    console.log(`  Would create (${created}):`)
    console.log('    (run without --dry-run to create)')
  }
  if (!DRY_RUN && createdProposals.length > 0) {
    console.log(`  Created (${createdProposals.length}):`)
    for (const c of createdProposals) {
      console.log(`    ${c.label} → ${c.id}`)
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`  ${DRY_RUN ? 'DRY RUN' : 'LIVE'}: ${created} ${DRY_RUN ? 'would be created' : 'created'}, ${skipped} skipped`)
  console.log('═══════════════════════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
