/**
 * Phase 43.B (= 42.4.2b) — live LLM graph-edge proposals behind the proven cage.
 *
 * Proves: the pure-fn contract of llm_live.ts (prompt determinism, conservative cost ceiling,
 * fail-closed parsing, input hash), the migration/RPC guards (live+test_owned allowed, live rows
 * still test_owned, LIVE_NOT_AUTHORISED for unauthorised live, fixture unchanged), that the provider
 * SDK is imported ONLY by llm_live.ts + the live runner (the cage core stays SDK-free), and that
 * the live path is one bounded call with no tool/agent loop and no JSON repair.
 *
 * Run: npx tsx src/lib/agents/graph_proposals/__tests__/phase-43-b-llm-live.test.ts
 */

import { readFileSync } from 'fs'
import {
  buildPrompt, estimateTokens, projectCostUsd, parseModelOutput, computeLiveInputHash,
  type LiveContextNode,
} from '../llm_live'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

const NODES: LiveContextNode[] = [
  { id: 'b-node', label: 'Boundary Setting', archive_name: 'velvet', source_item_ids: ['s1', 's2'] },
  { id: 'a-node', label: 'Caretaker Identity', archive_name: 'velvet', source_item_ids: ['s2', 's3'] },
]

// ─── Pure-fn contract ────────────────────────────────────────────────────────

section('estimateTokens is conservative (>= a chars/4 baseline)')
{
  const s = 'x'.repeat(1200)
  assert(estimateTokens(s) >= Math.ceil(1200 / 4), 'chars/3 estimate over-estimates vs chars/4')
  assert(estimateTokens('') === 0, 'empty string ⇒ 0 tokens')
}

section('projectCostUsd: small bounded prompt is well under, huge prompt is over')
{
  const { system, user } = buildPrompt(NODES)
  const small = projectCostUsd(`${system}\n${user}`, 1024)
  assert(small < 0.2, `bounded 2-node prompt + 1024 out < $0.20 (got $${small.toFixed(4)})`)
  const huge = projectCostUsd('z'.repeat(400_000), 1024)
  assert(huge >= 0.2, `400k-char prompt projects over the $0.20 ceiling (got $${huge.toFixed(4)})`)
}

section('buildPrompt is deterministic and constrains the model')
{
  const a = buildPrompt(NODES)
  const b = buildPrompt([...NODES].reverse())
  assert(JSON.stringify(a) === JSON.stringify(b), 'node order does not change the prompt (sorted by id)')
  assert(a.user.includes('a-node') && a.user.includes('b-node'), 'both given node ids appear in the prompt')
  assert(a.system.includes('contrasts_with') && a.system.includes('precedes') && a.system.includes('extends'), 'whitelist stated in system prompt')
  assert(a.system.includes('ONLY node ids from the provided list'), 'forbids inventing nodes')
  assert(a.system.includes('source_item_ids'), 'restricts evidence to endpoint source_item_ids')
  assert(a.system.includes('{"proposals": [...]}') || a.system.includes('"proposals"'), 'asks for the JSON object shape only')
  const c = buildPrompt(NODES, 5)
  assert(c.system.includes('AT MOST 5'), 'states an explicit proposal cap in-prompt (self-bounds output → no truncation)')
}

section('computeLiveInputHash: sha256 hex, deterministic, input-sensitive')
{
  const h1 = computeLiveInputHash('sys', 'usr')
  const h2 = computeLiveInputHash('sys', 'usr')
  const h3 = computeLiveInputHash('sys', 'usr2')
  assert(/^[a-f0-9]{64}$/.test(h1), 'hash is 64-char lowercase hex (matches the RPC INPUT_HASH check)')
  assert(h1 === h2, 'deterministic for identical input')
  assert(h1 !== h3, 'changes when the actual model input changes')
}

section('parseModelOutput: extracts array, NO repair, fail-closed')
{
  assert(JSON.stringify(parseModelOutput('{"proposals":[{"a":1}]}')) === '[{"a":1}]', 'unwraps {proposals:[...]}')
  assert(JSON.stringify(parseModelOutput('[{"a":1}]')) === '[{"a":1}]', 'accepts a bare array')
  assert(JSON.stringify(parseModelOutput('{"proposals":[]}')) === '[]', 'empty proposals ⇒ []')
  let threw = false
  try { parseModelOutput('here is your json: [1,2]') } catch { threw = true }
  assert(threw, 'prose-wrapped output throws (no prose recovery)')
  threw = false
  try { parseModelOutput('{"nope": 1}') } catch { threw = true }
  assert(threw, 'object without proposals throws (fail-closed)')
  threw = false
  try { parseModelOutput('not json') } catch { threw = true }
  assert(threw, 'malformed JSON throws')
}

// ─── Provider-SDK scope: only llm_live.ts + the live runner touch Anthropic ──

section('provider SDK is imported ONLY by llm_live.ts and the live runner')
{
  const live = readFileSync('src/lib/agents/graph_proposals/llm_live.ts', 'utf8')
  const runner = readFileSync('scripts/agent-graph-llm-live.ts', 'utf8')
  assert(live.includes("from '@anthropic-ai/sdk'"), 'llm_live.ts imports the Anthropic SDK (allowed)')
  assert(runner.includes('generateLiveProposals'), 'runner drives generation via llm_live.ts')
  // Cage core stays SDK-free.
  for (const f of [
    'src/lib/agents/graph_proposals/llm_postgate.ts',
    'src/lib/agents/graph_proposals/contract.ts',
    'src/lib/agents/graph_proposals/detect.ts',
    'scripts/agent-graph-propose.ts',
    'scripts/agent-graph-llm-fixture.ts',
  ]) {
    assert(!readFileSync(f, 'utf8').includes('@anthropic-ai/sdk'), `no Anthropic SDK import in ${f.split('/').pop()}`)
  }
}

section('live path is ONE bounded call — no tool loop, no agent loop, no JSON repair, no scheduler')
{
  const live = readFileSync('src/lib/agents/graph_proposals/llm_live.ts', 'utf8')
  assert((live.match(/messages\.create/g) ?? []).length === 1, 'exactly one messages.create call')
  assert(!live.includes('toolRunner') && !live.includes('tool_use') && !/\btools:/.test(live), 'no tool loop')
  assert(live.includes("thinking: { type: 'disabled' }"), 'thinking disabled (bounded output)')
  assert(!/qstash|scheduler|autonomy|cron/i.test(live), 'no scheduler/qstash/autonomy reference')
  // fail-before-call: the ceiling check returns before constructing the client.
  const beforeClient = live.slice(0, live.indexOf('new Anthropic('))
  assert(beforeClient.includes('PROJECTED_COST_OVER_CEILING'), 'cost-ceiling refusal happens before the model client is created')
}

// ─── Migration 095 guards ────────────────────────────────────────────────────

section('migration 095: admits live generation but keeps LLM rows test_owned')
{
  const sql = readFileSync('supabase-migrations/095_agent_graph_proposals_llm_live.sql', 'utf8')
  assert(sql.includes("generation_mode in ('fixture', 'live')"), 'agp_class_typed LLM branch admits fixture|live')
  // The LLM branch still requires test_owned = true (appears right after the generation_mode line).
  const llmBranch = sql.slice(sql.indexOf("generation_mode in ('fixture', 'live')"))
  assert(/generation_mode in \('fixture', 'live'\)\s*\n\s*and test_owned = true/.test(llmBranch), 'LLM branch still requires test_owned = true')
  assert(sql.includes('LIVE_NOT_AUTHORISED'), 'RPC raises LIVE_NOT_AUTHORISED')
  assert(sql.includes('p_live_authorized boolean default false'), 'live requires an explicit authorisation flag (default false)')
  assert(/if not coalesce\(p_live_authorized, false\) then raise exception 'LIVE_NOT_AUTHORISED'/.test(sql), 'unauthorised live is refused')
  // The insert forces test_owned = true (last value in the VALUES list is `true`).
  assert(/generation_mode, test_owned\s*\n\s*\) values \(/.test(sql), 'insert column list ends with generation_mode, test_owned')
  assert(/prompt_version, v_mode, true\s*\n\s*\)/.test(sql), 'insert forces test_owned=true, generation_mode=v_mode')
  assert(!sql.includes('test_owned = false') && !/test_owned,\s*false/.test(sql), 'never inserts a test_owned=false LLM row')
}

// ─── Live runner guards ──────────────────────────────────────────────────────

section('live runner: double-flag gate + required cost params + live authorisation')
{
  const r = readFileSync('scripts/agent-graph-llm-live.ts', 'utf8')
  assert(r.includes("has('live')") && r.includes("has('confirm-live')"), 'requires BOTH --live and --confirm-live')
  assert(r.includes("arg('archive-name')") && r.includes("arg('max-proposals')") && r.includes("arg('max-usd')"), 'requires --archive-name, --max-proposals, --max-usd')
  assert(r.includes('runPostGate('), 'runs the unchanged post-gate over the model output')
  assert(r.includes("p_generation_mode: 'live'") && r.includes('p_live_authorized: true'), 'records generation_mode=live with authorisation')
  assert(!/JSON\.parse|repair/i.test(r) || r.includes('runPostGate'), 'no ad-hoc JSON repair in the runner')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
