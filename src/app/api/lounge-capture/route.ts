// Phase 36B — Lounge Cross-Room Event Capture Adapter
//
// POST /api/lounge-capture — Capture recent Lounge contact as a cross-room event
//
// Confirmation flow:
// 1. First request (no body or { confirmed: false }):
//    - If first-ever capture → returns proposal with requires_confirmation: true
//    - If boundary resolved → creates event immediately
// 2. Confirmed request ({ confirmed: true }):
//    - Creates event from proposed boundary
//
// This is a governed manual capture path.
// It creates a cross_room_event using the 36A ledger.
// authority_label is always forced to 'cross_room_event_not_memory'.
//
// This route does NOT:
// - update State or Interior
// - touch Pulse/autonomy/QStash/cron
// - create journal jobs or entries
// - create Memory or Memory candidates
// - alter Archive/Memory/Library authority
// - inject prompt carryforward
// - interpret emotional impact

import { NextRequest, NextResponse } from 'next/server'
import { getOrCreateActiveThread, getMessagesForCapture } from '@/lib/lounge'
import { createCrossRoomEvent } from '@/lib/cross-room-events'

export async function POST(request: NextRequest) {
  try {
    // Parse optional body for confirmation flag
    let confirmed = false
    try {
      const body = await request.json()
      confirmed = body?.confirmed === true
    } catch {
      // No body or invalid JSON — treat as unconfirmed
    }

    // Get active thread
    const thread = await getOrCreateActiveThread()

    // Get capture proposal
    const { proposal, blocked } = await getMessagesForCapture(thread.id)

    if (blocked || !proposal) {
      return NextResponse.json({
        captured: false,
        blocked: blocked ?? 'No messages available for capture.',
      }, { status: 409 })
    }

    // If first capture requires confirmation and not yet confirmed, return proposal
    if (proposal.requiresConfirmation && !confirmed) {
      const participantNames = proposal.participants.map(p => p.label ?? p.id).join(', ')
      return NextResponse.json({
        captured: false,
        requires_confirmation: true,
        proposal: {
          messageCount: proposal.messageCount,
          firstTimestamp: proposal.firstTimestamp,
          lastTimestamp: proposal.lastTimestamp,
          participants: participantNames,
          presenceIds: proposal.presenceIds,
          taraPresent: proposal.taraPresent,
          boundaryResetReason: proposal.boundaryResetReason ?? null,
        },
      }, { status: 200 })
    }

    // Build deterministic neutral summary
    const participantNames = proposal.participants.map(p => p.label ?? p.id).join(', ')
    const summary = `Lounge contact: ${participantNames}. ${proposal.messageCount} messages captured.`

    // Create cross-room event via 36A helper
    const { event, error } = await createCrossRoomEvent({
      room_id: 'lounge',
      room_type: 'shared_room',
      source_thread_id: thread.id,
      source_message_ids: proposal.messages.map(m => m.id),
      participants: proposal.participants,
      presence_ids: proposal.presenceIds,
      tara_present: proposal.taraPresent,
      started_at: proposal.firstTimestamp,
      ended_at: proposal.lastTimestamp,
      message_count: proposal.messageCount,
      surface_mode: 'lounge',
      event_type: 'shared_room_contact',
      significance_level: 'meaningful',
      themes: [],
      summary,
      metadata: {
        phase: '36B',
        capture_source: 'lounge',
        capture_method: 'manual',
        adapter: 'lounge_event_capture',
      },
    })

    if (error || !event) {
      console.error('[lounge-capture] Create failed:', error)
      return NextResponse.json({
        captured: false,
        blocked: error ?? 'Failed to create cross-room event.',
      }, { status: 500 })
    }

    console.log(`[lounge-capture] Captured event ${event.id}: ${proposal.messageCount} messages, participants: ${participantNames}`)

    return NextResponse.json({
      captured: true,
      event: {
        id: event.id,
        room_id: event.room_id,
        room_type: event.room_type,
        event_type: event.event_type,
        authority_label: event.authority_label,
        message_count: event.message_count,
        participants: event.participants,
        presence_ids: event.presence_ids,
        tara_present: event.tara_present,
        started_at: event.started_at,
        ended_at: event.ended_at,
        summary: event.summary,
        significance_level: event.significance_level,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('[lounge-capture] Error:', error)
    return NextResponse.json({
      captured: false,
      blocked: 'Something went wrong during capture.',
    }, { status: 500 })
  }
}
