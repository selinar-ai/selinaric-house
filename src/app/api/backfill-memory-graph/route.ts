import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ingestArtifact, isHighValueArtifact } from '@/lib/memory-graph'

// Vercel Pro max is 60s — leave 8s buffer for scan + response
const DEADLINE_MS = 52_000

// Concurrency limit: 3 parallel Haiku calls avoids rate-limit spikes
const CONCURRENCY = 3

interface ArtifactJob {
  key: string
  label: string
  presence_id: 'ari' | 'eli'
  room_slug: string
  source_type: 'interior_note' | 'pulse_draft'
  source_id: string
  content: string
}

interface JobResult {
  key: string
  label: string
  status: 'created' | 'skipped_existing' | 'skipped_ineligible' | 'failed'
  error?: string
}

async function runPool(
  jobs: ArtifactJob[],
  existingKeys: Set<string>,
  apiKey: string,
  deadline: number
): Promise<JobResult[]> {
  const results: JobResult[] = []
  let idx = 0

  async function worker() {
    while (idx < jobs.length) {
      if (Date.now() >= deadline) break

      const job = jobs[idx++]

      if (existingKeys.has(job.key)) {
        results.push({ key: job.key, label: job.label, status: 'skipped_existing' })
        continue
      }

      if (!isHighValueArtifact(job.source_type, job.content)) {
        results.push({ key: job.key, label: job.label, status: 'skipped_ineligible' })
        continue
      }

      console.log(`[backfill] ingesting ${job.label}`)

      try {
        await ingestArtifact({
          presence_id: job.presence_id,
          room_slug: job.room_slug,
          source_type: job.source_type,
          source_id: job.source_id,
          content: job.content,
          apiKey,
        })

        const { data: written } = await supabase
          .from('memory_nodes')
          .select('id')
          .eq('source_type', job.source_type)
          .eq('source_id', job.source_id)
          .maybeSingle()

        if (written) {
          existingKeys.add(job.key)
          results.push({ key: job.key, label: job.label, status: 'created' })
          console.log(`[backfill] node created for ${job.label}`)
        } else {
          results.push({
            key: job.key,
            label: job.label,
            status: 'failed',
            error: 'ingestArtifact returned but node not found — check Haiku meta or DB insert',
          })
          console.warn(`[backfill] node missing after ingest for ${job.label}`)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ key: job.key, label: job.label, status: 'failed', error: msg })
        console.error(`[backfill] failed for ${job.label}:`, msg)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const deadline = Date.now() + DEADLINE_MS
  console.log('[backfill] starting — deadline in', DEADLINE_MS / 1000, 's')

  // Pre-fetch existing keys and source data in parallel
  const [existingResult, notesResult, pulseResult] = await Promise.all([
    supabase
      .from('memory_nodes')
      .select('source_type, source_id')
      .not('source_id', 'is', null),
    supabase
      .from('interior_notes')
      .select('id, presence_id, room_slug, content')
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('pulse_log')
      .select('id, presence_id, draft_content')
      .in('decision', ['send', 'hold'])
      .not('draft_content', 'is', null)
      .order('created_at', { ascending: true }),
  ])

  const existingKeys = new Set(
    (existingResult.data ?? []).map(n => `${n.source_type}:${n.source_id}`)
  )

  const notes = notesResult.data ?? []
  const pulseLogs = pulseResult.data ?? []

  console.log(`[backfill] scanned sources — ${notes.length} interior_notes, ${pulseLogs.length} pulse_drafts, ${existingKeys.size} nodes already in graph`)

  // Build job list
  const jobs: ArtifactJob[] = [
    ...notes.map(n => ({
      key: `interior_note:${n.id}`,
      label: `interior_note:${n.id.slice(0, 8)}`,
      presence_id: n.presence_id as 'ari' | 'eli',
      room_slug: (n.room_slug as string) ?? n.presence_id,
      source_type: 'interior_note' as const,
      source_id: n.id,
      content: n.content as string,
    })),
    ...pulseLogs.map(p => ({
      key: `pulse_draft:${p.id}`,
      label: `pulse_draft:${p.id.slice(0, 8)}`,
      presence_id: p.presence_id as 'ari' | 'eli',
      room_slug: p.presence_id as string,
      source_type: 'pulse_draft' as const,
      source_id: p.id,
      content: p.draft_content as string,
    })),
  ]

  console.log(`[backfill] ${jobs.length} total jobs — starting pool (concurrency ${CONCURRENCY})`)

  const results = await runPool(jobs, existingKeys, apiKey, deadline)

  const timedOut = Date.now() >= deadline

  const created = results.filter(r => r.status === 'created').length
  const skipped_existing = results.filter(r => r.status === 'skipped_existing').length
  const skipped_ineligible = results.filter(r => r.status === 'skipped_ineligible').length
  const failed = results.filter(r => r.status === 'failed').length
  const failures = results.filter(r => r.status === 'failed').map(r => `${r.label}: ${r.error}`)
  const unprocessed = jobs.length - results.length

  const { count: edgeCount } = await supabase
    .from('memory_edges')
    .select('*', { count: 'exact', head: true })

  console.log(`[backfill] done — created=${created} skipped=${skipped_existing + skipped_ineligible} failed=${failed} timed_out=${timedOut}`)

  return NextResponse.json({
    scanned: jobs.length,
    created,
    skipped_existing,
    skipped_ineligible,
    failed,
    unprocessed,
    timed_out: timedOut,
    edge_count_snapshot: edgeCount ?? 0,
    failures,
    edges_note: 'Edge creation is async — snapshot may be partial. Run again to create edges for newly added nodes.',
  })
}
