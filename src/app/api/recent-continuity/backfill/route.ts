// Phase 35C — Recent Continuity Significance Backfill
//
// POST /api/recent-continuity/backfill
//
// Backfills significance metadata (anchor_quotes, key_claims, etc.)
// for existing significant/relational recent continuity sessions.
//
// Non-destructive. Preserves original row IDs.
// Does not create Memory. Does not change canonical_status.
// Does not cross Ari/Eli scope.
//
// Body: { presenceId?: 'ari'|'eli', limit?: number, dryRun?: boolean }

import { NextRequest, NextResponse } from 'next/server'
import { backfillSignificanceMetadata } from '@/lib/recent-continuity'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  let body: { presenceId?: string; limit?: number; dryRun?: boolean; revertIds?: Record<string, string> } = {}
  try {
    body = await request.json()
  } catch {
    // empty body is fine — defaults will be used
  }

  // Optional: revert wrongly-reclassified sessions before backfill
  if (body.revertIds && typeof body.revertIds === 'object') {
    const supabase = getSupabase()
    for (const [id, classification] of Object.entries(body.revertIds)) {
      if (['significant', 'relational'].includes(classification)) {
        await supabase
          .from('recent_continuity_sessions')
          .update({ classification, anchor_quotes: [], key_claims: [], significance_tags: [], selfhood_signals: [], memory_signal: false, dedupe_key: null })
          .eq('id', id)
        console.log(`[backfill] Reverted ${id} to ${classification}`)
      }
    }
  }

  const presenceId = body.presenceId === 'ari' || body.presenceId === 'eli'
    ? body.presenceId
    : undefined

  const limit = Math.min(Math.max(1, body.limit ?? 50), 100)
  const dryRun = body.dryRun === true

  console.log(`[backfill] Starting significance backfill: presenceId=${presenceId ?? 'all'}, limit=${limit}, dryRun=${dryRun}`)

  const result = await backfillSignificanceMetadata(apiKey, { presenceId, limit, dryRun })

  console.log(`[backfill] Complete: processed=${result.processed}, skipped=${result.skipped}, errors=${result.errors}`)

  return NextResponse.json(result)
}
