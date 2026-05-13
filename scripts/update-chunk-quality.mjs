// Phase 33J.1 — Update chunk_quality for existing Library chunks
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
//
// Usage: node --env-file=.env.local scripts/update-chunk-quality.mjs

import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const MIN_SUBSTANTIVE_LENGTH = 80
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
]
const PROMPT_PATTERNS = [
  /\bconst\s+systemPrompt\b/,
  /\bsystemPrompt\s*[=:]\s*[`'"]/,
  /\bsystem_prompt\s*[=:]\s*[`'"]/,
]

function classifyChunk(chunkText, sourceField, itemTitle) {
  const trimmed = chunkText.trim()
  if (trimmed.length < MIN_SUBSTANTIVE_LENGTH) {
    const nc = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const nt = itemTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    if (nc === nt || nt.includes(nc) || nc.includes(nt)) return 'title_only'
    return 'too_short'
  }
  if (sourceField === 'title') return 'title_only'
  const nc = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  const nt = itemTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
  if (nc === nt) return 'title_only'
  const lines = trimmed.split('\n')
  let code = 0, ui = 0, prompt = 0
  for (const l of lines) {
    if (CODE_PATTERNS.some(p => p.test(l))) code++
    if (UI_PATTERNS.some(p => p.test(l))) ui++
    if (PROMPT_PATTERNS.some(p => p.test(l))) prompt++
  }
  const total = Math.max(lines.length, 1)
  if (prompt >= 2 || (prompt >= 1 && (code + ui) / total > 0.3)) return 'prompt_artifact'
  if (ui >= 2 && ui / total > 0.15) return 'ui_artifact'
  if (code >= 2 && code / total > 0.15) return 'code_artifact'
  if (sourceField === 'tags' || sourceField === 'phase_code') return 'metadata_only'
  return 'substantive_source'
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing env vars'); process.exit(1) }

  const sb = createClient(url, key)

  // Get all items for title lookup
  const { data: items } = await sb.from('library_items').select('id, title')
  const titleMap = new Map()
  for (const i of items ?? []) titleMap.set(i.id, i.title)

  // Get all chunks
  const { data: chunks, error } = await sb.from('library_chunks')
    .select('id, library_item_id, chunk_text, source_field, chunk_quality')

  if (error) { console.error('Failed:', error.message); process.exit(1) }

  console.log(`Total chunks to classify: ${chunks?.length ?? 0}`)

  let updated = 0
  let unchanged = 0
  let errors = 0

  for (const c of chunks ?? []) {
    const title = titleMap.get(c.library_item_id) ?? ''
    const quality = classifyChunk(c.chunk_text, c.source_field, title)
    const isCode = quality === 'code_artifact' || quality === 'ui_artifact' || quality === 'prompt_artifact'
    const isTitle = quality === 'title_only'

    if (c.chunk_quality === quality) {
      unchanged++
      continue
    }

    const { error: upErr } = await sb.from('library_chunks')
      .update({ chunk_quality: quality, is_code_artifact: isCode, is_title_only: isTitle })
      .eq('id', c.id)

    if (upErr) {
      errors++
      if (errors <= 3) console.error(`  Error updating ${c.id}: ${upErr.message}`)
    } else {
      updated++
    }
  }

  console.log(`\nDone: ${updated} updated, ${unchanged} unchanged, ${errors} errors`)
}

main().catch(e => { console.error(e); process.exit(1) })
