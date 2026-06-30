/**
 * Phase 42.3.3b — GET /api/agents/runs (Maintenance Room run history)
 *
 * Tara-only. 401 before any DB call. Service role server-side only.
 * Reads via `agent_runs_list` with `p_include_test: false` HARDCODED.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { RUNS_RPC } from '@/lib/agents/maintenance/contract'

export async function GET(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  }

  const sb = createClient(url, key)
  const domainParam = request.nextUrl.searchParams.get('domain')
  const domain = domainParam && domainParam.trim().length > 0 ? domainParam.trim() : null
  const { data, error } = await sb.rpc(RUNS_RPC, {
    p_domain: domain,
    p_include_test: false, // production: never test-owned
  })
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, runs: data ?? [] })
}
