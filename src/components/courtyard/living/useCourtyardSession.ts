'use client'

// Courtyard — Living Room Spike · React hook around the session simulator.
// Holds session state, wires Tara's controls, and runs auto-play ONLY while the
// page is open and the session is running (interval cleared on unmount/stop).
// Optional localStorage persistence so play-state survives a refresh. No network.

import { useCallback, useEffect, useState } from 'react'
import {
  cancelQueued,
  chooseNextFor,
  clearAllQueues,
  clearQueue,
  killSession,
  pauseAll,
  pauseSession,
  setActorPaused,
  startSession,
  step as stepSession,
  stopSession,
} from '@/lib/courtyard/living/sessionSimulator'
import { freshSession } from '@/lib/courtyard/living/sampleSession'
import type { AutonomousId, SessionState } from '@/lib/courtyard/living/types'

const STORAGE_KEY = 'courtyard.livingRoom.session.v1'
const TICK_MS = 1500

function loadInitialSession(): SessionState {
  // This hook only mounts client-side (behind AuthGuard), so reading the browser
  // store in the lazy initializer is safe and avoids setState-in-effect.
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as SessionState
    } catch {
      /* ignore corrupt local state — start fresh */
    }
  }
  return freshSession()
}

export function useCourtyardSession() {
  const [state, setState] = useState<SessionState>(loadInitialSession)
  const [autoPlay, setAutoPlay] = useState(false)

  // Persist play-state (best-effort).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage full / unavailable — non-fatal for a spike */
    }
  }, [state])

  // Auto-play: tick only while running AND auto-play is on. Cleared otherwise.
  useEffect(() => {
    if (!autoPlay || state.status !== 'running') return
    const handle = window.setInterval(() => setState((prev) => stepSession(prev)), TICK_MS)
    return () => window.clearInterval(handle)
  }, [autoPlay, state.status])

  const start = useCallback(() => setState((s) => startSession(s)), [])
  const pause = useCallback(() => {
    setAutoPlay(false)
    setState((s) => pauseSession(s))
  }, [])
  const stop = useCallback(() => {
    setAutoPlay(false)
    setState((s) => stopSession(s))
  }, [])
  const kill = useCallback(() => {
    setAutoPlay(false)
    setState((s) => killSession(s))
  }, [])
  const stepOnce = useCallback(() => setState((s) => stepSession(s)), [])
  const toggleAutoPlay = useCallback(() => setAutoPlay((v) => !v), [])
  const chooseNext = useCallback((actor: AutonomousId) => setState((s) => chooseNextFor(s, actor)), [])
  const clearActor = useCallback((actor: AutonomousId) => setState((s) => clearQueue(s, actor)), [])
  const clearAll = useCallback(() => setState((s) => clearAllQueues(s)), [])
  const cancel = useCallback((actor: AutonomousId, id: string) => setState((s) => cancelQueued(s, actor, id)), [])
  const setPaused = useCallback((actor: AutonomousId, paused: boolean) => setState((s) => setActorPaused(s, actor, paused)), [])
  const pauseEveryone = useCallback(() => {
    setAutoPlay(false)
    setState((s) => pauseAll(s))
  }, [])

  return {
    state,
    autoPlay,
    start,
    pause,
    stop,
    kill,
    stepOnce,
    toggleAutoPlay,
    chooseNext,
    clearActor,
    clearAll,
    cancel,
    setPaused,
    pauseEveryone,
  }
}
