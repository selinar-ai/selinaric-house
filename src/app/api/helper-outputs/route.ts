// Phase 41.4 — Helper Output Review Surface data source
// GET /api/helper-outputs
//
// READ-ONLY. GET only. No POST/PATCH/PUT/DELETE. No writes, no inserts, no
// updates, no helper execution. Reads helper_outputs for the Helper Review
// surface, with best-effort read-only provenance labels from library_items /
// library_item_files (display only). Helper outputs are trace, not authority —
// this route never feeds them into prompts and never mutates anything.
//
// SERVER-SIDE AUTH: gated by requireHouseApiAuth (Phase 38.3.2b HMAC HttpOnly
// cookie). The route is NOT callable unauthenticated — the client-side (house)
// AuthGuard is not the only protection. Unauthenticated direct calls get 401.
//
// Query params (all optional):
//   helperType, outputStatus, suggestedAction, confidenceLabel, createdBy
//   reviewRouted    'true' | 'false'
//   includeDeleted  'true'  (default: hide soft-deleted rows)
//   limit           default 100, max 200
//   offset          default 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const HELPER_OUTPUT_COLUMNS =
  'id, helper_type, output_status, suggested_action, confidence_label, presence_scope, ' +
  'created_by, created_at, not_memory, not_evidence, prompt_eligible, authority_changed, ' +
  'human_review_required, review_routed, reviewed_by, reviewed_at, source_refs, ' +
  'suggestion_payload, deleted_at, review_state, ' +
  // Phase 41.11: persisted review-burden fields (migration 076, live) — read-only.
  'risk_class, review_priority, review_mode, batch_eligible, sample_required, ' +
  'escalation_required, escalation_reasons'

type SourceRef = { source_surface: string; source_id: string }

export async function GET(request: NextRequest) {
  // Server-side auth gate — fail closed before any data is read.
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)

  const helperType = searchParams.get('helperType')
  const outputStatus = searchParams.get('outputStatus')
  const suggestedAction = searchParams.get('suggestedAction')
  const confidenceLabel = searchParams.get('confidenceLabel')
  const createdBy = searchParams.get('createdBy')
  const reviewRouted = searchParams.get('reviewRouted')
  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  const safeLimit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100), 200)
  const safeOffset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)

  const supabase = getSupabase()

  // eslint-disable-next-line prefer-const
  let q = supabase
    .from('helper_outputs')
    .select(HELPER_OUTPUT_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (!includeDeleted) q = q.is('deleted_at', null)
  if (helperType) q = q.eq('helper_type', helperType)
  if (outputStatus) q = q.eq('output_status', outputStatus)
  if (suggestedAction) q = q.eq('suggested_action', suggestedAction)
  if (confidenceLabel) q = q.eq('confidence_label', confidenceLabel)
  if (createdBy) q = q.eq('created_by', createdBy)
  if (reviewRouted === 'true') q = q.eq('review_routed', true)
  else if (reviewRouted === 'false') q = q.eq('review_routed', false)

  const { data: rows, error, count } = await q
  if (error) {
    return NextResponse.json(
      { error: 'Failed to load helper outputs', rows: [], labels: {}, total: 0 },
      { status: 500 },
    )
  }

  // ── Best-effort, read-only provenance labels (display only) ─────────────────
  const itemIds = new Set<string>()
  const fileIds = new Set<string>()
  for (const r of (rows ?? []) as Array<{ source_refs?: SourceRef[] }>) {
    const refs = (r.source_refs ?? []) as SourceRef[]
    for (const ref of refs) {
      if (ref.source_surface === 'library_item') itemIds.add(ref.source_id)
      else if (ref.source_surface === 'library_item_file') fileIds.add(ref.source_id)
    }
  }

  const labels: Record<string, string> = {}
  if (itemIds.size > 0) {
    const { data: items } = await supabase
      .from('library_items')
      .select('id, title')
      .in('id', [...itemIds])
    for (const it of (items ?? []) as Array<{ id: string; title: string }>) labels[it.id] = it.title
  }
  if (fileIds.size > 0) {
    const { data: files } = await supabase
      .from('library_item_files')
      .select('id, file_name')
      .in('id', [...fileIds])
    for (const f of (files ?? []) as Array<{ id: string; file_name: string }>) labels[f.id] = f.file_name
  }

  // ── Read-only review-event trace (Phase 41.14) ─────────────────────────────
  // Workflow history per row, fetched through the narrow definer read. The
  // events table is never granted a direct SELECT; this RPC returns SAFE summary
  // fields only. Best-effort: if the migration is not live (or the RPC errors),
  // rows return an empty trace and the surface shows "No review events yet." —
  // the listing never fails because of the trace. A trace is never authority.
  const baseRows = (rows ?? []) as unknown as Array<{ id: string }>
  const outputIds = baseRows.map((r) => r.id).filter((id): id is string => typeof id === 'string')

  const eventsByOutput: Record<string, unknown[]> = {}
  if (outputIds.length > 0) {
    const { data: events, error: eventsError } = await supabase.rpc(
      'helper_review_events_for_outputs',
      { p_helper_output_ids: outputIds },
    )
    if (!eventsError && Array.isArray(events)) {
      for (const ev of events as Array<{ helper_output_id?: string }>) {
        const key = typeof ev.helper_output_id === 'string' ? ev.helper_output_id : null
        if (!key) continue
        ;(eventsByOutput[key] ??= []).push(ev)
      }
    }
  }

  const rowsWithTrace = baseRows.map((r) => ({ ...r, review_events: eventsByOutput[r.id] ?? [] }))

  return NextResponse.json({ rows: rowsWithTrace, labels, total: count ?? (rows?.length ?? 0) })
}
