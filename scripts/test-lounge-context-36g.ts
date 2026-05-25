/**
 * Phase 36G — Lounge Context Indicator Tests
 *
 * Tests are deterministic: source code inspection only, no live API calls,
 * no production data writes, no autonomous jobs triggered.
 *
 * 20 test assertions:
 *  1.  Backend: responses[] type includes messageId field
 *  2.  Backend: saveThreadMessage return is captured
 *  3.  Backend: messageId is set from savedMsg.id
 *  4.  Component: LoungeContextIndicator file exists
 *  5.  Component: exports LoungeResponseMetadata type
 *  6.  Component: hasAnyContext checks librarySearchUsed
 *  7.  Component: hasAnyContext checks webSearchUsed
 *  8.  Component: hasAnyContext checks attachmentStatus.attempted
 *  9.  Component: hasAnyContext checks roomContactStatus.attempted
 * 10.  Component: renders "Not Memory" authority labels
 * 11.  Component: collapsed state shows chip summary
 * 12.  Component: expanded state shows Library section
 * 13.  Component: expanded state shows Web section
 * 14.  Component: expanded state shows Attachments section
 * 15.  Component: expanded state shows Room Carry-In section
 * 16.  LoungeChat: imports LoungeContextIndicator
 * 17.  LoungeChat: contextMetadataMap state exists
 * 18.  LoungeChat: captureResponseMetadata helper exists
 * 19.  LoungeChat: renders LoungeContextIndicator for ari/eli messages
 * 20.  Safety: no raw prompt exposure (system prompt not in component)
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

// --- Source reading ---

const LOUNGE_CHAT_ROUTE = path.resolve(__dirname, '../src/app/api/lounge-chat/route.ts')
const routeSource = fs.readFileSync(LOUNGE_CHAT_ROUTE, 'utf-8')

const LOUNGE_CONTEXT_INDICATOR = path.resolve(__dirname, '../src/components/LoungeContextIndicator.tsx')
const indicatorSource = fs.readFileSync(LOUNGE_CONTEXT_INDICATOR, 'utf-8')

const LOUNGE_CHAT_COMPONENT = path.resolve(__dirname, '../src/components/LoungeChat.tsx')
const componentSource = fs.readFileSync(LOUNGE_CHAT_COMPONENT, 'utf-8')

// --- Tests ---

console.log('\n=== Phase 36G: Lounge Context Indicator Tests ===\n')

// --- Section 1: Backend response shape ---
console.log('\n--- Backend response shape ---')

assert(routeSource.includes('messageId: string | null'),
  '1. Backend: responses[] type includes messageId field')

assert(routeSource.includes('const savedMsg = await saveThreadMessage(thread.id, presenceId, reply, surface)'),
  '2. Backend: saveThreadMessage return is captured')

assert(routeSource.includes("messageId: savedMsg?.id ?? null"),
  '3. Backend: messageId is set from savedMsg.id')

// --- Section 2: LoungeContextIndicator component ---
console.log('\n--- LoungeContextIndicator component ---')

assert(fs.existsSync(LOUNGE_CONTEXT_INDICATOR),
  '4. Component: LoungeContextIndicator file exists')

assert(indicatorSource.includes('export interface LoungeResponseMetadata'),
  '5. Component: exports LoungeResponseMetadata type')

assert(indicatorSource.includes('meta.librarySearchUsed'),
  '6. Component: hasAnyContext checks librarySearchUsed')

assert(indicatorSource.includes('meta.webSearchUsed'),
  '7. Component: hasAnyContext checks webSearchUsed')

assert(indicatorSource.includes('meta.attachmentStatus?.attempted'),
  '8. Component: hasAnyContext checks attachmentStatus.attempted')

assert(indicatorSource.includes('meta.roomContactStatus?.attempted'),
  '9. Component: hasAnyContext checks roomContactStatus.attempted')

assert(indicatorSource.includes('Not Memory') && indicatorSource.includes('Not State'),
  '10. Component: renders "Not Memory" authority labels')

assert(indicatorSource.includes("chips.join(' \\u00b7 ')") || indicatorSource.includes("chips.join(' · ')"),
  '11. Component: collapsed state shows chip summary')

assert(indicatorSource.includes('Library (') && indicatorSource.includes('text-blue-400'),
  '12. Component: expanded state shows Library section')

assert(indicatorSource.includes('Web (') && indicatorSource.includes('text-emerald-400'),
  '13. Component: expanded state shows Web section')

assert(indicatorSource.includes('Attachments (') && indicatorSource.includes('text-amber-400'),
  '14. Component: expanded state shows Attachments section')

assert(indicatorSource.includes('Room Carry-In (') && indicatorSource.includes('text-violet-400'),
  '15. Component: expanded state shows Room Carry-In section')

// --- Section 3: LoungeChat integration ---
console.log('\n--- LoungeChat integration ---')

assert(componentSource.includes("import LoungeContextIndicator") &&
  componentSource.includes("from '@/components/LoungeContextIndicator'"),
  '16. LoungeChat: imports LoungeContextIndicator')

assert(componentSource.includes('contextMetadataMap') && componentSource.includes('useState<Map<string, LoungeResponseMetadata>>'),
  '17. LoungeChat: contextMetadataMap state exists')

assert(componentSource.includes('captureResponseMetadata') && componentSource.includes('data.responses'),
  '18. LoungeChat: captureResponseMetadata helper exists')

assert(componentSource.includes('contextMetadataMap.has(msg.id)') &&
  componentSource.includes('<LoungeContextIndicator metadata={contextMetadataMap.get(msg.id)!}'),
  '19. LoungeChat: renders LoungeContextIndicator for ari/eli messages')

// --- Section 4: Safety ---
console.log('\n--- Safety ---')

assert(!indicatorSource.includes('systemPrompt') &&
  !indicatorSource.includes('fullSystemPrompt') &&
  !indicatorSource.includes('identity_kernel') &&
  !indicatorSource.includes('ANTHROPIC_API_KEY') &&
  !indicatorSource.includes('SUPABASE_SERVICE_ROLE'),
  '20. Safety: no raw prompt exposure (system prompt not in component)')

// --- Summary ---
console.log(`\n=== Results: ${passed}/${total.value} passed, ${failed} failed ===\n`)

if (failed > 0) {
  process.exit(1)
}
