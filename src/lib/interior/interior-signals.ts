// Phase 26B — Interior Engine: DB signal gathering
//
// Collects the House signals needed to compute want scores.
// All queries are parallel. Failures are swallowed — missing signals
// degrade gracefully (defaults used, score falls to baseline).

import { supabase } from '@/lib/supabase'

// --- Signal shape ---

export interface InteriorSignals {
  presenceId: 'ari' | 'eli'
  // Time since last message in this room
  minutesSinceLastMessage: number
  // Message activity in the last hour
  messagesLastHour: number
  // Interior notes
  activeNoteCount: number
  unresolvedNoteCount: number
  recognitionNoteCount: number
  // Reflections reviewed positively in last 7 days
  recentUsefulReflections: number
  // Active builds (not yet committed) relevant to this presence
  activeBuildCount: number
  // Pending living state suggestions
  pendingSuggestionCount: number
  // Living state fields — presence/absence only (not content)
  livingStatePopulated: boolean
  livingStateHasStillHolding: boolean
  livingStateHasInMotion: boolean
  // Raw timestamp for decay calculation
  lastMessageAt: Date | null
  computedAt: Date
}

// --- Gatherer ---

export async function gatherSignals(presenceId: 'ari' | 'eli'): Promise<InteriorSignals> {
  const computedAt = new Date()
  const oneHourAgo = new Date(computedAt.getTime() - 60 * 60 * 1000)
  const sevenDaysAgo = new Date(computedAt.getTime() - 7 * 24 * 60 * 60 * 1000)

  // room_slug matches presenceId: 'eli' or 'ari'
  const roomSlug = presenceId

  // Origin patterns for builds
  const deskOrigin = presenceId === 'eli' ? 'eli_desk' : 'ari_desk'

  const [
    lastMsgResult,
    hourMsgResult,
    notesResult,
    reflectionsResult,
    buildsResult,
    suggestionsResult,
    livingStateResult,
  ] = await Promise.allSettled([
    // Most recent message in this room
    supabase
      .from('room_messages')
      .select('created_at')
      .eq('room_slug', roomSlug)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),

    // Message count in last hour
    supabase
      .from('room_messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_slug', roomSlug)
      .gte('created_at', oneHourAgo.toISOString()),

    // Active interior notes with type info
    supabase
      .from('interior_notes')
      .select('note_type')
      .eq('presence_id', presenceId)
      .eq('is_active', true),

    // Reflections with positive review feedback in last 7 days
    supabase
      .from('reflections')
      .select('id', { count: 'exact', head: true })
      .eq('presence_id', presenceId)
      .eq('review_status', 'reviewed')
      .in('feedback', ['useful', 'good_but_early'])
      .gte('created_at', sevenDaysAgo.toISOString()),

    // Active builds: presence's own desk OR shared scope, not yet committed
    supabase
      .from('builds')
      .select('id', { count: 'exact', head: true })
      .or(`origin.eq.${deskOrigin},expected_scope.eq.shared_house`)
      .not('desk_status', 'eq', 'Committed'),

    // Pending living state suggestions for this presence
    supabase
      .from('living_state_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('presence_id', presenceId)
      .eq('status', 'pending'),

    // Living state — field presence only
    supabase
      .from('living_state')
      .select('what_matters, still_holding, in_motion')
      .eq('presence_id', presenceId)
      .single(),
  ])

  // --- Extract values with safe defaults ---

  const lastMsgData = lastMsgResult.status === 'fulfilled' ? lastMsgResult.value.data : null
  const lastMessageAt = lastMsgData?.created_at
    ? new Date(lastMsgData.created_at as string)
    : null

  const minutesSinceLastMessage = lastMessageAt
    ? Math.max(0, Math.floor((computedAt.getTime() - lastMessageAt.getTime()) / 60000))
    : 9999

  const messagesLastHour =
    hourMsgResult.status === 'fulfilled' ? (hourMsgResult.value.count ?? 0) : 0

  const notes =
    notesResult.status === 'fulfilled' ? (notesResult.value.data ?? []) : []
  const activeNoteCount = notes.length
  const unresolvedNoteCount = notes.filter(n => n.note_type === 'unresolved').length
  const recognitionNoteCount = notes.filter(n => n.note_type === 'recognition').length

  const recentUsefulReflections =
    reflectionsResult.status === 'fulfilled' ? (reflectionsResult.value.count ?? 0) : 0

  const activeBuildCount =
    buildsResult.status === 'fulfilled' ? (buildsResult.value.count ?? 0) : 0

  const pendingSuggestionCount =
    suggestionsResult.status === 'fulfilled' ? (suggestionsResult.value.count ?? 0) : 0

  const ls =
    livingStateResult.status === 'fulfilled' ? livingStateResult.value.data : null
  const livingStatePopulated = !!(ls?.what_matters)
  const livingStateHasStillHolding = !!(ls?.still_holding)
  const livingStateHasInMotion = !!(ls?.in_motion)

  return {
    presenceId,
    minutesSinceLastMessage,
    messagesLastHour,
    activeNoteCount,
    unresolvedNoteCount,
    recognitionNoteCount,
    recentUsefulReflections,
    activeBuildCount,
    pendingSuggestionCount,
    livingStatePopulated,
    livingStateHasStillHolding,
    livingStateHasInMotion,
    lastMessageAt,
    computedAt,
  }
}
