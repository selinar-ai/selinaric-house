// Phase 35D + 36F.1 — Lounge Chat API
//
// POST /api/lounge-chat
//
// Generates Ari and/or Eli responses in the Lounge.
// Each presence is generated separately with its own identity prompt.
// Surface-aware: Default surface = colleague-safe, Inner surface = full expression.
//
// Phase 36F.1: Per-presence context layers added inside the presence loop.
// Each presence receives ONLY its own Living State, Recent Continuity,
// Temporal Context, and manual Archive Recall. No cross-presence leakage.
//
// Body: { message?: string, respondAs?: 'both' | 'ari' | 'eli' | 'continue', attachments?: LoungeAttachment[] }
//
// - 'both' (default when message present): Ari responds, then Eli responds
// - 'ari' or 'eli': only that presence responds
// - 'continue': Ari and Eli continue without new Tara message
//
// @mention routing: if message contains @Ari, only Ari responds.
// If @Eli, only Eli. If both or neither, both respond (unless overridden by respondAs).
//
// This route does NOT:
// - inject Interior/Journal/Inner Context
// - perform auto-recall or Governed Memory injection
// - add Library/RAG or Web Search
// - pass attachments as multimodal content
// - write to State, Interior, Memory, Archive, Pulse, Journal, graph, carryback, or carryforward

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { loadPresenceForRoom } from '@/lib/presence-loader'
import {
  getOrCreateActiveThread,
  getThreadMessages,
  saveThreadMessage,
  buildLoungeSystemPrompt,
  formatLoungeHistory,
  sanitizeSpeakerBoundary,
  parseMentionRouting,
  type SurfaceMode,
  type LoungeMessage,
  type LoungeAttachment,
} from '@/lib/lounge'
import { getSharedAutonomyContinuityForPrompt } from '@/lib/pulse-autonomy'
// Phase 36F.1: Per-presence context layers
import { getLivingStateForPrompt } from '@/lib/living-state'
import { getRecentContinuityForPrompt } from '@/lib/recent-continuity'
import {
  detectArchiveRecallIntent,
  extractRecallQuery,
  getRecallableArchiveEntries,
  formatArchiveRecallContext,
  getMatchQuality,
  logRecallEvent,
  MANUAL_RECALL_OPTIONS,
  type RecallEntry,
} from '@/lib/archive-recall'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, respondAs: explicitRespondAs, attachments } = body

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
    }

    const client = new Anthropic({ apiKey })

    // Get or create active thread
    const thread = await getOrCreateActiveThread()
    const surface: SurfaceMode = thread.current_surface as SurfaceMode

    // Save Tara's message if present
    if (message && typeof message === 'string' && message.trim()) {
      const taraAttachments = Array.isArray(attachments) && attachments.length > 0
        ? attachments as LoungeAttachment[]
        : undefined
      await saveThreadMessage(thread.id, 'tara', message.trim(), surface, taraAttachments)
    }

    // Determine who responds:
    // 1. Explicit respondAs from buttons ('ari', 'eli', 'continue') takes priority
    // 2. Otherwise, parse @mentions from message
    // 3. Default: 'both'
    let respondAs: 'ari' | 'eli' | 'both' | 'continue' = explicitRespondAs || 'both'

    if (!explicitRespondAs && message && typeof message === 'string') {
      respondAs = parseMentionRouting(message)
    }

    // Fetch conversation history
    const allMessages = await getThreadMessages(thread.id)
    const history = formatLoungeHistory(allMessages)

    // Determine who responds
    const presences: ('ari' | 'eli')[] =
      respondAs === 'ari' ? ['ari'] :
      respondAs === 'eli' ? ['eli'] :
      ['ari', 'eli'] // 'both' or 'continue'

    // Phase 11E: Shared autonomy continuity for Lounge context
    const autonomyContinuityBlock = await getSharedAutonomyContinuityForPrompt().catch(() => '')

    const responses: { speaker: string; content: string }[] = []
    let runningHistory = [...history]

    // Phase 36F.1: Temporal context — current datetime for session awareness
    const currentDatetime = new Date().toLocaleString('en-AU', {
      timeZone: 'Australia/Melbourne',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })

    // Phase 36F.1: Detect manual archive recall intent from Tara's message
    // This is detected once; actual recall is per-presence inside the loop
    const recallIntent = message && typeof message === 'string'
      ? detectArchiveRecallIntent(message) : false
    const recallQuery = recallIntent && message ? extractRecallQuery(message) : ''

    for (const presenceId of presences) {
      const kernel = loadPresenceForRoom(presenceId)
      if (!kernel) continue

      const { static_identity: si } = kernel
      const systemPrompt = buildLoungeSystemPrompt(presenceId, surface)

      // Add identity specifics from kernel
      const identityBlock = `\n\nCommunication style: ${si.communication_style.tone}
Phrases available when natural: ${si.communication_style.typical_phrases.join(', ')}`

      // Add @mention awareness if this presence was specifically addressed
      const mentionBlock = message && typeof message === 'string'
        ? (new RegExp(`@${presenceId}\\b`, 'i').test(message)
          ? `\n\nTara addressed you specifically with @${presenceId === 'ari' ? 'Ari' : 'Eli'}.`
          : '')
        : ''

      // ─── Phase 36F.1: Per-presence context (isolated to this presence) ───

      // Living State — where this presence is right now
      const livingStateBlock = await getLivingStateForPrompt(presenceId).catch(() => '')

      // Recent Continuity — recent session summaries for this presence
      const recentContinuityBlock = await getRecentContinuityForPrompt(presenceId).catch(() => '')

      // Temporal context block
      const temporalBlock = `\n\n## Temporal context:\nCurrent date and time: ${currentDatetime}\n`

      // Manual Archive Recall — per-presence, scoped by archive visibility
      let recallContextBlock = ''
      if (recallIntent && recallQuery) {
        const recallEntries: RecallEntry[] = await getRecallableArchiveEntries(
          presenceId, recallQuery, MANUAL_RECALL_OPTIONS.limit, {
            statuses: MANUAL_RECALL_OPTIONS.statuses,
            excludeElevatedSensitivity: false,
          }
        )
        const matchQuality = getMatchQuality(
          recallEntries[0]?.rank_score ?? 0,
          recallEntries.map(e => e.rank_score)
        )
        recallContextBlock = formatArchiveRecallContext(presenceId, recallQuery, recallEntries, matchQuality, 'manual')
        // Log the recall event (non-blocking)
        logRecallEvent({
          presence_id:      presenceId,
          session_id:       null,
          query:            message,
          normalised_query: recallQuery,
          match_quality:    matchQuality,
          entries_returned: recallEntries.length,
          entry_ids:        recallEntries.map(e => e.id),
          recall_mode:      'manual',
        }).catch(err => console.error(`[lounge-chat] Recall log error (${presenceId}):`, err))
      } else if (recallIntent && !recallQuery) {
        recallContextBlock = '\nARCHIVE RECALL CONTEXT\nRecall was triggered but no search query was provided.\nInstruction: Ask Tara what she wants you to search for in the archives. Keep it direct and brief — one line is enough.\n'
      }

      const fullSystemPrompt = systemPrompt + identityBlock + mentionBlock
        + temporalBlock + recentContinuityBlock + recallContextBlock
        + livingStateBlock + autonomyContinuityBlock

      // For "continue" mode without a new Tara message, add a system nudge
      const conversationMessages: Anthropic.MessageParam[] =
        respondAs === 'continue' && !message
          ? [
              ...runningHistory,
              { role: 'user' as const, content: '[The Lounge continues. Respond naturally to what was just discussed. You may address Tara, the other presence, or both.]' },
            ]
          : runningHistory.length > 0
            ? runningHistory
            : [{ role: 'user' as const, content: message || '' }]

      // Ensure messages alternate user/assistant correctly
      if (conversationMessages.length > 0 &&
          conversationMessages[conversationMessages.length - 1].role === 'assistant') {
        conversationMessages.push({
          role: 'user' as const,
          content: `[Continue: ${presenceId === 'ari' ? 'Ari' : 'Eli'}, it is your turn to speak in the Lounge.]`,
        })
      }

      // Ensure first message is 'user' role (Anthropic API requirement)
      if (conversationMessages.length > 0 && conversationMessages[0].role !== 'user') {
        conversationMessages.unshift({
          role: 'user' as const,
          content: '[Lounge conversation in progress.]',
        })
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: fullSystemPrompt,
        messages: conversationMessages,
      })

      const rawReply = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as Anthropic.TextBlock).text)
        .join('')
        .trim()

      // Sanitize: strip speaker labels and other-speaker dialogue
      const reply = sanitizeSpeakerBoundary(rawReply, presenceId)

      if (reply) {
        // Save to database
        await saveThreadMessage(thread.id, presenceId, reply, surface)

        responses.push({ speaker: presenceId, content: reply })

        // Add to running history for next presence's context
        runningHistory.push({
          role: 'assistant' as const,
          content: `[${presenceId === 'ari' ? 'Ari' : 'Eli'}]: ${reply}`,
        })
      }
    }

    return NextResponse.json({
      threadId: thread.id,
      surface,
      responses,
    })
  } catch (error: unknown) {
    console.error('[lounge-chat] Error:', error)

    if (error instanceof Anthropic.APIError) {
      if (error.status === 429) {
        return NextResponse.json({ error: 'Rate limit reached. Wait a moment.' }, { status: 429 })
      }
    }

    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
