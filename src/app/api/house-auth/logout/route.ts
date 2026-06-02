// Phase 38.3.2b — House Auth Logout Route
//
// POST /api/house-auth/logout
// Clears the HttpOnly auth cookie.

import { NextRequest, NextResponse } from 'next/server'
import { HOUSE_AUTH_COOKIE } from '@/lib/server/houseAuth'

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: HOUSE_AUTH_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
