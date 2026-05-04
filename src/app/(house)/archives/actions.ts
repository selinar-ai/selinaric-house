'use server'

// Phase 29B — Server Actions for Archives page
//
// runGraphExtraction: triggers graph extraction for a given archive.
//   Uses CRON_SECRET (server-side only) to call POST /api/archive-graph/extract.
//   Returns GraphExtractionResult.

import { runGraphExtractionLogic } from '@/lib/archive-graph'
import type { GraphExtractionResult } from '@/lib/archive-graph'

const VALID_ARCHIVE_NAMES = ['velvet', 'violet', 'house']

export async function runGraphExtraction(
  archiveName: string,
  confirmedSensitive: boolean
): Promise<GraphExtractionResult> {
  if (!VALID_ARCHIVE_NAMES.includes(archiveName)) {
    throw new Error(`Invalid archiveName: ${archiveName}`)
  }
  return runGraphExtractionLogic(archiveName, confirmedSensitive)
}
