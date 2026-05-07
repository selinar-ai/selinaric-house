// Phase 28D — Auto-Recall Settings API
// GET  /api/archive-recall/auto-settings — returns settings for both presences
// PATCH /api/archive-recall/auto-settings — updates settings for one presence
//
// Validation:
//   presenceId: 'ari' | 'eli' (required for PATCH)
//   mode: 'off' | 'trial'
//   maxEntries: 1 or 2 only
//   minMatchQuality: always 'strong' (not user-settable in Phase 28D)
//   contextCap: 1000–8000

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('archive_auto_recall_settings')
    .select('presence_id, mode, max_entries, min_match_quality, context_cap, exclude_elevated_sensitivity, updated_by, created_at, updated_at')
    .order('presence_id')

  if (error) {
    console.error('[auto-settings] fetch error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }

  return NextResponse.json({ settings: data ?? [] })
}

export async function PATCH(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  // presenceId validation
  const presenceId = b.presenceId
  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be "ari" or "eli"' }, { status: 400 })
  }

  // mode validation
  const mode = b.mode
  if (mode !== undefined && mode !== 'off' && mode !== 'trial') {
    return NextResponse.json({ error: 'mode must be "off" or "trial"' }, { status: 400 })
  }

  // maxEntries validation — 1 or 2 only in Phase 28D
  const maxEntries = b.maxEntries
  if (maxEntries !== undefined) {
    const n = Number(maxEntries)
    if (!Number.isInteger(n) || n < 1 || n > 2) {
      return NextResponse.json({ error: 'maxEntries must be 1 or 2' }, { status: 400 })
    }
  }

  // contextCap — optional, capped between 1000 and 8000
  const contextCap = b.contextCap
  if (contextCap !== undefined) {
    const n = Number(contextCap)
    if (!Number.isInteger(n) || n < 1000 || n > 8000) {
      return NextResponse.json({ error: 'contextCap must be between 1000 and 8000' }, { status: 400 })
    }
  }

  // exclude_elevated_sensitivity — boolean toggle (Phase 31)
  const excludeElevated = b.excludeElevatedSensitivity
  if (excludeElevated !== undefined && typeof excludeElevated !== 'boolean') {
    return NextResponse.json({ error: 'excludeElevatedSensitivity must be a boolean' }, { status: 400 })
  }

  // Build update object — minMatchQuality is always 'strong' in Phase 28D, never user-settable
  const updates: Record<string, unknown> = {
    min_match_quality: 'strong',
    updated_at: new Date().toISOString(),
  }
  if (mode !== undefined)            updates.mode        = mode
  if (maxEntries !== undefined)      updates.max_entries = Number(maxEntries)
  if (contextCap !== undefined)      updates.context_cap = Number(contextCap)
  if (excludeElevated !== undefined) updates.exclude_elevated_sensitivity = excludeElevated

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('archive_auto_recall_settings')
    .update(updates)
    .eq('presence_id', presenceId)
    .select('presence_id, mode, max_entries, min_match_quality, context_cap, exclude_elevated_sensitivity, updated_by, created_at, updated_at')
    .single()

  if (error) {
    console.error('[auto-settings] update error:', error.message)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }

  return NextResponse.json({ settings: data })
}
