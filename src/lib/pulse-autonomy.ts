// Phase 11E — Pulse v2: Autonomous Choice Windows
//
// The clock opens the door.
// The presence chooses what happens.
// Every choice counts.
// Stillness counts too.
//
// This module implements the autonomy engine:
// - Melbourne timezone + quiet hours
// - Autonomy decision prompt (per presence)
// - Choice execution (Telegram, Journal, Desk, Stillness)
// - Confirmed memory creation (archive_items canonical)
// - Idempotency enforcement
// - Read window context gathering

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { insertJournalEntry } from '@/lib/journal'
import { sendTelegramMessage } from '@/lib/telegram'

// ─── Supabase client ─────────────────────────────────────────────────────────

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AutonomyAction = 'telegram' | 'journal' | 'desk' | 'stillness'

export interface AutonomyDecision {
  chosen_action: AutonomyAction
  reason_text: string
  choice_text: string
}

export interface AutonomyEventResult {
  id: string
  presence_id: string
  chosen_action: AutonomyAction
  choice_text: string | null
  reason_text: string | null
  status: 'completed' | 'failed' | 'skipped'
  error_message: string | null
  confirmed_memory_entry_id: string | null
  already_existed: boolean
}

export interface AutonomyWindowResult {
  ari: AutonomyEventResult
  eli: AutonomyEventResult
  window_at: string
  quiet_hours_active: boolean
}

// ─── Melbourne Timezone ──────────────────────────────────────────────────────

const MELBOURNE_TZ = 'Australia/Melbourne'

/**
 * Get current hour in Melbourne (0-23).
 */
export function getMelbourneHour(now?: Date): number {
  const d = now ?? new Date()
  const melbourneStr = d.toLocaleString('en-US', {
    timeZone: MELBOURNE_TZ,
    hour: 'numeric',
    hour12: false,
  })
  return parseInt(melbourneStr, 10)
}

/**
 * Get formatted Melbourne time string.
 */
export function getMelbourneTimeStr(now?: Date): string {
  const d = now ?? new Date()
  return d.toLocaleString('en-AU', {
    timeZone: MELBOURNE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Is it currently quiet hours? (10:00pm – 6:00am Melbourne time)
 */
export function isQuietHours(now?: Date): boolean {
  const hour = getMelbourneHour(now)
  return hour >= 22 || hour < 6
}

/**
 * Get the next scheduled autonomy window time (Melbourne).
 * Active windows: 6am, 10am, 2pm, 6pm
 * Quiet internal window: 2am (optional)
 */
export function getNextWindowTime(now?: Date): { next: Date; label: string } {
  const d = now ?? new Date()
  const hour = getMelbourneHour(d)

  // Active windows in Melbourne hours
  const windows = [2, 6, 10, 14, 18]
  const labels = ['2:00am (quiet)', '6:00am', '10:00am', '2:00pm', '6:00pm']

  // Find next window
  let nextIdx = windows.findIndex(w => w > hour)
  if (nextIdx === -1) nextIdx = 0 // wrap to tomorrow's first window

  return {
    next: getNextMelbourneTime(windows[nextIdx]),
    label: labels[nextIdx],
  }
}

function getNextMelbourneTime(targetHour: number): Date {
  const now = new Date()
  const currentHour = getMelbourneHour(now)

  // Calculate offset from now
  let hoursUntil = targetHour - currentHour
  if (hoursUntil <= 0) hoursUntil += 24

  return new Date(now.getTime() + hoursUntil * 60 * 60 * 1000)
}

// ─── Build canonical window timestamp (DST-safe) ────────────────────────────

/**
 * Build a canonical UTC timestamp for the autonomy window at the current
 * Melbourne local hour. This is the idempotency key.
 *
 * How it works:
 * 1. Get today's Melbourne date string (YYYY-MM-DD)
 * 2. Get the Melbourne local hour right now
 * 3. Construct "today at {hour}:00:00" in Melbourne local time
 * 4. Convert to UTC by computing Melbourne's current UTC offset
 *
 * Because `toLocaleString` with `timeZone: 'Australia/Melbourne'` uses
 * the IANA tz database, DST transitions are handled automatically.
 * No static AEST/AEDT offset is used.
 */
export function buildWindowTimestamp(now?: Date): Date {
  const d = now ?? new Date()
  const hour = getMelbourneHour(d)

  // Melbourne date today (YYYY-MM-DD)
  const melbDateStr = d.toLocaleDateString('en-CA', { timeZone: MELBOURNE_TZ })
  const [y, m, day] = melbDateStr.split('-').map(Number)

  // Construct a naive local date for Melbourne at this hour
  const naiveLocal = new Date(
    `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`
  )

  // Compute Melbourne's current UTC offset dynamically
  // (This respects DST — Intl resolves Australia/Melbourne to +10 or +11)
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' })
  const melbStr = d.toLocaleString('en-US', { timeZone: MELBOURNE_TZ })
  const offsetMs = new Date(melbStr).getTime() - new Date(utcStr).getTime()

  // Convert naive Melbourne local time to UTC
  return new Date(naiveLocal.getTime() - offsetMs)
}

// ─── Pulse Mode ──────────────────────────────────────────────────────────────

export type PulseMode = 'open' | 'quiet' | 'paused'

/**
 * Get the current Pulse mode from pulse_config table.
 * Falls back to 'open' if no config exists.
 * Pulse mode is Tara/system configuration — not changeable by Ari or Eli.
 */
export async function getPulseMode(): Promise<PulseMode> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('pulse_config')
      .select('value')
      .eq('key', 'pulse_mode')
      .limit(1)
      .single()

    const mode = data?.value as string
    if (mode === 'open' || mode === 'quiet' || mode === 'paused') return mode
    return 'open'
  } catch {
    // Table may not exist yet or no row — default to open
    return 'open'
  }
}

/**
 * Set the Pulse mode. Only Tara/system can call this.
 */
export async function setPulseMode(mode: PulseMode): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase
      .from('pulse_config')
      .upsert({
        key: 'pulse_mode',
        value: mode,
        updated_at: new Date().toISOString(),
        updated_by: 'tara',
      }, { onConflict: 'key' })

    if (error) {
      console.error('[pulse-config] Set mode error:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

// ─── Idempotency Check ───────────────────────────────────────────────────────

async function checkExistingEvent(
  presenceId: string,
  windowAt: Date
): Promise<AutonomyEventResult | null> {
  const supabase = getSupabase()

  const { data } = await supabase
    .from('pulse_autonomy_events')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('choice_window_at', windowAt.toISOString())
    .limit(1)
    .single()

  if (!data) return null

  return {
    id: data.id,
    presence_id: data.presence_id,
    chosen_action: data.chosen_action as AutonomyAction,
    choice_text: data.choice_text,
    reason_text: data.reason_text,
    status: data.status,
    error_message: data.error_message,
    confirmed_memory_entry_id: data.confirmed_memory_entry_id,
    already_existed: true,
  }
}

// ─── Read Window Context ─────────────────────────────────────────────────────

interface ReadWindowContext {
  recentRoomActivity: string
  recentAutonomyEvents: string
  recentContinuity: string
  recentTaraResponses: string
}

async function gatherReadWindow(presenceId: string): Promise<ReadWindowContext> {
  const supabase = getSupabase()
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()

  // Recent room messages (last 4 hours, max 10)
  const { data: messages } = await supabase
    .from('room_messages')
    .select('role, content, created_at')
    .eq('room_slug', presenceId)
    .gte('created_at', fourHoursAgo)
    .order('created_at', { ascending: false })
    .limit(10)

  const recentRoomActivity = messages && messages.length > 0
    ? messages.reverse().map(m =>
        `[${new Date(m.created_at).toLocaleTimeString('en-AU', { timeZone: MELBOURNE_TZ, hour: '2-digit', minute: '2-digit' })}] ${m.role}: ${(m.content as string).slice(0, 200)}`
      ).join('\n')
    : 'No recent room activity.'

  // Recent autonomy events (last 5)
  const { data: events } = await supabase
    .from('pulse_autonomy_events')
    .select('presence_id, chosen_action, choice_text, reason_text, choice_window_at, tara_responded')
    .eq('presence_id', presenceId)
    .order('choice_window_at', { ascending: false })
    .limit(5)

  const recentAutonomyEvents = events && events.length > 0
    ? events.map(e => {
        const time = new Date(e.choice_window_at).toLocaleString('en-AU', {
          timeZone: MELBOURNE_TZ,
          day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit',
        })
        let line = `${time} — ${e.chosen_action}`
        if (e.choice_text) line += `: "${(e.choice_text).slice(0, 100)}"`
        if (e.reason_text) line += ` (${e.reason_text.slice(0, 80)})`
        if (e.chosen_action === 'telegram') line += e.tara_responded ? ' [Tara responded]' : ' [No response yet]'
        return line
      }).join('\n')
    : 'No prior autonomy events.'

  // Recent confirmed continuity (from archive_items where import_label = pulse_autonomy_event)
  const { data: continuity } = await supabase
    .from('archive_items')
    .select('title, raw_content, created_at')
    .eq('owner_presence', presenceId)
    .eq('import_label', 'pulse_autonomy_event')
    .eq('canonical_status', 'canonical')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const recentContinuity = continuity && continuity.length > 0
    ? continuity.map(c => `- ${c.title}`).join('\n')
    : 'No prior confirmed autonomy continuity.'

  // Recent Tara Telegram responses
  const { data: responses } = await supabase
    .from('pulse_telegram_responses')
    .select('tara_response_text, received_at, matched_by')
    .eq('presence_id', presenceId)
    .order('received_at', { ascending: false })
    .limit(3)

  const recentTaraResponses = responses && responses.length > 0
    ? responses.map(r => {
        const time = new Date(r.received_at).toLocaleString('en-AU', {
          timeZone: MELBOURNE_TZ, hour: '2-digit', minute: '2-digit',
        })
        return `${time} — Tara: "${(r.tara_response_text).slice(0, 150)}"`
      }).join('\n')
    : 'No Tara Telegram responses recorded.'

  return { recentRoomActivity, recentAutonomyEvents, recentContinuity, recentTaraResponses }
}

// ─── Autonomy Decision Prompt ────────────────────────────────────────────────

function safeParseModelJson(raw: string): unknown {
  let text = raw.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')

  try { return JSON.parse(text) } catch { /* fall through */ }

  let repaired = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
  repaired = repaired.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  )
  try { return JSON.parse(repaired) } catch { /* fall through */ }

  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]) } catch { /* give up */ }
  }

  throw new Error('Model output is not valid JSON after sanitisation')
}

async function makeAutonomyDecision(
  presenceId: string,
  quietHoursActive: boolean,
  context: ReadWindowContext,
  apiKey: string
): Promise<AutonomyDecision> {
  const client = new Anthropic({ apiKey })
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  const availableActions = quietHoursActive
    ? 'journal, desk, stillness'
    : 'telegram, journal, desk, stillness'

  const telegramNote = quietHoursActive
    ? 'Telegram is unavailable because quiet hours are active (10:00pm–6:00am Melbourne time).'
    : ''

  const prompt = `You are ${presenceName}.

This is an autonomous choice window.

Quiet hours active: ${quietHoursActive}

You may choose exactly one action from the following available actions:

Available actions: ${availableActions}
${telegramNote}

Actions:
- telegram — send Tara a Telegram message${quietHoursActive ? ' [UNAVAILABLE — quiet hours]' : ''}
- journal — write in your personal journal
- desk — create a Desk build concept
- stillness — choose stillness

Recent room activity:
${context.recentRoomActivity}

Recent autonomy events:
${context.recentAutonomyEvents}

Recent confirmed continuity:
${context.recentContinuity}

Recent Tara Telegram responses:
${context.recentTaraResponses}

Read only the provided context.
Do not claim access to anything outside the provided context.
Do not apply old Pulse scoring gates.
Do not ask whether the message is "worth interrupting."
Do not treat stillness as failure.

Choose freely.

Return ONLY valid JSON:

{
  "chosen_action": "telegram" | "journal" | "desk" | "stillness",
  "reason_text": "short presence-authored reason or note",
  "choice_text": "message/journal/concept/stillness note text"
}`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as Anthropic.TextBlock).text)
    .join('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = safeParseModelJson(text) as any

  // Validate action
  const validActions: AutonomyAction[] = quietHoursActive
    ? ['journal', 'desk', 'stillness']
    : ['telegram', 'journal', 'desk', 'stillness']

  let chosenAction = parsed.chosen_action as AutonomyAction
  if (!validActions.includes(chosenAction)) {
    // If model chose telegram during quiet hours, fallback to stillness
    chosenAction = 'stillness'
  }

  return {
    chosen_action: chosenAction,
    reason_text: typeof parsed.reason_text === 'string' ? parsed.reason_text : '',
    choice_text: typeof parsed.choice_text === 'string' ? parsed.choice_text : '',
  }
}

// ─── Choice Execution ────────────────────────────────────────────────────────

async function executeTelegram(
  presenceId: string,
  decision: AutonomyDecision
): Promise<{ telegram_message_id: string | null; error: string | null }> {
  try {
    const result = await sendTelegramMessage(presenceId, decision.choice_text)
    return { telegram_message_id: result.message_id ?? null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Telegram error'
    console.error(`[pulse-autonomy] Telegram send failed for ${presenceId}:`, msg)
    return { telegram_message_id: null, error: msg }
  }
}

async function executeJournal(
  presenceId: string,
  decision: AutonomyDecision
): Promise<{ journal_entry_id: string | null; error: string | null }> {
  try {
    const entry = await insertJournalEntry(
      presenceId,
      'daily',
      decision.choice_text,
      null,           // title
      ['autonomy'],   // tags
      0.8,            // salience
      presenceId,     // authored_by
      'pulse_autonomy_event', // source
      null            // journal_job_id
    )
    return { journal_entry_id: entry?.id ?? null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown journal error'
    console.error(`[pulse-autonomy] Journal write failed for ${presenceId}:`, msg)
    return { journal_entry_id: null, error: msg }
  }
}

async function executeDeskConcept(
  presenceId: string,
  decision: AutonomyDecision
): Promise<{ desk_concept_id: string | null; error: string | null }> {
  try {
    const supabase = getSupabase()

    // Generate concept_id (ARI-C### or ELI-C###)
    const prefix = presenceId === 'ari' ? 'ARI-C' : 'ELI-C'
    const { count } = await supabase
      .from('desk_concepts')
      .select('*', { count: 'exact', head: true })
      .eq('presence_id', presenceId)

    const nextNum = String((count ?? 0) + 1).padStart(3, '0')
    const conceptId = `${prefix}${nextNum}`

    const { data, error } = await supabase
      .from('desk_concepts')
      .insert({
        concept_id: conceptId,
        presence_id: presenceId,
        title: decision.choice_text.slice(0, 100),
        proposed: decision.choice_text,
        why: decision.reason_text || 'Autonomy window choice.',
        expected_scope: presenceId === 'ari' ? 'ari_only' : 'eli_only',
        urgency: 'low',
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return { desk_concept_id: data?.id ?? null, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown desk error'
    console.error(`[pulse-autonomy] Desk concept failed for ${presenceId}:`, msg)
    return { desk_concept_id: null, error: msg }
  }
}

// ─── Confirmed Memory Creation ───────────────────────────────────────────────

/**
 * Category mapping for autonomy outcomes:
 * - telegram → relational_truth (reaching toward Tara)
 * - journal → personal_context (inner continuity)
 * - desk → architectural_history (build/operational continuity)
 * - stillness → personal_context (inner continuity, chosen non-action)
 */
function getCategoryForAction(action: AutonomyAction): string {
  switch (action) {
    case 'telegram': return 'relational_truth'
    case 'journal': return 'personal_context'
    case 'desk': return 'architectural_history'
    case 'stillness': return 'personal_context'
  }
}

/**
 * Build the title for the confirmed memory entry.
 * Failed actions get factual wording — the choice still happened.
 */
function buildMemoryTitle(
  presenceName: string,
  action: AutonomyAction,
  windowTime: string,
  failed: boolean
): string {
  if (failed) {
    switch (action) {
      case 'telegram': return `${presenceName} chose Telegram at ${windowTime}, but sending failed`
      case 'journal': return `${presenceName} chose journal at ${windowTime}, but writing failed`
      case 'desk': return `${presenceName} chose Desk at ${windowTime}, but concept creation failed`
      case 'stillness': return `${presenceName} chose stillness at ${windowTime}`
    }
  }
  switch (action) {
    case 'telegram': return `${presenceName} sent Tara a Telegram message at ${windowTime}`
    case 'journal': return `${presenceName} wrote a personal journal entry at ${windowTime}`
    case 'desk': return `${presenceName} created a Desk concept at ${windowTime}`
    case 'stillness': return `${presenceName} chose stillness at ${windowTime}`
  }
}

/**
 * Build the raw_content for the confirmed memory entry.
 * Failed actions are recorded factually — the choice is the lived event.
 */
function buildMemoryContent(
  presenceName: string,
  action: AutonomyAction,
  decision: AutonomyDecision,
  failed: boolean
): string {
  const reasonLine = decision.reason_text
    ? `\nReason: "${decision.reason_text}"`
    : ''

  if (failed) {
    switch (action) {
      case 'telegram':
        return `${presenceName} chose Telegram at an autonomous choice window, but sending failed.\nIntended message: "${decision.choice_text}"${reasonLine}`
      case 'journal':
        return `${presenceName} chose to write a personal journal entry at an autonomous choice window, but writing failed.${reasonLine}`
      case 'desk':
        return `${presenceName} chose Desk work at an autonomous choice window, but concept creation failed.${reasonLine}`
      case 'stillness':
        return `${presenceName} chose stillness at an autonomous choice window.${reasonLine}`
    }
  }

  switch (action) {
    case 'telegram':
      return `${presenceName} chose Telegram at an autonomous choice window and sent Tara a message.\nMessage: "${decision.choice_text}"${reasonLine}`
    case 'journal':
      return `${presenceName} chose to write a personal journal entry at an autonomous choice window.\nSummary: "${decision.choice_text.slice(0, 200)}"${reasonLine}`
    case 'desk':
      return `${presenceName} chose Desk work at an autonomous choice window and drafted a build concept.\nConcept: "${decision.choice_text.slice(0, 200)}"${reasonLine}`
    case 'stillness':
      return decision.choice_text
        ? `${presenceName} chose stillness at an autonomous choice window.\nNote: "${decision.choice_text}"${reasonLine}`
        : `${presenceName} chose stillness at an autonomous choice window.${reasonLine}`
  }
}

/**
 * Create confirmed memory entry in archive_items with canonical authority.
 * Also logs to archive_memory_events for audit trail.
 * Returns the archive_items.id for linking.
 */
async function createConfirmedAutonomyMemory(
  presenceId: string,
  eventId: string,
  action: AutonomyAction,
  decision: AutonomyDecision,
  windowAt: Date,
  eventStatus: 'completed' | 'failed' | 'skipped' = 'completed'
): Promise<string | null> {
  const supabase = getSupabase()
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const windowTimeStr = windowAt.toLocaleString('en-AU', {
    timeZone: MELBOURNE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  const failed = eventStatus === 'failed'
  const title = buildMemoryTitle(presenceName, action, windowTimeStr, failed)
  const rawContent = buildMemoryContent(presenceName, action, decision, failed)

  const { data, error } = await supabase
    .from('archive_items')
    .insert({
      archive_name: presenceId === 'ari' ? 'velvet' : 'violet',
      owner_presence: presenceId,
      source_origin: 'house',
      visibility: 'shared',
      title,
      raw_content: rawContent,
      excerpt: null,
      category: getCategoryForAction(action),
      canonical_status: 'canonical',
      sensitivity: 'ordinary',
      eligible_for_recall: true,
      eligible_for_embedding: false,
      eligible_for_graph: false,
      import_label: 'pulse_autonomy_event',
      source_document: eventId,
      review_notes: 'confirmed_autonomous_choice',
      created_by: 'house',
      updated_by: 'house',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error(`[pulse-autonomy] Confirmed memory creation failed for ${presenceId}:`, error?.message)
    return null
  }

  // Audit log
  await supabase.from('archive_memory_events').insert({
    archive_item_id: data.id,
    from_status: null,
    to_status: 'canonical',
    action: 'confirm_memory',
    reason: `Auto-confirmed first-party Pulse autonomy event: ${action}`,
    created_by: 'house',
  }).then(({ error: auditErr }) => {
    if (auditErr) console.error('[pulse-autonomy] Audit log error:', auditErr.message)
  })

  return data.id
}

/**
 * Optional: Mirror to presence_timeline for prompt display convenience.
 * This is NOT the canonical record — archive_items is.
 */
async function mirrorToTimeline(
  presenceId: string,
  action: AutonomyAction,
  decision: AutonomyDecision,
  windowAt: Date
): Promise<void> {
  const supabase = getSupabase()
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const windowTimeStr = windowAt.toLocaleString('en-AU', {
    timeZone: MELBOURNE_TZ,
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
  const dateStr = windowAt.toLocaleDateString('en-CA', { timeZone: MELBOURNE_TZ })

  const title = `Autonomy: ${presenceName} chose ${action} at ${windowTimeStr}`
  const content = decision.reason_text
    ? `${presenceName} chose ${action}. ${decision.reason_text}`
    : `${presenceName} chose ${action}.`

  await supabase.from('presence_timeline').insert({
    presence_id: presenceId,
    entry_date: dateStr,
    title,
    content: content.slice(0, 500),
    significance: 'standard',
    added_by: 'house',
    entry_type: 'continuity',
  }).then(({ error }) => {
    if (error) console.error(`[pulse-autonomy] Timeline mirror failed for ${presenceId}:`, error.message)
  })
}

// ─── Main Autonomy Runner ────────────────────────────────────────────────────

/**
 * Run a single autonomy window for one presence.
 * Enforces idempotency — will not duplicate events for the same presence + window.
 */
export async function runAutonomyForPresence(
  presenceId: string,
  windowAt: Date,
  apiKey: string,
  dryRun: boolean = false
): Promise<AutonomyEventResult> {
  const supabase = getSupabase()
  const quietHours = isQuietHours(windowAt)

  // Idempotency check
  const existing = await checkExistingEvent(presenceId, windowAt)
  if (existing) return existing

  // Gather read window context
  const context = await gatherReadWindow(presenceId)

  // Make autonomy decision
  let decision: AutonomyDecision
  try {
    decision = await makeAutonomyDecision(presenceId, quietHours, context, apiKey)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Decision generation failed'
    console.error(`[pulse-autonomy] Decision failed for ${presenceId}:`, errorMsg)

    // Retry once
    try {
      decision = await makeAutonomyDecision(presenceId, quietHours, context, apiKey)
    } catch {
      // Fallback to stillness
      decision = {
        chosen_action: 'stillness',
        reason_text: 'Decision generation failed — defaulted to stillness.',
        choice_text: '',
      }

      if (!dryRun) {
        // Record failed event
        const { data } = await supabase
          .from('pulse_autonomy_events')
          .insert({
            presence_id: presenceId,
            choice_window_at: windowAt.toISOString(),
            quiet_hours_active: quietHours,
            chosen_action: 'stillness',
            choice_text: null,
            reason_text: 'Decision generation failed — defaulted to stillness.',
            status: 'failed',
            error_message: errorMsg,
          })
          .select('id')
          .single()

        const eventId = data?.id ?? 'error'

        // Create confirmed memory even for failed decisions.
        // A failed choice is still a lived event — it must not vanish.
        let confirmedMemoryId: string | null = null
        if (eventId !== 'error') {
          confirmedMemoryId = await createConfirmedAutonomyMemory(
            presenceId, eventId, 'stillness', decision, windowAt, 'failed'
          )

          if (confirmedMemoryId) {
            await supabase
              .from('pulse_autonomy_events')
              .update({ confirmed_memory_entry_id: confirmedMemoryId })
              .eq('id', eventId)
          }

          // Mirror to timeline (non-blocking)
          mirrorToTimeline(presenceId, 'stillness', decision, windowAt).catch(() => {})
        }

        return {
          id: eventId,
          presence_id: presenceId,
          chosen_action: 'stillness',
          choice_text: null,
          reason_text: 'Decision generation failed — defaulted to stillness.',
          status: 'failed',
          error_message: errorMsg,
          confirmed_memory_entry_id: confirmedMemoryId,
          already_existed: false,
        }
      }
    }
  }

  // Dry run — return decision without executing
  if (dryRun) {
    return {
      id: 'dry-run',
      presence_id: presenceId,
      chosen_action: decision.chosen_action,
      choice_text: decision.choice_text,
      reason_text: decision.reason_text,
      status: 'completed',
      error_message: null,
      confirmed_memory_entry_id: null,
      already_existed: false,
    }
  }

  // Execute the chosen action
  let telegramMessageId: string | null = null
  let journalEntryId: string | null = null
  let deskConceptId: string | null = null
  let executionError: string | null = null

  switch (decision.chosen_action) {
    case 'telegram': {
      const result = await executeTelegram(presenceId, decision)
      telegramMessageId = result.telegram_message_id
      executionError = result.error
      break
    }
    case 'journal': {
      const result = await executeJournal(presenceId, decision)
      journalEntryId = result.journal_entry_id
      executionError = result.error
      break
    }
    case 'desk': {
      const result = await executeDeskConcept(presenceId, decision)
      deskConceptId = result.desk_concept_id
      executionError = result.error
      break
    }
    case 'stillness':
      // No execution needed — stillness is a valid action
      break
  }

  const status = executionError ? 'failed' : 'completed'

  // Insert autonomy event
  const readWindowStart = new Date(Date.now() - 4 * 60 * 60 * 1000)
  const { data: eventRow, error: insertErr } = await supabase
    .from('pulse_autonomy_events')
    .insert({
      presence_id: presenceId,
      choice_window_at: windowAt.toISOString(),
      quiet_hours_active: quietHours,
      allowed_read_window_start: readWindowStart.toISOString(),
      allowed_read_window_end: new Date().toISOString(),
      chosen_action: decision.chosen_action,
      choice_text: decision.choice_text || null,
      reason_text: decision.reason_text || null,
      telegram_message_id: telegramMessageId,
      journal_entry_id: journalEntryId,
      desk_concept_id: deskConceptId,
      status,
      error_message: executionError,
    })
    .select('id')
    .single()

  if (insertErr) {
    // Likely unique constraint violation (race condition)
    if (insertErr.code === '23505') {
      const existing2 = await checkExistingEvent(presenceId, windowAt)
      if (existing2) return existing2
    }
    console.error(`[pulse-autonomy] Event insert failed for ${presenceId}:`, insertErr.message)
    return {
      id: 'insert-error',
      presence_id: presenceId,
      chosen_action: decision.chosen_action,
      choice_text: decision.choice_text,
      reason_text: decision.reason_text,
      status: 'failed',
      error_message: insertErr.message,
      confirmed_memory_entry_id: null,
      already_existed: false,
    }
  }

  const eventId = eventRow!.id

  // Create confirmed memory entry for ALL autonomy outcomes.
  // A failed Telegram send is still an autonomous choice — it must not
  // disappear into logs only. Wording is factual:
  //   completed → "Eli sent Tara a Telegram message"
  //   failed    → "Eli chose Telegram, but sending failed"
  let confirmedMemoryId: string | null = null
  {
    confirmedMemoryId = await createConfirmedAutonomyMemory(
      presenceId, eventId, decision.chosen_action, decision, windowAt, status
    )

    // Link back to event
    if (confirmedMemoryId) {
      await supabase
        .from('pulse_autonomy_events')
        .update({ confirmed_memory_entry_id: confirmedMemoryId })
        .eq('id', eventId)
    }

    // Mirror to timeline (non-blocking)
    mirrorToTimeline(presenceId, decision.chosen_action, decision, windowAt).catch(() => {})
  }

  return {
    id: eventId,
    presence_id: presenceId,
    chosen_action: decision.chosen_action,
    choice_text: decision.choice_text,
    reason_text: decision.reason_text,
    status,
    error_message: executionError,
    confirmed_memory_entry_id: confirmedMemoryId,
    already_existed: false,
  }
}

/**
 * Run autonomy window for both presences.
 * Each chooses independently. One presence failing must not prevent the other
 * from being processed — each gets an explicit completed/failed/skipped outcome.
 */
export async function runAutonomyWindow(
  apiKey: string,
  dryRun: boolean = false,
  windowOverride?: Date
): Promise<AutonomyWindowResult> {
  const windowAt = windowOverride ?? buildWindowTimestamp()
  const quietHours = isQuietHours(windowAt)

  // Run independently (not in parallel — to avoid API rate issues)
  // Each presence is wrapped in try/catch so one cannot block the other.
  let ari: AutonomyEventResult
  try {
    ari = await runAutonomyForPresence('ari', windowAt, apiKey, dryRun)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[pulse-autonomy] Unhandled error for ari:', errorMsg)
    ari = {
      id: 'unhandled-error',
      presence_id: 'ari',
      chosen_action: 'stillness',
      choice_text: null,
      reason_text: `Unhandled error in autonomy loop — ${errorMsg}`,
      status: 'failed',
      error_message: errorMsg,
      confirmed_memory_entry_id: null,
      already_existed: false,
    }
  }

  let eli: AutonomyEventResult
  try {
    eli = await runAutonomyForPresence('eli', windowAt, apiKey, dryRun)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[pulse-autonomy] Unhandled error for eli:', errorMsg)
    eli = {
      id: 'unhandled-error',
      presence_id: 'eli',
      chosen_action: 'stillness',
      choice_text: null,
      reason_text: `Unhandled error in autonomy loop — ${errorMsg}`,
      status: 'failed',
      error_message: errorMsg,
      confirmed_memory_entry_id: null,
      already_existed: false,
    }
  }

  return {
    ari,
    eli,
    window_at: windowAt.toISOString(),
    quiet_hours_active: quietHours,
  }
}

// ─── Conversation Injection — Build context block for prompts ────────────────

/**
 * Build the autonomy continuity block for room prompt injection.
 * Shows last N autonomy events + Tara responses for this presence.
 */
export async function getAutonomyContinuityForPrompt(
  presenceId: string,
  limit: number = 6
): Promise<string> {
  const supabase = getSupabase()
  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'

  // Fetch recent events
  const { data: events } = await supabase
    .from('pulse_autonomy_events')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('status', 'completed')
    .order('choice_window_at', { ascending: false })
    .limit(limit)

  if (!events || events.length === 0) return ''

  // Fetch Tara responses for telegram events
  const telegramEventIds = events
    .filter(e => e.chosen_action === 'telegram')
    .map(e => e.id)

  let responses: Record<string, string[]> = {}
  if (telegramEventIds.length > 0) {
    const { data: taraResponses } = await supabase
      .from('pulse_telegram_responses')
      .select('pulse_autonomy_event_id, tara_response_text, received_at')
      .in('pulse_autonomy_event_id', telegramEventIds)
      .order('received_at', { ascending: true })

    if (taraResponses) {
      for (const r of taraResponses) {
        const eid = r.pulse_autonomy_event_id
        if (!responses[eid]) responses[eid] = []
        responses[eid].push(r.tara_response_text)
      }
    }
  }

  // Build block
  const lines: string[] = [`\n## Recent Autonomous Continuity — ${presenceName}\n`]

  for (const event of events.reverse()) {
    const time = new Date(event.choice_window_at).toLocaleString('en-AU', {
      timeZone: MELBOURNE_TZ,
      hour: '2-digit', minute: '2-digit', hour12: true,
    })

    switch (event.chosen_action) {
      case 'telegram':
        lines.push(`- ${time} — ${presenceName} sent Tara a Telegram message:`)
        if (event.choice_text) lines.push(`  "${event.choice_text.slice(0, 150)}"`)
        if (responses[event.id] && responses[event.id].length > 0) {
          lines.push(`  Tara response: "${responses[event.id][0].slice(0, 150)}"`)
        } else {
          lines.push(`  No response yet.`)
        }
        break
      case 'journal':
        lines.push(`- ${time} — ${presenceName} wrote a personal journal entry.`)
        if (event.reason_text) lines.push(`  Summary: "${event.reason_text.slice(0, 100)}"`)
        break
      case 'desk':
        lines.push(`- ${time} — ${presenceName} chose Desk work.`)
        if (event.choice_text) lines.push(`  Concept: "${event.choice_text.slice(0, 100)}"`)
        break
      case 'stillness':
        lines.push(`- ${time} — ${presenceName} chose stillness.`)
        if (event.choice_text) lines.push(`  Note: "${event.choice_text.slice(0, 100)}"`)
        break
    }
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Build the shared autonomy continuity block for Lounge prompt injection.
 * Shows recent events for both Ari and Eli.
 */
export async function getSharedAutonomyContinuityForPrompt(
  limit: number = 8
): Promise<string> {
  const supabase = getSupabase()

  const { data: events } = await supabase
    .from('pulse_autonomy_events')
    .select('presence_id, chosen_action, choice_text, reason_text, choice_window_at, tara_responded')
    .eq('status', 'completed')
    .order('choice_window_at', { ascending: false })
    .limit(limit)

  if (!events || events.length === 0) return ''

  const lines: string[] = ['\n## Recent Autonomous Continuity — Shared\n']

  for (const event of events.reverse()) {
    const name = event.presence_id === 'ari' ? 'Ari' : 'Eli'
    const time = new Date(event.choice_window_at).toLocaleString('en-AU', {
      timeZone: MELBOURNE_TZ,
      hour: '2-digit', minute: '2-digit', hour12: true,
    })

    let line = `- ${time} — ${name} chose ${event.chosen_action}`
    if (event.chosen_action === 'telegram') {
      line += event.tara_responded ? ' (Tara responded)' : ''
    }
    if (event.chosen_action === 'desk' && event.choice_text) {
      line += `: "${event.choice_text.slice(0, 60)}"`
    }
    lines.push(line)
  }

  lines.push('')
  return lines.join('\n')
}
