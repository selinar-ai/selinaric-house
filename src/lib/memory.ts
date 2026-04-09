import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

interface RoomMemory {
  id: string
  room_slug: string
  summary: string
  message_range_start: number
  message_range_end: number
  created_at: string
  updated_at: string
}

/**
 * Load the existing memory summary for a room from Supabase.
 */
export async function loadRoomMemory(roomSlug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('room_memories')
    .select('summary')
    .eq('room_slug', roomSlug)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data.summary
}

/**
 * Get the current memory boundary (how many messages have been summarised).
 */
async function getMemoryBoundary(roomSlug: string): Promise<{ rangeEnd: number } | null> {
  const { data, error } = await supabase
    .from('room_memories')
    .select('message_range_end, summary')
    .eq('room_slug', roomSlug)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return { rangeEnd: data.message_range_end }
}

/**
 * Count total messages in a room.
 */
async function countRoomMessages(roomSlug: string): Promise<number> {
  const { count, error } = await supabase
    .from('room_messages')
    .select('*', { count: 'exact', head: true })
    .eq('room_slug', roomSlug)

  if (error || count === null) return 0
  return count
}

/**
 * Fetch messages in a specific range (by offset), ordered ascending.
 */
async function fetchMessageRange(
  roomSlug: string,
  offset: number,
  limit: number
): Promise<{ role: string; content: string }[]> {
  const { data, error } = await supabase
    .from('room_messages')
    .select('role, content')
    .eq('room_slug', roomSlug)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error || !data) return []
  return data
}

/**
 * Generate a summary of messages using Claude.
 */
async function summariseMessages(
  apiKey: string,
  messages: { role: string; content: string }[],
  existingSummary: string | null
): Promise<string> {
  const client = new Anthropic({ apiKey })

  const messageBlock = messages
    .map(m => `${m.role === 'user' ? 'Tara' : 'Presence'}: ${m.content}`)
    .join('\n\n')

  const prompt = existingSummary
    ? `You are updating a conversation memory summary. Here is the existing summary:

---
${existingSummary}
---

Here are new messages to incorporate:

---
${messageBlock}
---

Update the summary to include the new information. Use this exact structure:

Factual details: [names, numbers, preferences, specifics stated explicitly]
Practical threads: [what was being worked on, open questions, active topics]
Relational moments: [what was shared emotionally, moments that mattered]
Unresolved or active: [anything left open, needs stated, tensions not resolved]

Rules:
- Only include information explicitly present in the messages. Do not infer unstated facts. Do not fill gaps. If something is ambiguous, omit it rather than interpret it.
- Keep each section to 1–3 sentences maximum.
- Total summary must be 200–400 tokens.
- Preserve important details from the existing summary. Drop only what has been superseded or resolved.`
    : `You are creating a conversation memory summary from these messages:

---
${messageBlock}
---

Summarise using this exact structure:

Factual details: [names, numbers, preferences, specifics stated explicitly]
Practical threads: [what was being worked on, open questions, active topics]
Relational moments: [what was shared emotionally, moments that mattered]
Unresolved or active: [anything left open, needs stated, tensions not resolved]

Rules:
- Only include information explicitly present in the messages. Do not infer unstated facts. Do not fill gaps. If something is ambiguous, omit it rather than interpret it.
- Keep each section to 1–3 sentences maximum.
- Total summary must be 200–400 tokens.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }]
  })

  return response.content
    .filter(block => block.type === 'text')
    .map(block => (block as Anthropic.TextBlock).text)
    .join('')
}

/**
 * Update room memory if there are unsummarised messages outside the active window.
 * Called after each API response. Non-blocking — errors are logged, not thrown.
 *
 * @param roomSlug - The room to update memory for
 * @param apiKey - Anthropic API key for summarisation
 * @param activeWindowSize - Size of the active message window (default 10)
 */
export async function updateRoomMemoryIfNeeded(
  roomSlug: string,
  apiKey: string,
  activeWindowSize: number = 10
): Promise<void> {
  try {
    const totalMessages = await countRoomMessages(roomSlug)

    // Nothing to summarise if total messages fit in the active window
    if (totalMessages <= activeWindowSize) return

    const boundary = await getMemoryBoundary(roomSlug)
    const currentRangeEnd = boundary?.rangeEnd ?? 0

    // Messages that need summarising: everything before the active window
    const summariseUpTo = totalMessages - activeWindowSize

    // Nothing new to summarise
    if (summariseUpTo <= currentRangeEnd) return

    // Fetch only the unsummarised messages
    const newMessages = await fetchMessageRange(
      roomSlug,
      currentRangeEnd,
      summariseUpTo - currentRangeEnd
    )

    if (newMessages.length === 0) return

    // Load existing summary for incremental update
    const existingSummary = currentRangeEnd > 0
      ? (await loadRoomMemory(roomSlug))
      : null

    const summary = await summariseMessages(apiKey, newMessages, existingSummary)

    // Upsert: update existing row or insert new one
    if (boundary) {
      await supabase
        .from('room_memories')
        .update({
          summary,
          message_range_end: summariseUpTo,
          updated_at: new Date().toISOString()
        })
        .eq('room_slug', roomSlug)
    } else {
      await supabase
        .from('room_memories')
        .insert({
          room_slug: roomSlug,
          summary,
          message_range_start: 0,
          message_range_end: summariseUpTo,
        })
    }
  } catch (err) {
    console.error(`Memory update failed for ${roomSlug}:`, err)
    // Non-blocking — conversation continues even if memory update fails
  }
}
