// Phase 37B — Graph Proposal Generator
//
// The graph may reveal relationship. The graph may propose meaning.
// The graph does not crown truth.
//
// This module generates pending graph proposals from a server-fetched source
// record using a controlled model call. It does not create approved graph
// items, canonical Memory, or prompt-injected truth.

import Anthropic from '@anthropic-ai/sdk'
import {
  GRAPH_NODE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_AUTHORITY_STATUSES,
  GRAPH_PRESENCE_SCOPES,
  isValidGraphNodeType,
  isValidGraphEdgeType,
  isValidGraphAuthorityStatus,
  isValidGraphPresenceScope,
  type GraphNodeType,
  type GraphEdgeType,
  type GraphAuthorityStatus,
  type GraphPresenceScope,
} from './ontology'
import type { GraphSourceRecord } from './sourceAdapters'
import { createProposal, type CreateProposalResult } from './proposals'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RawGeneratedProposal {
  proposalType: 'node' | 'edge'
  nodeType?: string
  edgeType?: string
  label: string
  summary: string
  confidence: number
  salience: number
  reason: string
  safeWording: string
  authorityStatus: string
  presenceScope: string
  payload?: Record<string, unknown>
}

export interface GenerationResult {
  created: number
  skipped: number
  proposals: Array<{
    proposalId?: string
    label: string
    type: string
    status: 'created' | 'duplicate' | 'invalid' | 'error'
    error?: string
  }>
  warnings: string[]
}

// ─── Allowed authority statuses per source type ─────────────────────────────

const AUTHORITY_OVERRIDES: Record<string, GraphAuthorityStatus[]> = {
  canonical_memory: ['canonical_supported'],
  held_truth: ['held_truth'],
  archive_item: ['archive_supported', 'candidate'],
  journal_entry: ['candidate', 'inferred'],
  interior_note: ['candidate', 'inferred'],
  reflection_output: ['candidate', 'inferred'],
  recent_continuity: ['candidate', 'inferred'],
  library_item: ['library_reference'],
  manual_tara: ['candidate'],
}

function enforceAuthority(
  suggested: string,
  sourceType: string,
  sourceHint: GraphAuthorityStatus
): GraphAuthorityStatus {
  const allowed = AUTHORITY_OVERRIDES[sourceType]
  if (!allowed) return sourceHint

  if (isValidGraphAuthorityStatus(suggested) && allowed.includes(suggested as GraphAuthorityStatus)) {
    return suggested as GraphAuthorityStatus
  }

  // Fall back to source hint if suggested is not allowed
  return allowed.includes(sourceHint) ? sourceHint : allowed[0]
}

// ─── Model prompt builder ───────────────────────────────────────────────────

function buildGenerationPrompt(source: GraphSourceRecord): string {
  return `You are proposing graph nodes and edges for the Selinaric House Relational Map.
You are reading a source record. You may propose up to 3 node proposals and up to 3 edge proposals.

IMPORTANT RULES:
- This is a PROPOSAL only. You are not deciding truth.
- Do not use "canonical_supported" unless the source is a confirmed canonical memory.
- Do not set prompt_eligible. It is always forced false by the system.
- Do not create Memory. You are proposing graph relationships.
- Be conservative. Fewer high-quality proposals is better than many shallow ones.
- Do not propose relationship_arc, relationship_milestone, or bond_event unless there is clear evidence of:
  named bond development, repair after rupture, trust shift, vow/reaffirmation,
  relationship phase change, shared House dynamic shift, or presence-to-presence development.
  Routine warmth alone is NOT enough.

SOURCE RECORD:
Type: ${source.sourceType}
Table: ${source.sourceTable}
ID: ${source.sourceId}
Label: ${source.label}
Scope: ${source.presenceScope}
Authority hint: ${source.authorityStatusHint}

Text:
${source.text.slice(0, 2500)}

ALLOWED NODE TYPES: ${GRAPH_NODE_TYPES.join(', ')}
ALLOWED EDGE TYPES: ${GRAPH_EDGE_TYPES.join(', ')}
ALLOWED AUTHORITY STATUSES: ${GRAPH_AUTHORITY_STATUSES.join(', ')}
ALLOWED PRESENCE SCOPES: ${GRAPH_PRESENCE_SCOPES.join(', ')}

Respond with a single JSON object. No markdown fences. No explanation.

{
  "proposals": [
    {
      "proposalType": "node",
      "nodeType": "concept",
      "label": "Short canonical label (max 60 chars)",
      "summary": "One sentence describing what this is and why it matters.",
      "confidence": 0.7,
      "salience": 0.6,
      "reason": "Why this proposal exists.",
      "safeWording": "How this could be safely described in a review context.",
      "authorityStatus": "candidate",
      "presenceScope": "shared"
    },
    {
      "proposalType": "edge",
      "edgeType": "relates_to",
      "label": "from_label -> to_label",
      "summary": "What this relationship means.",
      "confidence": 0.6,
      "salience": 0.5,
      "reason": "Why this edge is proposed.",
      "safeWording": "How this could be safely described.",
      "authorityStatus": "candidate",
      "presenceScope": "shared",
      "payload": {
        "from": { "label": "Node A", "nodeType": "concept" },
        "to": { "label": "Node B", "nodeType": "theme" }
      }
    }
  ]
}

Return only the JSON. No markdown fences. No explanation.`
}

// ─── JSON parsing ───────────────────────────────────────────────────────────

function parseGenerationResponse(raw: string): RawGeneratedProposal[] | null {
  let cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()

  function tryParse(text: string): RawGeneratedProposal[] | null {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.proposals)) {
        return parsed.proposals as RawGeneratedProposal[]
      }
    } catch { /* fall through */ }
    return null
  }

  const result = tryParse(cleaned)
  if (result) return result

  // Try extracting JSON object
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    const extracted = tryParse(cleaned.slice(start, end + 1))
    if (extracted) return extracted
  }

  return null
}

// ─── Validate a single raw proposal ────────────────────────────────────────

function validateRawProposal(
  raw: RawGeneratedProposal,
  source: GraphSourceRecord
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (raw.proposalType === 'node') {
    if (!raw.nodeType || !isValidGraphNodeType(raw.nodeType)) {
      errors.push(`Invalid node type: "${raw.nodeType}"`)
    }
  } else if (raw.proposalType === 'edge') {
    if (!raw.edgeType || !isValidGraphEdgeType(raw.edgeType)) {
      errors.push(`Invalid edge type: "${raw.edgeType}"`)
    }
    // Check payload has from/to
    const payload = raw.payload
    if (!payload?.from || !payload?.to) {
      errors.push('Edge proposal requires from and to in payload')
    }
  } else {
    errors.push(`Invalid proposal type: "${raw.proposalType}"`)
  }

  if (!raw.label || raw.label.trim().length === 0) {
    errors.push('Missing label')
  }

  if (!raw.reason || raw.reason.trim().length === 0) {
    errors.push('Missing reason')
  }

  if (!isValidGraphPresenceScope(raw.presenceScope || '')) {
    errors.push(`Invalid presence scope: "${raw.presenceScope}"`)
  }

  if (typeof raw.confidence !== 'number' || raw.confidence < 0 || raw.confidence > 1) {
    errors.push(`Invalid confidence: ${raw.confidence}`)
  }

  if (typeof raw.salience !== 'number' || raw.salience < 0 || raw.salience > 1) {
    errors.push(`Invalid salience: ${raw.salience}`)
  }

  return { valid: errors.length === 0, errors }
}

// ─── Build payload for edge proposals ───────────────────────────────────────

function buildEdgePayload(raw: RawGeneratedProposal): Record<string, unknown> {
  const payload = raw.payload ?? {}
  return {
    edgeType: raw.edgeType,
    from: payload.from ?? { label: 'unknown' },
    to: payload.to ?? { label: 'unknown' },
    summary: raw.summary || '',
    directionRequired: true,
    suggestedAuthorityStatus: raw.authorityStatus,
    suggestedPresenceScope: raw.presenceScope,
  }
}

function buildNodePayload(raw: RawGeneratedProposal): Record<string, unknown> {
  return {
    nodeType: raw.nodeType,
    label: raw.label,
    summary: raw.summary || '',
    suggestedAuthorityStatus: raw.authorityStatus,
    suggestedPresenceScope: raw.presenceScope,
  }
}

// ─── Main generation function ───────────────────────────────────────────────

export async function generateProposalsFromSource(
  source: GraphSourceRecord
): Promise<GenerationResult> {
  const result: GenerationResult = {
    created: 0,
    skipped: 0,
    proposals: [],
    warnings: [],
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    result.warnings.push('ANTHROPIC_API_KEY not set')
    return result
  }

  // 1. Call model
  const anthropic = new Anthropic({ apiKey })
  const prompt = buildGenerationPrompt(source)

  let rawText: string
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    rawText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    result.warnings.push(`Model call failed: ${msg}`)
    return result
  }

  // 2. Parse response
  const rawProposals = parseGenerationResponse(rawText)
  if (!rawProposals || rawProposals.length === 0) {
    result.warnings.push('No valid proposals parsed from model response')
    return result
  }

  // 3. Cap at 3 nodes + 3 edges
  const nodes = rawProposals.filter(p => p.proposalType === 'node').slice(0, 3)
  const edges = rawProposals.filter(p => p.proposalType === 'edge').slice(0, 3)
  const capped = [...nodes, ...edges]

  // 4. Validate and create each proposal
  for (const raw of capped) {
    const { valid, errors } = validateRawProposal(raw, source)

    if (!valid) {
      result.skipped++
      result.proposals.push({
        label: raw.label || '(unknown)',
        type: raw.proposalType,
        status: 'invalid',
        error: errors.join('; '),
      })
      continue
    }

    // Enforce authority status
    const enforcedAuthority = enforceAuthority(
      raw.authorityStatus,
      source.sourceType,
      source.authorityStatusHint
    )

    // Enforce presence scope — prefer source scope over model suggestion
    const enforcedScope: GraphPresenceScope = isValidGraphPresenceScope(raw.presenceScope)
      ? raw.presenceScope as GraphPresenceScope
      : source.presenceScope

    // Build payload
    const payload = raw.proposalType === 'edge'
      ? buildEdgePayload(raw)
      : buildNodePayload(raw)

    const createResult: CreateProposalResult = await createProposal({
      proposalType: raw.proposalType as 'node' | 'edge',
      nodeType: raw.proposalType === 'node' ? raw.nodeType as GraphNodeType : undefined,
      edgeType: raw.proposalType === 'edge' ? raw.edgeType as GraphEdgeType : undefined,
      label: raw.label.trim(),
      summary: raw.summary || '',
      payload,
      confidence: Math.max(0, Math.min(1, raw.confidence ?? 0.5)),
      salience: Math.max(0, Math.min(1, raw.salience ?? 0.5)),
      reason: raw.reason || 'Generated by graph proposal pipeline',
      safeWording: raw.safeWording,
      authorityStatus: enforcedAuthority,
      presenceScope: enforcedScope,
      primarySourceType: source.sourceType,
      primarySourceId: source.sourceId,
      generationModel: 'claude-haiku-4-5-20251001',
      sourceRecord: {
        sourceType: source.sourceType,
        sourceTable: source.sourceTable,
        sourceId: source.sourceId,
        sourceLabel: source.label,
        sourceExcerpt: source.excerpt,
        sourceMetadata: source.sourceMetadata,
      },
    })

    if (createResult.ok) {
      result.created++
      result.proposals.push({
        proposalId: createResult.proposalId,
        label: raw.label,
        type: raw.proposalType,
        status: 'created',
      })
    } else if (createResult.code === 'duplicate_pending') {
      result.skipped++
      result.proposals.push({
        label: raw.label,
        type: raw.proposalType,
        status: 'duplicate',
      })
    } else {
      result.skipped++
      result.proposals.push({
        label: raw.label,
        type: raw.proposalType,
        status: 'error',
        error: createResult.error,
      })
    }
  }

  return result
}
