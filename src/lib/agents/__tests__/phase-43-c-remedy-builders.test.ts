/**
 * Phase 43.C — pure builder tests: title parse vectors, URL predicate parity, null/blank handling.
 * Run: npx tsx src/lib/agents/__tests__/phase-43-c-remedy-builders.test.ts
 */

import {
  derivePhaseLabelFromTitle,
  buildPhaseLabelBackfillPlan,
  buildSourceUrlClearPlan,
  REMEDY_ACTION_PHASE_LABEL_BACKFILL,
  REMEDY_ACTION_SOURCE_URL_CLEAR,
} from '../packs/library/remedy'
import { isValidHttpUrl } from '../../helpers/sourceReferenceIntegrityHelper'

let passed = 0, failed = 0
const failures: string[] = []
function assert(c: boolean, l: string) { if (c) { passed++; console.log(`  ✓ ${l}`) } else { failed++; failures.push(l); console.log(`  ✗ ${l}`) } }
function section(n: string) { console.log(`\n── ${n} ──`) }

section('A1 title parse — the strict first-em-dash rule (Ari vector list)')
const PARSE_VECTORS: [string, string | null][] = [
  ['Phase 12A — Interior Notes v1', 'Interior Notes v1'],                                      // standard em-dash
  ['Phase 11B— Stage 2: The Pulse — Draft Review Engine', 'Stage 2: The Pulse — Draft Review Engine'], // no-space em-dash; later em-dash stays IN the label
  ['Phase 36 — Cross-Room Continuity - Vision Doc', 'Cross-Room Continuity - Vision Doc'],     // hyphen inside label is fine
  ['Phase 5B (5.5) — Memory Summarisation', 'Memory Summarisation'],
  ['Phase 7A_1 — Stabilisation Patch', 'Stabilisation Patch'],
  ['Phase 1 - House Shell', null],                                                             // ordinary hyphen → fail closed
  ['Phase 2B', null],                                                                          // no dash at all
  ['Phase 9 —   ', null],                                                                      // blank capture → fail closed
  ['Random — thing', null],                                                                    // no "Phase " prefix
  ['Phase— missing code space', null],                                                         // prefix requires the space
]
for (const [title, want] of PARSE_VECTORS) {
  assert(derivePhaseLabelFromTitle(title) === want, `"${title}" → ${JSON.stringify(want)}`)
}

section('A2 URL predicate — SQL-twin parity locked by shared vectors')
// The SQL twin in migration 090: v ~* '^https?://\S+$'. JS mirror below.
const SQL_TWIN = /^https?:\/\/\S+$/i
const EXCERPT = '"Tighten the edges. Protect the bones." Purpose Four targeted fixes applied after Phase 7A review'
const PARITY_VECTORS = [
  'https://example.com/path?q=1', 'http://x', 'HTTPS://EXAMPLE.COM/A',
  '', '   ', 'www.example.com', 'ftp://files.example.com', '/relative/path',
  'not a url', 'https://', 'https://exa mple.com', EXCERPT,
]
for (const v of PARITY_VECTORS) {
  assert(SQL_TWIN.test(v) === isValidHttpUrl(v), `parity on ${JSON.stringify(v.slice(0, 40))}`)
}
assert(!isValidHttpUrl(EXCERPT) && !SQL_TWIN.test(EXCERPT), 'the production excerpt is malformed under BOTH definitions')
// Known divergences (outside the parity set) are BOTH fail-closed for the Hand:
//  - helper-valid / twin-invalid: the helper never flags these → no finding → A2 unreachable.
//    Two members: scheme-without-slashes, and WHATWG's space-stripping (new URL('  https://x')
//    trims leading/trailing spaces before parsing, so the helper accepts it).
assert(isValidHttpUrl('https:example.com') && !SQL_TWIN.test('https:example.com'), 'divergence class 1a (no slashes) is unreachable (no finding is ever created)')
assert(isValidHttpUrl('  https://x') && !SQL_TWIN.test('  https://x'), 'divergence class 1b (WHATWG space-stripping) is unreachable (no finding is ever created)')
//  - helper-invalid / twin-valid (e.g. 'https://%'): the RPC twin raises URL_NOT_MALFORMED
//    → refuses to record/apply. Fail closed, no write.
assert(!isValidHttpUrl('https://%') && SQL_TWIN.test('https://%'), 'divergence class 2 exists and fail-closes at the RPC (URL_NOT_MALFORMED)')

section('A1 builder — eligibility fail-closed + faithful inverse + observed-title provenance')
const A1_OK = { findingId: 'f1', targetId: 't1', collection: 'development_documentation', phaseCode: '12A', phaseNumber: 12, currentLabel: null, title: 'Phase 12A — Interior Notes v1' }
{
  const p = buildPhaseLabelBackfillPlan(A1_OK)
  assert(p !== null && p.action_type === REMEDY_ACTION_PHASE_LABEL_BACKFILL && p.target_field === 'phase_label', 'eligible item → A1 plan')
  assert(p !== null && p.proposed_value === 'Interior Notes v1', 'proposed = derived label')
  assert(p !== null && p.current_value === null, 'inverse faithfully records prior SQL NULL')
  assert(p !== null && p.deterministic_reason.includes(A1_OK.title), 'reason carries the OBSERVED TITLE verbatim (provenance)')
}
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, collection: 'books' }) === null, 'wrong collection → null')
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, phaseCode: null }) === null, 'missing phase_code → null')
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, phaseCode: '  ' }) === null, 'blank phase_code → null')
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, phaseNumber: null }) === null, 'missing phase_number → null')
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, currentLabel: 'Already Here' }) === null, 'non-blank existing label → null (A1 hardening)')
{
  const p = buildPhaseLabelBackfillPlan({ ...A1_OK, currentLabel: '  ' })
  assert(p !== null && p.current_value === '  ', 'blank-string prior label allowed; inverse records the exact blank string')
}
assert(buildPhaseLabelBackfillPlan({ ...A1_OK, title: 'Phase 1 - House Shell' }) === null, 'unconventional title → null (fail closed)')

section('A2 builder — clear-to-null only; blank/valid URLs refuse')
{
  const p = buildSourceUrlClearPlan({ findingId: 'f2', targetId: 't2', sourceUrl: EXCERPT })
  assert(p !== null && p.action_type === REMEDY_ACTION_SOURCE_URL_CLEAR && p.target_field === 'source_url', 'malformed source_url → A2 plan')
  assert(p !== null && p.proposed_value === null, 'proposed value is null BY DESIGN (the clear)')
  assert(p !== null && p.current_value === EXCERPT, 'displaced text preserved byte-exactly as the inverse')
}
assert(buildSourceUrlClearPlan({ findingId: 'f', targetId: 't', sourceUrl: null }) === null, 'null source_url → no plan')
assert(buildSourceUrlClearPlan({ findingId: 'f', targetId: 't', sourceUrl: '   ' }) === null, 'blank source_url → no plan')
assert(buildSourceUrlClearPlan({ findingId: 'f', targetId: 't', sourceUrl: 'https://example.com' }) === null, 'valid URL → no plan')

console.log(`\n  Passed: ${passed}  Failed: ${failed}`)
if (failed > 0) { for (const x of failures) console.log(`  - ${x}`); process.exit(1) }
