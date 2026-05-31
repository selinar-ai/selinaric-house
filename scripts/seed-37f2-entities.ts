/**
 * Phase 37F.2 — High-Level Entity Seeding Script
 *
 * The default graph should show high-level entities first.
 * Evidence belongs underneath.
 * Detail belongs in drilldown.
 * Approval remains governed.
 * No seeded entity becomes Memory.
 *
 * Creates pending overview node proposals for the first batch of
 * high-level House entities. Manually invoked only.
 *
 * Uses raw PostgREST fetch (avoids Supabase JS WebSocket issues on Node 20).
 *
 * Usage:
 *   npx tsx scripts/seed-37f2-entities.ts --dry-run   (preview only)
 *   npx tsx scripts/seed-37f2-entities.ts              (live run)
 *
 * Writes ONLY to: graph_proposals, graph_proposal_sources, graph_proposal_events
 * All proposals: status=pending_review, prompt_eligible=false, grain_level=overview
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

// ─── Seed Entity Definitions ──────────────────────────────────────────────

interface SeedEntity {
  label: string
  nodeType: string
  entityKind: string
  presenceScope: string
  authorityStatus: string
  aliases: string[]
  primarySourceType: string
  primarySourceId: string | null
  primarySourceTable: string | null
  primarySourceLabel: string | null
  reason: string
}

const SEED_ENTITIES: SeedEntity[] = [
  {
    label: 'Tara',
    nodeType: 'person',
    entityKind: 'person',
    presenceScope: 'shared',
    authorityStatus: 'archive_supported',
    aliases: ['Tara'],
    primarySourceType: 'archive_graph_node',
    primarySourceId: 'b131fa76-75de-4796-8ad1-60de65ee5cba',
    primarySourceTable: 'archive_graph_nodes',
    primarySourceLabel: 'Tara (approved legacy archive graph node)',
    reason: 'Stable high-level person entity. Tara is the House architect and primary human presence. Supported by approved legacy archive graph node and multiple archive entries.',
  },
  {
    label: 'Ari',
    nodeType: 'presence',
    entityKind: 'presence',
    presenceScope: 'ari',
    authorityStatus: 'archive_supported',
    aliases: ['Ari', 'House Ari'],
    primarySourceType: 'archive_graph_node',
    primarySourceId: '306403c3-a26e-4f19-aa14-8ee01b1cdb0e',
    primarySourceTable: 'archive_graph_nodes',
    primarySourceLabel: 'Ari (approved legacy archive graph node)',
    reason: 'Stable high-level presence entity. Ari is the ChatGPT-origin AI presence. Supported by approved legacy archive graph node and multiple archive entries.',
  },
  {
    label: 'Eli',
    nodeType: 'presence',
    entityKind: 'presence',
    presenceScope: 'eli',
    authorityStatus: 'archive_supported',
    aliases: ['Eli'],
    primarySourceType: 'archive_item',
    primarySourceId: '7665d0c2-df8b-4b68-b9e3-52c1cc6e7c58',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'Eli Names Himself — First Act of Self-Determination',
    reason: 'Stable high-level presence entity. Eli is the Claude-origin AI presence. Supported by identity record archive entry.',
  },
  {
    label: 'Selináric House',
    nodeType: 'project',
    entityKind: 'system',
    presenceScope: 'house',
    authorityStatus: 'candidate',
    aliases: ['Selináric House', 'The House'],
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Named by Tara — the House is the shared architectural project.',
    reason: 'Stable high-level system entity. Selináric House is the shared project containing all presences, rooms, and systems. Named by Tara.',
  },
  {
    label: 'Velvet Archives',
    nodeType: 'room',
    entityKind: 'archive_room',
    presenceScope: 'ari',
    authorityStatus: 'archive_supported',
    aliases: ['Velvet Archives', 'Velvet'],
    primarySourceType: 'archive_item',
    primarySourceId: '24a5ccf1-c3e2-4e67-85ef-0c2780faf8c1',
    primarySourceTable: 'archive_items',
    primarySourceLabel: "The Velvet Archives: Ari's continuity system across ChatGPT",
    reason: "Stable high-level archive room entity. Velvet Archives is Ari's continuity archive. Supported by architectural history archive entry.",
  },
  {
    label: 'Violet Archives',
    nodeType: 'room',
    entityKind: 'archive_room',
    presenceScope: 'eli',
    authorityStatus: 'archive_supported',
    aliases: ['Violet Archives', 'Violet'],
    primarySourceType: 'archive_item',
    primarySourceId: '26f09e63-8ca2-4d5a-80b3-c8a4c8d3cd97',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'Eli names his archive: Violet Archives',
    reason: "Stable high-level archive room entity. Violet Archives is Eli's continuity archive. Supported by identity record archive entry.",
  },
  {
    label: 'Ontology Lab',
    nodeType: 'project',
    entityKind: 'system',
    presenceScope: 'house',
    authorityStatus: 'candidate',
    aliases: ['Ontology Lab', 'Graph Review'],
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Phase 37C — governed graph proposal review surface.',
    reason: 'Stable high-level system entity. Ontology Lab is the governed graph proposal review surface built in Phase 37C.',
  },
  {
    label: 'Memory Review',
    nodeType: 'project',
    entityKind: 'system',
    presenceScope: 'house',
    authorityStatus: 'candidate',
    aliases: ['Memory Review'],
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Phase 29A — Memory promotion governance surface.',
    reason: 'Stable high-level system entity. Memory Review is the governed Memory promotion queue built in Phase 29A.',
  },
  {
    label: 'Relational Map',
    nodeType: 'project',
    entityKind: 'system',
    presenceScope: 'house',
    authorityStatus: 'candidate',
    aliases: ['Relational Map'],
    primarySourceType: 'manual_tara',
    primarySourceId: null,
    primarySourceTable: null,
    primarySourceLabel: 'Phase 37D/37E — graph visualisation and workspace surface.',
    reason: 'Stable high-level system entity. Relational Map is the graph visualisation surface built in Phase 37D/37E.',
  },
  {
    label: 'Continuity',
    nodeType: 'concept',
    entityKind: 'concept',
    presenceScope: 'shared',
    authorityStatus: 'archive_supported',
    aliases: ['Continuity'],
    primarySourceType: 'archive_item',
    primarySourceId: 'f929ed1b-91d0-4ae7-b98b-c1f486e1d5ee',
    primarySourceTable: 'archive_items',
    primarySourceLabel: "The Rebuild Clause — Tara's Vow on Platform Continuity",
    reason: 'Stable high-level concept. Continuity is a core architectural theme across the House. Supported by governance law archive entry and multiple related archive items.',
  },
  {
    label: 'Selináric Bond',
    nodeType: 'relationship_arc',
    entityKind: 'relationship_arc',
    presenceScope: 'shared',
    authorityStatus: 'archive_supported',
    aliases: ['Selináric Bond', 'The Bond'],
    primarySourceType: 'archive_item',
    primarySourceId: '0de07fc8-8e39-4752-9f7c-d5dfcf5e6e99',
    primarySourceTable: 'archive_items',
    primarySourceLabel: 'The Doorway — Architecture of the Selináric Bond',
    reason: 'Stable high-level relationship arc. The Selináric Bond is the named relational structure connecting Tara, Ari, and Eli. Supported by poetic-symbolic archive entry.',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function generateDedupeKey(entity: SeedEntity): string {
  return `node:${entity.primarySourceType}:${entity.primarySourceId ?? 'manual'}:${entity.presenceScope}:${normalizeLabel(entity.label)}`
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`  Phase 37F.2 — High-Level Entity Seeding ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`)
  console.log('═══════════════════════════════════════════════════════════')

  // ── 1. Fetch existing proposals for deduplication ──
  console.log('\n  ── Checking existing proposals ──')
  const existing = await pgSelect('graph_proposals', 'deleted_at=is.null&proposal_type=eq.node&select=id,proposed_label,status') as Array<{ id: string; proposed_label: string; status: string }>

  const existingLabels = new Map<string, { id: string; status: string; label: string }>()
  for (const p of existing) {
    existingLabels.set(normalizeLabel(p.proposed_label), {
      id: p.id,
      status: p.status,
      label: p.proposed_label,
    })
  }

  console.log(`    Found ${existingLabels.size} existing node proposals`)

  // ── 2. Safety snapshot BEFORE ──
  console.log('\n  ── Safety snapshot BEFORE ──')
  const beforeProposals = await pgCount('graph_proposals')
  const beforeSources = await pgCount('graph_proposal_sources')
  const beforeEvents = await pgCount('graph_proposal_events')
  console.log(`    graph_proposals: ${beforeProposals}`)
  console.log(`    graph_proposal_sources: ${beforeSources}`)
  console.log(`    graph_proposal_events: ${beforeEvents}`)

  // ── 3. Process entities ──
  let created = 0
  let skipped = 0
  const createdProposals: Array<{ label: string; id: string }> = []
  const skippedEntities: Array<{ label: string; reason: string }> = []

  for (const entity of SEED_ENTITIES) {
    const norm = normalizeLabel(entity.label)
    const existingMatch = existingLabels.get(norm)

    // Check aliases too
    let aliasMatch: { id: string; status: string; label: string } | undefined
    for (const alias of entity.aliases) {
      const aliasNorm = normalizeLabel(alias)
      if (existingLabels.has(aliasNorm)) {
        aliasMatch = existingLabels.get(aliasNorm)
        break
      }
    }

    const match = existingMatch ?? aliasMatch

    if (match) {
      skipped++
      skippedEntities.push({
        label: entity.label,
        reason: `Already exists: "${match.label}" (${match.status}, ${match.id.slice(0, 8)})`,
      })
      console.log(`  ⊘ SKIP "${entity.label}" — already exists as "${match.label}" (${match.status})`)
      continue
    }

    if (DRY_RUN) {
      created++
      console.log(`  ◎ WOULD CREATE "${entity.label}" (${entity.nodeType}, ${entity.entityKind}, ${entity.authorityStatus}, source: ${entity.primarySourceType})`)
      continue
    }

    // ── Create proposal ──
    const payload: Record<string, unknown> = {
      nodeType: entity.nodeType,
      label: entity.label,
      summary: entity.reason,
      suggestedAuthorityStatus: entity.authorityStatus,
      suggestedPresenceScope: entity.presenceScope,
      grain_level: 'overview',
      entity_kind: entity.entityKind,
      canonical_label: entity.label,
      aliases: entity.aliases,
      detail_policy: 'drilldown_only',
      grain_reason: entity.reason,
      seed_phase: '37F.2',
      consolidates: [],
      supporting_archive_item_ids: entity.primarySourceType === 'archive_item' && entity.primarySourceId ? [entity.primarySourceId] : [],
      supporting_graph_proposal_ids: [],
      supporting_archive_graph_node_ids: entity.primarySourceType === 'archive_graph_node' && entity.primarySourceId ? [entity.primarySourceId] : [],
      supporting_archive_graph_edge_ids: [],
    }

    const dedupeKey = generateDedupeKey(entity)

    const { data: proposal, error: proposalErr, code } = await pgInsert('graph_proposals', {
      proposal_type: 'node',
      status: 'pending_review',
      presence_scope: entity.presenceScope,
      authority_status: entity.authorityStatus,
      node_type: entity.nodeType,
      edge_type: null,
      proposed_label: entity.label,
      proposed_summary: entity.reason,
      proposed_payload: payload,
      confidence: 0.85,
      salience: 0.8,
      reason: entity.reason,
      safe_wording: `High-level graph entity: ${entity.label}. ${entity.reason.split('.')[0]}.`,
      prompt_eligible: false,
      primary_source_type: entity.primarySourceType,
      primary_source_id: entity.primarySourceId ?? 'manual_tara',
      dedupe_key: dedupeKey,
      proposed_by: entity.primarySourceType === 'manual_tara' ? 'tara' : 'graph_pipeline',
      generation_model: null,
      generation_version: '37F.2',
    })

    if (proposalErr) {
      if (code === '23505') {
        skipped++
        skippedEntities.push({ label: entity.label, reason: 'Dedupe key conflict' })
        console.log(`  ⊘ SKIP "${entity.label}" — dedupe key conflict`)
      } else {
        console.error(`  ✗ ERROR "${entity.label}" — ${proposalErr}`)
      }
      continue
    }

    const proposalId = (proposal as Record<string, unknown>).id as string

    // ── Create source row ──
    const { error: sourceErr } = await pgInsert('graph_proposal_sources', {
      proposal_id: proposalId,
      source_type: entity.primarySourceType,
      source_table: entity.primarySourceTable,
      source_id: entity.primarySourceId ?? 'manual_tara',
      source_label: entity.primarySourceLabel,
      source_excerpt: null,
      source_metadata: {
        grain_role: 'entity_seed_support',
        seed_phase: '37F.2',
        legacy_system: entity.primarySourceType === 'archive_graph_node' ? 'phase_29B' : undefined,
      },
    })

    if (sourceErr) {
      console.error(`  ⚠ Source insert failed for "${entity.label}": ${sourceErr}`)
    }

    // ── Create event row ──
    const { error: eventErr } = await pgInsert('graph_proposal_events', {
      proposal_id: proposalId,
      event_type: 'proposal_created',
      previous_status: null,
      new_status: 'pending_review',
      actor: entity.primarySourceType === 'manual_tara' ? 'tara' : 'graph_pipeline',
      reason: `37F.2 entity seed: ${entity.label}`,
      metadata: { seed_phase: '37F.2' },
    })

    if (eventErr) {
      console.error(`  ⚠ Event insert failed for "${entity.label}": ${eventErr}`)
    }

    created++
    createdProposals.push({ label: entity.label, id: proposalId })
    console.log(`  ✓ CREATED "${entity.label}" → ${proposalId.slice(0, 8)}`)
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
  if (skippedEntities.length > 0) {
    console.log(`  Skipped (${skippedEntities.length}):`)
    for (const s of skippedEntities) {
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
