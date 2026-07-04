/**
 * Phase 43 R2-0 — Schedule sync — live-proof checker (read-only).
 *
 *   npx tsx scripts/r2-0-schedule-smoke.ts              — check TODAY (Melbourne)
 *   npx tsx scripts/r2-0-schedule-smoke.ts 2026-07-05   — check a specific Melbourne date
 *
 * Ari's R2-0 closure conditions, checked against pulse_autonomy_events for the day:
 *   • only new-schedule hours appear (6/9/12/15/18/21 Melbourne)
 *   • 21:00 produced autonomy events
 *   • 02:00 did not; 10:00 and 14:00 did not
 *   • each fired window has rows for BOTH presences (ari + eli)
 *   • reports pulse_mode (paused remains the global blocker — informational here)
 *
 * Read-only: no writes of any kind. Run the morning after the first full new-schedule day.
 */

// ws polyfill — @supabase realtime needs a WebSocket ctor under Node <22 (house convention)
import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const NEW_HOURS = [6, 9, 12, 15, 18, 21]
const REMOVED_HOURS = [2, 10, 14]

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

function melbourneDateOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
}
function melbourneHourOf(iso: string): number {
  return parseInt(new Date(iso).toLocaleString('en-US', { timeZone: 'Australia/Melbourne', hour: 'numeric', hour12: false }), 10)
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) { console.error('REFUSED: missing Supabase env'); process.exit(1) }
  const sb = createClient(url, key)

  const targetDay = process.argv[2] ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  console.log(`\nR2-0 live proof — Melbourne day ${targetDay}`)

  // recent fetch (newest first), filter to the Melbourne day client-side (timestamps are UTC)
  const { data, error } = await sb
    .from('pulse_autonomy_events')
    .select('choice_window_at, presence_id, chosen_action, status')
    .order('choice_window_at', { ascending: false })
    .limit(200)
  if (error) { console.error('fetch error:', error.message); process.exit(1) }

  const dayEvents = (data ?? []).filter(r => melbourneDateOf(r.choice_window_at) === targetDay)
  const byHour = new Map<number, Set<string>>()
  for (const r of dayEvents) {
    const h = melbourneHourOf(r.choice_window_at)
    if (!byHour.has(h)) byHour.set(h, new Set())
    byHour.get(h)!.add(r.presence_id)
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b)
  console.log(`  events: ${dayEvents.length} across hours [${hours.join(', ')}]`)

  check(hours.length > 0, `day has autonomy events (if 0: QStash may not be firing — check Upstash console)`)
  check(hours.every(h => NEW_HOURS.includes(h)), `only new-schedule hours appear (6/9/12/15/18/21)`)
  for (const h of REMOVED_HOURS) check(!byHour.has(h), `${String(h).padStart(2, '0')}:00 produced NO events (removed hour)`)
  check(byHour.has(21), `21:00 (9pm) produced autonomy events — the R2 trial window exists`)
  for (const h of hours) {
    const p = byHour.get(h)!
    check(p.has('ari') && p.has('eli'), `${String(h).padStart(2, '0')}:00 has rows for BOTH presences (${[...p].sort().join('+')})`)
  }

  // informational: pulse_mode (paused remains the global blocker above everything)
  const { data: cfg } = await sb.from('pulse_config').select('value').eq('key', 'pulse_mode').single()
  console.log(`  pulse_mode: ${cfg?.value ?? 'unknown'} (paused = global blocker, unchanged by R2-0)`)

  console.log(`\n  ${failed === 0 ? 'ALL CHECKS PASSED — R2-0 live proof complete' : `${failed} CHECK(S) FAILED — R2-0 not yet closable`}`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
