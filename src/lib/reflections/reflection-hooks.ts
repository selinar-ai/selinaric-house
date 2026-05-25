// Phase 36H.3 — Cross-Room Reflection Job Hooks
//
// Source-surface agnostic pathway for creating governed reflection jobs
// from cross-room events. Queue-only — no processing in v1.
//
// Core Law:
//   Journal is inner writing.
//   Reflection is governed synthesis.
//   A reflection job is only an invitation to synthesize.
//   Nothing mutates automatically.
//
// Authority labels:
//   cross_room_reflection_hook_not_memory  — on source_metadata
//   reflection_job_not_memory              — on the concept
//
// This module does NOT:
// - process reflection jobs
// - create final reflection outputs
// - create journal jobs or journal entries
// - create Memory or Memory candidates
// - create Archive entries
// - update State, Interior, or Pulse
// - create held truths
// - create graph nodes/edges
// - create carrybacks or carryforwards
// - create cross-room events (reads them only)
// - load sources for reflection processing
// - modify reflection prompts or routing
//
// It creates ONLY: pending reflection_jobs rows.

import { createClient } from '@supabase/supabase-js'
import type { ReflectionJob, ReflectionJobSourceMetadata } from './reflection-types'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueueReflectionJobInput {
  presenceId: 'ari' | 'eli'
  reflectionScope: 'ari' | 'eli'

  sourceSurface: string
  sourceEventType: string
  sourceEventId: string
  sourceImpactId?: string
  sourceRoomId?: string
  sourceWingId?: string

  contextSummary: string
  eligibilityReason: string
  authorityLabel: 'cross_room_reflection_hook_not_memory'

  createdBy: 'tara'
}

export interface QueueReflectionJobResult {
  created: boolean
  job?: ReflectionJob
  skippedReason?:
    | 'duplicate_pending_job'
    | 'invalid_presence'
    | 'invalid_scope'
    | 'missing_source_event_id'
    | 'missing_context_summary'
    | 'db_error'
}

// ─── Context Summary Builder ─────────────────────────────────────────────────

const CONTEXT_SUMMARY_MAX_CHARS = 800

/**
 * Build a bounded, presence-specific context summary from a cross-room impact
 * for a reflection job.
 *
 * The summary is descriptive, not interpretive. It does not force a conclusion
 * or impose what the reflection should find.
 */
export function buildReflectionContext(
  impact: {
    impact_summary: string
    continuity_signal?: string | null
    what_remains_open?: string[]
    what_changed?: string[]
  },
  eventSummary: string | null,
  presenceId: string,
): string {
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const parts: string[] = []

  if (eventSummary) {
    parts.push(`From a shared-room exchange: ${eventSummary}`)
  }

  parts.push(`${presenceName}'s extracted impact: ${impact.impact_summary}`)

  if (impact.continuity_signal) {
    parts.push(`Continuity signal: ${impact.continuity_signal}`)
  }

  if (impact.what_changed && impact.what_changed.length > 0) {
    parts.push(`What changed: ${impact.what_changed.slice(0, 3).join('; ')}`)
  }

  if (impact.what_remains_open && impact.what_remains_open.length > 0) {
    parts.push(`What remains open: ${impact.what_remains_open.slice(0, 3).join('; ')}`)
  }

  return parts.join(' — ').slice(0, CONTEXT_SUMMARY_MAX_CHARS)
}

// ─── Queue Function ──────────────────────────────────────────────────────────

/**
 * Queue a reflection job from a governed source event.
 *
 * This is the primary reusable hook for all source surfaces:
 * Lounge cross-room events, future Gaming Wing, Wellbeing Wing, etc.
 *
 * Creates a pending reflection_job with structured source_metadata.
 * Does NOT process the job. Does NOT create a reflection output.
 *
 * Duplicate handling: one pending cross_room_event per presence per
 * source impact (DB index). Second attempt returns { created: false }.
 */
export async function queueReflectionJobFromSource(
  input: QueueReflectionJobInput,
): Promise<QueueReflectionJobResult> {
  // Validate presence
  if (input.presenceId !== 'ari' && input.presenceId !== 'eli') {
    return { created: false, skippedReason: 'invalid_presence' }
  }

  // Validate scope matches presence for v1
  if (input.reflectionScope !== input.presenceId) {
    return { created: false, skippedReason: 'invalid_scope' }
  }

  // Validate source event ID
  if (!input.sourceEventId || input.sourceEventId.trim().length === 0) {
    return { created: false, skippedReason: 'missing_source_event_id' }
  }

  // Validate context summary
  if (!input.contextSummary || input.contextSummary.trim().length === 0) {
    return { created: false, skippedReason: 'missing_context_summary' }
  }

  // Build source metadata (server-derived, not trusted from client)
  const sourceMetadata: ReflectionJobSourceMetadata = {
    source_surface: input.sourceSurface,
    source_event_type: input.sourceEventType,
    source_event_id: input.sourceEventId,
    ...(input.sourceImpactId ? { source_impact_id: input.sourceImpactId } : {}),
    ...(input.sourceRoomId ? { source_room_id: input.sourceRoomId } : {}),
    ...(input.sourceWingId ? { source_wing_id: input.sourceWingId } : {}),
    authority_label: input.authorityLabel,
    eligibility_reason: input.eligibilityReason,
  }

  // Cap context summary
  const cappedSummary = input.contextSummary.trim().slice(0, CONTEXT_SUMMARY_MAX_CHARS)

  // Build source ref for the existing source_refs JSONB column
  const sourceRef = input.sourceImpactId
    ? { type: 'cross_room_impact' as const, id: input.sourceImpactId }
    : { type: 'cross_room_event' as const, id: input.sourceEventId }

  const supabase = getSupabase()

  // Insert the pending reflection job
  const { data, error } = await supabase
    .from('reflection_jobs')
    .insert({
      presence_id: input.presenceId,
      trigger_type: 'cross_room_event',
      source_refs: [sourceRef],
      source_summary: cappedSummary,
      source_metadata: sourceMetadata,
      reflection_scope: input.reflectionScope,
      created_by: input.createdBy,
      priority: 5,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation = duplicate pending job for this presence+impact
    if (error.code === '23505') {
      console.log(
        `[reflection-hooks] Pending reflection job already exists for ` +
        `${input.presenceId}/${input.sourceImpactId ?? input.sourceEventId}`
      )
      return { created: false, skippedReason: 'duplicate_pending_job' }
    }
    console.error('[reflection-hooks] Insert error:', error)
    return { created: false, skippedReason: 'db_error' }
  }

  console.log(
    `[reflection-hooks] Created cross-room reflection job for ${input.presenceId}: ` +
    `job ${data.id}, source ${input.sourceSurface}/${input.sourceEventType}`
  )

  return { created: true, job: data as ReflectionJob }
}

// ─── Server-Side Impact-to-Reflection Pipeline ──────────────────────────────

/**
 * Create a reflection job from a cross-room event impact.
 *
 * Server-side only. Fetches impact + parent event from DB, derives all
 * provenance fields. The frontend sends only the impactId — no source
 * metadata is trusted from the client.
 *
 * Returns the queue result, or an error string if the impact/event
 * cannot be resolved.
 */
export async function createReflectionJobFromImpact(
  impactId: string,
): Promise<{ result: QueueReflectionJobResult; error?: string }> {
  const supabase = getSupabase()

  // 1. Fetch impact (server-side — not trusted from client)
  const { data: impact, error: impactErr } = await supabase
    .from('cross_room_event_impacts')
    .select('id, cross_room_event_id, presence_id, impact_summary, continuity_signal, what_changed, what_remains_open, impact_status, authority_label')
    .eq('id', impactId)
    .single()

  if (impactErr || !impact) {
    return {
      result: { created: false },
      error: 'Impact not found',
    }
  }

  // Validate presence
  if (impact.presence_id !== 'ari' && impact.presence_id !== 'eli') {
    return {
      result: { created: false, skippedReason: 'invalid_presence' },
      error: `Invalid presence_id on impact: ${impact.presence_id}`,
    }
  }

  // 2. Fetch parent event (server-side — derive room/surface provenance)
  const { data: event, error: eventErr } = await supabase
    .from('cross_room_events')
    .select('id, room_id, room_type, summary, event_type')
    .eq('id', impact.cross_room_event_id)
    .single()

  if (eventErr || !event) {
    return {
      result: { created: false },
      error: 'Parent event not found',
    }
  }

  // 3. Build server-derived context summary
  const contextSummary = buildReflectionContext(
    {
      impact_summary: impact.impact_summary,
      continuity_signal: impact.continuity_signal,
      what_changed: Array.isArray(impact.what_changed) ? impact.what_changed : [],
      what_remains_open: Array.isArray(impact.what_remains_open) ? impact.what_remains_open : [],
    },
    event.summary,
    impact.presence_id,
  )

  // 4. Derive source surface from room_type
  const sourceSurface = event.room_type === 'lounge' ? 'lounge'
    : event.room_type === 'ari-room' ? 'ari_room'
    : event.room_type === 'eli-room' ? 'eli_room'
    : event.room_type === 'workshop' ? 'workshop'
    : event.room_type // pass through for future types

  // 5. Queue the reflection job with server-derived metadata
  const result = await queueReflectionJobFromSource({
    presenceId: impact.presence_id as 'ari' | 'eli',
    reflectionScope: impact.presence_id as 'ari' | 'eli',
    sourceSurface,
    sourceEventType: event.event_type ?? 'cross_room_event',
    sourceEventId: event.id,
    sourceImpactId: impact.id,
    sourceRoomId: event.room_id,
    contextSummary,
    eligibilityReason: 'tara_requested',
    authorityLabel: 'cross_room_reflection_hook_not_memory',
    createdBy: 'tara',
  })

  return { result }
}
