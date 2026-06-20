// Phase 42.2.1 — Delegated apply rollback (work-order-scoped)
//
// POST /api/helpers/work-orders/[id]/rollback
//
// Reverses one applied `retry_extraction` work order: restores the target file's
// extraction state to the recorded BEFORE snapshot and appends one append-only
// `rolled_back` helper_apply_events row (via the security-definer record RPC).
//
// NARROW: only an `applied` retry_extraction work order can be rolled back. The
// restore writes ONLY whitelisted extraction fields — never authority fields,
// tags/title/description, archive links, or any other surface. Faithful for this
// action because the delegatable precondition (`file_extraction_not_run`) means
// there was no prior extracted text to lose. Nothing here moves authority.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import {
  assertOnlyExtractionFields,
  buildExtractionSnapshot,
  buildExtractionRestore,
  RETRY_EXTRACTION,
  DELEGATABLE_TARGET_SURFACE,
  type ExtractionSnapshot,
} from '@/lib/helpers/helperWorkOrder'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const { id } = await params
  const supabase = getSupabase()

  // 1. Load the work order; only an applied retry_extraction may be rolled back.
  const { data: wo, error: woErr } = await supabase
    .from('helper_work_orders')
    .select('id, status, action_type, target_surface, target_id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (woErr) return NextResponse.json({ ok: false, error: woErr.message }, { status: 500 })
  if (!wo) return NextResponse.json({ ok: false, code: 'NOT_FOUND', reason: 'Work order not found' }, { status: 404 })
  if (wo.deleted_at != null) return NextResponse.json({ ok: false, code: 'DELETED' }, { status: 409 })
  if (wo.action_type !== RETRY_EXTRACTION || wo.status !== 'applied') {
    return NextResponse.json({ ok: false, code: 'NOT_ROLLBACKABLE', reason: `status ${wo.status}` }, { status: 422 })
  }

  // 2. Read the apply audit via the narrow definer read; find the BEFORE snapshot.
  const { data: events, error: evErr } = await supabase.rpc('helper_apply_events_for_work_orders', { p_work_order_ids: [wo.id] })
  if (evErr) return NextResponse.json({ ok: false, error: evErr.message }, { status: 500 })
  const appliedEvent = (Array.isArray(events) ? events : []).find((e: { result: string }) => e.result === 'applied')
  if (!appliedEvent) return NextResponse.json({ ok: false, code: 'NO_APPLIED_EVENT' }, { status: 422 })
  const before = appliedEvent.before_snapshot as ExtractionSnapshot

  // 3. Current (post-apply) state, for the rollback audit's before-field.
  const { data: cur } = await supabase
    .from('library_item_files')
    .select('extraction_status, extracted_text, extraction_char_count, extraction_error, extraction_method, extraction_truncated, extracted_at')
    .eq('id', wo.target_id)
    .maybeSingle()
  const postApply = cur ? buildExtractionSnapshot(cur) : null

  // 4. BIT-EXACT restore: write back the exact prior value of every extraction
  //    field the executor mutated (no rollback marker). The not-run precondition
  //    has no prior text, so extracted_text → null; buildExtractionRestore refuses
  //    if the snapshot shows prior text was present.
  let restore: Record<string, unknown>
  try {
    restore = buildExtractionRestore(before)
  } catch (e) {
    return NextResponse.json({ ok: false, code: 'RESTORE_UNSUPPORTED', reason: e instanceof Error ? e.message : String(e) }, { status: 422 })
  }
  assertOnlyExtractionFields(restore)
  const { error: upErr } = await supabase.from('library_item_files').update(restore).eq('id', wo.target_id)
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })

  const restored = buildExtractionSnapshot({
    extraction_status: restore.extraction_status as string | null,
    extracted_text: null,
    extraction_char_count: restore.extraction_char_count as number | null,
    extraction_error: restore.extraction_error as string | null,
    extraction_method: restore.extraction_method as string | null,
    extraction_truncated: restore.extraction_truncated as boolean | null,
    extracted_at: restore.extracted_at as string | null,
  })

  // 5. Atomically advance applied → rolled_back and append the audit row.
  const { data: ev } = await supabase.rpc('helper_apply_record', {
    p_work_order_id: wo.id,
    p_new_status: 'rolled_back',
    p_action_type: RETRY_EXTRACTION,
    p_target_surface: DELEGATABLE_TARGET_SURFACE,
    p_target_id: wo.target_id,
    p_before: postApply,
    p_after: restored,
    p_result: 'rolled_back',
    p_error: null,
    p_actor: 'system',
  })
  const evRow = Array.isArray(ev) ? ev[0] : ev

  return NextResponse.json({
    ok: true,
    work_order: { id: wo.id, status: 'rolled_back' },
    rollback: { event_id: (evRow as { id?: string })?.id ?? null, restored },
  })
}
