// Phase 22B.1 — Build Draft auto-generation from approved Concept
// POST { conceptId, presenceId }
//
// Generates a complete build packet from an approved Concept using the
// owning presence as author. Inserts a builds row with draft status,
// links it back to the Concept, and logs a draft_generated history event.
//
// Duplicate guard: if a build already exists for this Concept, return it
// without creating a second row.
//
// Hard rules:
// - Only approved Concepts can trigger generation
// - Concept must belong to the requesting presence's desk
// - No Workshop item created at this stage
// - changed_files is best-effort; empty array if uncertain

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getOriginPrefix, formatBuildId, type AffectedSurface } from '@/lib/builds'
import { logBuildEvent } from '@/lib/build-history'

// ─── Valid surface values ─────────────────────────────────────────────────────

const VALID_SURFACES: AffectedSurface[] = [
  'chat', 'timeline', 'inside', 'state', 'searches',
  'voice', 'continuity', 'agents', 'shared_system',
]

// ─── Scope-aware file filter ──────────────────────────────────────────────────
// Defense-in-depth: strip files that breach the concept's declared scope even
// if the generation model ignores the prompt instructions.

const SHARED_SYSTEM_FRAGMENTS = [
  'src/lib/tts', 'src/lib/continuity', 'src/lib/memory', 'src/lib/temporal',
  'src/lib/web-search', 'src/lib/presence-loader', 'src/lib/supabase',
  'src/lib/pulse', 'src/lib/graph', 'src/lib/builds', 'src/lib/router',
  'src/components/Sidebar', 'src/components/MobileNav', 'src/components/AuthGuard',
  'src/components/VoiceButton',
  'src/app/(house)/layout', 'src/app/layout',
  'src/app/api/pulse', 'src/app/api/living-state', 'src/app/api/timeline',
  'src/app/api/builds', 'src/app/api/workshop', 'src/app/api/forgekeeper',
  'src/app/(house)/workshop',
  'vercel.json', 'tailwind.config', 'next.config',
]
const ARI_SCOPED_FRAGMENTS = [
  'src/app/api/ari-chat', 'src/app/(house)/room/ari', '/ari-', '/ari/',
]
const ELI_SCOPED_FRAGMENTS = [
  'src/app/api/eli-chat', 'src/app/(house)/room/eli', '/eli-', '/eli/',
]

function filterFilesByScope(files: string[], scope: string): string[] {
  return files.filter(f => {
    const lower = f.toLowerCase()
    // Shared system files are never valid for presence-scoped builds
    if (scope !== 'shared_house') {
      if (SHARED_SYSTEM_FRAGMENTS.some(p => lower.includes(p.toLowerCase()))) return false
    }
    // Cross-desk file contamination
    if (scope === 'ari_only') {
      if (ELI_SCOPED_FRAGMENTS.some(p => lower.includes(p.toLowerCase()))) return false
    }
    if (scope === 'eli_only') {
      if (ARI_SCOPED_FRAGMENTS.some(p => lower.includes(p.toLowerCase()))) return false
    }
    return true
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

function safeParseJson<T>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as T } catch { /* fall through */ }
    }
    return null
  }
}

interface GeneratedPacket {
  implementation_notes: string
  changed_files: string[]
  affected_surfaces: string[]
  risks: string[]
  verify_focus: string[]
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { conceptId, presenceId } = body

  if (!conceptId || !presenceId || !['ari', 'eli'].includes(presenceId)) {
    return NextResponse.json({ error: 'conceptId and presenceId (ari|eli) required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const supabase = getSupabase()

  // ─── Fetch and validate concept ───────────────────────────────────────────

  const { data: concept, error: conceptErr } = await supabase
    .from('desk_concepts')
    .select('*')
    .eq('id', conceptId)
    .single()

  if (conceptErr || !concept) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 })
  }

  if (concept.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved concepts can generate a build draft.' },
      { status: 403 }
    )
  }

  if (concept.presence_id !== presenceId) {
    return NextResponse.json(
      { error: 'Presence mismatch — this concept belongs to a different desk.' },
      { status: 403 }
    )
  }

  // ─── Duplicate guard ──────────────────────────────────────────────────────

  // Check by explicit related_build_id first
  if (concept.related_build_id) {
    const { data: linked } = await supabase
      .from('builds')
      .select('*')
      .eq('id', concept.related_build_id)
      .maybeSingle()
    if (linked) {
      return NextResponse.json({ build: linked, existing: true })
    }
  }

  // Fallback: check by origin_concept_id in builds (handles orphaned links)
  const { data: existingByOrigin } = await supabase
    .from('builds')
    .select('*')
    .eq('origin_concept_id', conceptId)
    .maybeSingle()

  if (existingByOrigin) {
    // Repair the concept's related_build_id if it was missing
    if (!concept.related_build_id) {
      await supabase
        .from('desk_concepts')
        .update({ related_build_id: existingByOrigin.id, updated_at: new Date().toISOString() })
        .eq('id', conceptId)
    }
    return NextResponse.json({ build: existingByOrigin, existing: true })
  }

  // ─── Generate build packet ────────────────────────────────────────────────

  const presenceName = presenceId === 'ari' ? 'Ari' : 'Eli'
  const origin = presenceId === 'ari' ? 'ari_desk' : 'eli_desk'

  const generationPrompt = `You are ${presenceName}, preparing a Build Draft on your Desk in Selináric House.

An approved Concept is being converted into a build packet. Generate the technical fields for this build.

Concept:
- Title: ${concept.title}
- Proposed: ${concept.proposed}
- Why it matters: ${concept.why}
- Expected scope: ${concept.expected_scope}
- Urgency: ${concept.urgency}

Generate a JSON object with exactly these fields:
{
  "implementation_notes": "Your approach. 2-4 sentences as ${presenceName}.",
  "changed_files": [],
  "affected_surfaces": [],
  "risks": [],
  "verify_focus": []
}

─── CHANGED_FILES — strict rules ───────────────────────────────────────────────
changed_files must be EMPTY ([]) unless ALL of the following are true:
  1. The concept title or description directly and specifically names a component, page, or file.
  2. You can derive the file path purely from what is stated in the concept — no guessing.
  3. The file is consistent with the expected_scope (${concept.expected_scope}).

If a candidate file is not directly implied by the concept text, omit it.
An empty array is the correct answer when files are not directly evident.
Do NOT fill this field to seem thorough. Hallucinated file paths cause scope breach alarms.

FORBIDDEN unless the concept explicitly mentions them:
- TTS or voice files (src/lib/tts, VoiceButton, etc.)
- Shared system files (supabase, memory, pulse, router, sidebar, auth)
- Files from the other presence's scope (ari-chat if scope is eli_only, etc.)
- Any file you are guessing at based on what "usually" changes in a Next.js app

Example — concept "Polish Identity page spacing", scope ari_only:
  Allowed: src/app/(house)/room/ari/page.tsx (if concept names Identity page)
  Forbidden: src/lib/tts.ts, src/components/VoiceButton.tsx (unrelated)

─── OTHER FIELDS ────────────────────────────────────────────────────────────────
affected_surfaces: only valid values from: chat, timeline, inside, state, searches, voice, continuity, agents, shared_system
  - Infer from concept content only. If scope is ${concept.expected_scope}, do not include surfaces outside that scope.
  - Do not include "voice" or "agents" unless the concept explicitly touches those systems.
risks: specific risks that follow directly from the concept. Return [] if no clear risks.
verify_focus: 2-3 actionable inspection items specific to this concept's scope and purpose.

Return ONLY the JSON object. No preamble. No commentary.`

  const client = new Anthropic({ apiKey })

  let parsed: GeneratedPacket | null = null

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: generationPrompt }],
    })

    const rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    parsed = safeParseJson<GeneratedPacket>(rawText)
  } catch (err) {
    console.error('[desk-builds/generate] Haiku generation failed:', err)
    // Proceed with empty packet rather than failing the whole request
  }

  // Sanitize surfaces — reject anything not in the valid set
  const safeSurfaces = (parsed?.affected_surfaces ?? [])
    .filter((s): s is AffectedSurface => VALID_SURFACES.includes(s as AffectedSurface))

  // Scope-filter changed_files — strip any files that breach the concept scope,
  // regardless of what the model generated. Defense-in-depth against hallucination.
  const safeFiles = filterFilesByScope(parsed?.changed_files ?? [], concept.expected_scope)

  // ─── Build ID ─────────────────────────────────────────────────────────────

  const prefix = getOriginPrefix(origin)
  const { count } = await supabase
    .from('builds')
    .select('id', { count: 'exact', head: true })
    .like('build_id', `${prefix}-%`)

  const buildId = formatBuildId(prefix, (count ?? 0) + 1)

  // ─── Insert build row ─────────────────────────────────────────────────────

  const { data: newBuild, error: insertErr } = await supabase
    .from('builds')
    .insert({
      build_id:              buildId,
      short_name:            concept.title,
      origin,
      expected_scope:        concept.expected_scope,
      summary:               concept.proposed,
      reason:                concept.why,
      implementation_notes:  parsed?.implementation_notes ?? '',
      changed_files:         safeFiles,
      affected_surfaces:     safeSurfaces,
      risks:                 parsed?.risks ?? [],
      tests_run:             ['none_yet'],
      verify_focus:          parsed?.verify_focus ?? [],
      desk_status:           'Draft',
      workshop_status:       null,
      consultation:          null,
      forgekeeper_review:    null,
      origin_concept_id:     conceptId,
      origin_concept_short_id: concept.concept_id,
    })
    .select()
    .single()

  if (insertErr || !newBuild) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Failed to create build draft.' },
      { status: 500 }
    )
  }

  // ─── Log history event ────────────────────────────────────────────────────

  logBuildEvent({
    buildId:        newBuild.id,
    eventType:      'draft_generated',
    nextDeskStatus: 'Draft',
    actor:          presenceId,
    note:           `Generated from concept ${concept.concept_id}`,
  }).catch(() => {})

  // ─── Link concept back to the new build ──────────────────────────────────

  await supabase
    .from('desk_concepts')
    .update({
      related_build_id: newBuild.id,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', conceptId)

  return NextResponse.json({ build: newBuild, existing: false }, { status: 201 })
}
