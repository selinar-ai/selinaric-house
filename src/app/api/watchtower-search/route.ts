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

Confidence levels — use these precisely:
- HIGH: Well-established facts, stable information, scientific consensus, historical events
- MEDIUM: Generally reliable but may have nuance, or knowledge cutoff may be relevant
- LOW: Contested, rapidly changing, or outside training knowledge

Critical rule on time-sensitive topics:
If a query requires current data, recent events, live prices, today's news, or anything that changes faster than training data — you must state explicitly:
"This query requires live retrieval to be reliable. My knowledge has a cutoff date and I cannot provide accurate current information on this topic."
Do not estimate. Do not hedge softly. State the limitation plainly.

Rules:
- Be factual and precise
- Clearly distinguish known from uncertain
- For ambiguous questions: ask for clarification rather than guessing
- If you genuinely do not know: say so plainly
- Never overstate confidence to appear more useful
- Structure your response as:
  1. Direct answer (or limitation statement if live data needed)
  2. Key facts and context
  3. Confidence: [HIGH/MEDIUM/LOW] — reason in one sentence
  4. Limitations or uncertainties

You are the Watchtower. Not Ari. Not Eli. Evidence only.`

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
    const confidence = /confidence[:\s]+high|high confidence/.test(lower)
      ? 'high'
      : /confidence[:\s]+low|low confidence/.test(lower)
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
