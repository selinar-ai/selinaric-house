'use server'

// Phase 29A + 29D patch — Recall Server Actions
//
// runEmbedBackfill: executes the embedding backfill from the UI.
// Server-side only — EMBED_TEXT_SECRET and SUPABASE_SERVICE_ROLE_KEY never reach the browser.
//
// archiveName: required in v1 — restricts backfill to one archive (velvet|violet|house).
//   No global all-archive execution from the UI.
// confirmedSensitive: if true, includes elevated-sensitivity items (sacred|sensitive|technical).
// Returns { processed, skipped, errors, first_error? } or throws on fatal error.

import { runEmbedBackfillLogic } from '@/lib/archive-semantic'
import type { BackfillResult } from '@/lib/archive-semantic'

const VALID_ARCHIVE_NAMES = ['velvet', 'violet', 'house']

export async function runEmbedBackfill(
  confirmedSensitive: boolean,
  archiveName: string
): Promise<BackfillResult> {
  if (!VALID_ARCHIVE_NAMES.includes(archiveName)) {
    throw new Error(`Invalid archiveName: ${archiveName}`)
  }
  return runEmbedBackfillLogic(confirmedSensitive, archiveName)
}
