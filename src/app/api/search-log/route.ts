import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const presence = searchParams.get('presence') // 'ari' | 'eli' | null (all)
  const window = searchParams.get('window') // 'today' | 'session' | 'all'
  const sessionId = searchParams.get('session_id')
  const keyword = searchParams.get('q')
  const source = searchParams.get('source') // 'web' | 'library' | null (all)
  const limitParam = searchParams.get('limit')
  const limit = limitParam ? parseInt(limitParam, 10) : 100

  let query = supabase
    .from('search_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (presence && (presence === 'ari' || presence === 'eli')) {
    query = query.eq('presence_id', presence)
  }

  if (source && (source === 'web' || source === 'library')) {
    query = query.eq('source_type', source)
  }

  if (window === 'today') {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    query = query.gte('created_at', startOfDay.toISOString())
  } else if (window === 'session' && sessionId) {
    query = query.eq('session_id', sessionId)
  }

  if (keyword) {
    query = query.or(
      `query.ilike.%${keyword}%,reason.ilike.%${keyword}%,result_summary.ilike.%${keyword}%`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('search-log GET error:', error)
    return NextResponse.json({ error: 'Failed to load search log' }, { status: 500 })
  }

  return NextResponse.json(data)
}
