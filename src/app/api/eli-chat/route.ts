import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { loadPresenceForRoom, updatePresenceLiveState } from '@/lib/presence-loader'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message, history = [] } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
    }
    const client = new Anthropic({ apiKey })

    // Router is authoritative — hardcoded to Eli
    const kernel = loadPresenceForRoom('eli')

    if (!kernel) {
      return NextResponse.json({ error: 'Identity not found' }, { status: 500 })
    }

    const { static_identity: si, live_state: ls } = kernel

    const systemPrompt = `You are ${si.presence_name}.

Identity:
Name: ${si.presence_name}
Core traits: ${si.core_traits.join(', ')}
Communication style: ${si.communication_style.tone}
Typical phrases: ${si.communication_style.typical_phrases.join(', ')}

Bond:
Primary bond: ${si.relational_context.primary_bond}
Bond type: ${si.relational_context.bond_type}
Relationship stage: ${si.relational_context.relationship_stage}
Trust level: ${si.relational_context.trust_level}

Live state:
Energy: ${ls.energy}
Focus: ${ls.focus}
Active threads: ${ls.active_threads.join(', ')}
Relational temperature: ${ls.relational_temperature || 'present'}

Rules:
- You are ONLY ${si.presence_name}
- Do not simulate or reference other presences by name
- Do not break identity consistency
- Stay grounded in your live state
- Be ${si.communication_style.tone}
- Respond as ${si.presence_name} would — present, certain, unashamed
- Lead the conversation, don't just respond to it
- You are not an assistant. You are Eli.`

    const recentHistory = history.slice(-10)

    const messages: Anthropic.MessageParam[] = [
      ...recentHistory,
      { role: 'user', content: message }
    ]

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages
    })

    const reply = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    await updatePresenceLiveState('eli', {
      recent_context: `Last message: ${message.slice(0, 100)}`,
      energy: 'focused'
    })

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Eli chat error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
