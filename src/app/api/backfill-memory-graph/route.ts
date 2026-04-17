import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ingestArtifact, isHighValueArtifact } from '@/lib/memory-graph'

interface BackfillSummary {
  scanned: number
  created: number
  skipped_existing: number
  skipped_ineligible: number
  failed: number
  edge_count_snapshot: number
  failures: string[]
}

export async function POST(request: NextRequest) {
  // Optional: protect with CRON_SECRET so it can't be triggered externally
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

  // Pre-fetch all existing source_id keys to drive dedup without hitting DB per artifact
  const { data: existingNodes } = await supabase
    .from('memory_nodes')
    .select('source_type, source_id')
    .not('source_id', 'is', null)

  const existingKeys = new Set(
    (existingNodes ?? []).map(n => `${n.source_type}:${n.source_id}`)
  )

  // Fetch sources
  const [notesResult, pulseResult] = await Promise.all([
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

  const notes = notesResult.data ?? []
  const pulseLogs = pulseResult.data ?? []

  const summary: BackfillSummary = {
    scanned: 0,
    created: 0,
    skipped_existing: 0,
    skipped_ineligible: 0,
    failed: 0,
    edge_count_snapshot: 0,
    failures: [],
  }

  // --- Interior notes ---
  for (const note of notes) {
    summary.scanned++
    const key = `interior_note:${note.id}`

    if (existingKeys.has(key)) {
      summary.skipped_existing++
      continue
    }

    if (!isHighValueArtifact('interior_note', note.content)) {
      summary.skipped_ineligible++
      continue
    }

    try {
      await ingestArtifact({
        presence_id: note.presence_id as 'ari' | 'eli',
        room_slug: note.room_slug ?? note.presence_id,
        source_type: 'interior_note',
        source_id: note.id,
        content: note.content,
        apiKey,
      })

      // Verify the node was actually written (ingestArtifact swallows errors silently)
      const { data: written } = await supabase
        .from('memory_nodes')
        .select('id')
        .eq('source_type', 'interior_note')
        .eq('source_id', note.id)
        .maybeSingle()

      if (written) {
        summary.created++
        existingKeys.add(key)
      } else {
        summary.failed++
        summary.failures.push(`interior_note:${note.id} — ingestArtifact returned but node not found (check Haiku meta generation or DB insert)`)
      }
    } catch (err) {
      summary.failed++
      summary.failures.push(`interior_note:${note.id} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // --- Pulse drafts ---
  for (const log of pulseLogs) {
    summary.scanned++
    const key = `pulse_draft:${log.id}`
    const content = log.draft_content as string

    if (existingKeys.has(key)) {
      summary.skipped_existing++
      continue
    }

    if (!isHighValueArtifact('pulse_draft', content)) {
      summary.skipped_ineligible++
      continue
    }

    try {
      await ingestArtifact({
        presence_id: log.presence_id as 'ari' | 'eli',
        room_slug: log.presence_id,
        source_type: 'pulse_draft',
        source_id: log.id,
        content,
        apiKey,
      })

      const { data: written } = await supabase
        .from('memory_nodes')
        .select('id')
        .eq('source_type', 'pulse_draft')
        .eq('source_id', log.id)
        .maybeSingle()

      if (written) {
        summary.created++
        existingKeys.add(key)
      } else {
        summary.failed++
        summary.failures.push(`pulse_draft:${log.id} — ingestArtifact returned but node not found`)
      }
    } catch (err) {
      summary.failed++
      summary.failures.push(`pulse_draft:${log.id} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Edge count snapshot — best-effort, edge creation is async inside ingestArtifact
  const { count } = await supabase
    .from('memory_edges')
    .select('*', { count: 'exact', head: true })

  summary.edge_count_snapshot = count ?? 0

  return NextResponse.json({
    ...summary,
    edges_note: 'Edge creation runs async after node creation — snapshot reflects edges completed by response time, not all edges.',
  })
}
