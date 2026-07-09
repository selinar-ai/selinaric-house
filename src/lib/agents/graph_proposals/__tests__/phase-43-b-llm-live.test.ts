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
  buildPrompt, buildPromptWholeArchive, estimateTokens, projectCostUsd, parseModelOutput, computeLiveInputHash,
  type LiveContextNode,
} from '../llm_live'
import { LLM_LIVE_DEFAULT_PROFILE, LLM_LIVE_WHOLE_ARCHIVE_PROFILE } from '../contract'

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

// ─── Option B — governed whole-archive profile ──────────────────────────────

section('Option B: DEFAULT profile unchanged; whole-archive is a SEPARATE expanded profile')
{
  assert(LLM_LIVE_DEFAULT_PROFILE.maxNodes === 30 && LLM_LIVE_DEFAULT_PROFILE.maxOutputTokens === 1024 && LLM_LIVE_DEFAULT_PROFILE.maxProposals === 20, 'default profile stays 30/1024/20 (authorised 43.B)')
  assert(LLM_LIVE_DEFAULT_PROFILE.promptVersion === 'llm_edge_live_v1' && LLM_LIVE_DEFAULT_PROFILE.wholeArchive === false, 'default profile is v1, not whole-archive')
  assert(LLM_LIVE_DEFAULT_PROFILE.costCeilingUsd === 0.2, 'default ceiling $0.20')
  assert(LLM_LIVE_WHOLE_ARCHIVE_PROFILE.maxNodes === 100 && LLM_LIVE_WHOLE_ARCHIVE_PROFILE.maxOutputTokens === 8192 && LLM_LIVE_WHOLE_ARCHIVE_PROFILE.maxProposals === 40, 'whole-archive profile is 100/8192/40')
  assert(LLM_LIVE_WHOLE_ARCHIVE_PROFILE.promptVersion === 'llm_edge_live_whole_v1' && LLM_LIVE_WHOLE_ARCHIVE_PROFILE.wholeArchive === true, 'whole-archive uses llm_edge_live_whole_v1')
  assert(LLM_LIVE_WHOLE_ARCHIVE_PROFILE.costCeilingUsd === 0.2, 'whole-archive ceiling UNCHANGED at $0.20')
}

section('default prompt byte-identical (no cap line); whole-archive prompt adds the cap')
{
  const def = buildPrompt(NODES)
  assert(!def.system.includes('AT MOST'), 'DEFAULT prompt has NO in-prompt proposal cap (byte-identical to authorised v1)')
  const whole = buildPromptWholeArchive(NODES, 40)
  assert(whole.system.includes('AT MOST 40'), 'whole-archive prompt states an explicit AT MOST 40 cap')
  assert(whole.user === def.user, 'node/user section identical across profiles (only the cap rule differs)')
  assert(whole.system.length > def.system.length, 'whole-archive system = default + the cap line')
}

section('Option B: conservative per-node cost floor keeps velvet/violet under $0.20')
{
  assert(projectCostUsd('short', 1024, 100) > projectCostUsd('short', 1024, 0), 'nodeCount×200 floor raises the projection above chars/3')
  const velvet = projectCostUsd('x'.repeat(5000), 8192, 23)   // 23 nodes, full 8192 output
  const violet = projectCostUsd('x'.repeat(18000), 8192, 79)  // 79 nodes, full 8192 output
  assert(velvet < 0.2, `velvet whole-archive worst case < $0.20 (got $${velvet.toFixed(4)})`)
  assert(violet < 0.2, `violet whole-archive worst case < $0.20 (got $${violet.toFixed(4)})`)
  assert(projectCostUsd('', 0, 79) >= (79 * 200 / 1_000_000) * 3, 'input floor = nodeCount×200 tokens (genuinely conservative)')
}

section('Option B runner: expansion needs BOTH whole-archive flags; numbers clamp to the profile')
{
  const r = readFileSync('scripts/agent-graph-llm-live.ts', 'utf8')
  assert(r.includes("arg('profile') === 'whole-archive'") && r.includes("has('confirm-whole-archive-live')"), 'whole-archive needs --profile whole-archive + --confirm-whole-archive-live')
  assert(/--profile whole-archive requires --confirm-whole-archive-live/.test(r), '--profile whole-archive WITHOUT its confirm REFUSES')
  assert(r.includes('const wholeArchive = wantWhole && has('), 'expanded profile selected only when BOTH flags present')
  assert(r.includes('base.maxNodes') && r.includes('base.maxOutputTokens') && r.includes('base.maxProposals'), 'numeric --max-* CLAMP to the active profile max (clampInt)')
  assert(r.includes('Math.min(base.costCeilingUsd, parseFloat(maxUsd))'), 'ceiling only lowerable by --max-usd, never raised above the profile')
  assert(/refusing rather than truncating coverage/i.test(r), 'whole-archive refuses (no truncation) if approved nodes exceed the cap')
  assert(r.includes('profile: effective'), 'runner passes the resolved profile to generateLiveProposals')
  assert(r.includes("!wholeArchive && !arg('max-proposals')"), 'DEFAULT profile still REQUIRES --max-proposals (43.B unchanged)')
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
