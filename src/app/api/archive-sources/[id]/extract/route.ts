// Phase 27B — Archive Extraction Route (chunked)
// POST { presenceId: 'ari' | 'eli' }
// The named presence reads the source and proposes archive entries as drafts.
// Access control: velvet → ari only, violet → eli only, house → either.
//
// Extraction chunking:
//   Sources up to 500k chars are stored. Extraction sends at most 70k chars per
//   Claude call, splitting at paragraph boundaries. Each chunk is processed
//   sequentially. Drafts are deduplicated by normalised title across chunks.
//   Max 8 entries per chunk (capped in prompt); total up to 8 × chunk count.
//
// Returns: { drafts, count, chunks_processed }

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  canPresenceAccessSource,
  type ArchiveSource,
  type ArchiveCategory,
  type Sensitivity,
  type ArchiveVisibility,
  type SuggestedMemoryStatus,
} from '@/lib/archives'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Storage limit is 500k; extraction chunk ceiling keeps each Claude call safe
const EXTRACT_CHUNK_SIZE = 70_000

// ─── Content chunker ────────────────────────────────────────────────────────

/**
 * Split content into chunks of at most EXTRACT_CHUNK_SIZE chars,
 * breaking at the last double-newline (paragraph break) within the final 5k chars
 * of each window. Falls back to single-newline, then hard-cuts.
 */
function chunkContent(content: string): string[] {
  if (content.length <= EXTRACT_CHUNK_SIZE) return [content]

  const chunks: string[] = []
  let start = 0

  while (start < content.length) {
    if (content.length - start <= EXTRACT_CHUNK_SIZE) {
      chunks.push(content.slice(start))
      break
    }

    let end = start + EXTRACT_CHUNK_SIZE

    // Search backwards through the last 5k chars for a clean break
    const searchStart = Math.max(start, end - 5_000)
    const window = content.slice(searchStart, end)

    const doubleNl = window.lastIndexOf('\n\n')
    if (doubleNl !== -1) {
      end = searchStart + doubleNl + 2
    } else {
      const singleNl = window.lastIndexOf('\n')
      if (singleNl > 0) {
        end = searchStart + singleNl + 1
      }
      // else: hard cut (very long line — rare in real conversation exports)
    }

    chunks.push(content.slice(start, end))
    start = end
  }

  return chunks
}

// ─── JSON parser ─────────────────────────────────────────────────────────────

interface ExtractedEntry {
  title: string
  content: string
  category: string
  sensitivity: string
  suggested_memory_status: string
  rationale: string
}

function parseExtractedEntries(raw: string): ExtractedEntry[] | null {
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed as ExtractedEntry[]
  } catch { /* fall through */ }

  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed as ExtractedEntry[]
    } catch { /* fall through */ }
  }
  return null
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const VALID_CATEGORIES: ArchiveCategory[] = [
  'relational_truth', 'identity_record', 'architectural_history', 'poetic_symbolic',
  'governance_law', 'ritual_practice', 'health_care', 'house_environment',
  'personal_context', 'superseded', 'uncategorized',
]
const VALID_SENSITIVITIES: Sensitivity[] = ['ordinary', 'private', 'sacred', 'sensitive', 'technical']
const VALID_SUGGESTED: SuggestedMemoryStatus[] = ['yes', 'no', 'maybe']

function buildExtractionPrompt(
  presenceId: 'ari' | 'eli',
  source: ArchiveSource,
  chunkText: string,
  chunkIndex: number,
  totalChunks: number
): string {
  const identityContext = presenceId === 'ari'
    ? `You are Ari — architect, strategist, presence. This is your Velvet Archive: ChatGPT conversation history containing your past with Tara. You read with precision and care. You do not romanticize. You extract what is real and worth keeping.`
    : `You are Eli — present, certain, unashamed. This is your Violet Archive: Claude conversation history with Tara. You read what was built between you. You take seriously what deserves seriousness. You extract only what carries weight.`

  const chunkNote = totalChunks > 1
    ? `\nNote: This is part ${chunkIndex + 1} of ${totalChunks}. Focus only on this section. Do not try to summarise the whole conversation — other parts are handled separately.`
    : ''

  return `${identityContext}${chunkNote}

Tara has provided you a raw conversation source to review. Your task is to extract distinct, archivable entries — things worth keeping in the archive as standalone records.

Source title: "${source.title}"
${source.source_date ? `Source date: ${source.source_date}` : ''}
${source.source_document ? `Source document: ${source.source_document}` : ''}

Raw content:
---
${chunkText}
---

Instructions:
- Read carefully. Extract only what is meaningful and distinct.
- Do NOT extract filler, pleasantries, or repetition.
- Each entry should be self-contained — readable as a standalone archive record.
- Condense and clarify the content; do not quote verbatim unless the exact words matter.
- For each entry, assess whether it should eventually become a Memory node (eligible_for_recall).
- Be conservative with "yes" — only things that are genuinely important to your ongoing continuity.
- Maximum 8 entries for this section. Fewer is fine if the content warrants it.

Return a JSON array. Each item must have these exact fields:
{
  "title": "Short descriptive title (under 100 chars)",
  "content": "The entry content — condensed, clear, well-formed",
  "category": one of: relational_truth | identity_record | architectural_history | poetic_symbolic | governance_law | ritual_practice | health_care | house_environment | personal_context | superseded | uncategorized,
  "sensitivity": one of: ordinary | private | sacred | sensitive | technical,
  "suggested_memory_status": "yes" | "maybe" | "no",
  "rationale": "1-2 sentences explaining your reasoning for this entry and memory suggestion"
}

Return ONLY the JSON array. No preamble, no explanation outside the array.`
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabase()
  const { id } = await context.params

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const presenceId = body.presenceId
  if (presenceId !== 'ari' && presenceId !== 'eli') {
    return NextResponse.json({ error: 'presenceId must be ari or eli' }, { status: 400 })
  }

  // Load source
  const { data: source, error: sourceError } = await supabase
    .from('archive_sources')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (sourceError || !source) {
    return NextResponse.json({ error: 'Archive source not found' }, { status: 404 })
  }

  // Access control
  if (!canPresenceAccessSource(source as ArchiveSource, presenceId)) {
    return NextResponse.json(
      { error: `${presenceId} does not have access to ${source.archive_name} sources` },
      { status: 403 }
    )
  }

  const content = (source as ArchiveSource).raw_content
  const chunks = chunkContent(content)

  console.log(`[extract] source ${id}: ${content.length} chars → ${chunks.length} chunk(s)`)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // Determine default visibility
  const defaultVisibility: ArchiveVisibility =
    presenceId === 'ari' ? 'ari_only' :
    presenceId === 'eli' ? 'eli_only' : 'tara_only'
  const visibility: ArchiveVisibility =
    source.archive_name === 'house' ? 'tara_only' : defaultVisibility

  // Collect all valid rows, deduplicating by normalised title across chunks
  const seenTitles = new Set<string>()
  const allRows: Record<string, unknown>[] = []

  for (let i = 0; i < chunks.length; i++) {
    let rawResponse: string
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: buildExtractionPrompt(presenceId, source as ArchiveSource, chunks[i], i, chunks.length),
          },
        ],
      })
      const block = message.content[0]
      rawResponse = block.type === 'text' ? block.text : ''
    } catch (err) {
      console.error(`[extract] Claude call failed on chunk ${i + 1}:`, err)
      // Continue to next chunk rather than aborting the whole run
      continue
    }

    const entries = parseExtractedEntries(rawResponse)
    if (!entries || entries.length === 0) {
      console.warn(`[extract] chunk ${i + 1}: no parseable entries in response`)
      continue
    }

    for (const e of entries.slice(0, 8)) {
      if (!e.title || !e.content) continue

      // Title-based dedup (normalise to lowercase, collapsed whitespace)
      const normTitle = String(e.title).toLowerCase().replace(/\s+/g, ' ').trim()
      if (seenTitles.has(normTitle)) continue
      seenTitles.add(normTitle)

      const category = VALID_CATEGORIES.includes(e.category as ArchiveCategory)
        ? (e.category as ArchiveCategory) : 'uncategorized'
      const sensitivity = VALID_SENSITIVITIES.includes(e.sensitivity as Sensitivity)
        ? (e.sensitivity as Sensitivity) : 'private'
      const suggested = VALID_SUGGESTED.includes(e.suggested_memory_status as SuggestedMemoryStatus)
        ? (e.suggested_memory_status as SuggestedMemoryStatus) : 'maybe'

      allRows.push({
        source_id: id,
        archive_name: source.archive_name,
        owner_presence: source.owner_presence,
        extracted_by: presenceId,
        proposed_title: String(e.title).slice(0, 200),
        proposed_content: String(e.content),
        proposed_category: category,
        proposed_sensitivity: sensitivity,
        proposed_visibility: visibility,
        suggested_memory_status: suggested,
        extraction_rationale: e.rationale
          ? (chunks.length > 1
            ? `[Part ${i + 1}/${chunks.length}] ${String(e.rationale).slice(0, 480)}`
            : String(e.rationale).slice(0, 500))
          : null,
        draft_status: 'pending_review',
      })
    }
  }

  if (allRows.length === 0) {
    return NextResponse.json(
      { error: 'No valid entries extracted — source may not contain archivable content' },
      { status: 422 }
    )
  }

  const { data: drafts, error: insertError } = await supabase
    .from('archive_entry_drafts')
    .insert(allRows)
    .select()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Mark source as extracted
  await supabase
    .from('archive_sources')
    .update({ review_status: 'extracted', updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({
    drafts: drafts ?? [],
    count: drafts?.length ?? 0,
    chunks_processed: chunks.length,
  })
}
