// Phase 24 + 36H.3 — Reflection Jobs API
// GET  ?presenceId=ari|eli&status=pending|processing|completed|failed
//      Returns recent reflection jobs for a presence (default: last 20)
// POST { presenceId, triggerType, sourceRefs }
//      Creates a new reflection job from a valid trigger source
// POST { presenceId, triggerType: 'cross_room_event', impactId }
//      Phase 36H.3 — server-derived cross-room reflection job (queue-only)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createReflectionJob } from '@/lib/reflections/create-reflection-job'
import { createReflectionJobFromImpact } from '@/lib/reflections/reflection-hooks'
import { VALID_TRIGGER_TYPES, type ReflectionTriggerType, type SourceRef } from '@/lib/reflections/reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')
  const status = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'presenceId required (ari|eli)' }, { status: 400 })
  }

  const supabase = getSupabase()

  let query = supabase
    .from('reflection_jobs')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(request: NextRequest) {
  let body: { presenceId?: string; triggerType?: string; sourceRefs?: unknown; impactId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presenceId, triggerType, sourceRefs, impactId } = body

  if (!presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'presenceId required (ari|eli)' }, { status: 400 })
  }
  if (!triggerType || !VALID_TRIGGER_TYPES.includes(triggerType as ReflectionTriggerType)) {
    return NextResponse.json(
      { error: `triggerType must be one of: ${VALID_TRIGGER_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // ─── Phase 36H.3: Cross-room reflection job path ───
  // Client sends only presenceId + impactId. Server derives all provenance.
  if (triggerType === 'cross_room_event') {
    if (!impactId || typeof impactId !== 'string' || impactId.trim().length === 0) {
      return NextResponse.json({ error: 'impactId required for cross_room_event trigger' }, { status: 400 })
    }

    const { result, error } = await createReflectionJobFromImpact(impactId)

    if (error) {
      return NextResponse.json({ error }, { status: 400 })
    }
    if (!result.created) {
      if (result.skippedReason === 'duplicate_pending_job') {
        return NextResponse.json(
          { error: 'Pending reflection job already exists for this impact', skippedReason: result.skippedReason },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: `Job not created: ${result.skippedReason}`, skippedReason: result.skippedReason },
        { status: 400 }
      )
    }

    return NextResponse.json({ job: result.job }, { status: 201 })
  }

  // ─── Standard reflection job path (existing triggers) ───
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    return NextResponse.json({ error: 'sourceRefs must be a non-empty array' }, { status: 400 })
  }

  // Basic shape validation on each ref
  for (const ref of sourceRefs as unknown[]) {
    if (!ref || typeof ref !== 'object') {
      return NextResponse.json({ error: 'Each sourceRef must be an object with type and id' }, { status: 400 })
    }
    const r = ref as Record<string, unknown>
    if (typeof r.type !== 'string' || typeof r.id !== 'string') {
      return NextResponse.json({ error: 'Each sourceRef must have string type and string id' }, { status: 400 })
    }
  }

  try {
    const job = await createReflectionJob({
      presenceId: presenceId as 'ari' | 'eli',
      triggerType: triggerType as ReflectionTriggerType,
      sourceRefs: sourceRefs as SourceRef[],
    })
    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
