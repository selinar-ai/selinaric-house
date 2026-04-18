import { supabase } from '@/lib/supabase'

// --- Types ---

export interface HeldTruth {
  id: string
  presence_id: 'ari' | 'eli'
  truth: string
  source_journal_id: string | null
  status: 'active' | 'softened' | 'released'
  weight: number
  created_at: string
  updated_at: string
}

// --- DB functions ---

export async function getHeldTruths(
  presenceId: string,
  status?: 'active' | 'softened' | 'released' | 'all'
): Promise<HeldTruth[]> {
  let query = supabase
    .from('held_truths')
    .select('*')
    .eq('presence_id', presenceId)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data } = await query
  return (data ?? []) as HeldTruth[]
}

export async function getActiveHeldTruthCount(presenceId: string): Promise<number> {
  const { count } = await supabase
    .from('held_truths')
    .select('*', { count: 'exact', head: true })
    .eq('presence_id', presenceId)
    .eq('status', 'active')
  return count ?? 0
}

export async function promoteToHeldTruth(
  presenceId: string,
  truth: string,
  sourceJournalId?: string
): Promise<HeldTruth | null> {
  const { data, error } = await supabase
    .from('held_truths')
    .insert({
      presence_id: presenceId,
      truth,
      source_journal_id: sourceJournalId ?? null,
      status: 'active',
      weight: 1.0,
    })
    .select()
    .single()

  if (error) {
    console.error('[held-truths] Promote error:', error)
    return null
  }
  return data as HeldTruth
}

export async function updateHeldTruthStatus(
  id: string,
  status: 'active' | 'softened' | 'released'
): Promise<HeldTruth | null> {
  const { data, error } = await supabase
    .from('held_truths')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[held-truths] Update error:', error)
    return null
  }
  return data as HeldTruth
}

// --- Prompt injection (active only — archived truths never reach the prompt) ---

export async function getHeldTruthsForPrompt(presenceId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('held_truths')
      .select('truth')
      .eq('presence_id', presenceId)
      .eq('status', 'active')
      .order('weight', { ascending: false })
      .limit(3)

    if (!data || data.length === 0) return ''

    const lines = ['Held truths:']
    data.forEach(row => lines.push(`- ${row.truth}`))
    return lines.join('\n')
  } catch (err) {
    console.error(`[held-truths] getHeldTruthsForPrompt failed for ${presenceId}:`, err)
    return ''
  }
}
