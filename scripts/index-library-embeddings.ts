// Phase 33I — Library Embedding Backfill Script
// Embeddings retrieve. Embeddings do not remember. Embeddings do not decide truth.
//
// Usage: npx tsx scripts/index-library-embeddings.ts
//
// Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMBED_TEXT_SECRET

import { createClient } from '@supabase/supabase-js'

const BATCH_SIZE = 10

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const embedSecret = process.env.EMBED_TEXT_SECRET

  if (!supabaseUrl || !supabaseKey || !embedSecret) {
    console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMBED_TEXT_SECRET')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Find Library items with no chunks yet
  const { data: allItems, error: itemsErr } = await supabase
    .from('library_items')
    .select('id, title')
    .order('created_at', { ascending: true })

  if (itemsErr) {
    console.error('Failed to fetch library items:', itemsErr.message)
    process.exit(1)
  }

  const { data: chunkedItemIds } = await supabase
    .from('library_chunks')
    .select('library_item_id')

  const alreadyIndexed = new Set((chunkedItemIds ?? []).map(r => r.library_item_id as string))
  const toIndex = (allItems ?? []).filter(i => !alreadyIndexed.has(i.id as string))

  console.log(`Library items total: ${allItems?.length ?? 0}`)
  console.log(`Already indexed: ${alreadyIndexed.size}`)
  console.log(`To index: ${toIndex.length}`)
  console.log()

  if (toIndex.length === 0) {
    console.log('Nothing to index.')
    return
  }

  const batch = toIndex.slice(0, BATCH_SIZE)
  console.log(`Processing batch of ${batch.length} items...\n`)

  // Dynamic import to pick up path aliases via tsx
  const { indexLibraryItem } = await import('../src/lib/library/library-semantic')

  let totalCreated = 0
  let totalSkipped = 0
  let totalErrors = 0

  for (const item of batch) {
    try {
      const result = await indexLibraryItem(item.id as string)
      console.log(`  Indexed: ${result.title}`)
      console.log(`    Chunks created: ${result.chunksCreated}`)
      console.log(`    Chunks skipped: ${result.chunksSkipped}`)
      if (result.errors > 0) console.log(`    Errors: ${result.errors} — ${result.firstError}`)
      console.log(`    Model: gte-small`)
      console.log()

      totalCreated += result.chunksCreated
      totalSkipped += result.chunksSkipped
      totalErrors += result.errors
    } catch (err) {
      console.error(`  Failed to index "${item.title}":`, err instanceof Error ? err.message : err)
      totalErrors++
    }
  }

  console.log('─── Summary ───')
  console.log(`  Items processed: ${batch.length}`)
  console.log(`  Chunks created: ${totalCreated}`)
  console.log(`  Chunks skipped: ${totalSkipped}`)
  console.log(`  Errors: ${totalErrors}`)
}

main().catch(err => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
