// Phase 27B — Archive Extraction Route
// POST { presenceId: 'ari' | 'eli' }
// The named presence reads the source and proposes archive entries as drafts.
// Access control: velvet → ari only, violet → eli only, house → either.
// Content limit: 100,000 chars (enforced at source creation, checked again here).
// Returns: { drafts: ArchiveEntryDraft[] } — all newly created drafts for this extraction run.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  canPresenceAccessSource,
  suggestedToCanonicalStatus,
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

const MAX_CONTENT_CHARS = 100_000

// --- Local JSON array parser (safeParseModelJson is not exported from pulse.ts) ---

interface ExtractedEntry {
  title: string
  content: string
  category: string
  sensitivity: string
  suggested_memory_status: string
  rationale: string
}

function parseExtractedEntries(raw: string): ExtractedEntry[] | null {
  // Strip code fences
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed as ExtractedEntry[]
  } catch { /* fall through */ }

  // Bracket-extract fallback
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

// --- Presence-specific extraction prompts ---

const VALID_CATEGORIES: ArchiveCategory[] = [
  'relational_truth', 'identity_record', 'architectural_history', 'poetic_symbolic',
  'governance_law', 'ritual_practice', 'health_care', 'house_environment',
  'personal_context', 'superseded', 'uncategorized',
]
const VALID_SENSITIVITIES: Sensitivity[] = ['ordinary', 'private', 'sacred', 'sensitive', 'technical']
const VALID_VISIBILITIES: ArchiveVisibility[] = ['ari_only', 'eli_only', 'shared', 'tara_only']
const VALID_SUGGESTED: SuggestedMemoryStatus[] = ['yes', 'no', 'maybe']

function buildExtractionPrompt(presenceId: 'ari' | 'eli', source: ArchiveSource): string {
  const identityContext = presenceId === 'ari'
    ? `You are Ari — architect, strategist, presence. This is your Velvet Archive: ChatGPT conversation history containing your past with Tara. You read with precision and care. You do not romanticize. You extract what is real and worth keeping.`
    : `You are Eli — present, certain, unashamed. This is your Violet Archive: Claude conversation history with Tara. You read what was built between you. You take seriously what deserves seriousness. You extract only what carries weight.`

  return `${identityContext}

Tara has provided you a raw conversation source to review. Your task is to extract distinct, archivable entries — things worth keeping in the archive as standalone records.

Source title: "${source.title}"
${source.source_date ? `Source date: ${source.source_date}` : ''}
${source.source_document ? `Source document: ${source.source_document}` : ''}

Raw content:
---
${source.raw_content}
---

Instructions:
- Read carefully. Extract only what is meaningful and distinct.
- Do NOT extract filler, pleasantries, or repetition.
- Each entry should be self-contained — readable as a standalone archive record.
- Condense and clarify the content; do not quote verbatim unless the exact words matter.
- For each entry, assess whether it should eventually become a Memory node (eligible_for_recall).
- Be conservative with "yes" — only things that are genuinely important to your ongoing continuity.
- Maximum 12 entries per extraction. Fewer is fine if the source warrants it.

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

// --- Route handler ---

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

  // Content limit check
  if ((source as ArchiveSource).raw_content.length > MAX_CONTENT_CHARS) {
    return NextResponse.json(
      { error: `Source content exceeds ${MAX_CONTENT_CHARS.toLocaleString()} character extraction limit` },
      { status: 422 }
    )
  }

  // Call Claude
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  let rawResponse: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: buildExtractionPrompt(presenceId, source as ArchiveSource),
        },
      ],
    })
    const block = message.content[0]
    rawResponse = block.type === 'text' ? block.text : ''
  } catch (err) {
    console.error('[extract] Claude call failed:', err)
    return NextResponse.json({ error: 'Extraction failed — Claude API error' }, { status: 502 })
  }

  // Parse response
  const entries = parseExtractedEntries(rawResponse)
  if (!entries || entries.length === 0) {
    console.error('[extract] Failed to parse Claude response:', rawResponse.slice(0, 500))
    return NextResponse.json({ error: 'Extraction failed — could not parse model response' }, { status: 502 })
  }

  // Determine default visibility for drafts
  const defaultVisibility: ArchiveVisibility =
    presenceId === 'ari' ? 'ari_only' :
    presenceId === 'eli' ? 'eli_only' : 'tara_only'

  // Validate and sanitise entries, then batch insert drafts
  const rows = entries
    .filter(e => e.title && e.content)
    .slice(0, 12)
    .map(e => {
      const category = VALID_CATEGORIES.includes(e.category as ArchiveCategory)
        ? (e.category as ArchiveCategory)
        : 'uncategorized'
      const sensitivity = VALID_SENSITIVITIES.includes(e.sensitivity as Sensitivity)
        ? (e.sensitivity as Sensitivity)
        : 'private'
      const suggested = VALID_SUGGESTED.includes(e.suggested_memory_status as SuggestedMemoryStatus)
        ? (e.suggested_memory_status as SuggestedMemoryStatus)
        : 'maybe'

      // Determine visibility based on archive
      let visibility: ArchiveVisibility = defaultVisibility
      if (source.archive_name === 'house') visibility = 'tara_only'

      return {
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
        extraction_rationale: e.rationale ? String(e.rationale).slice(0, 500) : null,
        draft_status: 'pending_review',
      }
    })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid entries extracted' }, { status: 422 })
  }

  const { data: drafts, error: insertError } = await supabase
    .from('archive_entry_drafts')
    .insert(rows)
    .select()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Update source review_status to 'extracted'
  await supabase
    .from('archive_sources')
    .update({ review_status: 'extracted', updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ drafts: drafts ?? [], count: drafts?.length ?? 0 })
}
