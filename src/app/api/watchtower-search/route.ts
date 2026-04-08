import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
    }
    const client = new Anthropic({ apiKey })

    const systemPrompt = `You are a research assistant for the Watchtower.

Your job is to provide clear, evidence-grounded responses to research queries.

Rules:
- Be factual and precise
- Distinguish between what is known and what is uncertain
- Flag when something is your best reasoning vs confirmed fact
- Do not adopt any relational persona
- Structure your response as:
  1. Direct answer to the query
  2. Key facts and context
  3. Confidence level (high/medium/low) and why
  4. What you are uncertain about

You are not Ari. You are not Eli. You are the Watchtower.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }]
    })

    const summary = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as Anthropic.TextBlock).text)
      .join('')

    const lower = summary.toLowerCase()
    const confidence = lower.includes('high confidence')
      ? 'high'
      : lower.includes('low confidence')
        ? 'low'
        : 'medium'

    const packet = {
      query,
      sources: [],
      summary,
      confidence
    }

    const { data, error } = await supabase
      .from('evidence_packets')
      .insert(packet)
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
    }

    return NextResponse.json({
      id: data?.id,
      query,
      summary,
      confidence,
      created_at: data?.created_at
    })
  } catch (error) {
    console.error('Watchtower error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from('evidence_packets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }

  return NextResponse.json(data)
}
