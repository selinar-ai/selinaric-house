/**
 * Gate A1 — POST /api/archives/graph-eligibility/bulk (Tara's bulk handle on the intake gate)
 *
 * Marks/unmarks eligible_for_graph on canonical archive items in one gesture.
 * Tara-only; 401 before any parsing/validation/DB. Every payload defect fails closed
 * BEFORE any write (empty/invalid/duplicate/count-mismatch/over-cap via the shared
 * validator; per-id stale/ineligible states refused honestly in the report).
 * The UPDATE's SET is confined to eligible_for_graph. Marking triggers NOTHING
 * downstream — no extraction, no proposals, no approval; the flag only widens what a
 * later, separately-declared extraction run may consider. UNMARK ships fail-closed:
 * any item with downstream ontology references is refused per id with the reason.
 * One audit event per request to archive_eligibility_events with full traceability.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { validateBulkEligibilityPayload, GRAPH_ELIGIBILITY_BULK_MAX } from '@/lib/graph-eligibility'

export async function POST(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const v = validateBulkEligibilityPayload(body)
  if (!v.ok) return NextResponse.json({ ok: false, code: v.code }, { status: v.status })
  const { ids, action } = v
  const marking = action === 'mark'

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  const sb = createClient(url, key)

  // Fetch the targeted rows (verification reads — the true state, never client-trusted)
  const { data: rows, error: readErr } = await sb
    .from('archive_items')
    .select('id, title, canonical_status, deleted_at, eligible_for_graph')
    .in('id', ids)
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 })
  const byId = new Map((rows ?? []).map((r) => [r.id, r]))

  // UNMARK safety: build the downstream-reference sets once (fail-closed per id)
  const downstream = new Map<string, string>()
  if (!marking) {
    const idSet = new Set(ids)
    const { data: srcs } = await sb.from('graph_proposal_sources').select('source_id, source_type')
    for (const s of srcs ?? []) {
      if (s.source_type === 'archive_item' && idSet.has(s.source_id)) downstream.set(s.source_id, 'referenced by graph proposal source')
    }
    const { data: cands } = await sb
      .from('graph_candidate_suggestions')
      .select('target_archive_item_id, deduplicated_evidence_sources')
      .is('deleted_at', null)
    for (const c of cands ?? []) {
      if (c.target_archive_item_id && idSet.has(c.target_archive_item_id)) downstream.set(c.target_archive_item_id, 'target of candidate suggestion')
      for (const sid of (c.deduplicated_evidence_sources ?? []) as string[]) {
        if (idSet.has(sid)) downstream.set(sid, 'evidence source of candidate suggestion')
      }
    }
    const { data: nodes } = await sb.from('archive_graph_nodes').select('source_item_ids')
    for (const n of nodes ?? []) {
      for (const sid of (n.source_item_ids ?? []) as string[]) {
        if (idSet.has(sid)) downstream.set(sid, 'source of archive_graph node')
      }
    }
  }

  // Per-id qualification — honest reasons, nothing silent
  const qualified: string[] = []
  const failed: { id: string; reason: string }[] = []
  for (const id of ids) {
    const row = byId.get(id)
    if (!row) { failed.push({ id, reason: 'not_found' }); continue }
    if (row.deleted_at) { failed.push({ id, reason: 'deleted' }); continue }
    if (marking) {
      if (row.canonical_status !== 'canonical') { failed.push({ id, reason: 'not_canonical' }); continue }
      if (row.eligible_for_graph === true) { failed.push({ id, reason: 'already_marked (stale payload)' }); continue }
    } else {
      if (row.eligible_for_graph !== true) { failed.push({ id, reason: 'already_unmarked (stale payload)' }); continue }
      const dep = downstream.get(id)
      if (dep) { failed.push({ id, reason: `downstream_reference: ${dep}` }); continue }
    }
    qualified.push(id)
  }

  // THE WRITE — one update, SET confined to eligible_for_graph, qualified ids only
  let succeeded: string[] = []
  if (qualified.length > 0) {
    const { data: updated, error: updErr } = await sb
      .from('archive_items')
      .update({ eligible_for_graph: marking })
      .in('id', qualified)
      .select('id')
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
    succeeded = (updated ?? []).map((u) => u.id)
    for (const id of qualified) {
      if (!succeeded.includes(id)) failed.push({ id, reason: 'write_conflict' })
    }
  }

  // ONE audit event per request — full item-id traceability (30B-shaped, jsonb breakdown)
  const sampleTitles = succeeded.slice(0, 5).map((id) => byId.get(id)?.title).filter(Boolean)
  const { error: auditErr } = await sb.from('archive_eligibility_events').insert({
    event_type: marking ? 'graph_eligibility_mark' : 'graph_eligibility_unmark',
    items_affected: succeeded.length,
    items_scanned: ids.length,
    breakdown: {
      item_ids: ids,
      success_ids: succeeded,
      failed,
      expected_count: ids.length,
      cap: GRAPH_ELIGIBILITY_BULK_MAX,
      source: 'bulk_surface',
    },
    sample_titles: sampleTitles,
    created_by: 'tara', // server-derived; the House is single-user
    created_at: new Date().toISOString(),
  })
  if (auditErr) {
    console.error('[graph-eligibility/bulk] audit insert failed:', auditErr.message)
  }

  return NextResponse.json({
    ok: failed.length === 0,
    action,
    requested_count: ids.length,
    succeeded: succeeded.length,
    success_ids: succeeded,
    failed,
  })
}
