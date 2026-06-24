// Courtyard — Gaming Wing · Phase 1B
// Authenticated, read-only draft-model streaming route.
//
// Streams a single whitelisted draft .glb from the git-ignored
// gaming-assets/drafts/ folder to authenticated House users for local preview.
//
// Governance: this route ONLY reads and returns bytes. It creates nothing,
// stores nothing, mutates nothing, and approves nothing — no memory, archive,
// library, database, model calls, or autonomy. Because the draft .glb files are
// git-ignored, they are not deployed; in production this route returns 404, so
// it is effectively local-dev-only.

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, normalize } from 'path'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'
import { courtyardModelFileName, isCourtyardCharacterId } from '@/lib/courtyard/draftModels'

const DRAFTS_DIR = join(process.cwd(), 'gaming-assets', 'drafts')

function notFound() {
  return NextResponse.json(
    { ok: false, code: 'NOT_FOUND', reason: 'Unknown or unavailable draft model' },
    { status: 404 }
  )
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ character: string }> }
) {
  // 1. Auth first — fail closed.
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  // 2. Whitelist the character id. Only ari | eli | tara are ever accepted;
  //    arbitrary paths can never reach the filesystem.
  const { character } = await context.params
  if (!isCourtyardCharacterId(character)) {
    return notFound()
  }

  // 2b. Variant: "draft" (default), "fixed", or one of THIS character's
  //     whitelisted candidate ids. The resolver returns null for anything else,
  //     so arbitrary variant strings / filenames can never reach the filesystem.
  const variant = request.nextUrl.searchParams.get('variant') ?? 'draft'
  const fileName = courtyardModelFileName(character, variant)
  if (!fileName) {
    return notFound()
  }

  // 3. Build the path from the resolved, whitelisted filename only.
  const filePath = normalize(join(DRAFTS_DIR, fileName))

  // 4. Defense-in-depth: the resolved path must stay inside the drafts dir.
  if (filePath !== join(DRAFTS_DIR, fileName) || !filePath.startsWith(DRAFTS_DIR)) {
    return notFound()
  }

  // 5. Read and return. Missing file (e.g. production, where the asset is not
  //    deployed) → 404.
  let data: Buffer
  try {
    data = await readFile(filePath)
  } catch {
    return notFound()
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(data.length),
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}
