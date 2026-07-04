/**
 * Phase 43 R1.3 — Recall Corpus Coverage Fix (static guards).
 *
 * Proves the fix is EXACTLY corpus-retrieval coverage: the pre-scoring `.limit(500)` is gone,
 * replaced by paginated `.range()` full-corpus retrieval ordered by a stable pagination key;
 * and that NOTHING downstream changed — scoring weights, textScore gate, status filter,
 * two-pass sensitivity gate, caps, logging, and the three recall modes are all intact.
 * The behavioural corpus-coverage proof (target absent under old fetch / present under new,
 * manual returns it, presence still excludes it) is the live-DB smoke: scripts/r1-3-corpus-smoke.ts.
 *
 * Run: npx tsx src/lib/agents/__tests__/phase-43-r1-3-corpus-coverage.test.ts
 */

import * as fs from 'fs'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }
function read(rel: string): string { if (!fs.existsSync(rel)) throw new Error(`not found: ${rel}`); return fs.readFileSync(rel, 'utf8') }

const RECALL = 'src/lib/archive-recall.ts'

section('the arbitrary pre-scoring truncation is gone')
{
  const s = read(RECALL)
  // The whole bug: an unordered fixed cap on the candidate fetch. It must not exist anywhere
  // in executable code. Strip line-comments first so the fix's own explanatory comment (which
  // names the removed `.limit(500)` for the record) doesn't read as a false positive.
  const code = s.split('\n').map(l => { const i = l.indexOf('//'); return i >= 0 ? l.slice(0, i) : l }).join('\n')
  assert(!code.includes('.limit(500)'), `${RECALL}: fixed .limit(500) pre-scoring cap removed from executable code`)
}

section('full eligible corpus is fetched via stable pagination')
{
  const s = read(RECALL)
  // scope the assertions to the main retrieval fetch block
  const fetchStart = s.indexOf("const PAGE = 1000")
  const fetchEnd = s.indexOf('const inScope =')
  assert(fetchStart >= 0 && fetchEnd > fetchStart, `${RECALL}: paginated fetch block present`)
  const block = s.slice(fetchStart, fetchEnd)
  assert(block.includes('.range(from, from + PAGE - 1)'), `${RECALL}: pages via .range()`)
  assert(block.includes("from += PAGE"), `${RECALL}: advances by page size across pages`)
  assert(block.includes(".order('id', { ascending: true })"), `${RECALL}: ordered by id — stable pagination key`)
  assert(block.includes('data.length < PAGE'), `${RECALL}: terminates on a short (final) page`)
  // the order is documented as pagination-only, NOT relevance (guards against future misuse)
  assert(block.includes('not relevance') || block.includes('not a relevance'), `${RECALL}: order documented as pagination-only, not relevance`)
  // still filtered to the requested statuses and non-deleted — status filtering preserved
  assert(block.includes(".in('canonical_status', statuses)"), `${RECALL}: status filtering preserved in the paged fetch`)
  assert(block.includes(".is('deleted_at', null)"), `${RECALL}: soft-delete exclusion preserved in the paged fetch`)
  // same column projection as before (no shape change)
  assert(block.includes("'id, title, excerpt, raw_content, archive_name, owner_presence, source_origin, '"), `${RECALL}: identical column projection`)
}

section('scoring is untouched — no weight change (R1.3 is coverage only)')
{
  const s = read(RECALL)
  // exact weight table — any drift here would be an unauthorised scoring change
  const expected = [
    'title_exact:        100',
    'title_token:         60',
    'multi_token_title:   30',
    'excerpt:             40',
    'content:             20',
    'category:            10',
    'source_doc:           5',
    'import_label:         2',
    'memory_bonus:         5',
    'qualifier_boost:     50',
    'qualifier_dampen:   -40',
  ]
  for (const line of expected) assert(s.includes(line), `${RECALL}: weight unchanged — ${line.trim()}`)
  // the scoring function is still what the pipeline calls; the textScore>0 gate is intact
  assert(s.includes('.map(item => ({ item, ...scoreItem(item, tokens, query) }))'), `${RECALL}: scoreItem still drives ranking`)
  assert(s.includes('.filter(({ textScore }) => textScore > 0)'), `${RECALL}: textScore>0 gate preserved`)
}

section('downstream gates, caps, and sort preserved')
{
  const s = read(RECALL)
  // two-pass elevated sensitivity gate — sensitivity behaviour unchanged
  assert(s.includes('options?.excludeElevatedSensitivity'), `${RECALL}: elevated-sensitivity gate preserved`)
  assert(s.includes('ELEVATED_SENSITIVITIES.includes(item.sensitivity)'), `${RECALL}: elevated set still consulted`)
  // returned-result cap: safeLimit ≤ 10, applied AFTER scoring via slice (not on the fetch)
  assert(s.includes('const safeLimit = Math.min(Math.max(1, limit), 10)'), `${RECALL}: returned-result cap unchanged`)
  assert(s.includes('.slice(0, safeLimit)'), `${RECALL}: top-N slice applied after sort`)
  // sort by totalScore then canonical then recency — relevance ordering unchanged
  assert(s.includes('if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore'), `${RECALL}: score-desc primary sort preserved`)
}

section('presence scope filtering preserved')
{
  const s = read(RECALL)
  assert(s.includes('.filter(item => isInScope(item, presenceId))'), `${RECALL}: presence-scope filter still applied to the full corpus`)
}

section('event logging + the three recall modes intact (not touched by R1.3)')
{
  const s = read(RECALL)
  assert(s.includes("export type RecallMode = 'manual' | 'auto' | 'presence'"), `${RECALL}: manual|auto|presence modes intact`)
  const logSrc = read('src/lib/archive-recall.ts')
  assert(logSrc.includes('logRecallEvent'), `${RECALL}: logRecallEvent still present`)
}

section('A2-sec — recall is only reachable behind chat-route auth (unchanged)')
{
  for (const rel of ['src/app/api/ari-chat/route.ts', 'src/app/api/eli-chat/route.ts']) {
    const s = read(rel)
    const authIdx = s.indexOf('requireHouseApiAuth(request)')
    const tryIdx = s.indexOf('try {', s.indexOf('export async function POST'))
    assert(authIdx >= 0 && authIdx < tryIdx, `${rel}: auth remains first op, above the try (no recall/context/model before 401)`)
  }
}

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
