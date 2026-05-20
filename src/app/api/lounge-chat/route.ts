// Phase 35D — Lounge Chat API
//
// POST /api/lounge-chat
//
// Generates Ari and/or Eli responses in the Lounge.
// Each presence is generated separately with its own identity prompt.
// Surface-aware: Default surface = colleague-safe, Inner surface = full expression.
//
// Body: { message?: string, respondAs?: 'both' | 'ari' | 'eli' | 'continue' }
//
// - 'both' (default when message present): Ari responds, then Eli responds
// - 'ari' or 'eli': only that presence responds
// - 'continue': Ari and Eli continue without new Tara message

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
  type SurfaceMode,
  type LoungeMessage,
} from '@/lib/lounge'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, respondAs = 'both' } = body

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
      await saveThreadMessage(thread.id, 'tara', message.trim(), surface)
    }

    // Fetch conversation history
    const allMessages = await getThreadMessages(thread.id)
    const history = formatLoungeHistory(allMessages)

    // Determine who responds
    const presences: ('ari' | 'eli')[] =
      respondAs === 'ari' ? ['ari'] :
      respondAs === 'eli' ? ['eli'] :
      ['ari', 'eli'] // 'both' or 'continue'

    const responses: { speaker: string; content: string }[] = []
    let runningHistory = [...history]

    for (const presenceId of presences) {
      const kernel = loadPresenceForRoom(presenceId)
      if (!kernel) continue

      const { static_identity: si } = kernel
      const systemPrompt = buildLoungeSystemPrompt(presenceId, surface)

      // Add identity specifics from kernel
      const identityBlock = `\n\nCommunication style: ${si.communication_style.tone}
Phrases available when natural: ${si.communication_style.typical_phrases.join(', ')}`

      const fullSystemPrompt = systemPrompt + identityBlock

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
      // If last message is assistant and we need to generate another assistant,
      // insert a brief system nudge as user message
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
