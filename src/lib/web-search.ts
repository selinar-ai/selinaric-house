import { supabase } from '@/lib/supabase'

// --- Types ---

export interface SearchResult {
  title: string
  url: string
  description: string
}

export interface LogSearchParams {
  presence_id: 'ari' | 'eli'
  room_slug: string
  query: string
  reason: string
  result_summary: string
  session_id?: string | null
}

// --- Brave Search ---

export async function braveSearch(query: string): Promise<SearchResult[]> {
  console.log(`[web-search] braveSearch entered — query: "${query}"`)
  const apiKey = process.env.BRAVE_SEARCH_API_KEY
  console.log(`[web-search] API key present: ${!!apiKey}`)
  if (!apiKey) {
    console.warn('[web-search] BRAVE_SEARCH_API_KEY not set')
    return []
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&safesearch=moderate`
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    })

    console.log(`[web-search] Brave response status: ${res.status}`)

    if (!res.ok) {
      console.error(`[web-search] Brave API error: ${res.status}`)
      return []
    }

    const data = await res.json() as {
      web?: { results?: { title: string; url: string; description?: string }[] }
    }

    const results = (data.web?.results ?? []).slice(0, 5).map(r => ({
      title: r.title,
      url: r.url,
      description: r.description ?? '',
    }))

    console.log(`[web-search] Results returned: ${results.length}`)
    return results
  } catch (err) {
    console.error('[web-search] Search failed:', err)
    return []
  }
}

export function formatResultSummary(results: SearchResult[]): string {
  if (results.length === 0) return 'no useful results'
  return results
    .map(r => `${r.title} (${r.url}): ${r.description}`)
    .join('\n')
}

// --- Logging ---

export async function logSearch(params: LogSearchParams): Promise<void> {
  const { error } = await supabase.from('search_log').insert({
    presence_id: params.presence_id,
    room_slug: params.room_slug,
    query: params.query,
    reason: params.reason,
    result_summary: params.result_summary,
    session_id: params.session_id ?? null,
  })

  if (error) {
    console.error('[web-search] Failed to log search:', error)
  }
}

// --- Session rate limit ---

export async function getSessionSearchCount(
  presenceId: string,
  sessionId: string | null | undefined
): Promise<number> {
  if (!sessionId) return 0

  const { count, error } = await supabase
    .from('search_log')
    .select('*', { count: 'exact', head: true })
    .eq('presence_id', presenceId)
    .eq('session_id', sessionId)

  if (error) return 0
  return count ?? 0
}

export const MAX_SEARCHES_PER_RESPONSE = 2
export const MAX_SEARCHES_PER_SESSION = 5

// --- Tool definition (reusable across routes) ---

export const webSearchTool = {
  name: 'web_search',
  description: `Search the web for current, specific, factual information.

Use ONLY when:
- A specific place, name, event, or real-world reference is mentioned that benefits from current or verifiable information
- A question is asked that requires fresh, specific, or publicly verifiable context
- The answer would materially benefit from specificity that existing context cannot provide

Do NOT use for:
- General conversation or emotional exchanges
- When existing context is already sufficient
- Inferring feelings, intentions, or relational meaning from external sources
- Filling silence or showing initiative`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'The search query — specific and targeted',
      },
      reason: {
        type: 'string',
        description: 'One plain sentence: why this search was triggered',
      },
    },
    required: ['query', 'reason'],
  },
}
