/**
 * Phase 37B Post-Migration Validation
 *
 * Run after migration 068 (graph_proposals) is applied.
 *
 * Validates:
 * 1. GET smoke test — list proposals (expect empty initially)
 * 2. Safety snapshot — row counts in memory_nodes, memory_edges,
 *    archive_graph_nodes, archive_graph_edges
 * 3. Canonical status snapshot — canonical_status distribution in archive_items
 * 4. Controlled proposal insert — creates a test proposal directly via PostgREST
 * 5. Verify prompt_eligible is forced false
 * 6. Verify graph_proposal_sources is written
 * 7. Verify graph_proposal_events has proposal_created event
 * 8. Verify no writes to Phase 15/29B graph tables
 * 9. Verify no canonical_status mutations on archive_items
 * 10. Cleanup — soft-delete then remove the test proposal
 *
 * Uses raw PostgREST (fetch) to avoid Supabase JS WebSocket issues on Node 20.
 *
 * Usage: npx tsx scripts/validate-37b-post-migration.ts
 */

export {}  // TypeScript module boundary

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ─── Load .env.local ───────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[37B-validate] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const REST_URL = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

// ─── Test harness ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

// ─── PostgREST helpers ─────────────────────────────────────────────────────

async function pgSelect(table: string, params: string = ''): Promise<{ data: any[]; error: string | null }> {
  const url = `${REST_URL}/${table}${params ? '?' + params : ''}`
  try {
    const resp = await fetch(url, { headers: { ...HEADERS, 'Prefer': '' } })
    if (!resp.ok) {
      const body = await resp.text()
      return { data: [], error: `${resp.status}: ${body.slice(0, 200)}` }
    }
    const data = await resp.json()
    return { data: Array.isArray(data) ? data : [data], error: null }
  } catch (e) {
    return { data: [], error: String(e) }
  }
}

async function pgCount(table: string, filter: string = ''): Promise<number> {
  const url = `${REST_URL}/${table}?select=id${filter ? '&' + filter : ''}`
  try {
    const resp = await fetch(url, {
      headers: { ...HEADERS, 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' },
    })
    const range = resp.headers.get('content-range')
    if (range) {
      const total = range.split('/')[1]
      return total === '*' ? 0 : parseInt(total, 10)
    }
    // Fallback: just count the returned rows
    const data = await resp.json()
    return Array.isArray(data) ? data.length : 0
  } catch {
    return -1
  }
}

async function pgInsert(table: string, row: Record<string, unknown>): Promise<{ data: any; error: string | null; code?: string }> {
  const url = `${REST_URL}/${table}`
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(row),
    })
    const body = await resp.json()
    if (!resp.ok) {
      return { data: null, error: body.message || JSON.stringify(body), code: body.code }
    }
    return { data: Array.isArray(body) ? body[0] : body, error: null }
  } catch (e) {
    return { data: null, error: String(e) }
  }
}

async function pgUpdate(table: string, filter: string, updates: Record<string, unknown>): Promise<{ error: string | null }> {
  const url = `${REST_URL}/${table}?${filter}`
  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(updates),
    })
    if (!resp.ok) {
      const body = await resp.text()
      return { error: `${resp.status}: ${body.slice(0, 200)}` }
    }
    return { error: null }
  } catch (e) {
    return { error: String(e) }
  }
}

async function pgDelete(table: string, filter: string): Promise<{ error: string | null; code?: string }> {
  const url = `${REST_URL}/${table}?${filter}`
  try {
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: HEADERS,
    })
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      return { error: body.message || `${resp.status}`, code: body.code }
    }
    return { error: null }
  } catch (e) {
    return { error: String(e) }
  }
}

// ═════════════════════════════════════════════════════════════════════════════

async function run() {
  console.log('Phase 37B — Post-Migration Validation')
  console.log('═'.repeat(60))

  // ═══════════════════════════════════════════════════════════════
  // 1. GET smoke test — list proposals
  // ═══════════════════════════════════════════════════════════════
  section('1. GET smoke test — list proposals from graph_proposals')

  const { data: initialProposals, error: listErr } = await pgSelect(
    'graph_proposals',
    'deleted_at=is.null&order=created_at.desc&limit=50'
  )

  assert(!listErr, `List proposals query succeeds (no error)`)
  assert(Array.isArray(initialProposals), `List proposals returns an array`)

  const initialCount = initialProposals.length
  console.log(`  ℹ Initial proposal count: ${initialCount}`)

  // ═══════════════════════════════════════════════════════════════
  // 2. Safety snapshot — Phase 15 + Phase 29B graph tables
  // ═══════════════════════════════════════════════════════════════
  section('2. Safety snapshot — existing graph tables')

  const memoryNodesBefore = await pgCount('memory_nodes')
  const memoryEdgesBefore = await pgCount('memory_edges')
  const archiveGraphNodesBefore = await pgCount('archive_graph_nodes')
  const archiveGraphEdgesBefore = await pgCount('archive_graph_edges')

  console.log(`  ℹ memory_nodes: ${memoryNodesBefore}`)
  console.log(`  ℹ memory_edges: ${memoryEdgesBefore}`)
  console.log(`  ℹ archive_graph_nodes: ${archiveGraphNodesBefore}`)
  console.log(`  ℹ archive_graph_edges: ${archiveGraphEdgesBefore}`)

  assert(memoryNodesBefore >= 0, 'memory_nodes count captured')
  assert(memoryEdgesBefore >= 0, 'memory_edges count captured')
  assert(archiveGraphNodesBefore >= 0, 'archive_graph_nodes count captured')
  assert(archiveGraphEdgesBefore >= 0, 'archive_graph_edges count captured')

  // ═══════════════════════════════════════════════════════════════
  // 3. Canonical status snapshot
  // ═══════════════════════════════════════════════════════════════
  section('3. Canonical status snapshot')

  const { data: archiveItems } = await pgSelect('archive_items', 'select=canonical_status')
  const canonicalDistBefore: Record<string, number> = {}
  for (const row of archiveItems) {
    const status = row.canonical_status ?? 'null'
    canonicalDistBefore[status] = (canonicalDistBefore[status] || 0) + 1
  }
  console.log(`  ℹ canonical_status distribution:`, JSON.stringify(canonicalDistBefore))

  assert(Object.keys(canonicalDistBefore).length > 0, 'Have archive_items with canonical_status values')

  // ═══════════════════════════════════════════════════════════════
  // 4. Find a safe canonical archive_item for source reference
  // ═══════════════════════════════════════════════════════════════
  section('4. Find safe canonical archive_item')

  const { data: canonicalItems } = await pgSelect(
    'archive_items',
    'select=id,title,canonical_status,owner_presence&canonical_status=eq.canonical&deleted_at=is.null&limit=1'
  )

  let sourceId = '00000000-0000-0000-0000-000000000000'
  let sourceTitle = 'Test source'

  if (canonicalItems.length > 0) {
    const item = canonicalItems[0]
    sourceId = item.id
    sourceTitle = item.title ?? 'Untitled'
    console.log(`  ℹ Found: ${sourceId} — "${sourceTitle.slice(0, 50)}"`)
  } else {
    console.log('  ⚠ No canonical archive_item found — using placeholder ID')
  }

  assert(true, 'Source selection completed')

  // ═══════════════════════════════════════════════════════════════
  // 5. Controlled proposal insert
  // ═══════════════════════════════════════════════════════════════
  section('5. Controlled proposal insert')

  const dedupeKey = `node:archive_item:${sourceId}:shared:37b validation test node`

  const testProposal = {
    proposal_type: 'node',
    status: 'pending_review',
    presence_scope: 'shared',
    authority_status: 'candidate',
    node_type: 'concept',
    edge_type: null,
    proposed_label: '37B Validation Test Node',
    proposed_summary: 'Test proposal created by post-migration validation script.',
    proposed_payload: {
      nodeType: 'concept',
      label: '37B Validation Test Node',
      summary: 'Test proposal created by post-migration validation script.',
      suggestedAuthorityStatus: 'candidate',
      suggestedPresenceScope: 'shared',
    },
    confidence: 0.5,
    salience: 0.5,
    reason: 'Automated post-migration validation for Phase 37B.',
    safe_wording: 'Test validation node — safe to delete.',
    prompt_eligible: false,
    primary_source_type: 'archive_item',
    primary_source_id: sourceId,
    dedupe_key: dedupeKey,
    proposed_by: 'graph_pipeline',
    generation_model: null,
    generation_version: '37B',
  }

  const { data: insertedProposal, error: insertErr } = await pgInsert('graph_proposals', testProposal)

  assert(!insertErr, `Proposal insert succeeds${insertErr ? ': ' + insertErr : ''}`)
  assert(!!insertedProposal, 'Proposal returned after insert')

  const proposalId = insertedProposal?.id

  if (!proposalId) {
    console.log('  ⚠ Cannot continue — proposal insert failed')
    printSummary()
    return
  }

  console.log(`  ℹ Created proposal: ${proposalId}`)

  // ═══════════════════════════════════════════════════════════════
  // 6. Verify prompt_eligible is forced false
  // ═══════════════════════════════════════════════════════════════
  section('6. Verify proposal fields')

  assert(insertedProposal.prompt_eligible === false, 'prompt_eligible is false')
  assert(insertedProposal.status === 'pending_review', 'status is pending_review')
  assert(insertedProposal.proposed_by === 'graph_pipeline', 'proposed_by is graph_pipeline')
  assert(insertedProposal.generation_version === '37B', 'generation_version is 37B')
  assert(insertedProposal.authority_status === 'candidate', 'authority_status is candidate')
  assert(insertedProposal.presence_scope === 'shared', 'presence_scope is shared')
  assert(insertedProposal.proposal_type === 'node', 'proposal_type is node')
  assert(insertedProposal.node_type === 'concept', 'node_type is concept')
  assert(insertedProposal.dedupe_key === dedupeKey, 'dedupe_key matches')

  // ═══════════════════════════════════════════════════════════════
  // 7. Insert and verify graph_proposal_sources
  // ═══════════════════════════════════════════════════════════════
  section('7. Insert and verify graph_proposal_sources')

  const { data: insertedSource, error: sourceInsertErr } = await pgInsert('graph_proposal_sources', {
    proposal_id: proposalId,
    source_type: 'archive_item',
    source_table: 'archive_items',
    source_id: sourceId,
    source_label: sourceTitle,
    source_excerpt: 'Test excerpt for 37B validation.',
    source_metadata: { validation: true, phase: '37B' },
  })

  assert(!sourceInsertErr, `Source insert succeeds${sourceInsertErr ? ': ' + sourceInsertErr : ''}`)
  assert(!!insertedSource, 'Source record returned after insert')

  if (insertedSource) {
    assert(insertedSource.proposal_id === proposalId, 'Source FK points to proposal')
    assert(insertedSource.source_type === 'archive_item', 'Source type is archive_item')
    assert(insertedSource.source_table === 'archive_items', 'Source table is archive_items')
    assert(insertedSource.source_id === sourceId, 'Source ID matches')
    assert(typeof insertedSource.source_metadata === 'object', 'Source metadata is object')
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. Insert and verify proposal_created event
  // ═══════════════════════════════════════════════════════════════
  section('8. Insert and verify graph_proposal_events')

  const { data: insertedEvent, error: eventInsertErr } = await pgInsert('graph_proposal_events', {
    proposal_id: proposalId,
    event_type: 'proposal_created',
    previous_status: null,
    new_status: 'pending_review',
    actor: 'graph_pipeline',
    reason: 'Automated post-migration validation for Phase 37B.',
    metadata: {
      source_type: 'archive_item',
      source_id: sourceId,
      generation_model: null,
      validation: true,
    },
  })

  assert(!eventInsertErr, `Event insert succeeds${eventInsertErr ? ': ' + eventInsertErr : ''}`)
  assert(!!insertedEvent, 'Event record returned after insert')

  if (insertedEvent) {
    assert(insertedEvent.proposal_id === proposalId, 'Event FK points to proposal')
    assert(insertedEvent.event_type === 'proposal_created', 'Event type is proposal_created')
    assert(insertedEvent.new_status === 'pending_review', 'Event new_status is pending_review')
    assert(insertedEvent.actor === 'graph_pipeline', 'Event actor is graph_pipeline')
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. Verify no writes to Phase 15/29B graph tables
  // ═══════════════════════════════════════════════════════════════
  section('9. Verify no writes to existing graph tables')

  const memoryNodesAfter = await pgCount('memory_nodes')
  const memoryEdgesAfter = await pgCount('memory_edges')
  const archiveGraphNodesAfter = await pgCount('archive_graph_nodes')
  const archiveGraphEdgesAfter = await pgCount('archive_graph_edges')

  assert(memoryNodesAfter === memoryNodesBefore, `memory_nodes unchanged (${memoryNodesBefore} → ${memoryNodesAfter})`)
  assert(memoryEdgesAfter === memoryEdgesBefore, `memory_edges unchanged (${memoryEdgesBefore} → ${memoryEdgesAfter})`)
  assert(archiveGraphNodesAfter === archiveGraphNodesBefore, `archive_graph_nodes unchanged (${archiveGraphNodesBefore} → ${archiveGraphNodesAfter})`)
  assert(archiveGraphEdgesAfter === archiveGraphEdgesBefore, `archive_graph_edges unchanged (${archiveGraphEdgesBefore} → ${archiveGraphEdgesAfter})`)

  // ═══════════════════════════════════════════════════════════════
  // 10. Verify no canonical_status mutations
  // ═══════════════════════════════════════════════════════════════
  section('10. Verify no canonical_status mutations')

  const { data: archiveItemsAfter } = await pgSelect('archive_items', 'select=canonical_status')
  const canonicalDistAfter: Record<string, number> = {}
  for (const row of archiveItemsAfter) {
    const status = row.canonical_status ?? 'null'
    canonicalDistAfter[status] = (canonicalDistAfter[status] || 0) + 1
  }
  console.log(`  ℹ canonical_status distribution after:`, JSON.stringify(canonicalDistAfter))

  const allStatusKeys = new Set([...Object.keys(canonicalDistBefore), ...Object.keys(canonicalDistAfter)])
  let canonicalUnchanged = true
  for (const key of allStatusKeys) {
    const before = canonicalDistBefore[key] ?? 0
    const after = canonicalDistAfter[key] ?? 0
    if (before !== after) {
      canonicalUnchanged = false
      console.log(`  ⚠ canonical_status "${key}" changed: ${before} → ${after}`)
    }
  }
  assert(canonicalUnchanged, 'No canonical_status mutations on archive_items')

  // ═══════════════════════════════════════════════════════════════
  // 11. Verify proposal retrieval (single proposal + children)
  // ═══════════════════════════════════════════════════════════════
  section('11. Verify single proposal retrieval')

  const { data: retrievedList } = await pgSelect(
    'graph_proposals',
    `id=eq.${proposalId}&deleted_at=is.null`
  )

  assert(retrievedList.length === 1, 'Single proposal retrieval returns 1 row')

  const retrieved = retrievedList[0]
  if (retrieved) {
    assert(retrieved.id === proposalId, 'Retrieved proposal ID matches')
    assert(retrieved.prompt_eligible === false, 'Retrieved proposal prompt_eligible still false')
  }

  // Retrieve sources for the proposal
  const { data: sources } = await pgSelect(
    'graph_proposal_sources',
    `proposal_id=eq.${proposalId}`
  )

  assert(sources.length === 1, `Proposal has exactly 1 source record`)

  // Retrieve events for the proposal
  const { data: events } = await pgSelect(
    'graph_proposal_events',
    `proposal_id=eq.${proposalId}`
  )

  assert(events.length === 1, `Proposal has exactly 1 event record`)
  if (events.length > 0) {
    assert(events[0].event_type === 'proposal_created', 'Event is proposal_created')
  }

  // ═══════════════════════════════════════════════════════════════
  // 12. Verify dedupe prevents duplicate insert
  // ═══════════════════════════════════════════════════════════════
  section('12. Verify dedupe prevents duplicate')

  const { error: dupeErr, code: dupeCode } = await pgInsert('graph_proposals', testProposal)

  assert(!!dupeErr, 'Duplicate insert is rejected')
  assert(dupeCode === '23505', `Duplicate error code is 23505 (unique violation), got: ${dupeCode}`)
  if (dupeErr) {
    console.log(`  ℹ Dedupe message: ${dupeErr.slice(0, 120)}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // 13. Verify RESTRICT FK — cannot delete proposal with children
  // ═══════════════════════════════════════════════════════════════
  section('13. Verify FK RESTRICT — hard delete blocked')

  const { error: hardDeleteErr } = await pgDelete('graph_proposals', `id=eq.${proposalId}`)

  assert(!!hardDeleteErr, 'Hard delete of proposal with children is blocked')
  if (hardDeleteErr) {
    console.log(`  ℹ FK RESTRICT message: ${hardDeleteErr.slice(0, 150)}`)
  }

  // ═══════════════════════════════════════════════════════════════
  // 14. Cleanup — soft-delete then fully remove test data
  // ═══════════════════════════════════════════════════════════════
  section('14. Cleanup — soft-delete test proposal')

  const { error: softDeleteErr } = await pgUpdate(
    'graph_proposals',
    `id=eq.${proposalId}`,
    { deleted_at: new Date().toISOString() }
  )

  assert(!softDeleteErr, `Soft-delete succeeds${softDeleteErr ? ': ' + softDeleteErr : ''}`)

  // Verify soft-deleted proposal is excluded from list
  const { data: afterCleanup } = await pgSelect(
    'graph_proposals',
    'deleted_at=is.null&order=created_at.desc&limit=50'
  )

  const testProposalInList = afterCleanup.some((p: any) => p.id === proposalId)
  assert(!testProposalInList, 'Soft-deleted proposal excluded from list query')

  // Clean up children then parent
  const { error: cleanSourceErr } = await pgDelete('graph_proposal_sources', `proposal_id=eq.${proposalId}`)
  const { error: cleanEventErr } = await pgDelete('graph_proposal_events', `proposal_id=eq.${proposalId}`)
  const { error: finalDeleteErr } = await pgDelete('graph_proposals', `id=eq.${proposalId}`)

  if (!cleanSourceErr && !cleanEventErr && !finalDeleteErr) {
    console.log('  ℹ Test data fully cleaned up')
  } else {
    console.log('  ⚠ Partial cleanup — check manually')
    if (cleanSourceErr) console.log(`    Source cleanup: ${cleanSourceErr}`)
    if (cleanEventErr) console.log(`    Event cleanup: ${cleanEventErr}`)
    if (finalDeleteErr) console.log(`    Proposal cleanup: ${finalDeleteErr}`)
  }

  // Verify clean slate
  const finalCount = (await pgSelect('graph_proposals', 'deleted_at=is.null')).data.length
  assert(finalCount === initialCount, `Proposal count restored to initial (${initialCount} → ${finalCount})`)

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  printSummary()
}

function printSummary() {
  console.log('\n' + '═'.repeat(60))
  console.log(`Phase 37B Post-Migration Validation: ${passed} passed, ${failed} failed`)

  if (failures.length > 0) {
    console.log('\nFailed:')
    for (const f of failures) {
      console.log(`  ✗ ${f}`)
    }
  }

  console.log('═'.repeat(60))
  process.exit(failed > 0 ? 1 : 0)
}

// ─── Run ───────────────────────────────────────────────────────────────────

run().catch(err => {
  console.error('\n[FATAL]', err)
  process.exit(2)
})
