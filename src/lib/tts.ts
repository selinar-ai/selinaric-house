// Phase 20 — Shared TTS utilities
// Used by VoiceButton and any surface that needs voice output.
// Piper server runs locally in WSL2. Eli = Ryan voice, Ari = Kusal voice.

// TTS requests go through the Next.js proxy route (/api/tts) so the browser
// never needs direct access to the Piper WSL2 server (avoids CORS and host
// resolution issues). PIPER_URL is used server-side only in the proxy route.
const TTS_PROXY = '/api/tts'

// --- Text preparation ---

const CHUNK_TARGET_MAX = 650  // soft upper target
const CHUNK_HARD_MAX = 700    // absolute ceiling per chunk

/**
 * Sanitise text for synthesis.
 * Strips markdown formatting, normalises whitespace, preserves sentence
 * structure and paragraph intent so Piper produces natural speech.
 */
export function sanitizeForTTS(text: string): string {
  return text
    // Strip bold / italic markers
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_\n]+)_{1,3}/g, '$1')
    // Strip inline code
    .replace(/`([^`\n]+)`/g, '$1')
    // Strip headers
    .replace(/^#{1,6}\s+/gm, '')
    // Strip blockquotes (keep text)
    .replace(/^>\s*/gm, '')
    // Strip unordered list markers (keep text)
    .replace(/^[-*+]\s+/gm, '')
    // Strip bare URLs
    .replace(/https?:\/\/\S+/g, '')
    // Collapse inline whitespace
    .replace(/[ \t]+/g, ' ')
    // Collapse excess blank lines to one paragraph break
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Split text into Piper-friendly chunks.
 *
 * Strategy (in priority order):
 *   1. Keep whole paragraphs when they fit the soft target
 *   2. Split on sentence boundaries (.  ?  !)
 *   3. Split on clause boundaries (,  ;  :) if needed
 *   4. Hard split at word boundary as last resort
 *
 * Guarantees: no text is dropped, no duplicates, no empty chunks,
 * every chunk ≤ CHUNK_HARD_MAX characters.
 */
export function chunkTextForTTS(raw: string): string[] {
  const text = sanitizeForTTS(raw)
  if (!text) return []

  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/).map(p => p.replace(/\n/g, ' ').trim()).filter(Boolean)

  const accumulate: string[] = []
  let current = ''

  function flush() {
    if (current.trim()) accumulate.push(current.trim())
    current = ''
  }

  function tryAdd(fragment: string) {
    const joined = current ? current + ' ' + fragment : fragment
    if (joined.length <= CHUNK_TARGET_MAX) {
      current = joined
    } else {
      flush()
      current = fragment
    }
  }

  for (const para of paragraphs) {
    if (para.length <= CHUNK_TARGET_MAX) {
      // Paragraph fits — try to merge with current
      const joined = current ? current + ' ' + para : para
      if (joined.length <= CHUNK_TARGET_MAX) {
        current = joined
      } else {
        flush()
        current = para
      }
      continue
    }

    // Paragraph is too long — split into sentences
    // Lookbehind splits AFTER sentence-ending punctuation
    const sentences = para
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean)

    for (const sentence of sentences) {
      if (sentence.length <= CHUNK_TARGET_MAX) {
        tryAdd(sentence)
        continue
      }

      // Sentence is too long — split on clause boundaries
      const clauses = sentence.split(/(?<=[,;:])\s+/).map(c => c.trim()).filter(Boolean)
      for (const clause of clauses) {
        if (clause.length <= CHUNK_TARGET_MAX) {
          tryAdd(clause)
        } else {
          // Hard split at word boundary
          flush()
          let rest = clause
          while (rest.length > CHUNK_HARD_MAX) {
            const cutAt = rest.lastIndexOf(' ', CHUNK_HARD_MAX)
            const boundary = cutAt > 0 ? cutAt : CHUNK_HARD_MAX
            accumulate.push(rest.slice(0, boundary).trim())
            rest = rest.slice(boundary).trim()
          }
          current = rest
        }
      }
    }
  }

  flush()

  // Final hard-cap pass (safety net)
  const final: string[] = []
  for (const chunk of accumulate) {
    if (chunk.length <= CHUNK_HARD_MAX) {
      final.push(chunk)
    } else {
      let rest = chunk
      while (rest.length > CHUNK_HARD_MAX) {
        const cutAt = rest.lastIndexOf(' ', CHUNK_HARD_MAX)
        const boundary = cutAt > 0 ? cutAt : CHUNK_HARD_MAX
        final.push(rest.slice(0, boundary).trim())
        rest = rest.slice(boundary).trim()
      }
      if (rest) final.push(rest)
    }
  }

  return final.filter(c => c.length > 0)
}

// --- Piper availability (cached per browser session) ---

let _piperAvailable: boolean | null = null

/**
 * Check whether the Piper TTS server is reachable via the proxy.
 * Result is cached for the lifetime of the page — one network round-trip total.
 * Returns false on Vercel (where Piper doesn't run) and true locally.
 */
export async function checkPiperAvailable(): Promise<boolean> {
  if (_piperAvailable !== null) return _piperAvailable
  try {
    const res = await fetch(TTS_PROXY, { signal: AbortSignal.timeout(3000) })
    const data = await res.json().catch(() => ({}))
    _piperAvailable = res.ok && data.ok === true
  } catch {
    _piperAvailable = false
  }
  return _piperAvailable
}

// --- Piper synthesis ---

/**
 * Send one chunk to the Piper server and return the audio blob.
 * Throws on network or server error.
 */
export async function synthesizeChunk(
  text: string,
  presenceId: 'ari' | 'eli'
): Promise<Blob> {
  const res = await fetch(TTS_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, presence: presenceId }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? `TTS proxy error (${res.status})`)
  }
  return res.blob()
}

// --- Browser TTS fallback (Web Speech API) ---

/**
 * Speak text using the browser's built-in Web Speech API.
 * Used when Piper is unavailable (e.g. on Vercel).
 *
 * Returns a stop function. Calls onEnd when speech finishes naturally,
 * onError if the utterance errors. Safe to call stop() at any time.
 *
 * Presence tuning:
 *   Eli — natural pace, slightly warmer pitch
 *   Ari — measured pace, slightly lower pitch
 */
export function speakWithBrowser(
  rawText: string,
  presenceId: 'ari' | 'eli',
  onEnd: () => void,
  onError: (msg: string) => void
): () => void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd()
    return () => {}
  }

  const clean = sanitizeForTTS(rawText)
  if (!clean) { onEnd(); return () => {} }

  const utterance = new SpeechSynthesisUtterance(clean)

  // Pick an English voice if available — graceful if none found
  const voices = window.speechSynthesis.getVoices()
  const voice =
    voices.find(v => v.lang === 'en-US') ??
    voices.find(v => v.lang.startsWith('en')) ??
    null
  if (voice) utterance.voice = voice

  utterance.rate   = presenceId === 'eli' ? 1.0  : 0.95
  utterance.pitch  = presenceId === 'eli' ? 1.05 : 0.9
  utterance.volume = 1.0

  utterance.onend   = () => onEnd()
  utterance.onerror = (e) => onError(e.error ?? 'Speech synthesis error')

  window.speechSynthesis.cancel()   // stop anything already playing
  window.speechSynthesis.speak(utterance)

  return () => window.speechSynthesis.cancel()
}

// --- Global stop mechanism ---
// Ensures only one VoiceButton (or ChatInterface speaker) plays at a time.
// Module-level — safe in a single browser tab.

let _activeStop: (() => void) | null = null

/** Stop whatever is currently playing, if anything. */
export function stopAllTTS(): void {
  if (_activeStop) {
    _activeStop()
    _activeStop = null
  }
}

/** Register the current player's stop function as the global active stop. */
export function registerTTSStop(fn: () => void): void {
  _activeStop = fn
}

/** Clear the global stop registration (call after natural end or on unmount). */
export function clearTTSStop(): void {
  _activeStop = null
}
