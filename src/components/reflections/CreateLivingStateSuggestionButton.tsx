'use client'

// Phase 25 — Button shown on eligible reflections to create a Living State suggestion.
// Only renders when the reflection passes eligibility. Quiet, single action.

import { useState } from 'react'
import { isEligibleForSuggestion } from '@/lib/reflections/living-state-suggestion-types'
import type { ReflectionWithFeedback } from '@/lib/reflections/review-types'
import type { LivingStateSuggestion } from '@/lib/reflections/living-state-suggestion-types'

interface Props {
  reflection: ReflectionWithFeedback
  onCreated: (suggestion: LivingStateSuggestion) => void
}

type ButtonState = 'idle' | 'loading' | 'done' | 'error'

export default function CreateLivingStateSuggestionButton({ reflection, onCreated }: Props) {
  const [state, setState] = useState<ButtonState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isEligibleForSuggestion(reflection)) return null

  async function handleCreate() {
    setState('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/living-state-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId: reflection.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Failed to create suggestion')
        setState('error')
        return
      }

      setState('done')
      onCreated(data.suggestion as LivingStateSuggestion)
    } catch {
      setErrorMsg('Network error')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="pt-4 border-t border-house-border">
        <p className="font-body text-xs text-green-400">
          Living State suggestion created.
        </p>
      </div>
    )
  }

  return (
    <div className="pt-4 border-t border-house-border space-y-2">
      <button
        onClick={handleCreate}
        disabled={state === 'loading'}
        className={`
          font-body text-xs tracking-wide px-4 py-2 border transition-all duration-150
          ${state === 'loading'
            ? 'border-house-border text-text-muted cursor-not-allowed'
            : 'border-house-border text-text-secondary hover:border-eli-primary/50 hover:text-eli-primary'
          }
        `}
      >
        {state === 'loading' ? 'Creating suggestion…' : 'Create Living State suggestion'}
      </button>

      {state === 'error' && errorMsg && (
        <p className="font-body text-xs text-red-400">{errorMsg}</p>
      )}
    </div>
  )
}
