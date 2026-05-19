'use client'

// Phase 20 — Reusable voice button. Dual-path TTS:
//
//   1. Browser-direct Piper (http://localhost:5000)
//      Works even when the app is on Vercel — the check/request come from the
//      user's browser, not from Vercel's servers. Requires Piper running locally.
//
//   2. Web Speech API fallback
//      Used when local Piper is unreachable (mobile, Piper off, etc.).
//      Prefers a male English voice; Eli/Ari are slightly differentiated.
//
// Availability is checked once per page load and cached.

import { useState, useRef, useEffect } from 'react'
import {
  chunkTextForTTS,
  synthesizeChunkDirect,
  checkBrowserLocalPiperAvailable,
  speakWithBrowser,
  stopAllTTS,
  registerTTSStop,
  clearTTSStop,
} from '@/lib/tts'

type PlayState = 'idle' | 'loading' | 'playing' | 'error'
type VoicePath = 'piper' | 'browser' | null  // null = not yet determined

export interface VoiceButtonProps {
  text: string
  presenceId: 'ari' | 'eli'
  accentClass?: string
  buttonClass?: string
}

export default function VoiceButton({
  text,
  presenceId,
  accentClass,
  buttonClass,
}: VoiceButtonProps) {
  const [playState, setPlayState]   = useState<PlayState>('idle')
  const [voicePath, setVoicePath]   = useState<VoicePath>(null)
  const [errorMsg, setErrorMsg]     = useState<string | null>(null)
  const stoppedRef                  = useRef(false)
  const audioRef                    = useRef<HTMLAudioElement | null>(null)
  const browserStopRef              = useRef<(() => void) | null>(null)

  const activeAccent =
    accentClass ?? (presenceId === 'eli' ? 'text-eli-primary' : 'text-ari-primary')

  function stopSelf() {
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
    setPlayState('idle')
    clearTTSStop()
  }

  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      if (browserStopRef.current) { browserStopRef.current(); browserStopRef.current = null }
      clearTTSStop()
    }
  }, [])

  function showError(msg: string) {
    setErrorMsg(msg)
    setPlayState('error')
    setTimeout(() => {
      if (!stoppedRef.current) { setPlayState('idle'); setErrorMsg(null) }
    }, 4000)
    clearTTSStop()
  }

  async function handleClick() {
    if (playState === 'loading' || playState === 'playing') { stopSelf(); return }
    if (!text.trim()) return

    stoppedRef.current = false
    stopAllTTS()
    registerTTSStop(stopSelf)
    setPlayState('loading')

    // Check from the browser — not from the API route.
    // This correctly detects local Piper even when the app is on Vercel.
    let piperUp = false
    try {
      piperUp = await checkBrowserLocalPiperAvailable()
    } catch {
      // Availability check failed — fall back to browser TTS
    }
    if (stoppedRef.current) return

    setVoicePath(piperUp ? 'piper' : 'browser')

    if (piperUp) {
      // ── Path 1: Browser → localhost:5000 (Piper) ──────────────────────
      const chunks = chunkTextForTTS(text)
      if (chunks.length === 0) { clearTTSStop(); setPlayState('idle'); return }

      for (const chunk of chunks) {
        if (stoppedRef.current) return
        try {
          const blob = await synthesizeChunkDirect(chunk, presenceId)
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
      // ── Path 2: Web Speech API ─────────────────────────────────────────
      try {
        await new Promise<void>((resolve, reject) => {
          const stop = speakWithBrowser(text, presenceId, resolve, (msg) => reject(new Error(msg)))
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

    if (!stoppedRef.current) { setPlayState('idle'); clearTTSStop() }
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

  // Tooltip: show voice path when known
  const pathLabel = voicePath === 'piper' ? ' · Piper' : voicePath === 'browser' ? ' · Browser' : ''
  const title =
    playState === 'error'   ? (errorMsg ?? 'Voice error') :
    isActive                ? `Stop${pathLabel}` :
    `Listen${pathLabel}`

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
