// Phase 33J.1 — Library Chunk Quality Classification
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
// Chunk quality improves source access. It does not create Memory or change authority.

export type ChunkQuality =
  | 'substantive_source'
  | 'title_only'
  | 'metadata_only'
  | 'code_artifact'
  | 'ui_artifact'
  | 'prompt_artifact'
  | 'too_short'

const CODE_PATTERNS = [
  /(?:import|export)\s+(?:default\s+)?(?:function|class|const|type|interface)\b/,
  /(?:module\.exports|require\(['"])/,
  /\bconst\s+\w+\s*[:=]\s*(?:React\.|useState|useRef)/,
  /\breturn\s*\(\s*</,
]

const UI_PATTERNS = [
  /(?:className|onClick|onChange|useState|useEffect|useCallback|useMemo)\s*[=({]/,
  /<(?:div|span|button|input|select|form|label)\s+className=/,
  /<\/(?:div|span|button|input|select)>/,
  /\{[^}]*\?\s*['"][^'"]*['"]\s*:\s*['"][^'"]*['"]\s*\}/,
]

const PROMPT_ARTIFACT_PATTERNS = [
  /\bconst\s+systemPrompt\b/,
  /\bsystemPrompt\s*[=:]\s*[`'"]/,
  /\bsystem_prompt\s*[=:]\s*[`'"]/,
  /\bconst\s+\w+Prompt\s*=\s*[`'"]/,
]

const MIN_SUBSTANTIVE_LENGTH = 80

export function classifyChunkQuality(
  chunkText: string,
  sourceField: string,
  itemTitle: string,
): ChunkQuality {
  const trimmed = chunkText.trim()

  if (trimmed.length < MIN_SUBSTANTIVE_LENGTH) {
    const normChunk = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const normTitle = itemTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    if (normChunk === normTitle || normTitle.includes(normChunk) || normChunk.includes(normTitle)) {
      return 'title_only'
    }
    return 'too_short'
  }

  if (sourceField === 'title') {
    return 'title_only'
  }

  const normChunk = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const normTitle = itemTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  if (normChunk === normTitle) {
    return 'title_only'
  }

  const lines = trimmed.split('\n')
  let codeLines = 0
  let uiLines = 0
  let promptLines = 0

  for (const line of lines) {
    if (CODE_PATTERNS.some(p => p.test(line))) codeLines++
    if (UI_PATTERNS.some(p => p.test(line))) uiLines++
    if (PROMPT_ARTIFACT_PATTERNS.some(p => p.test(line))) promptLines++
  }

  const totalLines = Math.max(lines.length, 1)

  if (promptLines >= 2 || (promptLines >= 1 && (codeLines + uiLines) / totalLines > 0.3)) {
    return 'prompt_artifact'
  }

  if (uiLines >= 2 && uiLines / totalLines > 0.15) {
    return 'ui_artifact'
  }

  if (codeLines >= 2 && codeLines / totalLines > 0.15) {
    return 'code_artifact'
  }

  if (sourceField === 'tags' || sourceField === 'phase_code' || sourceField === 'phase_label') {
    return 'metadata_only'
  }

  return 'substantive_source'
}

export function isSubstantiveChunk(quality: ChunkQuality): boolean {
  return quality === 'substantive_source'
}
