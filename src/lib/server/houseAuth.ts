// Phase 38.3.2b — House Server-Side Auth Helper
//
// Server-only. Never import in client components.
// Protects server-side API routes via HttpOnly cookie.
// Does not replace the client-side sessionStorage UI gate.
//
// Token is HMAC-SHA256(password, secret) — not the raw password.
// Cookie is HttpOnly, SameSite=lax, Secure in production.

import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'

// ─── Constants ─────────────────────────────────────────────────────────────

export const HOUSE_AUTH_COOKIE = 'selinaric_house_auth'

// ─── Token ────────────────────────────────────────────────────────────────

function deriveToken(password: string, secret: string): string {
  return createHmac('sha256', secret).update(password + ':house_session').digest('hex')
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

// ─── Auth result ───────────────────────────────────────────────────────────

export type HouseAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; body: Record<string, unknown> }

// ─── requireHouseApiAuth ───────────────────────────────────────────────────
// Call this first in any route that should be protected.
// Returns { ok: true } if authenticated, or a safe 401/503 result.

export function requireHouseApiAuth(request: NextRequest): HouseAuthResult {
  const password = process.env.HOUSE_AUTH_PASSWORD ?? process.env.NEXT_PUBLIC_HOUSE_PASSWORD
  const secret = process.env.HOUSE_AUTH_SECRET

  if (!password || !secret) {
    // Fail closed — missing config means no auth possible
    console.error('[houseAuth] Missing HOUSE_AUTH_PASSWORD or HOUSE_AUTH_SECRET')
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        code: 'AUTH_CONFIG_MISSING',
        reason: 'Authentication configuration missing',
        stored: false,
        evidence: false,
        authority_changed: false,
      },
    }
  }

  const cookie = request.cookies.get(HOUSE_AUTH_COOKIE)
  if (!cookie?.value) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        code: 'UNAUTHENTICATED',
        reason: 'Authentication required',
        stored: false,
        evidence: false,
        authority_changed: false,
      },
    }
  }

  const expected = deriveToken(password, secret)
  if (!timingSafeCompare(cookie.value, expected)) {
    return {
      ok: false,
      status: 401,
      body: {
        ok: false,
        code: 'UNAUTHENTICATED',
        reason: 'Authentication required',
        stored: false,
        evidence: false,
        authority_changed: false,
      },
    }
  }

  return { ok: true }
}

// ─── Cookie builder ────────────────────────────────────────────────────────
// Used by the login route to set the auth cookie on a NextResponse.

export function buildAuthCookie(password: string, secret: string): {
  name: string
  value: string
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
} {
  const token = deriveToken(password, secret)
  return {
    name: HOUSE_AUTH_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  }
}

// ─── verifyLoginPassword ───────────────────────────────────────────────────
// Used by the login route — checks submitted password against env var.

export function verifyLoginPassword(submitted: string): boolean {
  const expected = process.env.HOUSE_AUTH_PASSWORD ?? process.env.NEXT_PUBLIC_HOUSE_PASSWORD
  if (!expected) return false
  return timingSafeCompare(submitted, expected)
}
