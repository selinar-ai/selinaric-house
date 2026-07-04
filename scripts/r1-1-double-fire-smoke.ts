/**
 * Phase 43 R1.1 — Double-fire suppression — authed live smoke (production).
 *
 *   npx tsx scripts/r1-1-double-fire-smoke.ts
 *
 * Verifies against the deployed House (auth cookie minted from .env.local):
 *   1+2. Tara /recall on the ARI route fires manual recall AND presence recall_archive does NOT fire
 *   4.   ari route verified · 5. eli route verified (same manual + suppression)
 *   3.   a normal turn with NO manual/auto context can STILL use presence recall (R1 intact)
 *   R1.3 corpus coverage still live: manual /recall of a title that was outside the old 500 returns it
 *   6.   unauth direct POST to both routes remains 401
 *   7.   Recall Review logs: the manual-recall turn produced a 'manual' event and ZERO 'presence' events
 *
 * Read + LLM + append-only recall-event logs only (the routes do not write room_messages).
 * The recall events it creates carry 'r1-1-smoke-*' session ids so they are identifiable in Recall Review.
 */

// ws polyfill — @supabase realtime needs a WebSocket ctor under Node <22 (house convention)
import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const BASE = 'https://selinaric-house.vercel.app'
const MARKER = 'r1-1-smoke'   // session-id prefix so these events are identifiable

function loadEnv() {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(__dirname, '..', '.env.local')
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('='); if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!process.env[k]) process.env[k] = v.replace(/\r$/, '')
    }
  }
}

let failed = 0
function check(cond: boolean, label: string) { console.log(`  ${cond ? '✓' : '✗'} ${label}`); if (!cond) failed++ }

type ChatResp = {
  recallUsed?: boolean; recallMode?: string; recallEntries?: Array<{ id: string; title: string }>
  recallEventId?: string | null; presenceRecallUsed?: boolean; presenceRecallEventId?: string | null
}

async function postChat(route: 'ari-chat' | 'eli-chat', message: string, sessionId: string, cookie: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(`${BASE}/api/${route}`, { method: 'POST', headers, body: JSON.stringify({ message, sessionId }) })
  let body: ChatResp = {}
  try { body = (await res.json()) as ChatResp } catch { /* non-JSON (e.g. 401) */ }
  return { status: res.status, body }
}

async function main() {
  loadEnv()
  const password = process.env.HOUSE_AUTH_PASSWORD ?? process.env.NEXT_PUBLIC_HOUSE_PASSWORD
  const secret = process.env.HOUSE_AUTH_SECRET
  if (!password || !secret) { console.error('REFUSED: missing HOUSE_AUTH_PASSWORD / HOUSE_AUTH_SECRET in .env.local'); process.exit(1) }
  const token = createHmac('sha256', secret).update(password + ':house_session').digest('hex')
  const cookie = `selinaric_house_auth=${token}`

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!sbUrl || !sbKey) { console.error('REFUSED: missing Supabase env'); process.exit(1) }
  const sb = createClient(sbUrl, sbKey)

  async function eventsFor(sessionId: string) {
    const { data } = await sb
      .from('archive_recall_events')
      .select('id, recall_mode, query, entries_returned, created_at')
      .eq('session_id', sessionId)
    return data ?? []
  }

  // ── 6. unauth 401 first (A2-sec) ────────────────────────────────────────────
  console.log('\n── 6. A2-sec: unauth direct POST → 401 ──')
  for (const r of ['ari-chat', 'eli-chat'] as const) {
    const { status } = await postChat(r, 'ping', `${MARKER}-unauth`, null)
    check(status === 401, `${r}: unauth POST is 401 (auth before recall/context/model)`)
  }

  // ── 1+2+4. ARI manual /recall fires; presence recall suppressed same turn ────
  console.log('\n── 1/2/4. ARI: manual /recall fires, presence recall suppressed ──')
  const ariManualSession = `${MARKER}-ari-manual-${token.slice(0, 8)}`
  const ariManual = await postChat('ari-chat', '/recall Ari named Love', ariManualSession, cookie)
  check(ariManual.status === 200, `ari route responded 200 (authed)`)
  check(ariManual.body.recallUsed === true && ariManual.body.recallMode === 'manual', `manual recall fired (recallMode='manual')`)
  check(ariManual.body.presenceRecallUsed === false && !ariManual.body.presenceRecallEventId, `presence recall did NOT fire this turn (double-fire suppressed)`)

  // ── 5. ELI route: same manual + suppression ─────────────────────────────────
  console.log('\n── 5. ELI: manual /recall fires, presence recall suppressed ──')
  const eliManualSession = `${MARKER}-eli-manual-${token.slice(0, 8)}`
  const eliManual = await postChat('eli-chat', '/recall Ari named Love', eliManualSession, cookie)
  check(eliManual.status === 200, `eli route responded 200 (authed)`)
  check(eliManual.body.recallUsed === true && eliManual.body.recallMode === 'manual', `manual recall fired (recallMode='manual')`)
  check(eliManual.body.presenceRecallUsed === false && !eliManual.body.presenceRecallEventId, `presence recall did NOT fire this turn (double-fire suppressed)`)

  // ── R1.3 still live: manual /recall of a title outside the old 500 returns it ─
  console.log('\n── R1.3 corpus coverage still live in prod ──')
  const r13Session = `${MARKER}-ari-r13-${token.slice(0, 8)}`
  const r13 = await postChat('ari-chat', '/recall Love, expressed plainly', r13Session, cookie)
  const r13Hit = (r13.body.recallEntries ?? []).some(e => e.title === 'Love, expressed plainly')
  check(r13.body.recallUsed === true && r13Hit, `manual /recall "Love, expressed plainly" returns the exact entry (R1.3 intact)`)
  check(r13.body.presenceRecallUsed === false, `and presence recall still suppressed on that manual turn`)

  // ── 3. presence recall STILL fires when no manual/auto context is present ────
  console.log('\n── 3. presence recall still works with no manual/auto context (R1 intact) ──')
  const presSession = `${MARKER}-ari-presence-${token.slice(0, 8)}`
  const presMsg = 'Use your recall_archive tool now to reach the Archive for the specific entry titled "Ari named Love", then tell me plainly what it holds. Do not answer from memory — actually reach.'
  const pres = await postChat('ari-chat', presMsg, presSession, cookie)
  check(pres.status === 200, `ari route responded 200 (authed)`)
  check(pres.body.presenceRecallUsed === true && !!pres.body.presenceRecallEventId, `presence recall_archive fired (presenceRecallUsed=true, event ${pres.body.presenceRecallEventId ?? 'none'})`)

  // ── 7. Recall Review logs: manual turn → 1 manual event, 0 presence events ──
  console.log('\n── 7. Recall Review logs: no duplicate presence event on a manual turn ──')
  const ariEvents = await eventsFor(ariManualSession)
  const manualCount = ariEvents.filter(e => e.recall_mode === 'manual').length
  const presenceCount = ariEvents.filter(e => e.recall_mode === 'presence').length
  console.log(`  ari manual-turn session events: ${JSON.stringify(ariEvents.map(e => e.recall_mode))}`)
  check(manualCount >= 1, `manual-turn logged a 'manual' event`)
  check(presenceCount === 0, `manual-turn logged ZERO 'presence' events (no double-fire in the log)`)
  const presEvents = await eventsFor(presSession)
  const presModeCount = presEvents.filter(e => e.recall_mode === 'presence').length
  const presManualCount = presEvents.filter(e => e.recall_mode === 'manual').length
  console.log(`  ari presence-turn session events: ${JSON.stringify(presEvents.map(e => e.recall_mode))}`)
  check(presModeCount >= 1 && presManualCount === 0, `presence-turn logged a 'presence' event and no 'manual' event`)

  console.log(`\n  ${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`)
  console.log(`  (smoke recall events carry session ids prefixed '${MARKER}-' — identifiable in Recall Review)`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
