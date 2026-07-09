/**
 * Phase 43.B (= 42.4.2b) — LIVE LLM graph-edge proposal generation. THE ONLY provider-call module.
 *
 * The 42.4.2a cage validates an untrusted proposal array end-to-end (llm_postgate.ts + the
 * agent_graph_llm_proposal_record RPC). 43.B makes a LIVE model produce that array instead of a
 * fixture file — everything downstream is unchanged. The model is a SUGGESTION SOURCE, never an
 * authority; its output runs the full deterministic gauntlet before a test_owned row can exist.
 *
 * Design (Ari-ruled): ONE bounded Anthropic call (Sonnet 5), no tool loop, no agent loop, no
 * retries-with-reasoning, no JSON repair, no prose recovery. Thinking DISABLED (this is bounded
 * structured extraction; keeps output within the 1024-token cap). Structured output via
 * output_config.format. A hard cost ceiling is checked (conservative, pure) BEFORE the call —
 * fail-before-call. input_hash = sha256 of the ACTUAL model input (prompt + serialized context).
 *
 * Purity split: buildPrompt / estimateTokens / projectCostUsd / parseModelOutput /
 * computeLiveInputHash are PURE (no I/O, no SDK) and unit-tested. Only generateLiveProposals
 * touches the Anthropic SDK, and only when invoked (never at import).
 */

import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import {
  LLM_LIVE_MODEL_ID,
  LLM_LIVE_PROMPT_VERSION,
  LLM_LIVE_MAX_OUTPUT_TOKENS,
  LLM_LIVE_MAX_PROPOSALS,
  LLM_LIVE_COST_CEILING_USD,
  LLM_EDGE_WHITELIST,
  LLM_MIN_CONFIDENCE,
} from './contract'

// ─── Bounded context node (what the model is allowed to reason over) ─────────

export type LiveContextNode = {
  id: string
  label: string
  archive_name: string
  source_item_ids: string[]
}

// Sonnet 5 pricing per 1M tokens (non-intro / conservative — we intentionally use the higher
// standard rate so the ceiling never under-charges). Intro rate is lower; using the higher is safe.
const PRICE_INPUT_PER_MTOK = 3.0
const PRICE_OUTPUT_PER_MTOK = 15.0

// The structured-output schema (top level must be an object; post-gate does the real validation).
export const LIVE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from_node_id: { type: 'string' },
          to_node_id: { type: 'string' },
          edge_type: { type: 'string', enum: [...LLM_EDGE_WHITELIST] },
          confidence: { type: 'number' },
          rationale: { type: 'string' },
          source_refs: { type: 'array', items: { type: 'string' } },
        },
        required: ['from_node_id', 'to_node_id', 'edge_type', 'confidence', 'rationale', 'source_refs'],
        additionalProperties: false,
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
} as const

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Conservative token estimate for the fail-before-call budget check. ~chars/3 deliberately
 * OVER-estimates (typical English is ~chars/4) to leave headroom for the Sonnet-5 tokenizer,
 * so "refuse if projected over ceiling" is fail-closed. This is the primary ceiling gate — pure,
 * deterministic, no network (countTokens exists via the SDK but is a call; the estimator is the
 * safe pre-call guard Ari's brief blessed as the fallback).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}

/** Projected worst-case USD cost of one call (conservative input estimate + full output cap). */
export function projectCostUsd(promptText: string, maxOutputTokens: number): number {
  const inTok = estimateTokens(promptText)
  return (inTok / 1_000_000) * PRICE_INPUT_PER_MTOK + (maxOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_MTOK
}

/**
 * Build the strict, versioned prompt. Deterministic: nodes sorted by id, no timestamps/randomness.
 * Instructs the model to propose ONLY whitelisted edges between the GIVEN node ids, with rationale
 * and source_refs drawn ONLY from the provided evidence, as the LIVE_OUTPUT_SCHEMA object. No prose.
 */
export function buildPrompt(
  nodes: LiveContextNode[],
  maxProposals: number = LLM_LIVE_MAX_PROPOSALS,
): { system: string; user: string } {
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const whitelist = LLM_EDGE_WHITELIST.join(', ')
  const system = [
    'You propose candidate relationship edges between EXISTING archive graph nodes for human review.',
    'You are a suggestion source, not an authority. Every proposal is reviewed before it means anything.',
    'Hard rules — any violation is rejected downstream, so follow them exactly:',
    `- Propose ONLY these edge types: ${whitelist}. No other type. These are relational, NOT truth or ranking claims.`,
    '- Use ONLY node ids from the provided list. Never invent a node or an id.',
    '- from_node_id must be lexicographically less than to_node_id (canonical undirected pair). No self-loops.',
    '- Both endpoints of an edge must share the same archive_name.',
    `- confidence is a number in [${LLM_MIN_CONFIDENCE}, 1]. Only propose edges you are at least ${LLM_MIN_CONFIDENCE} confident in.`,
    '- source_refs must be a non-empty subset of the two endpoints’ source_item_ids shown below. Never cite anything else.',
    '- rationale: one plain sentence grounded in the provided evidence. No authority, memory, or prompt claims.',
    `- Propose AT MOST ${maxProposals} edges — the highest-confidence ones only. Fewer is fine; do not pad to reach the limit.`,
    '- Output ONLY the JSON object {"proposals": [...]}. No prose, no markdown, no extra fields.',
    'If no edge meets the bar, return {"proposals": []}.',
  ].join('\n')
  const lines = sorted.map(
    (n) => `- id=${n.id} | archive=${n.archive_name} | label=${JSON.stringify(n.label)} | source_item_ids=[${n.source_item_ids.join(', ')}]`,
  )
  const user = `Nodes (${sorted.length}):\n${lines.join('\n')}`
  return { system, user }
}

/** input_hash = sha256 of the ACTUAL model input (system + user), for reproducible provenance. */
export function computeLiveInputHash(system: string, user: string): string {
  return createHash('sha256').update(`${system}\n---\n${user}`).digest('hex')
}

/**
 * Parse the model's structured output into the raw proposal array for runPostGate.
 * NO repair, NO prose recovery: JSON.parse, then take {proposals:[...]} (or a bare array).
 * Anything else throws — fail closed, zero accepted.
 */
export function parseModelOutput(text: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('LIVE_OUTPUT_MALFORMED_JSON')
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).proposals)) {
    return (parsed as { proposals: unknown[] }).proposals
  }
  throw new Error('LIVE_OUTPUT_NOT_ARRAY')
}

// ─── The one impure function — a single bounded Anthropic call ───────────────

export type LiveGenerationResult =
  | {
      refused: true
      reason: string
      projectedUsd: number
    }
  | {
      refused: false
      raw: unknown[]
      inputHash: string
      modelId: string
      promptVersion: string
      modelSettings: Record<string, unknown>
      projectedUsd: number
      usage: { inputTokens: number; outputTokens: number } | null
    }

export type GenerateLiveOptions = {
  apiKey: string
  maxOutputTokens?: number
  costCeilingUsd?: number
  maxProposals?: number
}

/**
 * ONE bounded call: build prompt → project cost → REFUSE before the call if over ceiling →
 * call Sonnet 5 (thinking disabled, structured output) → parse (no repair) → return the raw array
 * plus real provenance. The caller passes the array to the UNCHANGED runPostGate, then records
 * accepted proposals via the RPC with generation_mode='live'. This function performs no DB write.
 */
export async function generateLiveProposals(
  nodes: LiveContextNode[],
  opts: GenerateLiveOptions,
): Promise<LiveGenerationResult> {
  const maxOutputTokens = opts.maxOutputTokens ?? LLM_LIVE_MAX_OUTPUT_TOKENS
  const ceiling = opts.costCeilingUsd ?? LLM_LIVE_COST_CEILING_USD
  const maxProposals = opts.maxProposals ?? LLM_LIVE_MAX_PROPOSALS

  const { system, user } = buildPrompt(nodes, maxProposals)
  const projectedUsd = projectCostUsd(`${system}\n${user}`, maxOutputTokens)
  const inputHash = computeLiveInputHash(system, user)

  // FAIL BEFORE CALL: refuse if the conservative projection meets or exceeds the ceiling.
  if (projectedUsd >= ceiling) {
    return { refused: true, reason: `PROJECTED_COST_OVER_CEILING ($${projectedUsd.toFixed(4)} >= $${ceiling.toFixed(2)})`, projectedUsd }
  }

  const modelSettings: Record<string, unknown> = {
    model: LLM_LIVE_MODEL_ID,
    max_tokens: maxOutputTokens,
    thinking: 'disabled',
    output: 'json_schema',
  }

  const client = new Anthropic({ apiKey: opts.apiKey })
  let text = ''
  let usage: { inputTokens: number; outputTokens: number } | null = null
  try {
    const resp = await client.messages.create({
      model: LLM_LIVE_MODEL_ID,
      max_tokens: maxOutputTokens,
      thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema', schema: LIVE_OUTPUT_SCHEMA } },
      system,
      messages: [{ role: 'user', content: user }],
    } as Anthropic.MessageCreateParamsNonStreaming)
    if (resp.stop_reason === 'refusal') {
      return { refused: true, reason: 'MODEL_REFUSAL', projectedUsd }
    }
    const block = resp.content.find((b) => b.type === 'text')
    text = block && block.type === 'text' ? block.text : ''
    usage = { inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens }
  } catch (err) {
    return { refused: true, reason: `MODEL_CALL_FAILED: ${err instanceof Error ? err.message : String(err)}`, projectedUsd }
  }

  // No repair, no recovery: parse or fail closed to zero accepted.
  let raw: unknown[]
  try {
    raw = parseModelOutput(text)
  } catch (err) {
    return { refused: true, reason: err instanceof Error ? err.message : 'LIVE_OUTPUT_UNPARSEABLE', projectedUsd }
  }

  return {
    refused: false,
    raw,
    inputHash,
    modelId: LLM_LIVE_MODEL_ID,
    promptVersion: LLM_LIVE_PROMPT_VERSION,
    modelSettings,
    projectedUsd,
    usage,
  }
}
