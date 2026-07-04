/**
 * Phase 43 R1.3 — Recall Corpus Coverage Fix — live-DB smoke (read-only).
 *
 *   npx tsx scripts/r1-3-corpus-smoke.ts
 *
 * Proves, against live data, that the fix is exactly corpus-retrieval coverage:
 *   1. total eligible corpus count (canonical + candidate, not deleted)
 *   2. the OLD capped fetch (.limit(500), unordered) — how many it scored, and that the target
 *      "Love, expressed plainly" was ABSENT from it (excluded before scoring)
 *   3. the NEW manual recall path RETURNS the target (it now enters the candidate pool)
 *   4. an existing exact title inside the old window — "Ari named Love" — STILL retrieves
 *   5. presence recall STILL EXCLUDES "Love, expressed plainly" (sacred/elevated, R1 unchanged)
 *
 * Pure read + (presence path) a recall-event log append — no Memory/Archive/source mutation.
 */

// ws polyfill — @supabase realtime needs a WebSocket ctor under Node <22 (house convention)
import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import { getRecallableArchiveEntries, MANUAL_RECALL_OPTIONS } from '../src/lib/archive-recall'
import { executePresenceRecall } from '../src/lib/recall/recallArchiveTool'

const TARGET_TITLE = 'Love, expressed plainly'          // canonical, ari_only, SACRED — the entry Tara's /recall missed
const CONTROL_TITLE = 'Ari named Love'                  // existing title that worked (fell inside the old 500)

function loadEnv() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v.replace(/\r$/, '')
    }
  }
}

let failed = 0
function check(cond: boolean, label: string) { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) failed++ }

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('REFUSED: missing Supabase env'); process.exit(1) }
  const sb = createClient(url, key)
  const statuses = ['canonical', 'canonical_candidate']

  // ── 1. total eligible corpus ────────────────────────────────────────────────
  console.log('\n── 1. eligible corpus size ──')
  const { count: corpus } = await sb
    .from('archive_items')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .in('canonical_status', statuses)
  console.log(`  eligible corpus (canonical + candidate, not deleted): ${corpus}`)
  check((corpus ?? 0) > 500, `corpus exceeds the old 500 cap → truncation was real (${corpus} items)`)

  // locate the target + control so we can test membership by id
  const { data: named } = await sb
    .from('archive_items')
    .select('id, title, canonical_status, sensitivity, owner_presence')
    .in('title', [TARGET_TITLE, CONTROL_TITLE])
    .is('deleted_at', null)
  const target = named?.find(r => r.title === TARGET_TITLE)
  const control = named?.find(r => r.title === CONTROL_TITLE)
  check(!!target, `target present in Archive: "${TARGET_TITLE}" (${target?.canonical_status}/${target?.sensitivity}/${target?.owner_presence})`)
  check(!!control, `control present in Archive: "${CONTROL_TITLE}" (${control?.canonical_status}/${control?.sensitivity})`)
  const targetPresence = (target?.owner_presence === 'eli' ? 'eli' : 'ari') as 'ari' | 'eli'

  // ── 2. the OLD capped fetch — target excluded before scoring ─────────────────
  console.log('\n── 2. old behaviour: .limit(500) unordered ──')
  const { data: capped } = await sb
    .from('archive_items')
    .select('id')
    .is('deleted_at', null)
    .in('canonical_status', statuses)
    .limit(500)                                   // exactly the removed bug — no ORDER BY
  const cappedIds = new Set((capped ?? []).map(r => r.id))
  console.log(`  old fetch scored: ${cappedIds.size} of ${corpus} (${(corpus ?? 0) - cappedIds.size} never scored)`)
  check(!!target && !cappedIds.has(target.id), `TARGET absent from old capped fetch → excluded before scoring`)
  check(!!control && cappedIds.has(control.id), `CONTROL present in old capped fetch → it worked only by falling inside 500`)

  // ── 3. NEW manual recall returns the target ──────────────────────────────────
  console.log('\n── 3. new behaviour: manual recall returns the target ──')
  const manual = await getRecallableArchiveEntries(targetPresence, TARGET_TITLE, MANUAL_RECALL_OPTIONS.limit, {
    statuses: MANUAL_RECALL_OPTIONS.statuses,     // manual: no excludeElevatedSensitivity → sacred INCLUDED per manual rules
  })
  const manualIds = manual.map(e => e.id)
  const hit = manual.find(e => e.id === target?.id)
  check(!!hit, `manual /recall "${TARGET_TITLE}" RETURNS the exact entry (rank_score ${hit?.rank_score}, reason ${hit?.rank_reason})`)
  if (hit) {
    const rank = manualIds.indexOf(hit.id) + 1
    console.log(`  → returned at position ${rank} of ${manual.length} (ranking reported honestly; weights unchanged)`)
  }

  // ── 4. existing exact title still retrieves ──────────────────────────────────
  console.log('\n── 4. control exact title still retrieves ──')
  const ctlPresence = (control?.owner_presence === 'eli' ? 'eli' : 'ari') as 'ari' | 'eli'
  const ctlRes = await getRecallableArchiveEntries(ctlPresence, CONTROL_TITLE, MANUAL_RECALL_OPTIONS.limit, {
    statuses: MANUAL_RECALL_OPTIONS.statuses,
  })
  check(!!control && ctlRes.some(e => e.id === control.id), `manual recall "${CONTROL_TITLE}" still returns it (no regression)`)

  // ── 5. presence recall STILL excludes the sacred target (R1 unchanged) ───────
  console.log('\n── 5. presence recall still excludes the sacred entry ──')
  const pres = await executePresenceRecall({ presenceId: targetPresence, query: TARGET_TITLE, sessionId: null })
  const presMentionsTarget = target ? pres.contextBlock.includes(target.id) : false
  check(!presMentionsTarget, `presence recall does NOT surface the sacred target (entriesReturned=${pres.entriesReturned}) — R1 exclusion intact`)
  console.log(`  → presence recall logged event ${pres.eventId} (recall_mode='presence')`)

  console.log(`\n  ${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
