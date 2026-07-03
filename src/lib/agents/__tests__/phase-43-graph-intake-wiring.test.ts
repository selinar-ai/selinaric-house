/**
 * Gate A-R — static guards over the eligible_for_graph intake wiring.
 * The flag becomes the ontology intake gate; ledger stays idempotency; display unfiltered.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-graph-intake-wiring.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }
function readCode(rel: string): string { return read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') }

const AG = 'src/lib/archive-graph.ts'
const GRAIN = 'src/lib/graph/grainHelper.ts'
const CAND = 'src/lib/graph/candidateSuggestionService.ts'
const PATCH = 'src/app/api/archives/[id]/route.ts'
const BULK = 'src/app/api/archive-memory/bulk/route.ts'

section('29B extraction: flag enforced in BOTH preview and run selection; canonical only')
{
  const s = readCode(AG)
  const selects = [...s.matchAll(/from\('archive_items'\)[\s\S]{0,400}?\.eq\('archive_name', archiveName\)/g)].map((m) => m[0])
  assert(selects.length === 2, `exactly two archive_items selections found (preview + run), saw ${selects.length}`)
  for (const [i, sel] of selects.entries()) {
    assert(sel.includes(".eq('canonical_status', 'canonical')"), `selection #${i + 1}: canonical only`)
    assert(sel.includes(".eq('eligible_for_graph', true)"), `selection #${i + 1}: flag enforced`)
    assert(!sel.includes('canonical_candidate'), `selection #${i + 1}: canonical_candidate no longer admitted`)
  }
  // ledger idempotency preserved: the extracted-union mechanism is untouched
  assert(s.includes('processed_archive_item_ids') && s.includes('extractedSet'), 'processed-ledger union (idempotency) preserved')
  assert(s.includes('ELEVATED_SENSITIVITIES'), 'sensitivity gate preserved')
  assert(s.includes('MAX_ITEMS_PER_RUN'), 'cap/run behaviour preserved')
  // no new LLM path: exactly ONE model call site, the existing human/admin-triggered one
  const llmCalls = [...s.matchAll(/anthropic\.messages\.create/g)]
  assert(llmCalls.length === 1, `exactly one existing Claude call site (saw ${llmCalls.length})`)
}

section('37F grain: flag enforced in source selection; canonical only')
{
  const s = readCode(GRAIN)
  assert(s.includes(".eq('canonical_status', 'canonical')") && s.includes(".eq('eligible_for_graph', true)"), 'grain source selection is flag-gated + canonical-only')
  assert(!/in\('canonical_status'/.test(s), 'grain no longer admits canonical_candidate')
  for (const tok of ['anthropic', 'openai']) assert(!s.toLowerCase().includes(tok), `grain has no LLM (${tok})`)
}

section('candidate-suggestion creation: BOTH intake points refuse non-eligible items, no side door')
{
  const s = read(CAND)
  const gates = [...s.matchAll(/eligible_for_graph !== true/g)]
  assert(gates.length === 2, `two intake gates (supporting sources + target item), saw ${gates.length}`)
  assert((s.match(/not graph-eligible \(eligible_for_graph=false\)/g) ?? []).length === 2, 'both refusals carry the clear error')
  assert(s.includes("select('id, canonical_status, deleted_at, eligible_for_graph')"), 'flag fetched server-side (never client-supplied)')
}

section('display surfaces remain UNFILTERED')
{
  const card = read('src/components/ArchiveItemCard.tsx')
  assert(card.includes('eligible_for_graph') && !card.includes(".eq('eligible_for_graph'"), 'ArchiveItemCard displays the flag, filters nothing')
  const archivesLib = readCode('src/lib/archives.ts')
  assert(!archivesLib.includes(".eq('eligible_for_graph'"), 'archives listing library does not filter by the flag')
}

section('legacy PATCH hardened: auth BEFORE params/body/DB; single-item eligibility audit')
{
  const s = read(PATCH)
  const authIdx = s.indexOf('requireHouseApiAuth(request)')
  const paramsIdx = s.indexOf('await context.params')
  const bodyIdx = s.indexOf('await request.json()')
  const dbIdx = s.indexOf(".from('archive_items')")
  assert(authIdx >= 0 && authIdx < paramsIdx && authIdx < bodyIdx && authIdx < dbIdx, 'auth precedes params, body parsing, and any DB access')
  assert(s.includes("'graph_eligibility_mark'") && s.includes("'graph_eligibility_unmark'"), 'single-item flips write mark/unmark audit events')
  assert(s.includes("from('archive_eligibility_events')") && s.includes('item_ids: [id]'), 'audit uses archive_eligibility_events with item-id traceability')
  assert(s.includes("created_by: 'tara'"), 'audit actor is server-derived tara')
  assert(s.includes('eligAuditErr') && s.includes('console.error'), 'audit failure is logged, never fails the PATCH (27D convention)')
  // pre-existing guards preserved
  assert(s.includes("may only be true when canonical_status is 'canonical'"), 'canonical-only eligibility guard preserved')
  assert(s.includes('patch.eligible_for_graph = false'), 'single-item demotion still clears the flag')
}

section('legacy DELETE hardened: auth FIRST, before params/validation/DB (Ari pre-merge requirement)')
{
  const s = read(PATCH)
  const delIdx = s.indexOf('export async function DELETE')
  const del = s.slice(delIdx)
  const authIdx = del.indexOf('requireHouseApiAuth(request)')
  const paramsIdx = del.indexOf('await context.params')
  const dbIdx = del.indexOf(".from('archive_items')")
  assert(delIdx >= 0 && authIdx >= 0, 'DELETE handler calls requireHouseApiAuth')
  assert(authIdx < paramsIdx && authIdx < dbIdx, 'DELETE auth precedes params parsing and any DB access')
  assert(del.includes('!auth.ok') && del.includes('auth.status'), 'DELETE returns the auth status first')
  assert(del.includes('deleted_at: new Date().toISOString()') && del.includes(".is('deleted_at', null)"), 'DELETE remains soft-delete-only with already-deleted guard (behaviour unchanged)')
  assert(!del.includes('.delete('), 'DELETE performs no hard delete')
}

section('bulk demote clears eligibility flags exactly like the single PATCH')
{
  const s = read(BULK)
  assert(/toStatus !== 'canonical'[\s\S]{0,220}eligible_for_recall = false[\s\S]{0,120}eligible_for_embedding = false[\s\S]{0,120}eligible_for_graph = false/.test(s), 'bulk demotion clears all three flags')
  assert(s.includes('confirm_memory') && s.includes('eligible_for_recall = true'), '30B confirm behaviour preserved')
}

section('no forbidden surfaces in the wiring diff; helpers/agents cannot reach the flag')
for (const rel of [AG, GRAIN, CAND, PATCH, BULK]) {
  const s = readCode(rel).toLowerCase()
  for (const tok of ['qstash', 'cron(', 'scheduler', 'daemon', 'setinterval']) assert(!s.includes(tok), `${rel}: no "${tok}"`)
  for (const tok of ["approved_graph'", 'prompt_eligible = true', 'memory_nodes', 'memory_edges']) {
    // candidate service VERIFIES proposal status and grain READS approved proposals to
    // group labels — both are read-only, designed inputs, not truth writes
    if ((rel === CAND || rel === GRAIN) && tok === "approved_graph'") continue
    assert(!s.includes(tok), `${rel}: no "${tok}"`)
  }
}
{
  // the flag must be unreachable from the helper/agent layers entirely
  const dirs = ['src/lib/helpers', 'src/lib/agents']
  let hits = 0
  for (const dir of dirs) {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])
    for (const f of walk(dir).filter((f) => f.endsWith('.ts') && !f.includes('__tests__'))) {
      if (read(f).includes('eligible_for_graph')) hits++
    }
  }
  assert(hits === 0, `no helper/agent source file references eligible_for_graph (saw ${hits})`)
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
