// Phase 33J.1 — Library Chunk Quality Audit
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
//
// Usage: npx tsx scripts/audit-library-chunks.ts
//
// Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js'
import { classifyChunkQuality, type ChunkQuality } from '../src/lib/library/chunk-quality'

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: items, error: itemsErr } = await supabase
    .from('library_items')
    .select('id, title, phase_code, authority_status, description, content_text')
    .order('title')

  if (itemsErr) {
    console.error('Failed to fetch library items:', itemsErr.message)
    process.exit(1)
  }

  const { data: chunks, error: chunksErr } = await supabase
    .from('library_chunks')
    .select('id, library_item_id, chunk_text, source_field, embedding')

  if (chunksErr) {
    console.error('Failed to fetch library chunks:', chunksErr.message)
    process.exit(1)
  }

  const chunksByItem = new Map<string, typeof chunks>()
  for (const c of chunks ?? []) {
    const itemId = c.library_item_id as string
    if (!chunksByItem.has(itemId)) chunksByItem.set(itemId, [])
    chunksByItem.get(itemId)!.push(c)
  }

  console.log('═══ Library Chunk Quality Audit ═══')
  console.log(`Total library items: ${items?.length ?? 0}`)
  console.log(`Total chunks: ${chunks?.length ?? 0}`)
  console.log()

  type ItemAudit = {
    id: string
    title: string
    phaseCode: string | null
    authorityStatus: string | null
    chunkCount: number
    substantiveCount: number
    titleOnlyCount: number
    codeArtifactCount: number
    uiArtifactCount: number
    promptArtifactCount: number
    metadataOnlyCount: number
    tooShortCount: number
    sourceFields: Set<string>
    hasContentText: boolean
    hasDescription: boolean
    needsContentBackfill: boolean
    needsRechunk: boolean
  }

  const audits: ItemAudit[] = []
  let totalZeroChunks = 0
  let totalTitleOnly = 0
  let totalNoSubstantive = 0
  let totalCodeHeavy = 0
  let totalNeedsBackfill = 0

  for (const item of items ?? []) {
    const itemId = item.id as string
    const title = item.title as string
    const itemChunks = chunksByItem.get(itemId) ?? []

    const qualityCounts: Record<ChunkQuality, number> = {
      substantive_source: 0,
      title_only: 0,
      metadata_only: 0,
      code_artifact: 0,
      ui_artifact: 0,
      prompt_artifact: 0,
      too_short: 0,
    }

    const sourceFields = new Set<string>()

    for (const c of itemChunks) {
      const quality = classifyChunkQuality(
        c.chunk_text as string,
        c.source_field as string,
        title,
      )
      qualityCounts[quality]++
      sourceFields.add(c.source_field as string)
    }

    const hasContentText = !!(item.content_text as string)?.trim()
    const hasDescription = !!(item.description as string)?.trim()
    const needsRechunk = (qualityCounts.substantive_source === 0 && (hasContentText || hasDescription))
    const needsContentBackfill = (qualityCounts.substantive_source === 0 && !hasContentText && !hasDescription)

    const audit: ItemAudit = {
      id: itemId,
      title,
      phaseCode: item.phase_code as string | null,
      authorityStatus: item.authority_status as string | null,
      chunkCount: itemChunks.length,
      substantiveCount: qualityCounts.substantive_source,
      titleOnlyCount: qualityCounts.title_only,
      codeArtifactCount: qualityCounts.code_artifact,
      uiArtifactCount: qualityCounts.ui_artifact,
      promptArtifactCount: qualityCounts.prompt_artifact,
      metadataOnlyCount: qualityCounts.metadata_only,
      tooShortCount: qualityCounts.too_short,
      sourceFields,
      hasContentText,
      hasDescription,
      needsContentBackfill: needsContentBackfill,
      needsRechunk,
    }

    audits.push(audit)

    if (itemChunks.length === 0) totalZeroChunks++
    if (qualityCounts.title_only > 0 && qualityCounts.substantive_source === 0) totalTitleOnly++
    if (qualityCounts.substantive_source === 0) totalNoSubstantive++
    if (qualityCounts.code_artifact + qualityCounts.ui_artifact + qualityCounts.prompt_artifact > qualityCounts.substantive_source) totalCodeHeavy++
    if (needsContentBackfill) totalNeedsBackfill++
  }

  console.log('─── Summary ───')
  console.log(`Items with zero chunks: ${totalZeroChunks}`)
  console.log(`Items with title-only chunks only: ${totalTitleOnly}`)
  console.log(`Items with no substantive chunks: ${totalNoSubstantive}`)
  console.log(`Items with code/UI-heavy chunks: ${totalCodeHeavy}`)
  console.log(`Items needing content backfill: ${totalNeedsBackfill}`)
  console.log()

  // Detailed report for items needing attention
  const needsAttention = audits.filter(a =>
    a.needsContentBackfill || a.needsRechunk || a.substantiveCount === 0
  )

  if (needsAttention.length > 0) {
    console.log('─── Items Needing Attention ───')
    for (const a of needsAttention) {
      console.log(`  ${a.title}`)
      console.log(`    Phase: ${a.phaseCode ?? '—'} | Authority: ${a.authorityStatus ?? '—'}`)
      console.log(`    Chunks: ${a.chunkCount} total, ${a.substantiveCount} substantive, ${a.titleOnlyCount} title-only`)
      console.log(`    Code: ${a.codeArtifactCount} | UI: ${a.uiArtifactCount} | Prompt: ${a.promptArtifactCount} | Short: ${a.tooShortCount}`)
      console.log(`    Source fields: ${[...a.sourceFields].join(', ') || 'none'}`)
      console.log(`    Has content_text: ${a.hasContentText} | Has description: ${a.hasDescription}`)
      console.log(`    ${a.needsRechunk ? '→ NEEDS RECHUNK (has source but no substantive chunks)' : ''}`)
      console.log(`    ${a.needsContentBackfill ? '→ NEEDS CONTENT BACKFILL (no source material)' : ''}`)
      console.log()
    }
  }

  // Targeted report for key validation items
  const keyItems = ['12A', '13', '14']
  console.log('─── Key Validation Items ───')
  for (const phase of keyItems) {
    const match = audits.find(a => a.phaseCode === phase)
    if (!match) {
      console.log(`  Phase ${phase}: NOT FOUND`)
      continue
    }
    console.log(`  ${match.title}`)
    console.log(`    Chunks: ${match.chunkCount} total, ${match.substantiveCount} substantive`)
    console.log(`    Title-only: ${match.titleOnlyCount} | Code: ${match.codeArtifactCount} | UI: ${match.uiArtifactCount}`)
    console.log(`    Source fields: ${[...match.sourceFields].join(', ') || 'none'}`)
    console.log(`    Has content_text: ${match.hasContentText} | Has description: ${match.hasDescription}`)
    console.log(`    Needs rechunk: ${match.needsRechunk} | Needs backfill: ${match.needsContentBackfill}`)
    console.log()
  }

  // Full table
  console.log('─── Full Audit Table ───')
  console.log('Title | Phase | Chunks | Subst | Title | Code | UI | Prompt | Backfill | Rechunk')
  for (const a of audits) {
    const fields = [
      a.title.substring(0, 45).padEnd(45),
      (a.phaseCode ?? '—').padEnd(6),
      String(a.chunkCount).padStart(3),
      String(a.substantiveCount).padStart(3),
      String(a.titleOnlyCount).padStart(3),
      String(a.codeArtifactCount).padStart(3),
      String(a.uiArtifactCount).padStart(3),
      String(a.promptArtifactCount).padStart(3),
      a.needsContentBackfill ? 'YES' : '  —',
      a.needsRechunk ? 'YES' : '  —',
    ]
    console.log(fields.join(' | '))
  }
}

main().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
