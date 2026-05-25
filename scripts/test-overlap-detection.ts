/**
 * Fix 2 — Targeted test: overlap detection logic
 *
 * Tests that findOverlappingRow correctly identifies sessions that share >50%
 * of their source_message_ids and would trigger an upsert instead of insert.
 *
 * Run: npx tsx scripts/test-overlap-detection.ts
 */

export {}  // TypeScript module boundary — prevents global scope collisions

// Inline the overlap detection logic (same as in recent-continuity.ts)
function findOverlappingRow(
  newMessageIds: string[],
  existingRows: Array<{ id: string; session_end: string; source_message_ids: string[] | null; message_count: number; status: string }>,
): { id: string; session_end: string; message_count: number } | null {
  if (newMessageIds.length === 0) return null

  let bestMatch: { id: string; session_end: string; message_count: number; ratio: number } | null = null

  for (const row of existingRows) {
    if (row.status !== 'active') continue

    const existingIds = row.source_message_ids ?? []
    if (existingIds.length === 0) continue

    const existingSet = new Set(existingIds)
    const overlapCount = newMessageIds.filter(id => existingSet.has(id)).length

    const ratioVsNew = overlapCount / newMessageIds.length
    const ratioVsExisting = overlapCount / existingIds.length
    const maxRatio = Math.max(ratioVsNew, ratioVsExisting)

    if (maxRatio > 0.5) {
      if (!bestMatch || maxRatio > bestMatch.ratio) {
        bestMatch = { id: row.id, session_end: row.session_end, message_count: row.message_count, ratio: maxRatio }
      }
    }
  }

  return bestMatch
}

// ─── Test cases ──────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✓ ${description}`)
    passed++
  } else {
    console.log(`  ✗ FAIL: ${description}`)
    failed++
  }
}

console.log('\n=== Fix 2: Overlap Detection Tests ===\n')

// Test 1: Session grows by 1 message (5→6 messages, 5/6 = 83% overlap)
console.log('Test 1: Session grows by 1 message (should trigger upsert)')
{
  const existingRow = {
    id: 'row-1',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: ['m1', 'm2', 'm3', 'm4', 'm5'],
    message_count: 5,
    status: 'active',
  }
  const newIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'] // grew by 1
  const result = findOverlappingRow(newIds, [existingRow])
  assert(result !== null, 'Overlap detected')
  assert(result?.id === 'row-1', 'Correct row matched')
}

// Test 2: Completely different session (0% overlap, should NOT trigger upsert)
console.log('\nTest 2: Completely different session (should insert new)')
{
  const existingRow = {
    id: 'row-1',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: ['m1', 'm2', 'm3', 'm4', 'm5'],
    message_count: 5,
    status: 'active',
  }
  const newIds = ['m10', 'm11', 'm12', 'm13']
  const result = findOverlappingRow(newIds, [existingRow])
  assert(result === null, 'No overlap — insert as new session')
}

// Test 3: Low overlap (2/6 = 33%, should NOT trigger)
console.log('\nTest 3: Low overlap (33%, below threshold)')
{
  const existingRow = {
    id: 'row-1',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
    message_count: 6,
    status: 'active',
  }
  const newIds = ['m1', 'm2', 'm7', 'm8', 'm9', 'm10']
  const result = findOverlappingRow(newIds, [existingRow])
  assert(result === null, 'Below 50% threshold — no upsert')
}

// Test 4: Hidden row should be ignored (don't resurrect tombstones)
console.log('\nTest 4: Hidden row ignored (no resurrection)')
{
  const hiddenRow = {
    id: 'row-hidden',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: ['m1', 'm2', 'm3', 'm4', 'm5'],
    message_count: 5,
    status: 'hidden',
  }
  const newIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
  const result = findOverlappingRow(newIds, [hiddenRow])
  assert(result === null, 'Hidden row not matched')
}

// Test 5: Multiple existing rows — picks best overlap
console.log('\nTest 5: Multiple rows — picks highest overlap')
{
  const rows = [
    {
      id: 'row-low',
      session_end: '2026-05-22T09:00:00Z',
      source_message_ids: ['m1', 'm2', 'm3', 'm10', 'm11', 'm12'],
      message_count: 6,
      status: 'active',
    },
    {
      id: 'row-high',
      session_end: '2026-05-22T10:00:00Z',
      source_message_ids: ['m1', 'm2', 'm3', 'm4', 'm5'],
      message_count: 5,
      status: 'active',
    },
  ]
  const newIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
  const result = findOverlappingRow(newIds, rows)
  assert(result !== null, 'Overlap found')
  assert(result?.id === 'row-high', 'Picked row with highest overlap (5/5=100% vs existing)')
}

// Test 6: Empty message IDs (edge case)
console.log('\nTest 6: Empty IDs edge cases')
{
  const existingRow = {
    id: 'row-1',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: null,
    message_count: 5,
    status: 'active',
  }
  const result1 = findOverlappingRow(['m1', 'm2'], [existingRow])
  assert(result1 === null, 'Null source_message_ids → no match')

  const result2 = findOverlappingRow([], [{ ...existingRow, source_message_ids: ['m1'] }])
  assert(result2 === null, 'Empty new IDs → no match')
}

// Test 7: Exact same session (100% overlap)
console.log('\nTest 7: Exact same session (100% overlap)')
{
  const existingRow = {
    id: 'row-1',
    session_end: '2026-05-22T10:03:00Z',
    source_message_ids: ['m1', 'm2', 'm3'],
    message_count: 3,
    status: 'active',
  }
  const result = findOverlappingRow(['m1', 'm2', 'm3'], [existingRow])
  assert(result !== null, '100% overlap triggers upsert')
  assert(result?.id === 'row-1', 'Matched correct row')
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log(`${'═'.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
