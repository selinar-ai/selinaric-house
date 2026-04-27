// Phase 24D — Central helper for queuing governed reflection jobs.
// All event triggers (timeline, concepts, workshop, living state) must use this.
// Never scatter raw reflection_jobs inserts across routes.
//
// Two-step insert design:
//   Step 1 — core insert (presence_id, trigger_type, source_refs, status).
//            Always works regardless of which migrations are applied.
//   Step 2 — metadata enrichment (source_summary, priority).
//            Non-blocking best-effort; silently no-ops if migration 018 is not yet applied.
//
// Duplicate guard: prevents double-queuing for the same presence + trigger + source
// while a job is still pending. Completed jobs do not block re-queuing for recurring
// events (e.g. living_state_transition fires each time state meaningfully shifts).
//
// Returns null on validation failure or DB error — callers treat null as non-blocking.

import { createClient } from '@supabase/supabase-js'
import {
  VALID_TRIGGER_TYPES,
  type ReflectionTriggerType,
  type SourceRef,
  type ReflectionJob,
} from './reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export interface QueueJobParams {
  presenceId: 'ari' | 'eli'
  triggerType: ReflectionTriggerType
  sourceKind: SourceRef['type']
  sourceId: string
  sourceSummary?: string
  priority?: number // 1 = highest, 10 = lowest; default 5
}

/**
 * Queue a reflection job for a governed event.
 *
 * If an identical pending job already exists (same presence + trigger + source),
 * the existing job is returned without creating a duplicate.
 *
 * Callers should fire-and-forget with .catch(() => {}) — this never throws.
 */
export async function queueReflectionJob(
  params: QueueJobParams
): Promise<ReflectionJob | null> {
  const { presenceId, triggerType, sourceKind, sourceId, sourceSummary, priority = 5 } = params

  if (!['ari', 'eli'].includes(presenceId)) return null
  if (!VALID_TRIGGER_TYPES.includes(triggerType)) return null
  if (!sourceId?.trim()) return null

  const supabase = getSupabase()

  // Duplicate guard: block double-queuing while a job is still pending for this source
  const { data: existing } = await supabase
    .from('reflection_jobs')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('trigger_type', triggerType)
    .eq('status', 'pending')
    .contains('source_refs', [{ type: sourceKind, id: sourceId }])
    .maybeSingle()

  if (existing) return existing as ReflectionJob

  const sourceRef: SourceRef = { type: sourceKind, id: sourceId }

  // Step 1: core insert — guaranteed to work on any schema version
  const { data, error } = await supabase
    .from('reflection_jobs')
    .insert({
      presence_id: presenceId,
      trigger_type: triggerType,
      source_refs: [sourceRef],
      status: 'pending',
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[reflection] Failed to queue job:', error?.message)
    return null
  }

  // Step 2: metadata enrichment (migration 018 columns) — fire and forget
  // If source_summary / priority columns don't exist yet, the update silently no-ops.
  if (sourceSummary || priority !== 5) {
    supabase
      .from('reflection_jobs')
      .update({ source_summary: sourceSummary ?? null, priority })
      .eq('id', (data as Record<string, unknown>).id as string)
      .then(() => {})
  }

  return data as ReflectionJob
}
