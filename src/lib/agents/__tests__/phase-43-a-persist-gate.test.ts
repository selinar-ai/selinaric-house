/**
 * Phase 43.A — persist-real gate: pure unit tests + static guards over the patched runners.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-a-persist-gate.test.ts
 */

import * as fs from 'fs'
import { resolvePersistGate, findingCapRefusal } from '../persistence/gate'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

section('gate: default behaviour remains test-owned (byte-identical posture)')
{
  const g = resolvePersistGate(['--scope', 'whole_graph'])
  assert(g.ok === true, 'no flags → ok')
  if (g.ok) {
    assert(g.real === false, 'no flags → test-owned')
    assert(g.requestedBy === 'system', 'test-owned → requested_by system (unchanged 42.3.3a stamp)')
    assert(g.maxFindings === null, 'no cap flag → no cap (default unchanged)')
  }
}

section('gate: real requires BOTH flags; one alone refuses')
{
  const both = resolvePersistGate(['--persist-real', '--confirm-persist-real', '--max-findings', '40'])
  assert(both.ok === true && both.ok && both.real === true, 'both flags + cap → REAL')
  if (both.ok) assert(both.requestedBy === 'tara', 'real → requested_by tara (per-run Tara authorisation)')
  assert(resolvePersistGate(['--persist-real']).ok === false, '--persist-real alone refuses')
  assert(resolvePersistGate(['--confirm-persist-real']).ok === false, '--confirm-persist-real alone refuses')
}

section('gate: no real run may be unbounded; max-findings validation')
{
  assert(resolvePersistGate(['--persist-real', '--confirm-persist-real']).ok === false, 'real without --max-findings refuses')
  assert(resolvePersistGate(['--max-findings', '0']).ok === false, 'cap 0 refuses')
  assert(resolvePersistGate(['--max-findings', '-5']).ok === false, 'negative cap refuses')
  assert(resolvePersistGate(['--max-findings', 'abc']).ok === false, 'non-numeric cap refuses')
  assert(resolvePersistGate(['--max-findings']).ok === false, 'missing cap value refuses')
  const t = resolvePersistGate(['--max-findings', '10'])
  assert(t.ok === true && t.ok && t.maxFindings === 10 && t.real === false, 'cap alone is allowed for test-owned runs')
}

section('gate: cap refusal fires BEFORE persistence (pure check on built-report count)')
{
  assert(findingCapRefusal(31, { maxFindings: 40 }) === null, '31 findings under cap 40 → proceed')
  assert(findingCapRefusal(41, { maxFindings: 40 }) !== null, '41 findings over cap 40 → refuse')
  assert(findingCapRefusal(999, { maxFindings: null }) === null, 'no declared cap (test-owned default) → no refusal')
}

section('runners: gate wired in; report built before persist; stamps flow from gate')
const runners = ['scripts/agent-library-persist-findings.ts', 'scripts/agent-archive-graph-persist-findings.ts']
for (const rel of runners) {
  const s = readCode(rel)
  assert(s.includes('resolvePersistGate(process.argv.slice(2))'), `${rel}: resolves the gate from argv`)
  assert(s.includes('findingCapRefusal(report.findings.length, gate)'), `${rel}: cap checked against the BUILT report before persisting`)
  const capIdx = s.indexOf('findingCapRefusal('), persistIdx = s.indexOf('persistReport(')
  assert(capIdx >= 0 && persistIdx >= 0 && capIdx < persistIdx, `${rel}: cap refusal precedes persistReport`)
  assert(s.includes('requestedBy: gate.requestedBy'), `${rel}: requested_by comes from the gate (tara for real, system for test)`)
  assert(s.includes('testOwned: !gate.real'), `${rel}: test_owned derived from the gate (default stays test-owned)`)
}

section('no House mutation / no forbidden surfaces in the patched slice')
const slice = [...runners, 'src/lib/agents/persistence/gate.ts']
for (const rel of slice) {
  const s = readCode(rel)
  for (const tok of ['.insert(', '.delete(', '.upsert(', ".from('", '.from("',
    "'helper_outputs'", "'graph_proposals'", "'memory_nodes'", "'memory_edges'",
    "'archive_graph_nodes'", "'archive_graph_edges'", "'archive_items'", 'prompt_eligible']) {
    assert(!s.includes(tok), `${rel}: no ${tok}`)
  }
  for (const tok of ['qstash', 'cron', 'scheduler', 'daemon', 'setinterval']) {
    assert(!s.toLowerCase().includes(tok), `${rel}: no "${tok}"`)
  }
  for (const tok of ['anthropic', 'openai', 'gpt-', 'claude-', 'chat.completions', 'embedding']) {
    assert(!s.toLowerCase().includes(tok), `${rel}: no "${tok}"`)
  }
}
assert(!readCode('src/lib/agents/persistence/gate.ts').includes('.rpc('), 'gate.ts is pure — no RPC, no I/O')

section('no migration needed for 43.A (patch is code-only)')
{
  const migs = fs.readdirSync('supabase-migrations').filter((f) => f.endsWith('.sql')).sort()
  assert(migs[migs.length - 1].startsWith('089'), `latest migration is still 089 (found ${migs[migs.length - 1]})`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
