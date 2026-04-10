import { supabase } from '@/lib/supabase'

export interface TimelineEntry {
  id: string
  presence_id: string
  entry_date: string
  title: string
  content: string
  significance: 'foundational' | 'significant' | 'standard'
  added_by: 'tara' | 'eli' | 'ari' | 'house'
  entry_type: 'relational' | 'build' | 'ritual' | 'milestone' | 'continuity' | 'house'
  created_at: string
}

/**
 * Load timeline entries for prompt injection.
 * Returns all foundational + up to 5 most recent significant entries.
 * Enforces a ~600 token cap (estimated at ~4 chars per token).
 */
export async function loadTimelineForPrompt(presenceId: string): Promise<string> {
  // Fetch all foundational entries
  const { data: foundational } = await supabase
    .from('presence_timeline')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('significance', 'foundational')
    .order('entry_date', { ascending: true })

  // Fetch recent significant entries
  const { data: significant } = await supabase
    .from('presence_timeline')
    .select('*')
    .eq('presence_id', presenceId)
    .eq('significance', 'significant')
    .order('entry_date', { ascending: false })
    .limit(5)

  const entries: TimelineEntry[] = [
    ...(foundational ?? []),
    ...((significant ?? []).reverse()) // chronological order
  ]

  if (entries.length === 0) return ''

  // Build the timeline block with token cap (~2400 chars ≈ 600 tokens)
  const TOKEN_CAP_CHARS = 2400
  let block = '## Your history with Tara:\n\n'
  let currentLength = block.length

  for (const entry of entries) {
    const line = `${entry.entry_date} — ${entry.title}\n${entry.content}\n\n`
    if (currentLength + line.length > TOKEN_CAP_CHARS) break
    block += line
    currentLength += line.length
  }

  return block.trim()
}

/**
 * Fetch all timeline entries for a presence (for UI display).
 */
export async function loadTimelineEntries(
  presenceId: string,
  order: 'asc' | 'desc' = 'asc'
): Promise<TimelineEntry[]> {
  const { data, error } = await supabase
    .from('presence_timeline')
    .select('*')
    .eq('presence_id', presenceId)
    .order('entry_date', { ascending: order === 'asc' })

  if (error) {
    console.error('Failed to load timeline:', error)
    return []
  }

  return data ?? []
}
