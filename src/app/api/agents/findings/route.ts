/**
 * Phase 42.3.3b — GET /api/agents/findings (Maintenance Room read)
 *
 * Tara-only (House auth = single-user). 401 before any DB call. Service role is
 * server-side only. Reads via the SECURITY DEFINER `agent_findings_list` RPC with
 * `p_include_test: false` HARDCODED — the client cannot request test-owned rows.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { FINDINGS_RPC, parseFindingsFilter } from '@/lib/agents/maintenance/contract'

export async function GET(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  const filter = parseFindingsFilter(request.nextUrl.searchParams)
  const { data, error } = await sb.rpc(FINDINGS_RPC, {
    p_domain: filter.domain,
    p_review_state: filter.review_state,
    p_detection_status: filter.detection_status,
    p_include_test: false, // production: never test-owned
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, findings: data ?? [] })
}
