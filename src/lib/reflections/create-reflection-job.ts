// Phase 24 — Interior Reflection Engine: job creation
// The only entry point for creating reflection jobs.
// Validates trigger type and source refs before inserting.

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

export interface CreateJobParams {
  presenceId: 'ari' | 'eli'
  triggerType: ReflectionTriggerType
  sourceRefs: SourceRef[]
}

/**
 * Create a reflection job for a presence.
 * Only valid trigger types are accepted.
 * At least one source ref is required.
 * Returns the created job row.
 */
export async function createReflectionJob(params: CreateJobParams): Promise<ReflectionJob> {
  const { presenceId, triggerType, sourceRefs } = params

  if (!['ari', 'eli'].includes(presenceId)) {
    throw new Error(`Invalid presenceId: ${presenceId}`)
  }
  if (!VALID_TRIGGER_TYPES.includes(triggerType)) {
    throw new Error(
      `Invalid triggerType: "${triggerType}". Must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`
    )
  }
  if (!Array.isArray(sourceRefs) || sourceRefs.length === 0) {
    throw new Error('At least one source_ref is required')
  }
  for (const ref of sourceRefs) {
    if (!ref.type || !ref.id) {
      throw new Error('Each source_ref must have a type and id')
    }
  }

  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('reflection_jobs')
    .insert({
      presence_id: presenceId,
      trigger_type: triggerType,
      source_refs: sourceRefs,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create reflection job: ${error.message}`)

  return data as ReflectionJob
}
