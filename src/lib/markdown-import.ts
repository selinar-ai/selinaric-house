// Phase 27C — Markdown/text parsing utilities for Archive Conversations import.
// Detects title, source date, message count, and excerpt from raw file content.
// Used by both the API route and the UI preview component.

export const ACCEPTED_EXTENSIONS = ['.md', '.txt']
export const MAX_CONTENT_CHARS = 500_000

// ── Title ──────────────────────────────────────────────────────────────────

/** Strip date prefix + underscores from filename to produce a readable title. */
export function filenameToTitle(filename: string): string {
  const nameOnly = filename.replace(/\.[^.]+$/, '')
  // Strip leading YYYY-MM-DD__ / YYYY-MM-DD_ / YYYY-MM-DD-
  const stripped = nameOnly.replace(/^\d{4}-\d{2}-\d{2}[_\- ]+/, '')
  const spaced = stripped.replace(/[_]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * Detect title from content, falling back to filename-derived title.
 * Priority:
 *   1. First # Heading in content
 *   2. "Title: …" or "Conversation: …" metadata line
 *   3. Filename-derived via filenameToTitle()
 */
export function detectTitle(content: string, filename: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim()

  const metaMatch = content.match(/^(?:Title|Conversation):\s*(.+)$/im)
  if (metaMatch) return metaMatch[1].trim()

  return filenameToTitle(filename)
}

// ── Source date ────────────────────────────────────────────────────────────

/**
 * Detect source date. Priority:
 *   1. "- Conversation created: YYYY-MM-DD" metadata line
 *   2. YYYY-MM-DD prefix in filename
 *   3. First "## Name — YYYY-MM-DD" message heading
 */
export function detectSourceDate(content: string, filename: string): string | null {
  const metaDate = content.match(/[-*]\s*Conversation\s+created:\s*(\d{4}-\d{2}-\d{2})/im)
  if (metaDate) return metaDate[1]

  const filenameDate = filename.match(/^(\d{4}-\d{2}-\d{2})/)
  if (filenameDate) return filenameDate[1]

  const headingDate = content.match(/^##\s+.+[—–\-]\s*(\d{4}-\d{2}-\d{2})/m)
  if (headingDate) return headingDate[1]

  return null
}

// ── Message count ──────────────────────────────────────────────────────────

/** Count ## speaker headings as a proxy for message count. */
export function estimateMessageCount(content: string): number {
  const matches = content.match(/^##\s+(Tara|Ari|Eli|User|Assistant)\b/gim)
  return matches ? matches.length : 0
}

// ── Excerpt ────────────────────────────────────────────────────────────────

/**
 * Extract a clean excerpt: skip leading metadata block, strip heading markers,
 * return first 400 meaningful characters.
 */
export function extractExcerpt(content: string): string {
  const lines = content.split('\n')
  let bodyStart = 0
  // A metadata block is consecutive lines beginning with -, *, or key: value — find
  // the first blank line or heading line to mark the body start.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '' || line.startsWith('#')) {
      bodyStart = i
      break
    }
    // If no metadata detected, start from 0
    if (i === lines.length - 1) bodyStart = 0
  }
  const body = lines.slice(bodyStart).join('\n').trim()
  const stripped = body.replace(/^#{1,6}\s+/gm, '').trim()
  return stripped.slice(0, 400)
}

// ── Parsed result ──────────────────────────────────────────────────────────

export interface ParsedFile {
  filename: string
  title: string
  source_date: string | null
  message_count: number
  excerpt: string
  char_count: number
  raw_content: string
}

export function parseMarkdownFile(filename: string, content: string): ParsedFile {
  const trimmed = content.trim()
  return {
    filename,
    title:         detectTitle(trimmed, filename),
    source_date:   detectSourceDate(trimmed, filename),
    message_count: estimateMessageCount(trimmed),
    excerpt:       extractExcerpt(trimmed),
    char_count:    trimmed.length,
    raw_content:   trimmed,
  }
}
