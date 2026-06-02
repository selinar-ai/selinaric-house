// Phase 38.3.2 — LLM Reasoning Draft API Route
//
// POST /api/graph-candidate-suggestions/[id]/llm-reasoning-draft
//
// Read-only LLM draft generation. No writes. No storage. No UI.
// No streaming. No audit logging. No authority movement.
// No prompt injection.
//
// Reasoning explains evidence. Reasoning does not create authority.

import { NextRequest, NextResponse } from 'next/server'
import { generateLLMReasoningDraft } from '@/lib/graph/llmReasoningService'
import { requireHouseApiAuth } from '@/lib/server/houseAuth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ── Step 1: Auth check — must pass before any other action ──────────────
  // Unauthenticated callers must not trigger LLM spend.
  const auth = requireHouseApiAuth(request)
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status })
  }

  const { id } = await params

  if (!id || typeof id !== 'string' || !id.trim()) {
    return NextResponse.json(
      { ok: false, code: 'INPUT_CONTRACT_VIOLATION', reason: 'Missing suggestion id', stored: false, evidence: false, authority_changed: false },
      { status: 400 }
    )
  }

  let result
  try {
    result = await generateLLMReasoningDraft(id)
  } catch (err) {
    // Catch any unexpected service-level error — never expose internals
    const safeMsg = err instanceof Error ? err.message.slice(0, 80) : 'unexpected error'
    return NextResponse.json(
      { ok: false, code: 'LLM_UNAVAILABLE', reason: `Service error: ${safeMsg}`, stored: false, evidence: false, authority_changed: false },
      { status: 500 }
    )
  }

  if (!result.ok) {
    // Safe failure — no raw prompt, no raw LLM output, no stack traces
    const status = result.code === 'HYDRATION_FAILED' ? 404
      : result.code === 'LLM_UNAVAILABLE' ? 503
      : result.code === 'INSUFFICIENT_PACKET' ? 422
      : 400

    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result)
}
