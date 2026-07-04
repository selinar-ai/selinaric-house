/**
 * Gate A2-sec — GET /api/health
 *
 * The safe production smoke target. No auth required, no Anthropic call, no Supabase read,
 * no context assembly, no living-room contact. Returns a static liveness signal only.
 * Use THIS for deploy/liveness probes — never the living chat routes.
 */

import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({ ok: true, service: 'selinaric-house', status: 'alive' })
}
