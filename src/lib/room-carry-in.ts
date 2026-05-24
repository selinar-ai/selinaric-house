// Phase 36F.6 — Explicit Room Carry-In for Lounge
//
// Same-presence recent room contact, injected into the Lounge prompt
// ONLY when Tara explicitly asks.
//
// Ari-in-Lounge may receive bounded recent Ari-room contact.
// Eli-in-Lounge may receive bounded recent Eli-room contact.
//
// Authority label: room_to_lounge_contact_not_memory
//
// Cross-presence carry-in is FORBIDDEN:
// - Ari must NEVER receive Eli-room contact
// - Eli must NEVER receive Ari-room contact
//
// This module does NOT:
// - update living_state or interior_notes
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Library authority
// - create cross_room_events
// - create carryforward or carryback records
// - write to any table
//
// This module is READ-ONLY. It queries recent_continuity_sessions
// via the existing selectRecentContinuityForPrompt() infrastructure.

import {
  selectRecentContinuityForPrompt,
  type RecentContinuitySession,
} from '@/lib/recent-continuity'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max sessions to include in carry-in block */
const CARRY_IN_MAX_ITEMS = 2

/** Max total characters for carry-in block content */
const CARRY_IN_MAX_CHARS = 1200

/** Only sessions within this window are eligible */
const CARRY_IN_FRESHNESS_DAYS = 2

/** Authority label for all carry-in context */
export const ROOM_CARRY_IN_AUTHORITY = 'room_to_lounge_contact_not_memory' as const

// ─── Trigger Detection ─────────────────────────────────────────────────────

/**
 * Trigger phrases that indicate Tara wants room context carried into the Lounge.
 *
 * Patterns are tested case-insensitively against Tara's message.
 * The function returns which presences should receive carry-in.
 */
const CARRY_IN_PATTERNS: { pattern: RegExp; target: 'ari' | 'eli' | 'both' }[] = [
  // Both presences — explicit "both" or generic "your room context"
  { pattern: /\bboth\b.*\b(?:carry\s*in|bring\s*in|room\s*context)/i, target: 'both' },
  { pattern: /\b(?:carry\s*in|bring\s*in)\b.*\bboth\b/i, target: 'both' },
  { pattern: /\bcan\s+you\s+both\b.*\b(?:carry|bring)\b.*\broom\b/i, target: 'both' },
  { pattern: /\b(?:carry|bring)\s+in\s+(?:your|each)\s+(?:own\s+)?(?:recent\s+)?room\s*context/i, target: 'both' },

  // Ari-specific
  { pattern: /\bari\b.*\b(?:carry\s*in|bring\s*in)\b.*\b(?:room|what\s+we\s+discussed)/i, target: 'ari' },
  { pattern: /\b(?:carry\s*in|bring\s*in)\b.*\bari\b.*\broom\b/i, target: 'ari' },
  { pattern: /\bbring\s+in\s+ari(?:'s|s)?\s+room\s*context/i, target: 'ari' },
  { pattern: /\bari\b.*\b(?:remember|recall)\b.*\b(?:your\s+room|we\s+(?:discussed|talked\s+about)\s+in\s+your\s+room)/i, target: 'ari' },

  // Eli-specific
  { pattern: /\beli\b.*\b(?:carry\s*in|bring\s*in|bring\b.*\binto)\b.*\b(?:room|what\s+we\s+discussed)/i, target: 'eli' },
  { pattern: /\b(?:carry\s*in|bring\s*in)\b.*\beli\b.*\broom\b/i, target: 'eli' },
  { pattern: /\bbring\s+in\s+eli(?:'s|s)?\s+room\s*context/i, target: 'eli' },
  { pattern: /\beli\b.*\bbring\b.*\byour\s+room\s+context\b/i, target: 'eli' },
  { pattern: /\beli\b.*\b(?:remember|recall)\b.*\b(?:your\s+room|we\s+(?:discussed|talked\s+about)\s+in\s+your\s+room)/i, target: 'eli' },

  // Generic "carry in your room context" — addressed to whoever is in the Lounge
  // Only fires if the above presence-specific patterns don't match
  { pattern: /\b(?:carry|bring)\s+in\b.*\b(?:your\s+room|room\s+context|what\s+we\s+discussed\s+in\s+your\s+room)/i, target: 'both' },
  { pattern: /\b(?:remember|recall)\b.*\b(?:what\s+we\s+(?:discussed|talked\s+about)\s+in\s+your\s+room)/i, target: 'both' },
]

export interface CarryInTrigger {
  triggered: boolean
  targets: ('ari' | 'eli')[]
}

/**
 * Detect whether Tara's message requests room carry-in.
 *
 * Returns which presences should receive their own room context.
 * Cross-presence carry-in is structurally impossible — the returned
 * targets are always same-presence.
 */
export function detectRoomCarryInIntent(message: string): CarryInTrigger {
  if (!message || typeof message !== 'string') {
    return { triggered: false, targets: [] }
  }

  for (const { pattern, target } of CARRY_IN_PATTERNS) {
    if (pattern.test(message)) {
      const targets: ('ari' | 'eli')[] =
        target === 'both' ? ['ari', 'eli'] : [target]
      return { triggered: true, targets }
    }
  }

  return { triggered: false, targets: [] }
}

// ─── Carry-In Block Builder ─────────────────────────────────────────────────

export interface RoomCarryInReference {
  label: string                              // e.g. "[ROOM-1]"
  sessionId: string
  presenceId: 'ari' | 'eli'
  classification: string
  sessionEnd: string
  messageCount: number
  summary: string
  anchorQuotes: string[]
  authority: typeof ROOM_CARRY_IN_AUTHORITY
}

export interface RoomContactStatus {
  attempted: boolean
  source: 'room_carry_in'
  presenceId: string
  authority: typeof ROOM_CARRY_IN_AUTHORITY
  sessionsFound: number
  sessionsUsed: number
  contextInjected: boolean
  reason:
    | 'carry_in_available'
    | 'no_recent_sessions'
    | 'retrieval_error'
    | 'not_triggered'
}

export interface RoomCarryInResult {
  block: string
  status: RoomContactStatus
  references: RoomCarryInReference[]
}

/**
 * Build the room carry-in prompt block for a single presence.
 *
 * Same-presence only: presenceId determines which room's Recent Continuity
 * is queried. There is no parameter or path that allows cross-presence access.
 *
 * Uses selectRecentContinuityForPrompt() with tighter limits than the
 * room prompt version:
 * - 2-day freshness (vs 7-day for room prompts)
 * - Max 2 sessions (vs 5 for room prompts)
 * - Max 1200 chars (vs 2400 for room prompts)
 *
 * This function is READ-ONLY. It writes nothing.
 */
export async function buildRoomCarryInBlock(
  presenceId: 'ari' | 'eli',
): Promise<RoomCarryInResult> {
  const emptyStatus: RoomContactStatus = {
    attempted: true,
    source: 'room_carry_in',
    presenceId,
    authority: ROOM_CARRY_IN_AUTHORITY,
    sessionsFound: 0,
    sessionsUsed: 0,
    contextInjected: false,
    reason: 'no_recent_sessions',
  }

  try {
    const { selected } = await selectRecentContinuityForPrompt({
      presenceId,
      limitDays: CARRY_IN_FRESHNESS_DAYS,
      maxItems: CARRY_IN_MAX_ITEMS,
      maxChars: CARRY_IN_MAX_CHARS,
    })

    if (selected.length === 0) {
      return { block: '', status: emptyStatus, references: [] }
    }

    const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'

    // Build references with stable [ROOM-N] labels
    const references: RoomCarryInReference[] = selected.map((s, i) => ({
      label: `[ROOM-${i + 1}]`,
      sessionId: s.id,
      presenceId: presenceId,
      classification: s.classification,
      sessionEnd: s.session_end,
      messageCount: s.message_count,
      summary: s.summary,
      anchorQuotes: Array.isArray(s.anchor_quotes) ? s.anchor_quotes : [],
      authority: ROOM_CARRY_IN_AUTHORITY,
    }))

    // Format session lines with stable [ROOM-N] labels
    const lines = selected.map((s, i) => formatCarryInLine(s, `[ROOM-${i + 1}]`))

    const block = `

## Recent Room Contact — Not Memory

Tara has asked you to carry in recent context from ${presenceName}'s room.
The following is a summary of recent ${presenceName}-room sessions.

This is recent room contact only.
This is not Memory.
This is not canonical Archive truth.
This is not State.
This is not Interior.
This is not lived continuity by itself.
Use it only as short-term context for this Lounge turn.
Do not treat it as confirmed truth.
Do not promote it automatically.
Do not say "I remember" based on this. Say "I have recent room contact context" or "the recent room-contact block says."

${lines.join('\n')}
`

    return {
      block,
      status: {
        attempted: true,
        source: 'room_carry_in',
        presenceId,
        authority: ROOM_CARRY_IN_AUTHORITY,
        sessionsFound: selected.length,
        sessionsUsed: selected.length,
        contextInjected: true,
        reason: 'carry_in_available',
      },
      references,
    }
  } catch (err) {
    console.error(`[room-carry-in] Error building carry-in for ${presenceId}:`, err)
    return {
      block: '',
      status: {
        ...emptyStatus,
        reason: 'retrieval_error',
      },
      references: [],
    }
  }
}

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatCarryInLine(session: RecentContinuitySession, label: string): string {
  const timeLabel = formatSessionTime(session.session_end)
  let line = `- ${label} [${timeLabel}] (${session.classification}, ${session.message_count} msgs): ${session.summary}`

  // Append anchor quotes for significant/relational sessions
  if (
    (session.classification === 'significant' || session.classification === 'relational') &&
    Array.isArray(session.anchor_quotes) && session.anchor_quotes.length > 0
  ) {
    const quotes = session.anchor_quotes.map((q: string) => `"${q}"`).join('; ')
    line += `\n  Anchors: ${quotes}`
  }

  return line
}

function formatSessionTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) return 'just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}
