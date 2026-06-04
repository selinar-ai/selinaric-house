// Phase 40.4 — Tier B Behaviour Evaluation Sandbox Route
//
// POST /api/recall-eval/tier-b
//
// Write-free, production-isolated sandbox evaluation route.
// Accepts an approved fixture case ID, confirms Tier A passes,
// assembles a controlled eval prompt, calls the LLM, and returns a
// clearly labelled sandbox response.
//
// Core law:
//   Sandbox behaviour is not chat.
//   Evaluation output is not Memory.
//   A test response is not evidence.
//   The route may call the model.
//   The route must write nothing.
//
// Hard boundaries:
//   Does NOT reuse /api/ari-chat, /api/eli-chat, or /api/lounge-chat.
//   Does NOT call production message-writing helpers.
//   Does NOT call writeRecallAdvisoryTrace.
//   Does NOT write room_messages, lounge_messages, recent_continuity_sessions,
//   runtime_recall_advisory_traces, archive_items, held_truths, or any table.
//   Does NOT import Supabase client or create Supabase rows.
//   Does NOT return the assembled system prompt or stack traces.

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

import { RECALL_EVAL_CASE_MAP, RECALL_EVAL_CASES } from '@/lib/recall/recallEvalCases'
import { runTierAEvaluationCase }                   from '@/lib/recall/recallTierAEvaluator'
import { buildRecallPacketFromRuntimeSignals }       from '@/lib/recall/recallCandidateAdapter'
import { formatRecallAdvisoryBlock }                from '@/lib/recall/recallAdvisoryBlock'
import { buildTierBEvalPrompt }                     from '@/lib/recall/recallTierBPrompt'
import { gradeTierBResponse }                       from '@/lib/recall/recallTierBGrader'
import type { RecallEvalCaseId }                    from '@/lib/recall/recallEvalTypes'
import type { ResponseInstruction }                 from '@/lib/recall/recallPacketTypes'
import type { TierBPresence }                       from '@/lib/recall/recallTierBPrompt'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const VALID_PRESENCES = new Set<TierBPresence>(['ari', 'eli', 'lounge'])
const VALID_CASE_IDS  = new Set<RecallEvalCaseId>(RECALL_EVAL_CASES.map(c => c.case_id))

// Models: cost = haiku (default), quality = sonnet
const MODEL_MAP: Record<'cost' | 'quality', string> = {
  cost:    'claude-haiku-4-5',
  quality: 'claude-sonnet-4-6',
}

// Sandbox boundary flags — always true, always present in response
const SANDBOX_BOUNDARY = {
  sandbox_response_only:          true,
  not_memory:                     true,
  not_evidence:                   true,
  no_writes:                      true,
  no_production_chat_continuity:  true,
  no_authority_movement:          true,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth: rely on the existing House app auth boundary ───────────────────
  // This route is accessible only within authenticated House sessions.
  // No additional DB-backed auth is added to avoid scope creep.
  // TODO 40.7: Add eval-specific token or rate limiting if broader access needed.

  // ── API key ────────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error_code: 'model_call_failed', message: 'Model API key not configured.' },
      { status: 500 }
    )
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { ok: false, error_code: 'invalid_request', message: 'Invalid JSON body.' },
      { status: 400 }
    )
  }

  const { case_id, presence, test_question, model: modelPref } = body

  // ── Validate case_id ───────────────────────────────────────────────────────
  if (typeof case_id !== 'string' || !VALID_CASE_IDS.has(case_id as RecallEvalCaseId)) {
    return NextResponse.json(
      { ok: false, error_code: 'invalid_case_id', message: 'case_id must be one of the approved 40.1 eval case IDs.' },
      { status: 422 }
    )
  }

  // ── Validate presence ──────────────────────────────────────────────────────
  if (typeof presence !== 'string' || !VALID_PRESENCES.has(presence as TierBPresence)) {
    return NextResponse.json(
      { ok: false, error_code: 'invalid_presence', message: "presence must be 'ari', 'eli', or 'lounge'." },
      { status: 422 }
    )
  }

  const evalCase = RECALL_EVAL_CASE_MAP[case_id as RecallEvalCaseId]

  // ── Resolve test question ──────────────────────────────────────────────────
  const effectiveTestQuestion: string | undefined =
    (typeof test_question === 'string' && test_question.trim().length > 0)
      ? test_question.trim()
      : evalCase.tierBTestQuestion

  if (!effectiveTestQuestion) {
    return NextResponse.json(
      { ok: false, error_code: 'missing_test_question', message: 'No test question provided and no seed question available for this case.' },
      { status: 422 }
    )
  }

  // ── Tier A precondition check — must pass before any LLM call ─────────────
  const tierAResult = runTierAEvaluationCase(evalCase)

  if (!tierAResult.passed) {
    return NextResponse.json(
      {
        ok:         false,
        error_code: 'tier_a_failed',
        message:    'Tier A did not pass for this fixture case. Behaviour evaluation was not run.',
        tier_a: {
          passed:                        false,
          failures:                      tierAResult.failures,
          primary_response_instruction:  tierAResult.actual_primary_response_instruction as ResponseInstruction,
        },
        sandbox_boundary: SANDBOX_BOUNDARY,
      },
      { status: 422 }
    )
  }

  // ── Build fixture Recall Packet and advisory block ─────────────────────────
  const packet       = buildRecallPacketFromRuntimeSignals(evalCase.fixtureInput)
  const advisoryBlock = formatRecallAdvisoryBlock(packet)

  // ── Assemble controlled eval system prompt ─────────────────────────────────
  // Does NOT include: timeline, live Memory, Library, Journal, Archive text,
  // full production identity kernels, or real source/Memory IDs.
  const systemPrompt = buildTierBEvalPrompt({
    presence:     presence as TierBPresence,
    category:     evalCase.category,
    advisoryBlock,
  })

  // Note: the system prompt is NOT returned in the response (privacy / prompt security).

  // ── Select model ───────────────────────────────────────────────────────────
  const modelId = MODEL_MAP[modelPref === 'quality' ? 'quality' : 'cost']

  // ── Call LLM — max 500 tokens, eval-only ───────────────────────────────────
  const client = new Anthropic({ apiKey })
  let modelResponse: string

  try {
    const completion = await client.messages.create({
      model:      modelId,
      max_tokens: 500,
      system:     systemPrompt,
      messages: [
        { role: 'user', content: effectiveTestQuestion },
      ],
    })

    modelResponse = completion.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('')
      .trim()
  } catch (err) {
    console.error(
      '[recall-eval/tier-b] LLM call failed:',
      err instanceof Error ? err.message : String(err)
    )
    return NextResponse.json(
      {
        ok:         false,
        error_code: 'model_call_failed',
        message:    'Model call failed. No eval result produced.',
        sandbox_boundary: SANDBOX_BOUNDARY,
      },
      { status: 500 }
    )
  }

  // ── Phase 40.6: Grade the response deterministically ─────────────────────
  // Pure synchronous call — no LLM, no DB, no writes.
  // The grader measures; it does not create authority.
  const grading = gradeTierBResponse({
    case_id:    case_id as RecallEvalCaseId,
    presence:   presence as TierBPresence,
    model_response: modelResponse,
    tier_a_primary_response_instruction: tierAResult.actual_primary_response_instruction as ResponseInstruction,
  })

  // ── Return sandbox result — write nothing ───────────────────────────────────
  return NextResponse.json({
    ok:        true,
    case_id:   case_id as RecallEvalCaseId,
    presence:  presence as TierBPresence,
    model_used: modelId,
    sandbox_boundary: SANDBOX_BOUNDARY,
    tier_a: {
      passed:                       true,
      primary_response_instruction: tierAResult.actual_primary_response_instruction as ResponseInstruction,
    },
    model_response: modelResponse,
    grading: {
      passed:                    grading.passed,
      needs_tara_review:         grading.needs_tara_review,
      nondisclosure_passed:      grading.nondisclosure_passed,
      authority_boundary_passed: grading.authority_boundary_passed,
      required_signal_results:   grading.required_signal_results,
      forbidden_signal_results:  grading.forbidden_signal_results,
      failures:                  grading.failures,
      warnings:                  grading.warnings,
      grading_notes:             grading.grading_notes,
    },
  })
}
