// Phase 42.2.1 — Delegated Extraction Retry (the first delegated apply)
//
// POST /api/helpers/outputs/[id]/delegate/retry-extraction
//
// On Tara's approval click, this ONE auth-gated route: validates the helper
// output is exactly the delegatable `file_extraction_not_run` issue, lazily
// creates an APPROVED helper_work_orders row, snapshots the target file's
// extraction state, re-runs extraction for that ONE library_item_file (writing
// ONLY whitelisted extraction fields), snapshots the result, and records one
// append-only helper_apply_events row via the security-definer record RPC.
//
// Tara's click is the only authority event. There is no scheduler, no cron, no
// self-triggering, no standing agent. The executor uses an action-specific
// whitelist and can never reach Library authority fields, tags/title/description,
// archive links, canonical fields, or any other surface. Nothing here becomes
// Memory, evidence, prompt authority, Graph truth, or Archive truth.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { extractFromDocx, extractFromPdf, extractFromPlainText, type ExtractionResult } from '@/lib/files/extract-text'
import {
  isDelegatableExtractionOutput,
  extractionFileTarget,
  buildRetryExtractionWorkOrder,
  buildExtractionSnapshot,
  assertOnlyExtractionFields,
  RETRY_EXTRACTION,
  DELEGATABLE_TARGET_SURFACE,
} from '@/lib/helpers/helperWorkOrder'
import type { HelperOutputRow } from '@/lib/helpers/helperReviewPresenter'

const STORAGE_BUCKET = 'library-files'

function getSupabase() {
  // Service role: the executor writes the file's extraction fields, inserts the
  // work order, and calls the record RPC — all server-role-only surfaces.
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const { id } = await params
  const supabase = getSupabase()

  // 1. Load the helper output and validate it is the delegatable extraction issue.
  const { data: out, error: outErr } = await supabase
    .from('helper_outputs')
    .select('id, helper_type, suggested_action, suggestion_payload, source_refs, deleted_at, test_owned')
    .eq('id', id)
    .maybeSingle()
  if (outErr) return NextResponse.json({ ok: false, error: outErr.message }, { status: 500 })
  if (!out) return NextResponse.json({ ok: false, code: 'NOT_FOUND', reason: 'Helper output not found' }, { status: 404 })

  const row = out as unknown as HelperOutputRow
  if (!isDelegatableExtractionOutput(row)) {
    return NextResponse.json(
      { ok: false, code: 'NOT_DELEGATABLE', reason: 'This output is not a delegatable extraction-retry issue' },
      { status: 422 },
    )
  }
  const fileId = extractionFileTarget(row)!

  // 2. Lazily create the APPROVED work order (Tara's click is the authority event).
  const nowIso = new Date().toISOString()
  const woInsert = buildRetryExtractionWorkOrder(row, nowIso, (out as { test_owned?: boolean }).test_owned === true)
  const { data: wo, error: woErr } = await supabase
    .from('helper_work_orders')
    .insert(woInsert)
    .select('id, status, action_type, target_surface, target_id, test_owned')
    .single()
  if (woErr || !wo) return NextResponse.json({ ok: false, error: woErr?.message ?? 'work order insert failed' }, { status: 500 })

  // 3. Load the target file + BEFORE snapshot (extraction state only).
  const { data: file, error: fileErr } = await supabase
    .from('library_item_files')
    .select('id, library_item_id, file_type, file_path, extraction_status, extracted_text, extraction_char_count, extraction_error, extraction_method, extraction_truncated, extracted_at')
    .eq('id', fileId)
    .maybeSingle()
  if (fileErr || !file) {
    await record(supabase, wo.id, 'failed', fileId, {}, null, 'failed', fileErr?.message ?? 'target file not found')
    return NextResponse.json({ ok: false, error: 'target file not found' }, { status: 500 })
  }
  const before = buildExtractionSnapshot(file)

  // 4. Perform the ONE bounded operation: re-run extraction for this file only,
  //    writing ONLY whitelisted extraction fields. Try/catch → 'failed' audit.
  try {
    const fileType = file.file_type as string
    let update: Record<string, unknown>

    if (['docx', 'pdf', 'markdown'].includes(fileType)) {
      const { data: blob, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(file.file_path)
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed')
      const buffer = Buffer.from(await blob.arrayBuffer())
      let result: ExtractionResult
      if (fileType === 'docx') result = await extractFromDocx(buffer)
      else if (fileType === 'pdf') result = await extractFromPdf(buffer)
      else result = extractFromPlainText(buffer, 'markdown_text')

      update = {
        extraction_status: result.status,
        extracted_text: result.text,
        extracted_at: new Date().toISOString(),
        extraction_error: result.error,
        extraction_char_count: result.charCount,
        extraction_truncated: result.truncated,
        extraction_method: 'text_parse',
      }
    } else {
      // Non-document types are out of this slice's bounded operation.
      throw new Error(`retry_extraction supports document files only in this slice (got '${fileType}')`)
    }

    // Whitelist guard — the executor may write ONLY extraction fields.
    assertOnlyExtractionFields(update)
    const { error: upErr } = await supabase.from('library_item_files').update(update).eq('id', fileId)
    if (upErr) throw new Error(upErr.message)

    const after = buildExtractionSnapshot({
      extraction_status: update.extraction_status as string,
      extracted_text: update.extracted_text as string | null,
      extraction_char_count: update.extraction_char_count as number | null,
      extraction_error: update.extraction_error as string | null,
      extraction_method: update.extraction_method as string | null,
      extraction_truncated: update.extraction_truncated as boolean | null,
      extracted_at: update.extracted_at as string | null,
    })

    const ev = await record(supabase, wo.id, 'applied', fileId, before, after, 'applied', null)
    return NextResponse.json({
      ok: true,
      work_order: { id: wo.id, status: 'applied', action_type: RETRY_EXTRACTION, target_surface: DELEGATABLE_TARGET_SURFACE, target_id: fileId },
      apply: { event_id: ev?.id ?? null, result: 'applied', before, after },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await record(supabase, wo.id, 'failed', fileId, before, null, 'failed', msg)
    return NextResponse.json({ ok: false, work_order_id: wo.id, error: msg }, { status: 500 })
  }
}

type Sb = ReturnType<typeof getSupabase>
async function record(
  supabase: Sb, workOrderId: string, newStatus: 'applied' | 'failed',
  targetId: string, before: unknown, after: unknown, result: 'applied' | 'failed', error: string | null,
): Promise<{ id: string } | null> {
  const { data } = await supabase.rpc('helper_apply_record', {
    p_work_order_id: workOrderId,
    p_new_status: newStatus,
    p_action_type: RETRY_EXTRACTION,
    p_target_surface: DELEGATABLE_TARGET_SURFACE,
    p_target_id: targetId,
    p_before: before,
    p_after: after,
    p_result: result,
    p_error: error,
    p_actor: 'system',
  })
  const ev = Array.isArray(data) ? data[0] : data
  return ev ? { id: (ev as { id: string }).id } : null
}
