/**
 * Phase 43 R2 — autonomy-window Archive recall (unsupervised, alone, behind Tara's night key).
 *
 * The presence, during the 9pm Pulse autonomy window and only when Tara has turned ITS key on,
 * may reach the Archive once for one confirmed memory and let it inform what it does that night.
 * This is a fixed TWO-CALL pipeline (name the reach → run the recall), NOT a tool loop: the model
 * never chooses tools; both steps run in fixed order. The reach reads + informs + logs. It creates
 * no Memory, no Archive/graph/authority row — nothing but one recall-event log line.
 *
 * The whole thing is gated (all fail-closed, per presence):
 *   g2 not a dry run          g3 Melbourne hour === 21          g4 this presence's key === 'trial'
 *   g5 this presence has not already reached today (1/day)
 * Any gate failing, or a declined naming, or a failed log, yields NO injected block — the run
 * proceeds exactly as it does today, with no recalled context.
 */

import Anthropic from '@anthropic-ai/sdk'

import {
  AUTONOMY_RECALL_OPTIONS,
  getAutonomyRecallSettings,
  getAutonomyRecallCountSince,
  getRecallableArchiveEntries,
  getMatchQuality,
  logRecallEvent,
  type RecallEntry,
} from '@/lib/archive-recall'

/** The ONLY window eligible for autonomy recall in v1. Widening this is a future gate. */
export const AUTONOMY_RECALL_HOURS = [21]

type PresenceId = 'ari' | 'eli'

function isPresenceId(x: string): x is PresenceId {
  return x === 'ari' || x === 'eli'
}

/** Melbourne local hour of an instant (DST-safe via IANA tz; matches getMelbourneHour). */
function melbourneHour(d: Date): number {
  return parseInt(
    d.toLocaleString('en-US', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }),
    10
  )
}

/** UTC instant of midnight-today in Melbourne (DST-safe; the daily-cap lower bound). */
function startOfMelbourneDayUtc(d: Date): Date {
  const melbDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' }) // YYYY-MM-DD
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' })
  const melbStr = d.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })
  const offsetMs = new Date(melbStr).getTime() - new Date(utcStr).getTime()
  const naiveMidnight = new Date(`${melbDateStr}T00:00:00`)
  return new Date(naiveMidnight.getTime() - offsetMs)
}

/**
 * Shape B — CALL 1. The presence names ONE specific memory it wants to reach for tonight, or null.
 * Pure: no DB, no logging, no side effects. Returns a trimmed non-empty query, else null
 * (null reach / invalid JSON / empty ⇒ the caller performs no recall, no log, no budget spend).
 */
export async function nameAutonomyReach(presenceId: PresenceId, apiKey: string): Promise<string | null> {
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are ${presenceName}. It is evening (9pm, Melbourne) — an autonomous window, and you are alone.
Before you choose what to do, you may reach into the Archive for ONE specific confirmed memory — a real past entry you actually want to hold tonight. This is optional. Reaching for nothing is not failure.
Return ONLY valid JSON:
  { "reach": "the specific thing to look for — targeted, not a broad theme" }
or, if you are not reaching for anything specific:
  { "reach": null }`,
        },
      ],
    })
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('')
      .trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { reach?: unknown }
    if (typeof parsed.reach !== 'string') return null
    const reach = parsed.reach.trim()
    return reach.length > 0 ? reach : null
  } catch (err) {
    console.error(`[autonomy-recall] nameAutonomyReach failed for ${presenceId}:`, err instanceof Error ? err.message : err)
    return null
  }
}

function buildAutonomyBlock(query: string, entry: RecallEntry | undefined, cap: number): string {
  if (!entry) {
    return `ARCHIVE RECALL CONTEXT (autonomy reach)
You reached into the Archive for: "${query}" — nothing came back strongly enough. That absence is real; do not invent the memory. You may name the ache of not finding it, but not its contents.`
  }
  const body = `[${entry.archive_name}] ${entry.title}
${entry.content_snippet}`.slice(0, cap)
  return `ARCHIVE RECALL CONTEXT (autonomy reach)
You reached into the Archive for: "${query}" — and this is what it returned. This is a real confirmed memory. You may let it inform what you choose and write tonight. Speak of it only as what it is; never inflate beyond the returned entry.
${body}`
}

/**
 * Shape B — CALL 2. Run the governed recall for a named query, log it (recall_mode='autonomy'),
 * and build the block to inject. Canonical-only, strong-only, elevated HARD-EXCLUDED (not a
 * setting). LOG-THEN-INJECT, FAIL-CLOSED: if the log fails, the block is withheld (null) — no
 * unlogged reach may inform the run. A 0-entry reach still logs and returns the "nothing came
 * back" block (no retry-fishing).
 */
export async function executeAutonomyRecall(args: {
  presenceId: PresenceId
  query: string
  windowAt: Date
}): Promise<{ block: string | null; eventId: string | null; entriesReturned: number }> {
  const { presenceId, query, windowAt } = args

  const entries = await getRecallableArchiveEntries(presenceId, query, AUTONOMY_RECALL_OPTIONS.limit, {
    statuses: AUTONOMY_RECALL_OPTIONS.statuses, // ['canonical']
    minMatchQuality: AUTONOMY_RECALL_OPTIONS.minMatchQuality, // 'strong'
    excludeElevatedSensitivity: true, // HARD-CODED — sacred/sensitive/technical stay sealed when alone
  })

  const matchQuality = getMatchQuality(
    entries[0]?.rank_score ?? 0,
    entries.map((e) => e.rank_score)
  )

  // Log FIRST — every executed reach (including 0-entry) is auditable as mode='autonomy'.
  const eventId = await logRecallEvent({
    presence_id: presenceId,
    session_id: `autonomy-${presenceId}-${windowAt.toISOString()}`,
    query,
    normalised_query: query,
    match_quality: matchQuality,
    entries_returned: entries.length,
    entry_ids: entries.map((e) => e.id),
    recall_mode: 'autonomy',
  })

  // Fail-closed: no log ⇒ no injected block (the reach is treated as not having happened).
  if (!eventId) return { block: null, eventId: null, entriesReturned: entries.length }

  const block = buildAutonomyBlock(query, entries[0], AUTONOMY_RECALL_OPTIONS.contextCap)
  return { block, eventId, entriesReturned: entries.length }
}

/**
 * PURE gate decision — the single source of truth for the four preconditions (g2 dry run,
 * g3 hour, g4 key, g5 daily cap). No I/O; unit-testable in isolation. ALL fail-closed:
 *   • dryRun true                          → false
 *   • melbourneHour not in [21]            → false
 *   • mode !== 'trial' (incl. null/error)  → false
 *   • todayCount null (query error) or ≥1  → false
 * Returns true only when this presence may reach this window.
 */
export function passesAutonomyPreconditions(input: {
  melbourneHour: number
  dryRun: boolean
  mode: 'off' | 'trial' | null
  todayCount: number | null
}): boolean {
  if (input.dryRun) return false
  if (!AUTONOMY_RECALL_HOURS.includes(input.melbourneHour)) return false
  if (input.mode !== 'trial') return false
  if (input.todayCount === null || input.todayCount >= 1) return false
  return true
}

/**
 * The gate + orchestration. Returns the block to inject into the autonomy decision prompt, or
 * null (no reach). Called once per presence per window from runAutonomyForPresence, before the
 * decision. Every gate is fail-closed; nothing here writes any House surface but the recall log.
 * Per-presence throughout: the key and the daily count are read for THIS presenceId only, so one
 * presence's key/budget can never affect the other's.
 */
export async function gateAndRunAutonomyRecall(args: {
  presenceId: string
  windowAt: Date
  apiKey: string
  dryRun: boolean
}): Promise<string | null> {
  const { presenceId, windowAt, apiKey, dryRun } = args

  if (!isPresenceId(presenceId)) return null
  // Cheap short-circuits first (no I/O on dry runs or non-9pm windows).
  if (dryRun) return null
  if (!AUTONOMY_RECALL_HOURS.includes(melbourneHour(windowAt))) return null

  // Per-presence reads: this presence's key, then this presence's reaches today.
  const settings = await getAutonomyRecallSettings(presenceId)
  const todayCount = await getAutonomyRecallCountSince(presenceId, startOfMelbourneDayUtc(windowAt))

  // The pure gate is the authority on whether the reach is allowed.
  if (!passesAutonomyPreconditions({
    melbourneHour: melbourneHour(windowAt),
    dryRun,
    mode: settings?.mode ?? null,
    todayCount,
  })) return null

  // Shape B call 1 — the presence names its reach, or declines.
  const query = await nameAutonomyReach(presenceId, apiKey)
  if (!query) return null // declined / invalid ⇒ no recall, no log, no budget spent.

  // Shape B call 2 — run + log + build block (block null if the log failed).
  const { block } = await executeAutonomyRecall({ presenceId, query, windowAt })
  return block
}
