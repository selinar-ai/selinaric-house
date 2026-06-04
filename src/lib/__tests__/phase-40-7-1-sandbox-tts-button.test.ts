/**
 * Phase 40.7.1 Structural Tests — Sandbox Response TTS Button
 *
 * Verifies:
 *   - RecallTierBBehaviourLabPanel imports VoiceButton
 *   - VoiceButton is placed near the Sandbox Response section
 *   - VoiceButton receives model_response as text (reads only that)
 *   - VoiceButton does NOT receive grading fields as text
 *   - VoiceButton does NOT receive boundary flags as text
 *   - ttsPresenceId helper maps lounge → ari (VoiceButton constraint)
 *   - No new API routes, persistence, or localStorage added
 *   - No Supabase imports added
 *   - No production chat routes touched
 *   - All prior Phase 40/39 tests still pass
 *
 * Run: npx tsx src/lib/__tests__/phase-40-7-1-sandbox-tts-button.test.ts
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── test harness ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..', '..')
let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

const COMPONENT_PATH = 'src/components/recall/RecallTierBBehaviourLabPanel.tsx'
const componentSrc   = fs.readFileSync(path.join(ROOT, COMPONENT_PATH), 'utf-8')

// ═══════════════════════════════════════════════════════
// 1. VoiceButton is imported
// ═══════════════════════════════════════════════════════
section('1. VoiceButton imported')

assert(
  componentSrc.includes("import VoiceButton from '@/components/VoiceButton'"),
  'Panel imports VoiceButton from House component library'
)

// ═══════════════════════════════════════════════════════
// 2. VoiceButton is placed near Sandbox Response section
// ═══════════════════════════════════════════════════════
section('2. VoiceButton placement near Sandbox Response')

// VoiceButton and "Sandbox Response" label should be in close proximity
const sandboxResponsePos = componentSrc.indexOf('Sandbox Response')
const voiceButtonPos     = componentSrc.indexOf('<VoiceButton')

assert(sandboxResponsePos > 0,  '"Sandbox Response" label is still present')
assert(voiceButtonPos > 0,      '<VoiceButton component is rendered')

// VoiceButton should be within ~400 chars of the Sandbox Response header
const proximity = Math.abs(voiceButtonPos - sandboxResponsePos)
assert(
  proximity < 600,
  `<VoiceButton is near Sandbox Response heading (${proximity} chars away)`
)

// ═══════════════════════════════════════════════════════
// 3. VoiceButton receives only model_response as text
// ═══════════════════════════════════════════════════════
section('3. VoiceButton receives model_response text only')

assert(
  componentSrc.includes('text={result.model_response}'),
  'VoiceButton text prop is result.model_response'
)

// VoiceButton must NOT receive grading fields as text
const forbiddenTtsFields = [
  'text={result.grading',
  'text={grading',
  'text={result.sandbox_boundary',
  'text={result.tier_a',
  'text={boundaryText',
  'text={systemPrompt',
  'text={prompt',
]

for (const field of forbiddenTtsFields) {
  assert(
    !componentSrc.includes(field),
    `VoiceButton does NOT receive forbidden field as text: ${field}`
  )
}

// ═══════════════════════════════════════════════════════
// 4. presenceId helper maps lounge → ari
// ═══════════════════════════════════════════════════════
section('4. presenceId mapping for VoiceButton constraint')

assert(
  componentSrc.includes('ttsPresenceId'),
  'ttsPresenceId helper is defined'
)

assert(
  componentSrc.includes("presenceId={ttsPresenceId(selectedPresence)}"),
  'VoiceButton presenceId uses ttsPresenceId(selectedPresence)'
)

// Lounge defaults to ari (VoiceButton only accepts 'ari' | 'eli')
assert(
  componentSrc.includes("return presence === 'eli' ? 'eli' : 'ari'") ||
  componentSrc.includes("presence === 'eli'"),
  "ttsPresenceId maps lounge → 'ari' (VoiceButton only accepts ari/eli)"
)

// ═══════════════════════════════════════════════════════
// 5. TTS does not expose forbidden content
// ═══════════════════════════════════════════════════════
section('5. TTS does not expose forbidden content')

// Component must NOT pass grading, boundary flags, or prompt text to any speech API
const ttsBlock = (() => {
  const start = componentSrc.indexOf('<VoiceButton')
  const end   = componentSrc.indexOf('/>', start)
  return start >= 0 && end > start ? componentSrc.slice(start, end + 2) : ''
})()

assert(ttsBlock.length > 0, 'VoiceButton JSX block extracted for inspection')

assert(
  !ttsBlock.includes('grading') && !ttsBlock.includes('boundary'),
  'VoiceButton block does not reference grading or boundary fields'
)

assert(
  !ttsBlock.includes('prompt') || ttsBlock.includes('model_response'),
  'VoiceButton block references model_response (not prompt/system fields)'
)

// ═══════════════════════════════════════════════════════
// 6. No new API routes / persistence / localStorage
// ═══════════════════════════════════════════════════════
section('6. No new API routes / persistence')

// No new API route for TTS
assert(
  !fs.existsSync(path.join(ROOT, 'src/app/api/recall-eval/tts')),
  'No new /api/recall-eval/tts route created'
)

assert(
  !componentSrc.includes('localStorage.'),
  'Component does NOT use localStorage.'
)

assert(
  !componentSrc.includes('sessionStorage.'),
  'Component does NOT use sessionStorage.'
)

// ═══════════════════════════════════════════════════════
// 7. No Supabase imports added
// ═══════════════════════════════════════════════════════
section('7. No Supabase imports')

assert(
  !componentSrc.includes("from '@supabase") &&
  !componentSrc.includes('createClient'),
  'Panel does NOT import Supabase'
)

// ═══════════════════════════════════════════════════════
// 8. Production chat routes unmodified
// ═══════════════════════════════════════════════════════
section('8. Production chat routes unmodified')

for (const routePath of ['ari-chat', 'eli-chat', 'lounge-chat'].map(r => `src/app/api/${r}/route.ts`)) {
  const content = fs.readFileSync(path.join(ROOT, routePath), 'utf-8')
  assert(
    !content.includes('VoiceButton') && !content.includes('ttsPresenceId'),
    `${routePath.split('/').pop()}: NOT modified by 40.7.1`
  )
}

// ═══════════════════════════════════════════════════════
// 9. No migrations added
// ═══════════════════════════════════════════════════════
section('9. No migrations added')

const migrationFiles = fs.readdirSync(path.join(ROOT, 'supabase-migrations'))
const ttsMigrations  = migrationFiles.filter(f => f.includes('tts') || f.includes('voice'))
assert(
  ttsMigrations.length === 0,
  `No TTS migrations (found: ${ttsMigrations.join(', ') || 'none'})`
)

// ═══════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════')
console.log('  Phase 40.7.1 Sandbox TTS Button Tests')
console.log(`  Passed: ${passed}`)
console.log(`  Failed: ${failed}`)
console.log('═══════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
} else {
  console.log('\n✅ All 40.7.1 sandbox TTS button tests passed.\n')
  process.exit(0)
}
