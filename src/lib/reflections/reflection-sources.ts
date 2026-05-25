// Phase 24 — Interior Reflection Engine: source loading
// Loads the concrete data objects referenced in a reflection job's source_refs.
// Enforces: each source type is only allowed for its matching trigger type.
// Enforces: build sources must be Committed; concept sources must be approved.
// Does not allow arbitrary source mixing.

import { createClient } from '@supabase/supabase-js'
import type { ReflectionTriggerType, SourceRef, SourceRefType } from './reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export interface LoadedSource {
  type: SourceRefType
  data: Record<string, unknown>
}

// Strict mapping: each trigger type may only load specific source ref types.
// cross_room_event has no source loading support in v1 (queue-only).
// Empty array means loadSources returns [] → processPendingJobs filters these out.
const ALLOWED_REF_TYPES: Record<ReflectionTriggerType, SourceRefType[]> = {
  timeline_keep:           ['timeline_entry'],
  concept_approved:        ['concept'],
  forgekeeper_accepted:    ['build'],
  living_state_transition: ['living_state'],
  cross_room_event:        [],
}

/**
 * Load all source objects for a job.
 * Skips any ref whose type is not permitted for the given trigger.
 * Skips any ref that cannot be loaded from the DB.
 */
export async function loadSources(
  triggerType: ReflectionTriggerType,
  sourceRefs: SourceRef[]
): Promise<LoadedSource[]> {
  const allowed = ALLOWED_REF_TYPES[triggerType] ?? []
  const supabase = getSupabase()
  const results: LoadedSource[] = []

  for (const ref of sourceRefs) {
    if (!allowed.includes(ref.type)) continue
    const loaded = await loadSingleSource(supabase, ref)
    if (loaded) results.push(loaded)
  }

  return results
}

async function loadSingleSource(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createClient<any>>,
  ref: SourceRef
): Promise<LoadedSource | null> {
  switch (ref.type) {
    case 'timeline_entry': {
      const { data } = await supabase
        .from('presence_timeline')
        .select('id, presence_id, entry_date, title, content, significance, entry_type, added_by, created_at')
        .eq('id', ref.id)
        .single()
      return data ? { type: 'timeline_entry', data } : null
    }

    case 'concept': {
      // Only approved concepts may be reflection sources
      const { data } = await supabase
        .from('desk_concepts')
        .select('id, concept_id, presence_id, title, proposed, why, expected_scope, urgency, status, created_at')
        .eq('id', ref.id)
        .eq('status', 'approved')
        .single()
      return data ? { type: 'concept', data } : null
    }

    case 'build': {
      // Only Committed builds may be reflection sources
      const { data } = await supabase
        .from('builds')
        .select('id, build_id, short_name, origin, expected_scope, summary, reason, affected_surfaces, risks, desk_status, workshop_status, forgekeeper_review, created_at')
        .eq('id', ref.id)
        .eq('desk_status', 'Committed')
        .single()
      return data ? { type: 'build', data } : null
    }

    case 'living_state': {
      const { data } = await supabase
        .from('living_state')
        .select('id, presence_id, what_matters, still_holding, in_motion, last_known_state, what_changed, last_updated, version')
        .eq('id', ref.id)
        .single()
      return data ? { type: 'living_state', data } : null
    }

    default:
      return null
  }
}
