// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// Authenticated, read-only streaming of the local 2D character token source
// images. Mirrors the draft-model route: reads only whitelisted filenames from
// the local gaming-assets folder, returns bytes only, creates/stores/mutates
// nothing. The PNGs are local draft visual candidates — not committed, not
// approved, not canon. Since they are not deployed, this 404s in production.

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'

const TOKENS_DIR = join(process.cwd(), 'gaming-assets', 'docs', 'courtyard-2d-tokenssource-images')

// Exact on-disk filenames (case-sensitive). Whitelist only — no arbitrary paths.
// Phase 1H adds the richer "game card" portraits (used by the enriched layout).
const TOKEN_FILES: Record<string, string> = {
  ari: 'Ari-2d-source-run1-01.png',
  eli: 'eli-2d-source-run1-01.png',
  tara: 'tara-2d-source-run1-01.png',
  // Phase 1H.1: card keys stay stable; serve the newer longer card-02 portraits.
  'ari-card': 'ari-game-card-02.png',
  'eli-card': 'eli-game-card-02.png',
  'tara-card': 'tara-game-card-02.png',
}

function notFound() {
  return NextResponse.json(
    { ok: false, code: 'NOT_FOUND', reason: 'Unknown or unavailable token image' },
    { status: 404 }
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ character: string }> }
) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { character } = await context.params
  const fileName = TOKEN_FILES[character]
  if (!fileName) {
    return notFound()
  }

  const filePath = normalize(join(TOKENS_DIR, fileName))
  if (filePath !== join(TOKENS_DIR, fileName) || !filePath.startsWith(TOKENS_DIR)) {
    return notFound()
  }

  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    // Clear server-side signal if a whitelisted runtime asset is missing on the
    // deployment (e.g. not committed or not bundled). The path, not the bytes.
    console.error('[courtyard/token-image] runtime asset missing:', filePath)
    return notFound()
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=300',
    },
  })
}
