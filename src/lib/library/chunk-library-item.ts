// Phase 33I — Library Item Chunking
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.

import { createHash } from 'crypto'

const TARGET_CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 120
const MIN_CHUNK_SIZE = 120
const MAX_CHUNK_SIZE = 1500

export interface LibraryChunkInput {
  libraryItemId: string
  sourceField: string
  text: string
}

export interface LibraryChunk {
  libraryItemId: string
  chunkIndex: number
  chunkText: string
  chunkHash: string
  sourceField: string
  charCount: number
  tokenEstimate: number
}

function computeChunkHash(libraryItemId: string, sourceField: string, text: string): string {
  const normalised = text.replace(/\s+/g, ' ').trim()
  return createHash('sha256')
    .update(`${libraryItemId}:${sourceField}:${normalised}`)
    .digest('hex')
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function splitIntoParagraphs(text: string): string[] {
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
}

export function chunkText(input: LibraryChunkInput): LibraryChunk[] {
  const { libraryItemId, sourceField, text } = input
  const trimmed = text.trim()
  if (!trimmed || trimmed.length < MIN_CHUNK_SIZE) {
    if (trimmed.length > 0) {
      return [{
        libraryItemId,
        chunkIndex: 0,
        chunkText: trimmed,
        chunkHash: computeChunkHash(libraryItemId, sourceField, trimmed),
        sourceField,
        charCount: trimmed.length,
        tokenEstimate: estimateTokens(trimmed),
      }]
    }
    return []
  }

  const paragraphs = splitIntoParagraphs(trimmed)
  const chunks: LibraryChunk[] = []
  let currentChunk = ''

  function flushChunk() {
    const ct = currentChunk.trim()
    if (ct.length > 0) {
      chunks.push({
        libraryItemId,
        chunkIndex: chunks.length,
        chunkText: ct,
        chunkHash: computeChunkHash(libraryItemId, sourceField, ct),
        sourceField,
        charCount: ct.length,
        tokenEstimate: estimateTokens(ct),
      })
    }
    currentChunk = ''
  }

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_SIZE) {
      if (currentChunk.length > 0) flushChunk()

      let remaining = para
      while (remaining.length > 0) {
        const slice = remaining.slice(0, TARGET_CHUNK_SIZE)
        const lastSpace = slice.lastIndexOf(' ')
        const breakAt = lastSpace > MIN_CHUNK_SIZE ? lastSpace : slice.length

        currentChunk = remaining.slice(0, breakAt).trim()
        flushChunk()

        const overlapStart = Math.max(0, breakAt - CHUNK_OVERLAP)
        remaining = remaining.slice(overlapStart).trim()
        if (remaining.length <= MIN_CHUNK_SIZE && remaining.length > 0) {
          currentChunk = remaining
          flushChunk()
          remaining = ''
        }
      }
      continue
    }

    if (currentChunk.length + para.length + 2 > TARGET_CHUNK_SIZE && currentChunk.length >= MIN_CHUNK_SIZE) {
      flushChunk()
      const overlap = currentChunk.length > 0 ? '' : ''
      currentChunk = overlap
    }

    currentChunk = currentChunk ? currentChunk + '\n\n' + para : para
  }

  flushChunk()

  return chunks
}

export interface LibraryItemTextFields {
  libraryItemId: string
  title: string
  description: string | null
  contentText: string | null
  attachmentTexts: { sourceField: string; text: string }[]
}

export function chunkLibraryItem(fields: LibraryItemTextFields): LibraryChunk[] {
  const allChunks: LibraryChunk[] = []
  const { libraryItemId } = fields

  if (fields.title.trim()) {
    allChunks.push({
      libraryItemId,
      chunkIndex: 0,
      chunkText: fields.title.trim(),
      chunkHash: computeChunkHash(libraryItemId, 'title', fields.title.trim()),
      sourceField: 'title',
      charCount: fields.title.trim().length,
      tokenEstimate: estimateTokens(fields.title.trim()),
    })
  }

  if (fields.description?.trim()) {
    const descChunks = chunkText({
      libraryItemId,
      sourceField: 'description',
      text: fields.description,
    })
    allChunks.push(...descChunks)
  }

  if (fields.contentText?.trim()) {
    const contentChunks = chunkText({
      libraryItemId,
      sourceField: 'content_text',
      text: fields.contentText,
    })
    allChunks.push(...contentChunks)
  }

  for (const att of fields.attachmentTexts) {
    const attChunks = chunkText({
      libraryItemId,
      sourceField: att.sourceField,
      text: att.text,
    })
    allChunks.push(...attChunks)
  }

  // Re-index all chunks sequentially
  allChunks.forEach((c, i) => { c.chunkIndex = i })

  return allChunks
}
