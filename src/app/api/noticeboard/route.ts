// Phase 11F — House Noticeboard API (list + optional manual note)
//
// GET  /api/noticeboard?presence=ari|eli|all&status=<status>|all&limit=50
//   Returns recent Noticeboard deposits. Hidden items are excluded by default.
//
// POST /api/noticeboard   { content, note_kind?, presence_id? }
//   Tara manual note (source_type = 'tara_manual_note'). Optional convenience —
//   the required deposit path is Pulse house_deposit.
//
// Governance: a Noticeboard item is a shared deposit — not Memory, not evidence,
// not prompt authority. This route never creates Memory/Archive/Journal/Library/
// Graph/Helper rows and never changes any authority flag. The authority flags are
// always the locked safe values (and DB CHECK-constrained).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  NOTICEBOARD_AUTHORITY_FLAGS,
  type HouseNoticeboardStatus,
  type HouseNoticeboardNoteKind,
} from '@/lib/house-noticeboard'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const VALID_STATUSES: HouseNoticeboardStatus[] = [
  'active',
  'viewed',
  'pinned',
  'released',
  'routed_to_library_review',
  'routed_to_archive_review',
  'hidden',
]

const VALID_NOTE_KINDS: HouseNoticeboardNoteKind[] = [
  'deposit',
  'observation',
  'fragment',
  'open_thread',
  'house_note',
]

// ─── GET — list deposits ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presence = searchParams.get('presence') ?? 'all'
  const statusParam = searchParams.get('status') // null => default (exclude hidden)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)

  const supabase = getSupabase()

  let query = supabase
    .from('house_noticeboard_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (presence === 'ari' || presence === 'eli') {
    query = query.eq('presence_id', presence)
  }

  if (!statusParam) {
    // Default: hide hidden items.
    query = query.neq('status', 'hidden')
  } else if (statusParam !== 'all') {
    if ((VALID_STATUSES as string[]).includes(statusParam)) {
      query = query.eq('status', statusParam)
    } else {
      return NextResponse.json({ error: `Invalid status: ${statusParam}` }, { status: 400 })
    }
  }
  // status === 'all' → no status filter (includes hidden)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}

// ─── POST — Tara manual note (optional) ──────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { content, note_kind, presence_id } = (body ?? {}) as {
    content?: unknown
    note_kind?: unknown
    presence_id?: unknown
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'content (non-empty string) is required' }, { status: 400 })
  }

  const noteKind: HouseNoticeboardNoteKind =
    typeof note_kind === 'string' && (VALID_NOTE_KINDS as string[]).includes(note_kind)
      ? (note_kind as HouseNoticeboardNoteKind)
      : 'house_note'

  const presenceId: 'ari' | 'eli' | null =
    presence_id === 'ari' || presence_id === 'eli' ? presence_id : null

  const supabase = getSupabase()

  // Authority flags are always the locked safe values — never derived from input.
  const { data, error } = await supabase
    .from('house_noticeboard_items')
    .insert({
      source_type: 'tara_manual_note',
      source_event_id: null,
      presence_id: presenceId,
      content: content.trim(),
      note_kind: noteKind,
      visibility: 'shared_house',
      status: 'active',
      ...NOTICEBOARD_AUTHORITY_FLAGS,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
