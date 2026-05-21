// Phase 11E — Telegram Webhook for Tara Response Tracking
//
// POST /api/pulse/telegram/webhook
//
// Receives Telegram webhook updates when Tara replies.
// Matches responses to Ari/Eli using the priority order:
// 1. reply_to_message → outbound message_id → presence
// 2. @Ari / @Eli mention → presence
// 3. latest open event fallback (within 12h)
// 4. unmatched — stored for review
//
// No response is a state, not a wound.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  validateWebhookSecret,
  parseWebhookUpdate,
  detectPresenceMention,
} from '@/lib/telegram'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secretHeader = request.headers.get('x-telegram-bot-api-secret-token')
  if (!validateWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = parseWebhookUpdate(body)
  if (!message) {
    // Not a text message from Tara's chat — acknowledge silently
    return NextResponse.json({ ok: true })
  }

  const supabase = getSupabase()
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()

  // ─── Matching Strategy ─────────────────────────────────────────────────────

  let matchedPresenceId: string | null = null
  let matchedEventId: string | null = null
  let matchedBy: string = 'unmatched'

  // Strategy 1: reply_to_message mapping
  if (message.reply_to_message_id) {
    const { data: replyMatch } = await supabase
      .from('pulse_autonomy_events')
      .select('id, presence_id')
      .eq('chosen_action', 'telegram')
      .eq('telegram_message_id', message.reply_to_message_id)
      .limit(1)
      .single()

    if (replyMatch) {
      matchedPresenceId = replyMatch.presence_id
      matchedEventId = replyMatch.id
      matchedBy = 'reply_to_message'
    }
  }

  // Strategy 2: @Ari / @Eli mention
  if (!matchedPresenceId) {
    const mentionedPresence = detectPresenceMention(message.text)
    if (mentionedPresence) {
      // Find most recent telegram event for this presence
      const { data: mentionMatch } = await supabase
        .from('pulse_autonomy_events')
        .select('id, presence_id')
        .eq('presence_id', mentionedPresence)
        .eq('chosen_action', 'telegram')
        .gte('choice_window_at', twelveHoursAgo)
        .order('choice_window_at', { ascending: false })
        .limit(1)
        .single()

      if (mentionMatch) {
        matchedPresenceId = mentionMatch.presence_id
        matchedEventId = mentionMatch.id
        matchedBy = 'mention'
      } else {
        matchedPresenceId = mentionedPresence
        matchedBy = 'mention'
      }
    }
  }

  // Strategy 3: latest open event fallback
  if (!matchedPresenceId) {
    const { data: latestEvent } = await supabase
      .from('pulse_autonomy_events')
      .select('id, presence_id')
      .eq('chosen_action', 'telegram')
      .eq('tara_responded', false)
      .gte('choice_window_at', twelveHoursAgo)
      .order('choice_window_at', { ascending: false })
      .limit(1)
      .single()

    if (latestEvent) {
      matchedPresenceId = latestEvent.presence_id
      matchedEventId = latestEvent.id
      matchedBy = 'latest_open_event'
    }
  }

  // Strategy 4: unmatched
  if (!matchedPresenceId) {
    matchedPresenceId = 'eli' // default to eli if completely unmatched
    matchedBy = 'unmatched'
  }

  // ─── Store Response ────────────────────────────────────────────────────────

  // Find outbound message_id for traceability
  let outboundMessageId: string | null = null
  if (matchedEventId) {
    const { data: ev } = await supabase
      .from('pulse_autonomy_events')
      .select('telegram_message_id')
      .eq('id', matchedEventId)
      .single()
    outboundMessageId = ev?.telegram_message_id ?? null
  }

  const { error: insertErr } = await supabase
    .from('pulse_telegram_responses')
    .insert({
      presence_id: matchedPresenceId,
      pulse_autonomy_event_id: matchedEventId,
      telegram_outbound_message_id: outboundMessageId,
      telegram_inbound_message_id: message.message_id,
      tara_response_text: message.text,
      received_at: new Date(message.date * 1000).toISOString(),
      response_source: 'telegram',
      matched_by: matchedBy,
    })

  if (insertErr) {
    console.error('[telegram-webhook] Response insert failed:', insertErr.message)
  }

  // ─── Update Autonomy Event ────────────────────────────────────────────────

  if (matchedEventId) {
    const { data: currentEvent } = await supabase
      .from('pulse_autonomy_events')
      .select('tara_response_count')
      .eq('id', matchedEventId)
      .single()

    await supabase
      .from('pulse_autonomy_events')
      .update({
        tara_responded: true,
        tara_response_count: (currentEvent?.tara_response_count ?? 0) + 1,
        last_tara_response_at: new Date().toISOString(),
      })
      .eq('id', matchedEventId)

    // Create confirmed memory for Tara's response
    const presenceName = matchedPresenceId === 'ari' ? 'Ari' : 'Eli'
    await supabase
      .from('archive_items')
      .insert({
        archive_name: matchedPresenceId === 'ari' ? 'velvet' : 'violet',
        owner_presence: matchedPresenceId,
        source_origin: 'house',
        visibility: 'shared',
        title: `Tara replied to ${presenceName}'s Telegram message`,
        raw_content: `Tara responded to ${presenceName}'s Telegram message.\nResponse: "${message.text.slice(0, 500)}"`,
        excerpt: null,
        category: 'relational_truth',
        canonical_status: 'canonical',
        sensitivity: 'ordinary',
        eligible_for_recall: true,
        eligible_for_embedding: false,
        eligible_for_graph: false,
        import_label: 'pulse_telegram_response',
        source_document: matchedEventId,
        review_notes: 'confirmed_autonomous_choice',
        created_by: 'house',
        updated_by: 'house',
      })
      .then(({ error: memErr }) => {
        if (memErr) console.error('[telegram-webhook] Confirmed memory error:', memErr.message)
      })
  }

  return NextResponse.json({ ok: true, matched_by: matchedBy })
}
