import { chunkText, chunkLibraryItem } from '../chunk-library-item'

describe('chunkText', () => {
  it('creates chunks from long text with paragraph boundaries', () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) =>
      `Paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet. '.repeat(5)}`
    ).join('\n\n')

    const chunks = chunkText({
      libraryItemId: 'item-1',
      sourceField: 'content_text',
      text: paragraphs,
    })

    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach(c => {
      expect(c.sourceField).toBe('content_text')
      expect(c.libraryItemId).toBe('item-1')
      expect(c.chunkText.length).toBeGreaterThan(0)
      expect(c.chunkHash).toBeTruthy()
      expect(c.charCount).toBe(c.chunkText.length)
    })
  })

  it('returns single chunk for short text', () => {
    const chunks = chunkText({
      libraryItemId: 'item-1',
      sourceField: 'description',
      text: 'A short description that does not need splitting into multiple chunks.',
    })

    expect(chunks.length).toBe(1)
    expect(chunks[0].sourceField).toBe('description')
  })

  it('returns empty array for empty text', () => {
    expect(chunkText({ libraryItemId: 'x', sourceField: 'title', text: '' })).toEqual([])
    expect(chunkText({ libraryItemId: 'x', sourceField: 'title', text: '   ' })).toEqual([])
  })

  it('produces stable hashes for same content', () => {
    const a = chunkText({ libraryItemId: 'item-1', sourceField: 'title', text: 'Hello world' })
    const b = chunkText({ libraryItemId: 'item-1', sourceField: 'title', text: 'Hello world' })
    expect(a[0].chunkHash).toBe(b[0].chunkHash)
  })

  it('produces different hashes for different source fields', () => {
    const a = chunkText({ libraryItemId: 'item-1', sourceField: 'title', text: 'Hello world' })
    const b = chunkText({ libraryItemId: 'item-1', sourceField: 'description', text: 'Hello world' })
    expect(a[0].chunkHash).not.toBe(b[0].chunkHash)
  })
})

describe('chunkLibraryItem', () => {
  it('preserves source field boundaries', () => {
    const chunks = chunkLibraryItem({
      libraryItemId: 'item-1',
      title: 'Phase 14 — Web Search',
      description: 'Autonomous browsing for Ari and Eli.',
      contentText: 'Content text about web search implementation details and rate limiting.',
      attachmentTexts: [
        { sourceField: 'attachment_text', text: 'Extracted DOCX content about search design.' },
      ],
    })

    const sourceFields = chunks.map(c => c.sourceField)
    expect(sourceFields).toContain('title')
    expect(sourceFields).toContain('description')
    expect(sourceFields).toContain('content_text')
    expect(sourceFields).toContain('attachment_text')
  })

  it('assigns sequential chunk indices', () => {
    const chunks = chunkLibraryItem({
      libraryItemId: 'item-1',
      title: 'Test',
      description: 'Description text here.',
      contentText: 'Content text here.',
      attachmentTexts: [],
    })

    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i)
    })
  })

  it('handles null description and content', () => {
    const chunks = chunkLibraryItem({
      libraryItemId: 'item-1',
      title: 'Title Only',
      description: null,
      contentText: null,
      attachmentTexts: [],
    })

    expect(chunks.length).toBe(1)
    expect(chunks[0].sourceField).toBe('title')
  })

  it('does not merge different source fields into one chunk', () => {
    const chunks = chunkLibraryItem({
      libraryItemId: 'item-1',
      title: 'Phase 13',
      description: 'Living State description.',
      contentText: 'Content about living state.',
      attachmentTexts: [{ sourceField: 'ocr_text', text: 'OCR extracted content.' }],
    })

    chunks.forEach(c => {
      expect(['title', 'description', 'content_text', 'ocr_text']).toContain(c.sourceField)
    })
  })
})
