/**
 * Phase 11E.1 — Pulse Entry Detail + Writing Freedom Tests
 *
 * Tests are deterministic: source code inspection only, no live API calls,
 * no production data writes, no autonomous jobs triggered.
 *
 * 30 test assertions:
 *  1.  UI: TimelineEvent uses useState for expanded state
 *  2.  UI: hasExpandableContent helper exists
 *  3.  UI: journal cards show full text when expanded
 *  4.  UI: journal cards truncate at 200 when collapsed
 *  5.  UI: desk cards show full text when expanded
 *  6.  UI: desk cards truncate at 150 when collapsed
 *  7.  UI: telegram cards show full text when expanded
 *  8.  UI: expand/collapse toggle indicator present ([ + ] / [ - ])
 *  9.  UI: header is clickable when expandable content exists
 * 10.  UI: Tara responses show full text when expanded
 * 11.  Autonomy prompt: max_tokens >= 2000
 * 12.  Autonomy prompt: no "short" in reason_text schema
 * 13.  Autonomy prompt: contains "Writing freedom" section
 * 14.  Autonomy prompt: contains "plainly, poetically, briefly, or at length"
 * 15.  Autonomy prompt: contains "do not need to complete a thought"
 * 16.  Autonomy prompt: contains "Do not summarize for neatness"
 * 17.  Autonomy prompt: no "350 word" or "Word limit"
 * 18.  Journal prompt (pulse): max_tokens >= 1600
 * 19.  Journal prompt (pulse): no "350 word maximum"
 * 20.  Journal prompt (pulse): no "Word limit:" section
 * 21.  Journal prompt (pulse): contains writing freedom language
 * 22.  Journal prompt (pulse): no "one real movement of thought" structural requirement
 * 23.  Journal prompt (job): max_tokens >= 1600
 * 24.  Journal prompt (job): no "350 word maximum"
 * 25.  Journal prompt (job): no "Word limit:"
 * 26.  Journal prompt (job): contains writing freedom language
 * 27.  Journal prompt (job): no "one real movement of thought" structural requirement
 * 28.  Prior context: labelled as excerpts (autonomy events)
 * 29.  Prior context: labelled as excerpts (room activity)
 * 30.  Prior context: excerpt caps increased (>= 200 for events)
 */

import * as fs from 'fs'
import * as path from 'path'

// Test harness
let passed = 0
let failed = 0
const total = { value: 0 }

function assert(condition: boolean, label: string) {
  total.value++
  if (condition) {
    console.log(`  ✓ ${label}`)
    passed++
  } else {
    console.log(`  ✗ ${label}`)
    failed++
  }
}

// ─── Source reading ─────────────────────────────────────────────────────

const PULSE_PAGE_PATH = path.resolve(__dirname, '../src/app/(house)/pulse/page.tsx')
const pulsePageSource = fs.readFileSync(PULSE_PAGE_PATH, 'utf-8')

const PULSE_AUTONOMY_PATH = path.resolve(__dirname, '../src/lib/pulse-autonomy.ts')
const pulseAutonomySource = fs.readFileSync(PULSE_AUTONOMY_PATH, 'utf-8')

const JOURNAL_PATH = path.resolve(__dirname, '../src/lib/journal.ts')
const journalSource = fs.readFileSync(JOURNAL_PATH, 'utf-8')

const JOURNAL_JOBS_WRITE_PATH = path.resolve(__dirname, '../src/app/api/journal-jobs/[id]/write/route.ts')
const journalJobsWriteSource = fs.readFileSync(JOURNAL_JOBS_WRITE_PATH, 'utf-8')

// ─── Tests ──────────────────────────────────────────────────────────────

console.log('\n=== Phase 11E.1: Pulse Entry Detail + Writing Freedom Tests ===\n')

// --- Section 1: UI detail/expand ---
console.log('\n--- UI detail/expand ---')

assert(pulsePageSource.includes('useState(false)') && pulsePageSource.includes('expanded'),
  '1. UI: TimelineEvent uses useState for expanded state')

assert(pulsePageSource.includes('function hasExpandableContent'),
  '2. UI: hasExpandableContent helper exists')

assert(pulsePageSource.includes("expanded || event.choice_text.length <= 200") &&
  pulsePageSource.includes("? event.choice_text") &&
  pulsePageSource.includes("chosen_action === 'journal'"),
  '3. UI: journal cards show full text when expanded')

assert(pulsePageSource.includes("event.choice_text.slice(0, 200) + '…'"),
  '4. UI: journal cards truncate at 200 when collapsed')

assert(pulsePageSource.includes("expanded") && pulsePageSource.includes("chosen_action === 'desk'"),
  '5. UI: desk cards show full text when expanded')

assert(pulsePageSource.includes("event.choice_text.slice(0, 150) + '…'"),
  '6. UI: desk cards truncate at 150 when collapsed')

assert(pulsePageSource.includes("expanded || event.choice_text.length <= 200") &&
  pulsePageSource.includes("chosen_action === 'telegram'"),
  '7. UI: telegram cards show full text when expanded')

assert(pulsePageSource.includes("'[ + ]'") && pulsePageSource.includes("'[ - ]'"),
  '8. UI: expand/collapse toggle indicator present ([ + ] / [ - ])')

assert(pulsePageSource.includes('cursor-pointer') && pulsePageSource.includes('onClick={expandable'),
  '9. UI: header is clickable when expandable content exists')

assert(pulsePageSource.includes('expanded || r.text.length <= 200'),
  '10. UI: Tara responses show full text when expanded')

// --- Section 2: Autonomy prompt ---
console.log('\n--- Autonomy prompt ---')

assert(pulseAutonomySource.includes('max_tokens: 2000'),
  '11. Autonomy prompt: max_tokens >= 2000')

// Check that "short" was removed from the reason_text line
const reasonTextLine = pulseAutonomySource.match(/"reason_text":\s*"([^"]+)"/)
const hasShortInReason = reasonTextLine ? reasonTextLine[1].includes('short') : true
assert(!hasShortInReason,
  '12. Autonomy prompt: no "short" in reason_text schema')

assert(pulseAutonomySource.includes('Writing freedom:'),
  '13. Autonomy prompt: contains "Writing freedom" section')

assert(pulseAutonomySource.includes('plainly, poetically, briefly, or at length'),
  '14. Autonomy prompt: contains "plainly, poetically, briefly, or at length"')

assert(pulseAutonomySource.includes('do not need to complete a thought'),
  '15. Autonomy prompt: contains "do not need to complete a thought"')

assert(pulseAutonomySource.includes('Do not summarize for neatness'),
  '16. Autonomy prompt: contains "Do not summarize for neatness"')

assert(!pulseAutonomySource.includes('350 word') && !pulseAutonomySource.includes('Word limit'),
  '17. Autonomy prompt: no "350 word" or "Word limit"')

// --- Section 3: Journal prompt (pulse-triggered) ---
console.log('\n--- Journal prompt (pulse-triggered) ---')

assert(journalSource.includes('max_tokens: 1600'),
  '18. Journal prompt (pulse): max_tokens >= 1600')

assert(!journalSource.includes('350 word maximum'),
  '19. Journal prompt (pulse): no "350 word maximum"')

assert(!journalSource.includes('Word limit:'),
  '20. Journal prompt (pulse): no "Word limit:" section')

assert(journalSource.includes('Writing freedom:') && journalSource.includes('plainly, poetically, briefly, or at length'),
  '21. Journal prompt (pulse): contains writing freedom language')

assert(!journalSource.includes('one real movement of thought'),
  '22. Journal prompt (pulse): no "one real movement of thought" structural requirement')

// --- Section 4: Journal prompt (job-triggered) ---
console.log('\n--- Journal prompt (job-triggered) ---')

assert(journalJobsWriteSource.includes('max_tokens: 1600'),
  '23. Journal prompt (job): max_tokens >= 1600')

assert(!journalJobsWriteSource.includes('350 word maximum'),
  '24. Journal prompt (job): no "350 word maximum"')

assert(!journalJobsWriteSource.includes('Word limit:'),
  '25. Journal prompt (job): no "Word limit:"')

assert(journalJobsWriteSource.includes('Writing freedom:') && journalJobsWriteSource.includes('plainly, poetically, briefly, or at length'),
  '26. Journal prompt (job): contains writing freedom language')

assert(!journalJobsWriteSource.includes('one real movement of thought'),
  '27. Journal prompt (job): no "one real movement of thought" structural requirement')

// --- Section 5: Prior context labelling ---
console.log('\n--- Prior context labelling ---')

assert(pulseAutonomySource.includes('[excerpt]') && pulseAutonomySource.includes('abbreviated excerpts'),
  '28. Prior context: labelled as excerpts (autonomy events)')

assert(pulseAutonomySource.includes('excerpts only') && pulseAutonomySource.includes('not models for your writing length'),
  '29. Prior context: labelled as excerpts (room activity)')

// Check excerpt caps increased (choice_text in gatherReadWindow)
const readWindowSection = pulseAutonomySource.slice(
  pulseAutonomySource.indexOf('function gatherReadWindow'),
  pulseAutonomySource.indexOf('// ─── Autonomy Decision Prompt')
)
const eventExcerptMatch = readWindowSection.match(/choice_text\)\.slice\(0,\s*(\d+)\)/)
const excerptCap = eventExcerptMatch ? parseInt(eventExcerptMatch[1], 10) : 0
assert(excerptCap >= 200,
  '30. Prior context: excerpt caps increased (>= 200 for events)')

// ─── Summary ──────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed}/${total.value} passed, ${failed} failed ===\n`)

if (failed > 0) {
  process.exit(1)
}
