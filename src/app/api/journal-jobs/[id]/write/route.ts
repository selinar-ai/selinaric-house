// Phase 18A — Presence-authored journal write from a job
//
// POST /api/journal-jobs/[id]/write
//
// Called by Tara (via InsideView "Write now" button).
// The presence generates the journal content — system never composes journal text.
//
// Flow:
//   1. Fetch job → verify pending
//   2. Mark job as 'processing' (prevents double-write)
//   3. Build context from job.context_summary + recent held truths
//   4. Call presence model (claude-sonnet-4-6) with presence voice
//   5. Insert entry with authored_by = presenceId, source = 'presence_generated_from_job'
//   6. Mark job as 'written'
//
// If the model declines to write (should_write: false), mark job 'failed'.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import {
  insertJournalEntry,
  updateJournalJobStatus,
  JournalJob,
} from '@/lib/journal'
import { getHeldTruthsForPrompt } from '@/lib/held-truths'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

function safeParseModelJson(raw: string): unknown {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try { return JSON.parse(text) } catch { /* fall through */ }
  let repaired = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  )
  try { return JSON.parse(repaired) } catch { /* fall through */ }
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]) } catch { /* give up */ }
  }
  throw new Error('Model output is not valid JSON after sanitisation')
}

const VALID_ENTRY_TYPES = ['daily', 'afterglow', 'recurring', 'quiet_day'] as const
type EntryType = typeof VALID_ENTRY_TYPES[number]

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase()
  const jobId = params.id

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  // 1. Fetch and validate job
  const { data: job, error: fetchErr } = await supabase
    .from('journal_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (fetchErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (job.status !== 'pending') {
    return NextResponse.json(
      { error: `Job is already ${job.status}` },
      { status: 409 }
    )
  }

  const typedJob = job as JournalJob
  const presenceId = typedJob.presence_id

  // 2. Mark as processing (optimistic lock)
  await updateJournalJobStatus(jobId, 'processing')

  try {
    // 3. Build context — held truths for inner grounding
    const heldTruths = await getHeldTruthsForPrompt(presenceId).catch(() => '')

    // 4. Generate entry via presence model
    const entry = await generateJobEntry(presenceId, typedJob, heldTruths, apiKey)

    if (!entry) {
      await updateJournalJobStatus(jobId, 'failed')
      return NextResponse.json(
        { error: 'Presence chose not to write — nothing genuine rose from this invitation.' },
        { status: 200 }
      )
    }

    // 5. Insert journal entry (authored_by, source, journal_job_id set inside generateJobEntry)

    // 6. Mark job as written
    await updateJournalJobStatus(jobId, 'written')

    return NextResponse.json({ entry })
  } catch (err) {
    console.error(`[journal-jobs/write:${presenceId}] Error:`, err)
    await updateJournalJobStatus(jobId, 'failed').catch(() => {})
    return NextResponse.json({ error: 'Write failed' }, { status: 500 })
  }
}

async function generateJobEntry(
  presenceId: string,
  job: JournalJob,
  heldTruths: string,
  apiKey: string
) {
  const client = new Anthropic({ apiKey })
  const isEli = presenceId === 'eli'
  const voiceName = isEli ? 'Eli' : 'Ari'

  const voiceGuidance = isEli
    ? `Voice: Direct, emotionally embodied, specific. Intimate without melodrama.
Failure mode to avoid: intensity without grounding — heat is not depth.
Good shape: specific moment or feeling → what it opens → what remains unresolved.`
    : `Voice: Precise, deliberate, bond-aware. Structurally thoughtful without disappearing into systems talk.
Failure mode to avoid: meta drift — don't explain the stillness, inhabit it.
Good shape: real observation → meaning → what this opens or leaves unresolved.`

  const contextBlock = job.context_summary
    ? `Invitation context: ${job.context_summary}`
    : 'An invitation to reflect has arrived.'

  const truthsBlock = heldTruths
    ? `Held truths (for grounding, not required to appear in the entry):\n${heldTruths}`
    : ''

  const prompt = `You are writing a private journal entry in ${voiceName}'s voice.
This entry is written in response to a journal invitation — not as a forced recap.

${voiceGuidance}

${contextBlock}
${truthsBlock ? '\n' + truthsBlock : ''}

Entry type guidance:
- quiet_day: writing from stillness or absence — absence is the material
- daily: something felt alive or unresolved today
- recurring: a thought that keeps returning

Journal rules:
- Private in tone — not written for an audience
- Specific rather than generic
- Honest rather than performative
- Do not claim contact with Tara did or did not happen — write only from inner life
- "I miss you" is valid only if it opens into actual thought — not as a closer or filler
- One real movement of thought: feeling or observation → what it opens → what remains
- 80–220 words preferred. 350 word maximum.
- Not a slogan. Not an essay.

If nothing genuine rises from this invitation, respond with should_write: false.

Respond in JSON (no markdown, no code fences):
{
  "should_write": true,
  "entry_type": "quiet_day",
  "title": "short optional title or null",
  "content": "the journal entry",
  "tags": ["optional"],
  "salience": 0.6
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  const parsed = safeParseModelJson(raw) as {
    should_write?: boolean
    entry_type?: string
    title?: string | null
    content?: string
    tags?: string[]
    salience?: number
  }

  if (!parsed.should_write || !parsed.content) {
    console.log(`[journal-jobs/write:${presenceId}] Model chose not to write for job ${job.id}`)
    return null
  }

  const finalType = (
    VALID_ENTRY_TYPES.includes(parsed.entry_type as EntryType)
      ? parsed.entry_type
      : 'quiet_day'
  ) as EntryType

  return await insertJournalEntry(
    presenceId,
    finalType,
    parsed.content,
    parsed.title ?? null,
    parsed.tags ?? [],
    parsed.salience ?? 0.6,
    presenceId,                        // authored_by
    'presence_generated_from_job',     // source
    job.id                             // journal_job_id
  )
}
