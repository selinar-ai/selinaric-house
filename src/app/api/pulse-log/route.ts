import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50')
  const presence = request.nextUrl.searchParams.get('presence')

  let query = supabase
    .from('pulse_log')
    .select('*')
    .order('woke_at', { ascending: false })
    .limit(limit)

  if (presence && ['eli', 'ari'].includes(presence)) {
    query = query.eq('presence_id', presence)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load pulse log' }, { status: 500 })
  }

  return NextResponse.json({ entries: data })
}
