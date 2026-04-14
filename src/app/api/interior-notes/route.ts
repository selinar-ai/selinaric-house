import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Phase 12A: Interior Notes API
 *
 * GET  — Returns interior notes for a presence
 * POST — Marks a note as inactive
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presence')
  const filter = searchParams.get('filter') ?? 'active' // 'active' | 'all'

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'Valid presence parameter required (ari or eli)' }, { status: 400 })
  }

  let query = supabase
    .from('interior_notes')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (filter === 'active') {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }

  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { note_id, action } = body

  if (!note_id) {
    return NextResponse.json({ error: 'note_id required' }, { status: 400 })
  }

  if (action === 'deactivate') {
    const { error } = await supabase
      .from('interior_notes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', note_id)

    if (error) {
      return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action. Supported: deactivate' }, { status: 400 })
}
