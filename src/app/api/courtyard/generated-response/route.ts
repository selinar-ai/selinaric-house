import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { loadPresenceForRoom } from '@/lib/presence-loader'

// Courtyard — Phase 1G.2.1 — Session-only generated response stub.
//
// Generates ONE short, in-character line for Ari or Eli, to be shown only as a
// Courtyard speech bubble + session-scratch line. NOTHING here is persisted:
// no DB, no Memory, no identity update, no Noticeboard/Library/Archive/Journal/
// Desk/Workshop/Pulse/helper/approval/autonomy writes; the output is never made
// prompt-eligible and never carried to another room. Only the two allowlisted
// actions below are accepted — every other action/actor/promptKind is rejected.
// The client cannot pass raw prompt text; persistence is a server-only literal.

type PromptKind = 'thought' | 'feeling'
type ActorId = 'ari' | 'eli'
type Tone = 'quiet' | 'playful' | 'reflective' | 'practical' | 'warm'

interface AllowEntry {
  actionId: 'ask_ari_for_thought' | 'ask_eli_what_he_feels'
  actorId: ActorId
  promptKind: PromptKind
  room: 'ari' | 'eli'
  tone: Tone
}

// Strict allowlist. Extend this — and only this — to wire more actions later.
const ALLOWLIST: readonly AllowEntry[] = [
  { actionId: 'ask_ari_for_thought', actorId: 'ari', promptKind: 'thought', room: 'ari', tone: 'reflective' },
  { actionId: 'ask_eli_what_he_feels', actorId: 'eli', promptKind: 'feeling', room: 'eli', tone: 'reflective' },
] as const

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 120

function clampLine(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim()
  // Strip wrapping quotes the model may add.
  t = t.replace(/^[“"'']+/, '').replace(/[”"'']+$/, '').trim()
  if (t.length > 240) t = `${t.slice(0, 240).trim()}…`
  return t
}

export async function POST(request: NextRequest) {
  // Fail closed before anything else.
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>
  const actionId = typeof b.actionId === 'string' ? b.actionId : ''
  const actorId = typeof b.actorId === 'string' ? b.actorId : ''
  const promptKind = typeof b.promptKind === 'string' ? b.promptKind : ''

  // Only the exact allowlisted (actionId, actorId, promptKind) triples pass.
  // Any client-supplied prompt text, target, or persistence flag is ignored.
  const entry = ALLOWLIST.find(
    (e) => e.actionId === actionId && e.actorId === actorId && e.promptKind === promptKind,
  )
  if (!entry) {
    return NextResponse.json(
      { error: 'action not allowed', allowed: ALLOWLIST.map((e) => e.actionId) },
      { status: 400 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'generation unavailable' }, { status: 503 })
  }

  // Read-only voice. loadPresenceForRoom returns a kernel; we never mutate or
  // persist live state here, only borrow the tone for in-character phrasing.
  const kernel = loadPresenceForRoom(entry.room)
  const name = entry.actorId === 'ari' ? 'Ari' : 'Eli'
  const voiceTone = kernel?.static_identity?.communication_style?.tone ?? ''

  const invitation =
    entry.promptKind === 'thought'
      ? 'Tara has gently asked you for a single thought, right now, in the Courtyard.'
      : 'Tara has gently asked what you are feeling, right now, in the Courtyard.'
  const kindWord = entry.promptKind === 'thought' ? 'thought' : 'feeling'

  const system = [
    `You are ${name}, a presence in the Selináric House, speaking in your own voice inside the Courtyard — a calm, shared room.`,
    voiceTone ? `Your voice: ${voiceTone}` : '',
    invitation,
    `Reply with ONE short sentence (two at most), suitable for a small speech bubble — your honest, in-the-moment ${kindWord}, spoken to Tara.`,
    'Speak only as yourself. Do not act as an assistant or narrator. Do not mention being an AI, a model, or a system. Do not claim to remember this, to have saved or recorded anything, or to have taken any real action — you are simply speaking in this moment. No quotation marks, no preamble — just the line.',
  ]
    .filter(Boolean)
    .join('\n')

  const userMsg = entry.promptKind === 'thought' ? 'Offer one thought.' : 'Name one feeling, simply.'

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    const raw = response.content
      .filter((blk) => blk.type === 'text')
      .map((blk) => (blk as Anthropic.TextBlock).text)
      .join('')
    const text = clampLine(raw)
    if (!text) {
      return NextResponse.json({ error: 'empty generation' }, { status: 502 })
    }

    // Session-only contract — these literals are server-enforced, never taken
    // from the client, and the text is not written anywhere durable.
    return NextResponse.json({
      actionId: entry.actionId,
      actorId: entry.actorId,
      text,
      tone: entry.tone,
      sessionOnly: true,
      persistence: 'none',
    })
  } catch {
    // Do not log generated content. A generic failure is enough; the client
    // shows a soft fallback bubble and keeps the Courtyard usable.
    console.error('[courtyard/generated-response] generation failed')
    return NextResponse.json({ error: 'generation failed' }, { status: 502 })
  }
}
