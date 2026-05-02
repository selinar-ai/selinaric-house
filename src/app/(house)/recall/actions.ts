'use server'

// Phase 29A — Recall Server Actions
//
// runEmbedBackfill: executes the embedding backfill from the UI.
// Server-side only — OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY never reach the browser.
//
// confirmedSensitive: if true, includes elevated-sensitivity items (sacred|sensitive|technical).
// Returns { processed, skipped, errors } or throws on fatal error.

import { runEmbedBackfillLogic } from '@/lib/archive-semantic'
import type { BackfillResult } from '@/lib/archive-semantic'

export async function runEmbedBackfill(confirmedSensitive: boolean): Promise<BackfillResult> {
  return runEmbedBackfillLogic(confirmedSensitive)
}
