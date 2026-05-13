// Phase 33J.1 — Library Chunk Quality Audit (ESM)
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
//
// Usage: node --env-file=.env.local scripts/audit-chunks.mjs

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

  const { data: items } = await sb.from('library_items')
    .select('id, title, phase_code, authority_status, description, content_text')
    .order('title')

  const { data: chunks } = await sb.from('library_chunks')
    .select('id, library_item_id, chunk_text, source_field')

  const byItem = new Map()
  for (const c of chunks ?? []) {
    const id = c.library_item_id
    if (!byItem.has(id)) byItem.set(id, [])
    byItem.get(id).push(c)
  }

  console.log('=== Library Chunk Quality Audit ===')
  console.log(`Total items: ${items?.length ?? 0}`)
  console.log(`Total chunks: ${chunks?.length ?? 0}\n`)

  let zeroChunks = 0, titleOnly = 0, noSubst = 0, codeHeavy = 0, needsBackfill = 0

  const audits = []
  for (const item of items ?? []) {
    const ic = byItem.get(item.id) ?? []
    const counts = { substantive_source: 0, title_only: 0, metadata_only: 0, code_artifact: 0, ui_artifact: 0, prompt_artifact: 0, too_short: 0 }
    const fields = new Set()
    for (const c of ic) {
      const q = classifyChunk(c.chunk_text, c.source_field, item.title)
      counts[q]++
      fields.add(c.source_field)
    }
    const hasCT = !!(item.content_text?.trim())
    const hasDesc = !!(item.description?.trim())
    const rechunk = counts.substantive_source === 0 && (hasCT || hasDesc)
    const backfill = counts.substantive_source === 0 && !hasCT && !hasDesc
    audits.push({ ...item, counts, fields, hasCT, hasDesc, rechunk, backfill, chunkCount: ic.length })
    if (ic.length === 0) zeroChunks++
    if (counts.title_only > 0 && counts.substantive_source === 0) titleOnly++
    if (counts.substantive_source === 0) noSubst++
    if (counts.code_artifact + counts.ui_artifact + counts.prompt_artifact > counts.substantive_source) codeHeavy++
    if (backfill) needsBackfill++
  }

  console.log('--- Summary ---')
  console.log(`Zero chunks: ${zeroChunks}`)
  console.log(`Title-only (no substantive): ${titleOnly}`)
  console.log(`No substantive chunks: ${noSubst}`)
  console.log(`Code/UI-heavy: ${codeHeavy}`)
  console.log(`Needs content backfill: ${needsBackfill}\n`)

  const attention = audits.filter(a => a.backfill || a.rechunk || a.counts.substantive_source === 0)
  if (attention.length > 0) {
    console.log('--- Items Needing Attention ---')
    for (const a of attention) {
      console.log(`  ${a.title}`)
      console.log(`    Phase: ${a.phase_code ?? '-'} | Auth: ${a.authority_status ?? '-'}`)
      console.log(`    Chunks: ${a.chunkCount} | Subst: ${a.counts.substantive_source} | Title: ${a.counts.title_only} | Code: ${a.counts.code_artifact} | UI: ${a.counts.ui_artifact} | Prompt: ${a.counts.prompt_artifact} | Short: ${a.counts.too_short}`)
      console.log(`    Fields: ${[...a.fields].join(', ') || 'none'}`)
      console.log(`    content_text: ${a.hasCT} | description: ${a.hasDesc}`)
      console.log(`    ${a.rechunk ? '=> NEEDS RECHUNK' : ''} ${a.backfill ? '=> NEEDS BACKFILL' : ''}\n`)
    }
  }

  console.log('--- Key Validation Items ---')
  for (const pc of ['12A', '13', '14']) {
    const m = audits.find(a => a.phase_code === pc)
    if (!m) { console.log(`  Phase ${pc}: NOT FOUND`); continue }
    console.log(`  ${m.title}`)
    console.log(`    Chunks: ${m.chunkCount} | Subst: ${m.counts.substantive_source} | Title: ${m.counts.title_only}`)
    console.log(`    content_text: ${m.hasCT} | description: ${m.hasDesc}`)
    console.log(`    Rechunk: ${m.rechunk} | Backfill: ${m.backfill}\n`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
