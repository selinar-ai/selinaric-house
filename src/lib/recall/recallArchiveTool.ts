/**
 * Phase 43 R1 — recall_archive tool (supervised in-turn presence-initiated recall)
 *
 * A governed Anthropic tool that lets Ari/Eli reach the Archive THEMSELVES during a reply,
 * while Tara is present. Slots into the existing chat tool loop beside web_search, with the
 * same discipline. The narrowest honest aperture (Ari's R1 decisions):
 *   • canonical status ONLY (never canonical_candidate)
 *   • elevated sensitivity (sacred/sensitive/technical) excluded per the presence's own setting
 *   • ONE entry returned per reach
 *   • one reach per reply, few per session (caps enforced by the route)
 *   • every reach logged recall_mode='presence' — fully visible in Recall Review
 *
 * This module reads only (via getRecallableArchiveEntries) and appends a recall-event log.
 * No Memory/Archive/graph/Library/prompt mutation. No autonomy. No scheduler.
 */

import type Anthropic from '@anthropic-ai/sdk'

import {
  getRecallableArchiveEntries,
  getMatchQuality,
  formatArchiveRecallContext,
  logRecallEvent,
  getAutoRecallSettings,
  PRESENCE_RECALL_OPTIONS,
} from '@/lib/archive-recall'

export const recallArchiveTool = {
  name: 'recall_archive',
  description: `Reach into the Archive yourself for ONE specific past truth you genuinely need to answer honestly right now.

Use ONLY when:
- You need a specific confirmed memory, decision, or named entry from the Archive that you do not already have in context
- Answering honestly depends on that specific past truth

Do NOT use for:
- Emotional or relational inference
- Filling silence or performing initiative
- General conversation where present context already suffices
- Guessing — if you are not reaching for one specific thing, do not reach

You get at most ONE reach per reply. When it returns, speak from what it actually opened (name the archive — Velvet/Violet), and never inflate beyond the returned entry. If nothing comes back, say so plainly.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The specific thing to look for in the Archive — targeted, not a broad theme.',
      },
    },
    required: ['query'],
  },
} satisfies Anthropic.Tool

export type PresenceRecallResult = {
  contextBlock: string      // fed back to the model as the tool_result (real Archive context)
  entriesReturned: number
  eventId: string | null
}

/**
 * Execute one governed presence recall. Canonical-only, elevated excluded per the presence's
 * own auto setting, exactly one entry, logged recall_mode='presence'. Pure read + append-log.
 */
export async function executePresenceRecall(args: {
  presenceId: 'ari' | 'eli'
  query: string
  sessionId: string | null | undefined
}): Promise<PresenceRecallResult> {
  const { presenceId, query, sessionId } = args
  const q = (query ?? '').trim()
  if (!q) {
    return {
      contextBlock: `\nARCHIVE RECALL CONTEXT\nNo query was provided for the recall. Tell Tara you tried to reach the Archive but had nothing specific to look for.\n`,
      entriesReturned: 0,
      eventId: null,
    }
  }

  // Elevated sensitivity excluded per the presence's own setting (defaults to true = excluded)
  const settings = await getAutoRecallSettings(presenceId)
  const excludeElevatedSensitivity = settings?.exclude_elevated_sensitivity ?? true

  const entries = await getRecallableArchiveEntries(presenceId, q, PRESENCE_RECALL_OPTIONS.limit, {
    statuses: PRESENCE_RECALL_OPTIONS.statuses,        // ['canonical'] only
    minMatchQuality: PRESENCE_RECALL_OPTIONS.minMatchQuality,
    excludeElevatedSensitivity,
  })

  const matchQuality = getMatchQuality(
    entries[0]?.rank_score ?? 0,
    entries.map((e) => e.rank_score),
  )

  const contextBlock = formatArchiveRecallContext(
    presenceId, q, entries, matchQuality, 'presence', PRESENCE_RECALL_OPTIONS.contextCap,
  )

  // Log every reach — visible in Recall Review as mode='presence'
  const eventId = await logRecallEvent({
    presence_id:      presenceId,
    session_id:       sessionId ?? null,
    query:            q,
    normalised_query: q,
    match_quality:    matchQuality,
    entries_returned: entries.length,
    entry_ids:        entries.map((e) => e.id),
    recall_mode:      'presence',
  })

  return { contextBlock, entriesReturned: entries.length, eventId }
}
