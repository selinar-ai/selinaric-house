// Phase 30B — Memory Eligibility Governance API
// POST { mode: 'audit' | 'apply' }
//
// 'audit'  — dry-run: returns canonical entries with eligible_for_recall=false, grouped counts, sample entries
// 'apply'  — sets eligible_for_recall=true on canonical + ineligible entries, logs to archive_eligibility_events
//
// Idempotent: second apply returns updated=0.
// Does not change canonical_status, eligible_for_embedding, eligible_for_graph, or archive contents.

import { NextRequest, NextResponse } from 'next/server'
import {
  getRecallEligibilityAudit,
  applyRecallEligibilityBackfill,
} from '@/lib/archive-memory'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { mode } = body

  if (mode === 'audit') {
    const result = await getRecallEligibilityAudit()
    return NextResponse.json({ success: true, mode: 'audit', ...result })
  }

  if (mode === 'apply') {
    const result = await applyRecallEligibilityBackfill()
    return NextResponse.json({ success: true, mode: 'apply', ...result })
  }

  return NextResponse.json({ error: 'mode must be "audit" or "apply"' }, { status: 400 })
}
