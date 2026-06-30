/**
 * Phase 42.3.4a — GET /api/agents/remedy-plans (read-only proposed remedy plans)
 *
 * Tara-only. 401 before any DB call. Service role server-side only. Reads via the
 * SECURITY DEFINER `agent_remedy_plans_list` RPC with `p_include_test: false` HARDCODED.
 * Read-only: there is NO record/approve/apply route — a remedy plan is shown, never acted on.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { REMEDY_PLANS_LIST_RPC } from '@/lib/agents/maintenance/contract'

export async function GET(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  const findingParam = request.nextUrl.searchParams.get('finding_id')
  const findingId = findingParam && findingParam.trim().length > 0 ? findingParam.trim() : null
  const { data, error } = await sb.rpc(REMEDY_PLANS_LIST_RPC, {
    p_finding_id: findingId,
    p_include_test: false, // production: never test-owned
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, remedy_plans: data ?? [] })
}
