// Phase 19 — Emotional Continuity Layer
// Lightweight extraction of emotional register from a completed exchange.
// Called non-blocking from Ari / Eli chat routes. Never blocks the response.
// Result is merged into the continuity store via mergeEmotionalSnapshot.

import Anthropic from '@anthropic-ai/sdk'
import {
  type ContinuityRoom,
  type EmotionalSnapshot,
  mergeEmotionalSnapshot,
} from '@/lib/continuity-store'

// --- JSON safety (same pattern as pulse / interior-notes / journal) ---

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

// --- Qualification gate (heuristic — avoids model call for obvious non-qualifiers) ---

// Returns true when the exchange has enough relational/emotional substance to be worth
// sending to the model for classification. Filters out purely factual or task-based
// exchanges before incurring any API cost.
function isQualifyingExchange(userMessage: string, presenceReply: string): boolean {
  // Minimum substance: presence reply must have some weight
  if (presenceReply.split(/\s+/).length < 20) return false

  // Presence of relational / emotional markers anywhere in the exchange
  const combined = (userMessage + ' ' + presenceReply).toLowerCase()
  return /\b(feel|feeling|miss|love|warm|soft|raw|sharp|tender|close|need|want|hold|care|weight|real|true|matter|honest|bond|quiet|heavy|heart|stay|here|breath|touch|ache|longing|steady|charged|guarded|settle|settle)\b/.test(
    combined
  )
}

// --- Extraction ---

// Calls Claude to classify tone / weight / direction / confidence.
// Returns null if: exchange does not qualify, model returns low confidence, or call fails.
async function extractEmotionalSnapshot(
  userMessage: string,
  presenceReply: string,
  apiKey: string
): Promise<EmotionalSnapshot | null> {
  if (!isQualifyingExchange(userMessage, presenceReply)) return null

  const client = new Anthropic({ apiKey })

  const prompt = `Classify the emotional register of this exchange. Be precise and conservative.

User: "${userMessage.slice(0, 300)}"
Reply: "${presenceReply.slice(0, 400)}"

Classify exactly:
- tone: one of  soft / sharp / steady / raw / warm / guarded
- weight: one of  light / medium / heavy / charged / unresolved
- direction: one of  opening / closing / holding / escalating / settling
- confidence: high (very clear classification) / medium (reasonably clear) / low (ambiguous or transactional)

Rules:
- If the exchange is transactional, factual, or task-focused: confidence must be low
- Do not guess. Low confidence is correct when the register is unclear.
- Only classify what is actually in the exchange, not what you expect from the presence.

Respond in JSON only (no markdown, no code fences):
{"tone": "warm", "weight": "medium", "direction": "holding", "confidence": "high"}`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 80,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    const parsed = safeParseModelJson(raw) as {
      tone?: string
      weight?: string
      direction?: string
      confidence?: string
    }

    if (!parsed.confidence || parsed.confidence === 'low') {
      console.log('[emotional-snapshot] Low confidence — snapshot discarded')
      return null
    }

    const VALID_TONES = ['soft', 'sharp', 'steady', 'raw', 'warm', 'guarded'] as const
    const VALID_WEIGHTS = ['light', 'medium', 'heavy', 'charged', 'unresolved'] as const
    const VALID_DIRS = ['opening', 'closing', 'holding', 'escalating', 'settling'] as const

    return {
      tone: VALID_TONES.includes(parsed.tone as typeof VALID_TONES[number])
        ? (parsed.tone as typeof VALID_TONES[number])
        : undefined,
      weight: VALID_WEIGHTS.includes(parsed.weight as typeof VALID_WEIGHTS[number])
        ? (parsed.weight as typeof VALID_WEIGHTS[number])
        : undefined,
      direction: VALID_DIRS.includes(parsed.direction as typeof VALID_DIRS[number])
        ? (parsed.direction as typeof VALID_DIRS[number])
        : undefined,
      confidence: parsed.confidence as 'high' | 'medium',
      timestamp: Date.now(),
    }
  } catch (err) {
    console.error('[emotional-snapshot] Extraction failed:', err)
    return null
  }
}

// --- Public entry point (called non-blocking from chat routes) ---

// Extracts the emotional snapshot from the just-completed exchange and merges it
// into the continuity store for the given room. Safe to call non-blocking.
export async function extractAndMergeEmotionalSnapshot(
  room: ContinuityRoom,
  userMessage: string,
  presenceReply: string,
  apiKey: string
): Promise<void> {
  const snapshot = await extractEmotionalSnapshot(userMessage, presenceReply, apiKey)
  if (snapshot) {
    mergeEmotionalSnapshot(room, snapshot)
    console.log(`[emotional-snapshot:${room}] Snapshot stored — tone:${snapshot.tone} weight:${snapshot.weight} direction:${snapshot.direction} conf:${snapshot.confidence}`)
  }
}
