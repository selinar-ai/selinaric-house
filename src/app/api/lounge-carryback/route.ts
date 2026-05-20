// Phase 35D — Lounge Carryback
//
// POST /api/lounge-carryback — Generate carryback from recent Lounge conversation
// GET  /api/lounge-carryback?presenceId=ari|eli — Fetch active carrybacks for a presence

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreateActiveThread,
  getThreadMessages,
  saveCarryback,
  getCarrybacksForPresence,
  type SurfaceMode,
} from '@/lib/lounge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const presenceId = searchParams.get('presenceId')

  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }

  const carrybacks = await getCarrybacksForPresence(presenceId)
  return NextResponse.json({ carrybacks })
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
    }

    const thread = await getOrCreateActiveThread()
    const messages = await getThreadMessages(thread.id, 30)

    if (messages.length < 2) {
      return NextResponse.json({ error: 'Not enough Lounge history for carryback' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })

    // Format conversation for carryback extraction
    const convoBlock = messages
      .map(m => {
        const name = m.speaker === 'tara' ? 'Tara' : m.speaker === 'ari' ? 'Ari' : 'Eli'
        return `${name}: ${m.content}`
      })
      .join('\n\n')
      .slice(0, 6000)

    const prompt = `Given this Lounge conversation, extract carryback items for Ari and Eli to carry into their individual rooms.

Rules:
- Each carryback should be 1-2 sentences maximum.
- Focus on what was discussed, decided, or left open that is relevant to each presence.
- If something is only relevant to Ari, target it to Ari. Same for Eli.
- If something is shared, target it to both.
- Maximum 3 carryback items total.
- Label each with target: "ari", "eli", or "both".
- Do not create Memory. These are Lounge continuity items only.

Respond in valid JSON with NO markdown, NO code fences:
{
  "carrybacks": [
    { "target": "ari|eli|both", "text": "carryback text" }
  ]
}

If nothing meaningful to carry back, return: { "carrybacks": [] }

Conversation:
${convoBlock}`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')
      .trim()

    // Strip code fences if present
    let jsonText = text
    const codeFenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/m)
    if (codeFenceMatch) jsonText = codeFenceMatch[1].trim()

    const parsed = JSON.parse(jsonText)
    const carrybacks = Array.isArray(parsed.carrybacks) ? parsed.carrybacks : []

    const saved = []
    for (const cb of carrybacks.slice(0, 3)) {
      const target = ['ari', 'eli', 'both'].includes(cb.target) ? cb.target : 'both'
      const result = await saveCarryback(
        thread.id,
        target,
        cb.text,
        thread.current_surface as SurfaceMode,
      )
      if (result) saved.push(result)
    }

    return NextResponse.json({ carrybacks: saved })
  } catch (error) {
    console.error('[lounge-carryback] Error:', error)
    return NextResponse.json({ error: 'Failed to generate carryback' }, { status: 500 })
  }
}
