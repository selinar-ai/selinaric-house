'use client'

// Phase 20 — Reusable voice button for all House surfaces.
// Dual-path TTS:
//   Piper (local WSL2 via /api/tts proxy) — used when Piper is reachable
//   Web Speech API                         — fallback on Vercel / Piper down
// Availability is checked once per page load and cached.

import { useState, useRef, useEffect } from 'react'
import {
  chunkTextForTTS,
  synthesizeChunk,
  checkPiperAvailable,
  speakWithBrowser,
  stopAllTTS,
  registerTTSStop,
  clearTTSStop,
} from '@/lib/tts'

type PlayState = 'idle' | 'loading' | 'playing' | 'error'

export interface VoiceButtonProps {
  text: string
  presenceId: 'ari' | 'eli'
  /** Accent color class for the playing state (e.g. 'text-eli-primary'). Derived from presenceId if omitted. */
  accentClass?: string
  /** Extra classes applied to the button for layout/sizing. Defaults to compact house style. */
  buttonClass?: string
}

export default function VoiceButton({
  text,
  presenceId,
  accentClass,
  buttonClass,
}: VoiceButtonProps) {
  const [playState, setPlayState] = useState<PlayState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const stoppedRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Holds the cancel function for the browser TTS utterance, if active
  const browserStopRef = useRef<(() => void) | null>(null)

  const activeAccent =
    accentClass ?? (presenceId === 'eli' ? 'text-eli-primary' : 'text-ari-primary')

  // Stop self: interrupt whichever path is active, reset state
  function stopSelf() {
    stoppedRef.current = true
    // Stop Piper audio if playing
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    // Stop browser speech if playing
    if (browserStopRef.current) {
      browserStopRef.current()
      browserStopRef.current = null
    }
    setPlayState('idle')
    clearTTSStop()
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      if (browserStopRef.current) {
        browserStopRef.current()
        browserStopRef.current = null
      }
      clearTTSStop()
    }
  }, [])

  function showError(msg: string) {
    setErrorMsg(msg)
    setPlayState('error')
    setTimeout(() => {
      if (!stoppedRef.current) {
        setPlayState('idle')
        setErrorMsg(null)
      }
    }, 4000)
    clearTTSStop()
  }

  async function handleClick() {
    // Already active — stop
    if (playState === 'loading' || playState === 'playing') {
      stopSelf()
      return
    }

    if (!text.trim()) return

    stoppedRef.current = false
    stopAllTTS()
    registerTTSStop(stopSelf)
    setPlayState('loading')

    // --- Check Piper availability (cached after first call) ---
    const piperUp = await checkPiperAvailable()
    if (stoppedRef.current) return

    if (piperUp) {
      // ── Piper path: chunk → synthesize → Blob → Audio ──────────────────
      const chunks = chunkTextForTTS(text)
      if (chunks.length === 0) { clearTTSStop(); setPlayState('idle'); return }

      for (const chunk of chunks) {
        if (stoppedRef.current) return

        try {
          const blob = await synthesizeChunk(chunk, presenceId)
          if (stoppedRef.current) return

          setPlayState('playing')

          await new Promise<void>((resolve, reject) => {
            const url = URL.createObjectURL(blob)
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve() }
            audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; reject(new Error('Playback failed')) }
            audio.play().catch(reject)
          })
        } catch (err) {
          if (stoppedRef.current) return
          showError(err instanceof Error ? err.message : 'Piper error')
          return
        }
      }
    } else {
      // ── Browser TTS path: Web Speech API ───────────────────────────────
      try {
        await new Promise<void>((resolve, reject) => {
          const stop = speakWithBrowser(
            text,
            presenceId,
            resolve,
            (msg) => reject(new Error(msg))
          )
          browserStopRef.current = stop
          if (!stoppedRef.current) setPlayState('playing')
        })
      } catch (err) {
        if (stoppedRef.current) return
        showError(err instanceof Error ? err.message : 'Browser TTS failed')
        return
      } finally {
        browserStopRef.current = null
      }
    }

    if (!stoppedRef.current) {
      setPlayState('idle')
      clearTTSStop()
    }
  }

  const isActive = playState === 'loading' || playState === 'playing'
  const icon =
    playState === 'loading' ? '…' :
    playState === 'playing' ? '⏸' :
    playState === 'error'   ? '!' :
    '🔊'

  const stateClass =
    playState === 'playing' ? activeAccent :
    playState === 'loading' ? 'text-text-muted animate-pulse-soft' :
    playState === 'error'   ? 'text-red-400' :
    'text-text-muted hover:text-text-secondary'

  const sizeClass = buttonClass ?? 'min-w-[36px] min-h-[36px]'

  const title =
    playState === 'error' ? (errorMsg ?? 'Voice error') :
    isActive ? 'Stop' :
    'Listen'

  return (
    <button
      onClick={handleClick}
      title={title}
      className={`flex items-center justify-center text-sm transition-all duration-200 ${sizeClass} ${stateClass}`}
    >
      {icon}
    </button>
  )
}
