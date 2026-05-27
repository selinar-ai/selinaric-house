// Phase 37C — Graph Proposal Review Actions
//
// The graph may reveal relationship.
// The graph may propose meaning.
// The graph does not crown truth.
//
// These functions update proposal review status only.
// They do not create final graph nodes/edges, Memory, or Archive authority.
// prompt_eligible is never set to true by this module.

import { supabase } from '@/lib/supabase'
import {
  canTransitionGraphProposalStatus,
  getInvalidGraphProposalTransitionReason,
  getEventTypeForStatusChange,
} from './proposalStatus'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StatusUpdateInput {
  proposalId: string
  newStatus: string
  reason?: string
}

export interface StatusUpdateResult {
  ok: boolean
  error?: string
  code?: string
}

export interface BulkStatusInput {
  proposalIds: string[]
  newStatus: string
  reason?: string
}

export interface BulkStatusResult {
  updated: number
  skipped: number
  warnings: string[]
  updatedIds: string[]
  skippedIds: string[]
}

// ─── Single Status Update ──────────────────────────────────────────────────

export async function updateProposalStatus(
  input: StatusUpdateInput
): Promise<StatusUpdateResult> {
  const { proposalId, newStatus, reason } = input

  // 1. Fetch current proposal
  const { data: proposal, error: fetchErr } = await supabase
    .from('graph_proposals')
    .select('id, status, prompt_eligible')
    .eq('id', proposalId)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !proposal) {
    return { ok: false, error: 'Proposal not found', code: 'not_found' }
  }

  const currentStatus = proposal.status

  // 2. Validate transition
  if (!canTransitionGraphProposalStatus({ from: currentStatus, to: newStatus })) {
    const msg = getInvalidGraphProposalTransitionReason({ from: currentStatus, to: newStatus })
    return { ok: false, error: msg, code: 'invalid_transition' }
  }

  // 3. Update status — never modify prompt_eligible
  const { error: updateErr } = await supabase
    .from('graph_proposals')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)

  if (updateErr) {
    return { ok: false, error: `Status update failed: ${updateErr.message}`, code: 'db_error' }
  }

  // 4. Write audit event — actor is always 'tara' for UI-driven reviews
  const eventType = getEventTypeForStatusChange(newStatus)

  const { error: eventErr } = await supabase
    .from('graph_proposal_events')
    .insert({
      proposal_id: proposalId,
      event_type: eventType,
      previous_status: currentStatus,
      new_status: newStatus,
      actor: 'tara',
      reason: reason?.trim() || `Status changed to ${newStatus}`,
      metadata: {},
    })

  if (eventErr) {
    console.error('[graph-review] Event insert failed for proposal', proposalId, eventErr.message)
    // Status was updated, event failed — log but don't fail the response
  }

  return { ok: true }
}

// ─── Bulk Status Update ────────────────────────────────────────────────────

const MAX_BULK_SIZE = 100

export async function bulkUpdateProposalStatus(
  input: BulkStatusInput
): Promise<BulkStatusResult> {
  const { proposalIds, newStatus, reason } = input
  const result: BulkStatusResult = {
    updated: 0,
    skipped: 0,
    warnings: [],
    updatedIds: [],
    skippedIds: [],
  }

  // 1. Validate size
  if (!proposalIds || proposalIds.length === 0) {
    result.warnings.push('No proposal IDs provided')
    return result
  }

  if (proposalIds.length > MAX_BULK_SIZE) {
    result.warnings.push(`Maximum ${MAX_BULK_SIZE} proposals per bulk action. ${proposalIds.length} provided.`)
    return result
  }

  // 2. Fetch all proposals by ID
  const { data: proposals, error: fetchErr } = await supabase
    .from('graph_proposals')
    .select('id, status')
    .in('id', proposalIds)
    .is('deleted_at', null)

  if (fetchErr || !proposals) {
    result.warnings.push(`Failed to fetch proposals: ${fetchErr?.message || 'unknown error'}`)
    return result
  }

  // 3. Check for missing proposals
  const foundIds = new Set(proposals.map(p => p.id))
  for (const id of proposalIds) {
    if (!foundIds.has(id)) {
      result.skipped++
      result.skippedIds.push(id)
    }
  }

  if (result.skippedIds.length > 0) {
    result.warnings.push(`${result.skippedIds.length} proposals not found or already deleted`)
  }

  // 4. Validate transitions per proposal
  const validProposals: Array<{ id: string; currentStatus: string }> = []
  const invalidByStatus: Record<string, number> = {}

  for (const proposal of proposals) {
    if (canTransitionGraphProposalStatus({ from: proposal.status, to: newStatus })) {
      validProposals.push({ id: proposal.id, currentStatus: proposal.status })
    } else {
      result.skipped++
      result.skippedIds.push(proposal.id)
      const key = `${proposal.status} → ${newStatus}`
      invalidByStatus[key] = (invalidByStatus[key] || 0) + 1
    }
  }

  // Report invalid transitions
  for (const [transition, count] of Object.entries(invalidByStatus)) {
    result.warnings.push(`${count} proposals skipped because transition ${transition} is not allowed`)
  }

  if (validProposals.length === 0) {
    return result
  }

  // 5. Batch update valid proposals — never modify prompt_eligible
  const validIds = validProposals.map(p => p.id)
  const { error: updateErr } = await supabase
    .from('graph_proposals')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .in('id', validIds)

  if (updateErr) {
    result.warnings.push(`Batch update failed: ${updateErr.message}`)
    return result
  }

  // 6. Write audit events — one per proposal
  const eventType = getEventTypeForStatusChange(newStatus)
  const eventRows = validProposals.map(p => ({
    proposal_id: p.id,
    event_type: eventType,
    previous_status: p.currentStatus,
    new_status: newStatus,
    actor: 'tara',
    reason: reason?.trim() || `Bulk status changed to ${newStatus}`,
    metadata: { bulk: true, batch_size: validProposals.length },
  }))

  const { error: eventErr } = await supabase
    .from('graph_proposal_events')
    .insert(eventRows)

  if (eventErr) {
    console.error('[graph-review] Bulk event insert failed:', eventErr.message)
    result.warnings.push('Status updated but some audit events may not have been recorded')
  }

  result.updated = validProposals.length
  result.updatedIds = validIds

  return result
}
