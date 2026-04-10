import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const presenceId = request.nextUrl.searchParams.get('presence')
  const order = request.nextUrl.searchParams.get('order') ?? 'asc'

  if (!presenceId || !['eli', 'ari'].includes(presenceId)) {
    return NextResponse.json({ error: 'Valid presence required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('presence_timeline')
    .select('*')
    .eq('presence_id', presenceId)
    .order('entry_date', { ascending: order === 'asc' })

  if (error) {
    return NextResponse.json({ error: 'Failed to load timeline' }, { status: 500 })
  }

  return NextResponse.json({ entries: data })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { presence_id, entry_date, title, content, significance, entry_type } = body

    if (!presence_id || !entry_date || !title || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!['eli', 'ari'].includes(presence_id)) {
      return NextResponse.json({ error: 'Valid presence required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('presence_timeline')
      .insert({
        presence_id,
        entry_date,
        title,
        content,
        significance: significance ?? 'standard',
        entry_type: entry_type ?? 'relational',
        added_by: 'tara'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 })
    }

    return NextResponse.json({ entry: data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'Entry ID required' }, { status: 400 })
    }

    // Only allow safe fields to be updated
    const allowed = ['entry_date', 'title', 'content', 'significance', 'entry_type']
    const patch: Record<string, string> = {}
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        patch[key] = updates[key]
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('presence_timeline')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
    }

    return NextResponse.json({ entry: data })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
