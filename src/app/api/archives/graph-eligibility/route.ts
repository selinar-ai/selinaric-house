/**
 * Gate A1 — GET /api/archives/graph-eligibility (read-only listing for Tara's bulk surface)
 *
 * Lists CANONICAL archive items with their graph-eligibility state, filterable by
 * archive, date range, sensitivity, import_label, and eligibility state. Tara-only;
 * 401 before any DB access. Read-only — the ONLY mutation path is the sibling bulk
 * route. Display surfaces elsewhere remain unfiltered; this listing is canonical-only
 * because only canonical items can ever be marked (27D rule).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { requireHouseApiAuth } from '@/lib/server/houseAuth'

const LIST_CAP = 500

export async function GET(request: NextRequest) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ ok: false, code: 'CONFIG_MISSING' }, { status: 503 })
  const sb = createClient(url, key)

  const p = request.nextUrl.searchParams
  const norm = (v: string | null) => (v && v.trim().length > 0 ? v.trim() : null)
  const archive = norm(p.get('archive'))
  const from = norm(p.get('from'))
  const to = norm(p.get('to'))
  const sensitivity = norm(p.get('sensitivity'))
  const importLabel = norm(p.get('import_label'))
  const eligibility = norm(p.get('eligibility')) // marked | unmarked | all

  let q = sb
    .from('archive_items')
    .select('id, title, archive_name, sensitivity, import_label, created_at, eligible_for_graph')
    .eq('canonical_status', 'canonical')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(LIST_CAP)

  if (archive) q = q.eq('archive_name', archive)
  if (from) q = q.gte('created_at', from)
  if (to) q = q.lte('created_at', to)
  if (sensitivity) q = q.eq('sensitivity', sensitivity)
  if (importLabel) q = q.ilike('import_label', `%${importLabel}%`)
  if (eligibility === 'marked') q = q.eq('eligible_for_graph', true)
  if (eligibility === 'unmarked') q = q.or('eligible_for_graph.is.null,eligible_for_graph.eq.false')

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [], cap: LIST_CAP, capped: (data ?? []).length === LIST_CAP })
}
