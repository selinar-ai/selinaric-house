// Governance verification: reasoning_audit_events + llm_reasoning_feedback_events
// Confirms no forbidden content and all governance flags correct.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
    if (!process.env[k]) process.env[k] = v
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

let ok = true
function check(label, pass, detail) {
  const m = pass ? '✓' : '✗'
  if (!pass) ok = false
  console.log(`  ${m} ${label}`)
  if (detail !== undefined) console.log(`      ${detail}`)
}

// ── reasoning_audit_events ────────────────────────────────────────────────
console.log('\n── reasoning_audit_events (last 5) ──')
const r1 = await fetch(`${URL}/rest/v1/reasoning_audit_events?select=*&order=created_at.desc&limit=5`, { headers: H })
const audit = await r1.json()
check('Table reachable', r1.ok, `HTTP ${r1.status}`)
check(`${audit.length} audit row(s) returned`, audit.length > 0)

// Forbidden COLUMN names — must not exist as keys in the row object
// (not substring search — exact column key check)
const FORBIDDEN_AUDIT_KEYS = ['evidence_summary','directly_supported','graph_supported',
  'inferred_only','missing_or_weak','authority_boundary','do_not_conclude',
  'raw_prompt','model_response','raw_content','ANTHROPIC_API_KEY',
  'draft_hash','packet_fingerprint','feedback_event_id',
  'prompt_text','system_prompt','draft_body','draft_json']

for (const row of audit) {
  const t = row.event_type
  console.log(`\n  Row: ${t} | status: ${row.event_status} | model: ${row.llm_model ?? 'n/a'} | condition: ${row.baseline_evidence_condition ?? 'n/a'}`)
  check(`${t}: authority_changed = false`, row.authority_changed === false, String(row.authority_changed))
  check(`${t}: not_evidence = true`,       row.not_evidence === true,       String(row.not_evidence))
  check(`${t}: prompt_eligible = false`,   row.prompt_eligible === false,   String(row.prompt_eligible))
  check(`${t}: review_routed = false`,     row.review_routed === false,     String(row.review_routed))
  // Check for forbidden column keys (not substring — exact key match)
  for (const f of FORBIDDEN_AUDIT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, f)) {
      check(`${t}: no forbidden column "${f}"`, false, 'column EXISTS in row')
    }
  }
  check(`${t}: no draft column keys present`, true, `columns: ${Object.keys(row).join(', ')}`)
}

// ── llm_reasoning_feedback_events ─────────────────────────────────────────
console.log('\n── llm_reasoning_feedback_events (last 3) ──')
const r2 = await fetch(`${URL}/rest/v1/llm_reasoning_feedback_events?select=*&order=created_at.desc&limit=3`, { headers: H })
const fb = await r2.json()
check('Table reachable', r2.ok, `HTTP ${r2.status}`)
check(`${fb.length} feedback row(s) returned`, fb.length > 0)

const FORBIDDEN_FB_KEYS = ['evidence_summary','directly_supported','raw_content','ANTHROPIC_API_KEY',
  'draft_hash','packet_fingerprint','raw_prompt','model_response','draft_body']

for (const row of fb) {
  console.log(`\n  Row: ${row.feedback_type} | suggestion: ${row.suggestion_id?.slice(0,8)}... | model: ${row.draft_model ?? 'n/a'}`)
  check(`${row.feedback_type}: authority_changed = false`, row.authority_changed === false, String(row.authority_changed))
  check(`${row.feedback_type}: not_evidence = true`,       row.not_evidence === true,       String(row.not_evidence))
  check(`${row.feedback_type}: prompt_eligible = false`,   row.prompt_eligible === false,   String(row.prompt_eligible))
  check(`${row.feedback_type}: review_routed = false`,     row.review_routed === false,     String(row.review_routed))
  for (const f of FORBIDDEN_FB_KEYS) {
    if (Object.prototype.hasOwnProperty.call(row, f)) {
      check(`${row.feedback_type}: no forbidden column "${f}"`, false, 'column EXISTS in row')
    }
  }
  check(`${row.feedback_type}: column keys`, true, Object.keys(row).join(', '))
}

console.log('\n══════════════════════════════════════════')
console.log(ok ? '  ALL GOVERNANCE CHECKS PASSED' : '  SOME CHECKS FAILED')
console.log('══════════════════════════════════════════\n')
process.exit(ok ? 0 : 1)
