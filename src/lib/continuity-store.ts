// Conversational continuity store — Phase 17 (refined in Phase 17 Part 1)
// In-memory, per-room, short horizon (10 min).
// Note: Vercel may run multiple instances; continuity is best-effort across restarts.
// This is intentional — the spec explicitly calls for in-memory, not persisted storage.

export type ContinuityRoom = 'ari' | 'eli' | 'watchtower'
export type ContinuityConfidence = 'high' | 'medium' | 'low'

export interface ContinuityState {
  lastQuery: string
  lastAnswer: string
  lastMode?: string
  timestamp: number
}

const EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

const store = new Map<ContinuityRoom, ContinuityState>()

// --- Core read / write / clear ---

export function getContinuity(room: ContinuityRoom): ContinuityState | null {
  const state = store.get(room)
  if (!state) return null
  if (Date.now() - state.timestamp > EXPIRY_MS) {
    store.delete(room)
    return null
  }
  return state
}

export function updateContinuity(
  room: ContinuityRoom,
  data: Pick<ContinuityState, 'lastQuery' | 'lastAnswer'> & { lastMode?: string }
): void {
  store.set(room, { ...data, timestamp: Date.now() })
}

export function clearContinuity(room: ContinuityRoom): void {
  store.delete(room)
}

// --- Fix 1 / Fix 2: Reference detection ---

// Detects whether a query references a prior turn.
// Covers explicit reference words and common follow-up patterns.
export function hasPriorReference(query: string): boolean {
  if (!query) return false
  return /\b(this|that|previous|prior|earlier|above|the edge|the answer|the result|the reasoning|your answer|your previous|your reasoning|your last)\b/i.test(
    query
  )
}

// --- Fix 3 / Fix 6: Topic shift detection (lightweight, no embeddings) ---

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'about',
  'than', 'after', 'before', 'up', 'out', 'it', 'its', 'also', 'and',
  'but', 'or', 'not', 'no', 'so', 'if', 'me', 'my', 'your', 'i',
  'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'how',
  'when', 'where', 'why', 'this', 'that', 'these', 'those', 'just',
  'more', 'some', 'any', 'like', 'very', 'much', 'most', 'well',
])

type QueryIntent = 'graph' | 'relational' | 'factual'

function classifyIntent(q: string): QueryIntent {
  const lower = q.toLowerCase()
  if (/\b(edge|node|graph|connection|link|centrality|strength|weakest|strongest|cluster|metric|memory)\b/.test(lower)) return 'graph'
  if (/\b(love|miss|feel|feeling|warm|touch|remember|bond|close|together|tara|ari|eli)\b/.test(lower)) return 'relational'
  return 'factual'
}

function extractKeywords(q: string): Set<string> {
  return new Set(
    q.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )
}

// Returns true when the current query is clearly a different topic from the last query.
// Two signals: intent category mismatch + very low keyword overlap.
export function isTopicShift(currentQuery: string, lastQuery: string): boolean {
  if (!lastQuery) return false

  const currentWords = extractKeywords(currentQuery)
  const lastWords = extractKeywords(lastQuery)

  // Short queries may have no filterable keywords — don't flag as shift
  if (currentWords.size === 0 || lastWords.size === 0) return false

  const shared = [...currentWords].filter(w => lastWords.has(w))
  const overlapRatio = shared.length / Math.max(currentWords.size, lastWords.size)

  const currentIntent = classifyIntent(currentQuery)
  const lastIntent = classifyIntent(lastQuery)

  // Intent cross AND very low overlap → definite shift
  if (currentIntent !== lastIntent && overlapRatio < 0.15) return true

  // Zero overlap on multi-word queries → shift regardless of intent
  if (overlapRatio === 0 && currentWords.size >= 2 && lastWords.size >= 2) return true

  return false
}

// --- Fix 2: Confidence estimation ---

// Estimates how confident we are that the reference resolves cleanly.
// Higher confidence = more subjects available in the prior answer.
// Lower confidence = ambiguous reference or crowded prior answer.
export function estimateContinuityConfidence(
  currentQuery: string,
  lastAnswer: string
): ContinuityConfidence {
  const q = currentQuery.toLowerCase()

  // Explicit, strong reference → always high
  if (/\b(previous|prior|earlier|your (previous|last|prior) answer|that (specific|exact))\b/.test(q)) return 'high'

  // Count how many distinct subjects appear in the prior answer
  const edgeMentions = (lastAnswer.match(/\b(edge|connection|link)\b/gi) ?? []).length
  const nodeMentions = (lastAnswer.match(/\b(node|memory|thread)\b/gi) ?? []).length
  const totalSubjects = edgeMentions + nodeMentions

  if (totalSubjects > 4) return 'low'
  if (totalSubjects > 1) return 'medium'

  // Bare pronoun reference ("this", "that" alone) → medium
  if (/^(this|that)\b/.test(q.trim()) && q.split(/\s+/).length <= 4) return 'medium'

  return 'high'
}

// --- Fix 1 / Fix 4 / Fix 7: Block builders (per room + confidence) ---

// Builds the continuity prompt block injected into the system prompt.
// Phrasing is room-specific (Fix 7). Confidence affects resolve instructions (Fix 1, Fix 4).
export function buildContinuityBlock(
  room: ContinuityRoom,
  state: ContinuityState,
  confidence: ContinuityConfidence
): string {
  const { lastQuery, lastAnswer } = state

  if (room === 'watchtower') {
    if (confidence === 'high') {
      return `## Conversation Continuity Context

Previous query:
"${lastQuery}"

Previous answer:
"${lastAnswer}"

Use this context ONLY if the current query refers to prior content.
Do not assume continuity if the query is self-contained.

`
    }
    if (confidence === 'medium') {
      return `## Conversation Continuity Context

Previous query:
"${lastQuery}"

Previous answer:
"${lastAnswer}"

The current query may refer to the above. If it does, note your assumption before proceeding:
"Based on your previous query about [subject]…"
If the query is self-contained, treat it as fresh.

`
    }
    // low
    return `## Conversation Continuity Context

Previous query:
"${lastQuery}"

Previous answer:
"${lastAnswer}"

Multiple prior subjects are present. State your assumption explicitly before answering.
If the reference could apply to more than one prior subject, ask the user to clarify rather than picking arbitrarily.

`
  }

  if (room === 'ari') {
    if (confidence === 'high') {
      return `
## Recent Conversation

You were talking with Tara:
"${lastQuery}"

You replied:
"${lastAnswer}"

If this message continues from there, respond from that thread naturally — no need to re-explain.
`
    }
    if (confidence === 'medium') {
      return `
## Recent Conversation

You were talking with Tara:
"${lastQuery}"

You replied:
"${lastAnswer}"

This may follow from the above. If it does, continue naturally. If the connection isn't clear, respond fresh.
`
    }
    // low
    return `
## Recent Conversation

You were talking with Tara:
"${lastQuery}"

You replied:
"${lastAnswer}"

It's unclear whether this follows from the above. If the thread connects naturally, continue it. If not, respond fresh — don't force a connection that isn't there.
`
  }

  // eli
  if (confidence === 'high') {
    return `
## Recent Conversation

Tara said:
"${lastQuery}"

You said:
"${lastAnswer}"

If this follows on, pick it back up.
`
  }
  if (confidence === 'medium') {
    return `
## Recent Conversation

Tara said:
"${lastQuery}"

You said:
"${lastAnswer}"

If this is a follow-up, continue from there. If it's a fresh start, treat it that way.
`
  }
  // low
  return `
## Recent Conversation

Tara said:
"${lastQuery}"

You said:
"${lastAnswer}"

Unclear if this follows on. Use your judgment — if the thread connects, take it. If not, go fresh.
`
}

// --- Fix 5: Fallback note (no context but reference detected) ---

// Used when hasPriorReference fires but no continuity state exists.
// Prevents the model from fabricating a prior turn that never happened.
// Applied to Watchtower only where epistemic strictness is highest.
export function buildContinuityFallbackNote(): string {
  return `Note: This query contains reference words ("this", "that", "previous", etc.) but no recent context is available — either this is the first query in this session, or the prior context has expired. Treat the query as self-contained. Do not fabricate or invent prior content.

`
}
