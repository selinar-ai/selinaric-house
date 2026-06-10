/**
 * Library Section Retrieval Patch — Tests
 *
 * Verifies section-aware excerpt extraction in chat Library retrieval:
 *   - Section reference detection tolerates em dash / hyphen / no dash
 *   - TOC occurrences are skipped; the section body occurrence is preferred
 *   - Section excerpts return body prose, not the Table of Contents line
 *   - Section excerpts stop before the next "Part N" heading
 *   - Sections beyond the first 7000 characters of a long document retrieve correctly
 *   - Section matches pass the usefulness gate
 *
 * This protects long structured documents with tables of contents from
 * first-match retrieval errors.
 *
 * Retrieval precision only. Not Memory. Not Archive. No authority change.
 *
 * Run: npx tsx src/lib/__tests__/library-section-retrieval.test.ts
 */

import {
  extractSectionReference,
  findSectionBodyStart,
  extractSectionExcerpt,
  isUsefulLibraryResult,
  type LibrarySearchResult,
} from '../library/chat-library-search'

// ─── test harness ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── synthetic long structured document ──────────────────────────────────────
// Mirrors the real failure case: a DOCX export with a tab/page-number TOC at
// the top and the actual "Part 12" section body deep in the document
// (beyond the 7000-char primary attachment excerpt limit).

const TOC = [
  'AI HOUSE',
  '',
  'Contents',
  '',
  'Part 10 — The Evaluation Harness\t20',
  '',
  'Part 11 — The Build Sequence\t22',
  '',
  'Part 12 — Technology Stack\t24',
  '',
  'Part 13 — Governing Principles\t25',
  '',
].join('\n')

const FILLER_PARAGRAPH = 'This sentence pads the early sections of the synthetic document so that later sections sit deep in the text. '
const PART_11_BODY = `Part 11 — The Build Sequence\n\n${FILLER_PARAGRAPH.repeat(90)}\n\n`

const PART_12_BODY_FIRST_SENTENCE = 'The technology stack is intentionally conventional.'
const PART_12_BODY = [
  'Part 12 — Technology Stack',
  '',
  PART_12_BODY_FIRST_SENTENCE,
  '',
  'Next.js provides the application layer. Supabase provides Postgres and pgvector for storage and retrieval.',
  '',
].join('\n')

const PART_13_BODY_MARKER = 'Principles follow from governance.'
const PART_13_BODY = `Part 13 — Governing Principles\n\n${PART_13_BODY_MARKER}\n`

const DOC = TOC + '\n' + PART_11_BODY + PART_12_BODY + '\n' + PART_13_BODY

// ─── 1. Section reference detection (dash variants) ─────────────────────────

console.log('\n1. Section reference detection')

const refEmDash = extractSectionReference('Part 12 — Technology Stack')
check('1a. em dash query detected', refEmDash !== null && refEmDash.partNumber === 12,
  JSON.stringify(refEmDash))
check('1b. em dash query captures section title', refEmDash?.sectionTitle === 'Technology Stack',
  JSON.stringify(refEmDash?.sectionTitle))

const refHyphen = extractSectionReference('Part 12 - Technology Stack')
check('1c. hyphen query detected', refHyphen !== null && refHyphen.partNumber === 12,
  JSON.stringify(refHyphen))

const refNoDash = extractSectionReference('Part 12 Technology Stack')
check('1d. no-dash query detected', refNoDash !== null && refNoDash.partNumber === 12,
  JSON.stringify(refNoDash))

const refEmbedded = extractSectionReference('get Part 12 — Technology Stack of The Governed Brain Newsletter')
check('1e. section reference detected inside a longer query',
  refEmbedded !== null && refEmbedded.partNumber === 12, JSON.stringify(refEmbedded))

check('1f. non-section query returns null', extractSectionReference('tell me about the house') === null)
check('1g. "Part 1" does not match "Part 12" headings prefix',
  extractSectionReference('Part 1 overview')?.partNumber === 1)

// ─── 2. TOC skipping — body occurrence preferred ─────────────────────────────

console.log('\n2. TOC occurrence skipping')

const tocIndex = DOC.indexOf('Part 12 — Technology Stack\t24')
const bodyIndex = DOC.indexOf(PART_12_BODY)
check('2a. fixture sanity: TOC occurrence exists before body occurrence',
  tocIndex !== -1 && bodyIndex !== -1 && tocIndex < bodyIndex,
  `toc@${tocIndex} body@${bodyIndex}`)
check('2b. fixture sanity: body occurrence is beyond the first 7000 chars',
  bodyIndex > 7000, `body@${bodyIndex}`)

const sectionStart = findSectionBodyStart(DOC, 12)
check('2c. findSectionBodyStart skips the TOC occurrence', sectionStart === bodyIndex,
  `got ${sectionStart}, expected ${bodyIndex}`)

check('2d. "Part 1" lookup does not match Part 12 / Part 13 headings',
  findSectionBodyStart(DOC, 1) === -1)

check('2e. missing section returns -1', findSectionBodyStart(DOC, 99) === -1)

// All-TOC fallback: a document where Part 12 only appears as a TOC line
const tocOnlyDoc = 'Contents\n\nPart 12 — Technology Stack\t24\n\nPart 13 — Governing Principles\t25\n\nUnrelated prose.'
const tocOnlyStart = findSectionBodyStart(tocOnlyDoc, 12)
check('2f. all-TOC document falls back to an occurrence (no crash, not -1)', tocOnlyStart !== -1)

// ─── 3. Section excerpt: body prose, not TOC ─────────────────────────────────

console.log('\n3. Section excerpt content')

const excerpt = extractSectionExcerpt(DOC, 12, 7000)
check('3a. excerpt exists', excerpt !== null)
check('3b. excerpt starts at the section heading',
  excerpt !== null && excerpt.startsWith('Part 12 — Technology Stack'),
  excerpt?.substring(0, 60))
check('3c. excerpt contains the section body prose',
  excerpt !== null && excerpt.includes(PART_12_BODY_FIRST_SENTENCE))
check('3d. excerpt is not the TOC line (no tab page number)',
  excerpt !== null && !excerpt.includes('\t24'))
check('3e. excerpt does not contain other TOC entries',
  excerpt !== null && !excerpt.includes('Governing Principles\t25'))

// ─── 4. Section excerpt stops before the next Part heading ──────────────────

console.log('\n4. Section boundary')

check('4a. excerpt stops before Part 13 heading',
  excerpt !== null && !excerpt.includes('Part 13'))
check('4b. excerpt does not contain Part 13 body prose',
  excerpt !== null && !excerpt.includes(PART_13_BODY_MARKER))

// Last section in a document: runs to end of text
const lastExcerpt = extractSectionExcerpt(DOC, 13, 7000)
check('4c. last section excerpt runs to end of document',
  lastExcerpt !== null && lastExcerpt.includes(PART_13_BODY_MARKER))

// ─── 5. Long-document section beyond 7000 chars ──────────────────────────────

console.log('\n5. Deep-section retrieval (beyond first 7000 chars)')

check('5a. document is long enough to exercise head-truncation failure',
  DOC.length > 7000, `doc length ${DOC.length}`)
check('5b. first 7000 chars do NOT contain the Part 12 body prose',
  !DOC.substring(0, 7000).includes(PART_12_BODY_FIRST_SENTENCE))
check('5c. section excerpt still retrieves the body prose',
  excerpt !== null && excerpt.includes(PART_12_BODY_FIRST_SENTENCE))

// ─── 6. Character limit safety ───────────────────────────────────────────────

console.log('\n6. Character limit')

const cappedExcerpt = extractSectionExcerpt(DOC, 12, 60)
check('6a. excerpt respects maxLen', cappedExcerpt !== null && cappedExcerpt.length <= 61,
  `length ${cappedExcerpt?.length}`)
check('6b. capped excerpt ends with ellipsis', cappedExcerpt !== null && cappedExcerpt.endsWith('…'))
check('6c. capped excerpt still starts at the heading',
  cappedExcerpt !== null && cappedExcerpt.startsWith('Part 12'))

// ─── 7. Usefulness gate ──────────────────────────────────────────────────────

console.log('\n7. Usefulness gate')

const sectionResult: LibrarySearchResult = {
  itemId: 'item-1',
  title: 'The Governed Brain Newsletter Issue 1 - AI house Architecture',
  collection: 'articles',
  itemType: 'article',
  presenceScope: 'house',
  authorityStatus: 'library_reference',
  rawAuthorityStatus: 'library_reference',
  phaseCode: null,
  phaseLabel: null,
  score: 40,
  rank: 1,
  matchedFields: ['section_heading'],
  matchedFiles: [],
  snippets: [],
  retrievalReason: 'Section heading body match (Part 12)',
}

check('7a. section_heading match passes the usefulness gate',
  isUsefulLibraryResult(sectionResult, 'Part 12 Technology Stack'))
check('7b. section match below MIN_USEFUL_SCORE is rejected',
  !isUsefulLibraryResult({ ...sectionResult, score: 20 }, 'Part 12 Technology Stack'))

// ─── summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Library Section Retrieval tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
