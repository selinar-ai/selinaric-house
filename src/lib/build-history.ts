// Phase 22B — Build history helpers
// Server-side utility — only imported from API route handlers.

import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BuildEventType =
  | 'created'
  | 'draft_generated'
  | 'updated'
  | 'consultation_requested'
  | 'consultation_responded'
  | 'consultation_declined'
  | 'consultation_closed'
  | 'marked_ready'
  | 'sent_for_verification'
  | 'forgekeeper_complete'
  | 'plan_approved'
  | 'approved'
  | 'returned'
  | 'held'
  | 'reopened'
  | 'committed'

export interface BuildHistoryEvent {
  id:                   string
  build_id:             string
  event_type:           BuildEventType
  prev_desk_status:     string | null
  next_desk_status:     string | null
  prev_workshop_status: string | null
  next_workshop_status: string | null
  actor:                string
  note:                 string | null
  created_at:           string
}

export const EVENT_LABELS: Record<BuildEventType, string> = {
  created:                  'Build created',
  draft_generated:          'Build draft generated from concept',
  updated:                  'Fields updated',
  consultation_requested:   'Consultation requested',
  consultation_responded:   'Consultation response received',
  consultation_declined:    'Consultation declined',
  consultation_closed:      'Consultation closed',
  marked_ready:             'Marked ready',
  sent_for_verification:    'Sent for verification',
  forgekeeper_complete:     'Forgekeeper review complete',
  plan_approved:            'Build plan approved for implementation',
  approved:                 'Approved for commit',
  returned:                 'Returned for edits',
  held:                     'Held in Workshop',
  reopened:                 'Reopened in Workshop',
  committed:                'Committed',
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function logBuildEvent(params: {
  buildId:              string
  eventType:            BuildEventType
  prevDeskStatus?:      string | null
  nextDeskStatus?:      string | null
  prevWorkshopStatus?:  string | null
  nextWorkshopStatus?:  string | null
  actor?:               string
  note?:                string
}): Promise<void> {
  const {
    buildId,
    eventType,
    prevDeskStatus      = null,
    nextDeskStatus      = null,
    prevWorkshopStatus  = null,
    nextWorkshopStatus  = null,
    actor               = 'system',
    note,
  } = params

  await supabase.from('build_history').insert({
    build_id:             buildId,
    event_type:           eventType,
    prev_desk_status:     prevDeskStatus,
    next_desk_status:     nextDeskStatus,
    prev_workshop_status: prevWorkshopStatus,
    next_workshop_status: nextWorkshopStatus,
    actor,
    note: note ?? null,
  })
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getBuildHistory(buildId: string): Promise<BuildHistoryEvent[]> {
  const { data, error } = await supabase
    .from('build_history')
    .select('*')
    .eq('build_id', buildId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[build-history] fetch error:', error)
    return []
  }
  return (data ?? []) as BuildHistoryEvent[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a build origin to its owning presence actor string. */
export function originToActor(origin: string): string {
  if (origin === 'ari_desk') return 'ari'
  if (origin === 'eli_desk') return 'eli'
  return 'system'
}
