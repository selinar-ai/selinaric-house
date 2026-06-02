// Phase 38.3.2b — House Auth Login Route
//
// POST /api/house-auth/login
// Sets an HttpOnly auth cookie on successful password verification.
// Does not expose password, secret, or token in response.
// Returns 400 on wrong password. Returns 503 on missing config.

import { NextRequest, NextResponse } from 'next/server'
import { verifyLoginPassword, buildAuthCookie } from '@/lib/server/houseAuth'

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, reason: 'Invalid request' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''
  if (!password) {
    return NextResponse.json({ ok: false, reason: 'Password required' }, { status: 400 })
  }

  const secret = process.env.HOUSE_AUTH_SECRET
  if (!secret) {
    console.error('[house-auth/login] HOUSE_AUTH_SECRET not configured')
    return NextResponse.json({ ok: false, reason: 'Auth not configured' }, { status: 503 })
  }

  if (!verifyLoginPassword(password)) {
    return NextResponse.json({ ok: false, reason: 'Invalid password' }, { status: 400 })
  }

  const envPassword = process.env.HOUSE_AUTH_PASSWORD ?? process.env.NEXT_PUBLIC_HOUSE_PASSWORD ?? ''
  const cookieOptions = buildAuthCookie(envPassword, secret)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(cookieOptions)
  return response
}
