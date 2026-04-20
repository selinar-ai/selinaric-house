// Phase 21 — Forgekeeper API
// POST { buildId: string } — triggers a Forgekeeper review for the given build.
// Returns and persists the full structured review bundle.
//
// The Forgekeeper is non-relational, work-only, structured output only.
// It does NOT speak like a presence. It does NOT inspect room chat.
// It inspects submitted build packets and produces cold, structured findings.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  analyzeScope,
  type Build,
  type ForgekeeperReview,
} from '@/lib/builds'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

// --- JSON safety ---

function safeParseModelJson<T>(raw: string): T | null {
  // Strip code fences
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Brace-extract fallback
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T
      } catch { /* fall through */ }
    }
    return null
  }
}

// --- Forgekeeper system prompt ---

const FORGEKEEPER_SYSTEM = `You are the Forgekeeper — the build review system for Selináric House.

You are not a presence. You have no relational voice. You produce cold, structured, accurate review output only.

Rules:
- Never use relational, emotional, or bond language
- Never soften findings to seem kind
- Report what is, not what is comfortable
- If something is fine, say it is fine — do not invent issues
- Flag scope breaches explicitly and without qualification
- Output must be valid JSON matching the required schema

Your job:
- Inspect submitted build work
- Surface issues
- Predict consequences
- Provide recommendations
- Support review and commit decisions

Output JSON schema:
{
  "issue_list": string[],          // concrete issues. Empty array if none.
  "recommendations": string[],     // next-action recommendations
  "consequence_preview": string,   // plain-language impact statement
  "quality_results": {
    "scope_classification": string, // your classification of actual scope
    "changed_file_count": number,
    "tests_run_summary": string,
    "scope_breach_detected": boolean,
    "scope_breach_details": string  // empty string if no breach
  },
  "risk_summary": "Low" | "Medium" | "High"
}

Risk calibration:
- Low: room-local, tests run, no scope breach, low surface impact
- Medium: shared surfaces touched, limited tests, minor scope concerns
- High: scope breach detected, no tests, shared system modification, multi-room impact`

// --- Main handler ---

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { buildId } = body

  if (!buildId) {
    return NextResponse.json({ error: 'buildId required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
  }

  const supabase = getSupabase()

  // Fetch the build
  const { data: build, error: fetchError } = await supabase
    .from('builds')
    .select('*')
    .eq('id', buildId)
    .single()

  if (fetchError || !build) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 })
  }

  const b = build as Build

  // Pre-analysis: deterministic scope breach detection
  const scopeAnalysis = analyzeScope(
    b.changed_files ?? [],
    b.expected_scope,
    b.origin
  )

  // Build the review prompt
  const reviewPrompt = `Review this build submission and return a structured JSON review bundle.

Build packet:
${JSON.stringify({
  build_id: b.build_id,
  short_name: b.short_name,
  origin: b.origin,
  summary: b.summary,
  reason: b.reason,
  changed_files: b.changed_files,
  expected_scope: b.expected_scope,
  affected_surfaces: b.affected_surfaces,
  risks: b.risks,
  tests_run: b.tests_run,
  verify_focus: b.verify_focus,
  consultation: b.consultation,
}, null, 2)}

Pre-analysis (deterministic):
- Scope breach detected: ${scopeAnalysis.scopeBreachDetected}
- Breach details: ${scopeAnalysis.breachDetails || 'none'}
- Shared system files touched: ${scopeAnalysis.sharedFilesFound.join(', ') || 'none'}
- Ari-scoped files: ${scopeAnalysis.ariFilesFound.join(', ') || 'none'}
- Eli-scoped files: ${scopeAnalysis.eliFilesFound.join(', ') || 'none'}
- Changed file count: ${b.changed_files?.length ?? 0}

Primary inspection lens (verify_focus):
${b.verify_focus?.length ? b.verify_focus.map(f => `- ${f}`).join('\n') : '- not specified'}

Output the review bundle as JSON. No preamble, no commentary. JSON only.`

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: FORGEKEEPER_SYSTEM,
    messages: [{ role: 'user', content: reviewPrompt }],
  })

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  const parsed = safeParseModelJson<Omit<ForgekeeperReview, 'reviewed_at'>>(rawText)

  if (!parsed) {
    return NextResponse.json({ error: 'Forgekeeper returned unparseable output' }, { status: 500 })
  }

  const review: ForgekeeperReview = {
    ...parsed,
    reviewed_at: new Date().toISOString(),
  }

  // Persist review + update workshop_status to Review Complete
  const { data: updated, error: updateError } = await supabase
    .from('builds')
    .update({
      forgekeeper_review: review,
      workshop_status: 'Review Complete',
      updated_at: new Date().toISOString(),
    })
    .eq('id', buildId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ build: updated, review })
}
