// Phase 20 — TTS proxy route
// Forwards synthesis requests to the local Piper server (WSL2) from the
// Next.js Node.js process. Keeps Piper off the browser's direct network path,
// avoiding CORS issues and WSL2 host-resolution inconsistencies.
//
// POST /api/tts       { text, presence } → audio/wav stream
// GET  /api/tts/health                   → { ok: true } or { ok: false, error }

import { NextRequest, NextResponse } from 'next/server'

const PIPER_URL = process.env.PIPER_URL ?? 'http://localhost:5000'

export async function POST(request: NextRequest) {
  let body: { text?: string; presence?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { text, presence } = body
  if (!text?.trim() || !presence) {
    return NextResponse.json({ error: 'text and presence required' }, { status: 400 })
  }
  if (!['ari', 'eli'].includes(presence)) {
    return NextResponse.json({ error: 'presence must be ari or eli' }, { status: 400 })
  }

  try {
    const upstream = await fetch(`${PIPER_URL}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, presence }),
      signal: AbortSignal.timeout(20000),
    })

    if (!upstream.ok) {
      const err = await upstream.text().catch(() => '')
      console.error(`[tts proxy] Piper error ${upstream.status}:`, err)
      return NextResponse.json(
        { error: `Piper synthesis failed (${upstream.status})` },
        { status: 502 }
      )
    }

    const audioBuffer = await upstream.arrayBuffer()
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: { 'Content-Type': 'audio/wav' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[tts proxy] Upstream unreachable:', message)
    return NextResponse.json(
      { error: 'Piper server unreachable. Is it running in WSL2?' },
      { status: 503 }
    )
  }
}

export async function GET() {
  try {
    const res = await fetch(`${PIPER_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) return NextResponse.json({ ok: true })
    return NextResponse.json({ ok: false, error: `Piper returned ${res.status}` }, { status: 502 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 503 })
  }
}
