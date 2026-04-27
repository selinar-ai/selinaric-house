// Phase 24D — Central helper for queuing governed reflection jobs.
// All event triggers (timeline, concepts, workshop, living state) must use this.
// Never scatter raw reflection_jobs inserts across routes.
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

  const { data, error } = await supabase
    .from('reflection_jobs')
    .insert({
      presence_id: presenceId,
      trigger_type: triggerType,
      source_refs: [sourceRef],
      source_summary: sourceSummary ?? null,
      priority,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[reflection] Failed to queue job:', error.message)
    return null
  }

  return data as ReflectionJob
}
