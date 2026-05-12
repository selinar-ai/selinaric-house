import { buildLibrarySearchStatusBlock, type LibrarySearchStatus } from '../chat-library-search'

describe('buildLibrarySearchStatusBlock', () => {
  it('creates status block when no useful results found', () => {
    const status: LibrarySearchStatus = {
      attempted: true,
      query: 'pulse architecture',
      source: 'library',
      usefulResultCount: 0,
      rawResultCount: 3,
      contextInjected: false,
      reason: 'no_useful_results',
    }

    const block = buildLibrarySearchStatusBlock(status)

    expect(block).toContain('Library Search Status')
    expect(block).toContain('pulse architecture')
    expect(block).toContain('Useful results found: 0')
    expect(block).toContain('Context injected: false')
    expect(block).toContain('MUST NOT say you cannot search')
    expect(block).toContain('MUST acknowledge that you searched')
    expect(block).toContain('MUST NOT say you do not have a Library search tool')
  })

  it('returns empty string when useful results are found', () => {
    const status: LibrarySearchStatus = {
      attempted: true,
      query: 'Phase 11',
      source: 'library',
      usefulResultCount: 2,
      contextInjected: true,
      reason: 'useful_results_found',
    }

    expect(buildLibrarySearchStatusBlock(status)).toBe('')
  })

  it('returns empty string when search was not triggered', () => {
    const status: LibrarySearchStatus = {
      attempted: false,
      query: '',
      source: 'library',
      usefulResultCount: 0,
      contextInjected: false,
      reason: 'not_triggered',
    }

    expect(buildLibrarySearchStatusBlock(status)).toBe('')
  })

  it('returns empty string on search error', () => {
    const status: LibrarySearchStatus = {
      attempted: true,
      query: 'something',
      source: 'library',
      usefulResultCount: 0,
      contextInjected: false,
      reason: 'search_error',
    }

    expect(buildLibrarySearchStatusBlock(status)).toBe('')
  })

  it('does not include raw result content in status block', () => {
    const status: LibrarySearchStatus = {
      attempted: true,
      query: 'purple mango protocol',
      source: 'library',
      usefulResultCount: 0,
      rawResultCount: 5,
      contextInjected: false,
      reason: 'no_useful_results',
    }

    const block = buildLibrarySearchStatusBlock(status)

    expect(block).not.toContain('rawResultCount')
    expect(block).not.toContain('snippet')
    expect(block).not.toContain('score')
    expect(block).not.toContain('title')
    expect(block).toContain('Search attempted: true')
    expect(block).toContain('Source: Library')
  })
})
