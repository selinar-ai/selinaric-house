import { buildLibraryContextBlock } from '../chat-library-search'
import type { LibrarySearchResult } from '../chat-library-search'

const makeResult = (overrides?: Partial<LibrarySearchResult>): LibrarySearchResult => ({
  itemId: 'item-1',
  title: 'Phase 13 — Living State',
  collection: 'Development Documentation',
  itemType: 'document',
  presenceScope: 'shared',
  authorityStatus: 'library_reference',
  rawAuthorityStatus: 'library_reference',
  phaseCode: 'P13',
  phaseLabel: 'Living State',
  score: 85,
  rank: 1,
  matchedFields: ['title', 'content_text'],
  matchedFiles: [],
  snippets: [{ field: 'content_text', text: 'Living State manages presence energy and focus.' }],
  retrievalReason: 'Title exact match',
  ...overrides,
})

describe('buildLibraryContextBlock', () => {
  it('returns empty string for zero results', () => {
    expect(buildLibraryContextBlock('anything', [])).toBe('')
  })

  it('includes required contract heading and rules', () => {
    const block = buildLibraryContextBlock('Phase 13', [makeResult()])

    expect(block).toContain('Library Context:')
    expect(block).toContain('open-book Library source material retrieved for this reply')
    expect(block).toContain('Rules:')
    expect(block).toContain('Do not treat it as Memory.')
    expect(block).toContain('Do not treat it as lived continuity.')
    expect(block).toContain('Do not treat it as identity.')
    expect(block).toContain('Do not treat it as canonical Archive truth.')
    expect(block).toContain('make that visible in wording')
  })

  it('includes source metadata per result', () => {
    const block = buildLibraryContextBlock('Phase 13', [makeResult()])

    expect(block).toContain('Phase 13 — Living State')
    expect(block).toContain('Collection: Development Documentation')
    expect(block).toContain('Item type: document')
    expect(block).toContain('Source label: library_reference')
    expect(block).toContain('Matched: title, content_text')
    expect(block).toContain('Snippet (content_text):')
  })

  it('includes speech discipline footer', () => {
    const block = buildLibraryContextBlock('Phase 13', [makeResult()])

    expect(block).toContain('Speech discipline:')
    expect(block).toContain('"I checked the Library"')
    expect(block).toContain('never "I remember"')
    expect(block).toContain('not canonical Archive truth')
    expect(block).toContain('Do not promote Library material to memory authority')
  })

  it('does not contain memory-authority language', () => {
    const block = buildLibraryContextBlock('Phase 13', [makeResult()])

    expect(block).not.toContain('canonical memory')
    expect(block).not.toContain('This is Memory')
    expect(block).not.toContain('lived continuity source')
  })

  it('downgrades canonical_memory authority label', () => {
    const block = buildLibraryContextBlock('Phase 13', [makeResult({
      rawAuthorityStatus: 'canonical_memory',
      authorityStatus: 'library_reference',
    })])

    expect(block).toContain('deprecated canonical_memory')
    expect(block).toContain('not valid for Library')
  })
})
