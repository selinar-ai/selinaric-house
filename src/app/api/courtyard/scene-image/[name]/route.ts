// Courtyard — Gaming Wing · Phase 1F (visual Courtyard surface)
// Authenticated, read-only streaming of the approved Courtyard stage image.
// Whitelist only — reads a fixed local reference PNG and returns bytes. Creates
// /stores/mutates nothing. The image is a local reference, not committed; since
// it is not deployed, this 404s in production.

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'

const REFERENCES_DIR = join(process.cwd(), 'gaming-assets', 'docs', 'courtyard-visual-references')

// Whitelisted stage backgrounds (exact on-disk filenames).
const SCENE_FILES: Record<string, string> = {
  courtyard: 'courtyard-reference-01.png',
}

function notFound() {
  return NextResponse.json(
    { ok: false, code: 'NOT_FOUND', reason: 'Unknown or unavailable scene image' },
    { status: 404 }
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { name } = await context.params
  const fileName = SCENE_FILES[name]
  if (!fileName) {
    return notFound()
  }

  const filePath = normalize(join(REFERENCES_DIR, fileName))
  if (filePath !== join(REFERENCES_DIR, fileName) || !filePath.startsWith(REFERENCES_DIR)) {
    return notFound()
  }

  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    // Clear server-side signal if a whitelisted runtime asset is missing on the
    // deployment (e.g. not committed or not bundled). The path, not the bytes.
    console.error('[courtyard/scene-image] runtime asset missing:', filePath)
    return notFound()
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=600',
    },
  })
}
