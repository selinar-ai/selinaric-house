// Phase 18A + 36H.2 — Journal Jobs API
//
// GET  ?presenceId=ari|eli&status=pending   — list jobs for a presence
// POST { presenceId, reason: 'manual_invite', contextSummary? }
//        — Tara creates a manual journal invitation
// POST { presenceId, reason: 'cross_room_invite', impactId }
//        — Tara creates a cross-room journal invitation from an impact
//        — All provenance is server-derived from impactId; client sends minimum
// PATCH { id, status: 'dismissed' }
//        — dismiss a pending job

import { NextRequest, NextResponse } from 'next/server'
import {
  getJournalJobs,
  createJournalJob,
  updateJournalJobStatus,
  getMelbourneDate,
} from '@/lib/journal'
import { createJournalInvitationFromImpact } from '@/lib/journal-invitation-hooks'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

// --- GET ---

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')
  const status = searchParams.get('status') ?? undefined

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'Invalid presenceId' }, { status: 400 })
  }

  try {
    const jobs = await getJournalJobs(presenceId, status)
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[api/journal-jobs] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch journal jobs' }, { status: 500 })
  }
}

// --- POST: Manual invite or cross-room invite ---

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { presenceId, reason, contextSummary, impactId } = body

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'Invalid presenceId' }, { status: 400 })
  }

  // ─── Cross-room invite path (36H.2) ───
  // Client sends only impactId; server derives all provenance
  if (reason === 'cross_room_invite') {
    if (!impactId || typeof impactId !== 'string') {
      return NextResponse.json({ error: 'impactId is required for cross_room_invite' }, { status: 400 })
    }

    try {
      const { result, error } = await createJournalInvitationFromImpact(impactId)

      if (error) {
        return NextResponse.json({ error }, { status: 400 })
      }

      if (!result.created) {
        if (result.skippedReason === 'duplicate_pending_job') {
          return NextResponse.json(
            { error: 'Cross-room journal invitation already pending for today.', alreadyPending: true },
            { status: 409 }
          )
        }
        return NextResponse.json(
          { error: result.skippedReason ?? 'Failed to create invitation' },
          { status: 400 }
        )
      }

      return NextResponse.json({ job: result.job })
    } catch (err) {
      console.error('[api/journal-jobs] POST cross_room_invite error:', err)
      return NextResponse.json({ error: 'Failed to create cross-room journal invitation' }, { status: 500 })
    }
  }

  // ─── Manual invite path (existing 18A) ───
  if (reason && reason !== 'manual_invite') {
    return NextResponse.json({ error: 'POST only supports manual_invite or cross_room_invite reason' }, { status: 400 })
  }

  const finalContext = contextSummary?.trim() ||
    'Tara has invited you to write a journal entry.'

  try {
    const job = await createJournalJob(presenceId, 'manual_invite', finalContext, 'tara')

    if (!job) {
      // Unique constraint = already pending for this presence/date/reason
      return NextResponse.json(
        { error: 'Journal invitation already pending for today', alreadyPending: true },
        { status: 409 }
      )
    }

    return NextResponse.json({ job })
  } catch (err) {
    console.error('[api/journal-jobs] POST error:', err)
    return NextResponse.json({ error: 'Failed to create journal invitation' }, { status: 500 })
  }
}

// --- PATCH: Dismiss ---

export async function PATCH(request: NextRequest) {
  const body = await request.json()
  const { id, status } = body

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  if (status !== 'dismissed') {
    return NextResponse.json({ error: 'Only status: dismissed is allowed via this endpoint' }, { status: 400 })
  }

  // Verify job exists and is pending
  const supabase = getSupabase()
  const { data: job, error: fetchErr } = await supabase
    .from('journal_jobs')
    .select('id, status, presence_id')
    .eq('id', id)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.status !== 'pending') {
    return NextResponse.json({ error: `Job is already ${job.status}` }, { status: 409 })
  }

  try {
    const ok = await updateJournalJobStatus(id, 'dismissed')
    if (!ok) {
      return NextResponse.json({ error: 'Failed to dismiss job' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/journal-jobs] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to dismiss job' }, { status: 500 })
  }
}
