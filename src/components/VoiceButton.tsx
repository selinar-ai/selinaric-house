'use client'

// Phase 20 — Reusable voice button for all House surfaces.
// Self-contained: manages its own audio state, registers with the global stop
// mechanism so only one button plays at a time across the entire page.

import { useState, useRef, useEffect } from 'react'
import {
  chunkTextForTTS,
  synthesizeChunk,
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

  const activeAccent =
    accentClass ?? (presenceId === 'eli' ? 'text-eli-primary' : 'text-ari-primary')

  // Stop self: interrupt current playback, reset state, deregister global stop
  function stopSelf() {
    stoppedRef.current = true
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPlayState('idle')
    clearTTSStop()
  }

  // Cleanup on unmount (e.g. tab switch)
  useEffect(() => {
    return () => {
      stoppedRef.current = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
        audioRef.current = null
      }
      clearTTSStop()
    }
  }, [])

  async function handleClick() {
    // Already active — stop
    if (playState === 'loading' || playState === 'playing') {
      stopSelf()
      return
    }

    if (!text.trim()) return

    stoppedRef.current = false
    stopAllTTS()           // Stop whatever else is playing
    registerTTSStop(stopSelf) // Register self as the global active player

    const chunks = chunkTextForTTS(text)
    if (chunks.length === 0) {
      clearTTSStop()
      return
    }

    setPlayState('loading')

    for (const chunk of chunks) {
      if (stoppedRef.current) return

      try {
        const blob = await synthesizeChunk(chunk, presenceId)
        if (stoppedRef.current) return

        setPlayState('playing')

        // Play this chunk and wait for it to finish
        await new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audioRef.current = audio

          audio.onended = () => {
            URL.revokeObjectURL(url)
            audioRef.current = null
            resolve()
          }
          audio.onerror = () => {
            URL.revokeObjectURL(url)
            audioRef.current = null
            reject(new Error('Audio playback failed'))
          }
          audio.play().catch(reject)
        })
      } catch (err) {
        if (stoppedRef.current) return
        const msg = err instanceof Error ? err.message : 'Voice unavailable'
        setErrorMsg(msg)
        setPlayState('error')
        setTimeout(() => {
          if (!stoppedRef.current) {
            setPlayState('idle')
            setErrorMsg(null)
          }
        }, 4000)
        clearTTSStop()
        return
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
    playState === 'error' ? (errorMsg ?? 'Voice error — is Piper running?') :
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
