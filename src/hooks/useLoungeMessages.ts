'use client'

// Phase 35D — Lounge Messages Hook
//
// Manages Lounge thread state, messages, surface mode, and chat interactions.

import { useState, useEffect, useCallback } from 'react'
import type { SurfaceMode, LoungeMessage, LoungeAttachment } from '@/lib/lounge'

interface ThreadInfo {
  id: string
  surface: SurfaceMode
  status: string
}

export function useLoungeMessages() {
  const [thread, setThread] = useState<ThreadInfo | null>(null)
  const [messages, setMessages] = useState<LoungeMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch thread + messages
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/lounge-messages')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setThread(data.thread)
      setMessages(data.messages ?? [])
    } catch (err) {
      console.error('[useLoungeMessages] fetch error:', err)
      setMessages([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Send a message and get responses
  const send = useCallback(async (
    message: string,
    respondAs?: 'both' | 'ari' | 'eli' | 'continue',
    attachments?: LoungeAttachment[],
  ) => {
    const res = await fetch('/api/lounge-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message || undefined,
        respondAs: respondAs || undefined,
        attachments: attachments && attachments.length > 0 ? attachments : undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || 'Failed to send')
    }

    const data = await res.json()

    // Refresh to get full state
    await refresh()

    return data
  }, [refresh])

  // Toggle surface mode
  const toggleSurface = useCallback(async () => {
    if (!thread) return

    const res = await fetch('/api/lounge-thread/surface', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: thread.id }),
    })

    if (!res.ok) throw new Error('Failed to toggle surface')

    const data = await res.json()
    setThread(prev => prev ? { ...prev, surface: data.surface } : null)
  }, [thread])

  // Generate carryback
  const generateCarryback = useCallback(async () => {
    const res = await fetch('/api/lounge-carryback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!res.ok) throw new Error('Failed to generate carryback')
    return res.json()
  }, [])

  // Capture cross-room event (Phase 36B)
  // Supports confirmation flow: first call may return requires_confirmation,
  // second call with confirmed: true creates the event.
  const captureEvent = useCallback(async (confirmed?: boolean) => {
    const res = await fetch('/api/lounge-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: confirmed ?? false }),
    })

    const data = await res.json()

    // Requires confirmation (first capture or boundary reset)
    if (data.requires_confirmation) {
      return {
        captured: false,
        requires_confirmation: true,
        proposal: data.proposal,
        boundaryResetReason: data.proposal?.boundaryResetReason ?? null,
        blocked: null,
      }
    }

    // Blocked
    if (!res.ok || !data.captured) {
      return { captured: false, requires_confirmation: false, blocked: data.blocked ?? 'Capture failed.', proposal: null }
    }

    // Success
    return { captured: true, requires_confirmation: false, event: data.event, blocked: null, proposal: null }
  }, [])

  return {
    thread,
    messages,
    loading,
    send,
    toggleSurface,
    generateCarryback,
    captureEvent,
    refresh,
  }
}
