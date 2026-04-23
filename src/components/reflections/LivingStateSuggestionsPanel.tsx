'use client'

// Phase 25 — Panel showing pending and decided Living State suggestions for a presence.
// Embedded in the Reflections page (Option A). Collapsible when no pending items.

import { useState, useEffect, useCallback } from 'react'
import { formatReflectionType } from '@/lib/reflections/reflection-format'
import type { LivingStateSuggestionWithReflection } from '@/lib/reflections/living-state-suggestion-types'

interface Props {
  presenceId: 'ari' | 'eli'
  // Called after an approve so the parent can refresh living state display if needed
  onApproved?: () => void
}

type ActionState = Record<string, 'idle' | 'loading' | 'done' | 'error'>

export default function LivingStateSuggestionsPanel({ presenceId, onApproved }: Props) {
  const [suggestions, setSuggestions] = useState<LivingStateSuggestionWithReflection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actions, setActions] = useState<ActionState>({})
  const [collapsed, setCollapsed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/living-state-suggestions?presenceId=${presenceId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setSuggestions(data.suggestions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions')
    } finally {
      setLoading(false)
    }
  }, [presenceId])

  useEffect(() => { load() }, [load])

  async function handleDecide(id: string, action: 'approve' | 'dismiss') {
    setActions(prev => ({ ...prev, [id]: 'loading' }))

    try {
      const res = await fetch(`/api/living-state-suggestions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()

      if (!res.ok) {
        setActions(prev => ({ ...prev, [id]: 'error' }))
        console.error('[suggestions panel] decide failed:', data.error)
        return
      }

      setActions(prev => ({ ...prev, [id]: 'done' }))

      // Optimistic status update
      setSuggestions(prev =>
        prev.map(s => s.id === id ? { ...s, status: action === 'approve' ? 'approved' : 'dismissed', decided_at: new Date().toISOString() } : s)
      )

      if (action === 'approve') onApproved?.()
    } catch {
      setActions(prev => ({ ...prev, [id]: 'error' }))
    }
  }

  const pending = suggestions.filter(s => s.status === 'pending')
  const decided = suggestions.filter(s => s.status !== 'pending')

  // Don't render if there's nothing at all
  if (!loading && suggestions.length === 0) return null

  const accentClass = presenceId === 'eli' ? 'text-eli-primary' : 'text-ari-primary'
  const borderAccentClass = presenceId === 'eli' ? 'border-eli-primary/30' : 'border-ari-primary/30'

  return (
    <div className="border-b border-house-border bg-house-surface/50">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-5 py-3 flex items-center gap-3 text-left"
      >
        <span className="font-body text-xs text-text-muted tracking-widest uppercase flex-1">
          Living State Suggestions
          {pending.length > 0 && (
            <span className={`ml-2 ${accentClass}`}>· {pending.length} pending</span>
          )}
        </span>
        <span className="font-body text-xs text-text-muted">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-3">
          {loading && (
            <div className="flex gap-1 py-2">
              <div className="w-1 h-1 bg-text-muted rounded-full animate-pulse-soft" />
              <div className="w-1 h-1 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
              <div className="w-1 h-1 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
            </div>
          )}

          {error && (
            <p className="font-body text-xs text-red-400">{error}</p>
          )}

          {/* Pending suggestions */}
          {pending.map(s => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              actionState={actions[s.id] ?? 'idle'}
              accentClass={accentClass}
              borderAccentClass={borderAccentClass}
              onApprove={() => handleDecide(s.id, 'approve')}
              onDismiss={() => handleDecide(s.id, 'dismiss')}
            />
          ))}

          {/* Decided suggestions — compact */}
          {decided.length > 0 && (
            <div className="space-y-1 pt-1">
              {decided.map(s => (
                <DecidedRow key={s.id} suggestion={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Pending suggestion card ---

interface CardProps {
  suggestion: LivingStateSuggestionWithReflection
  actionState: 'idle' | 'loading' | 'done' | 'error'
  accentClass: string
  borderAccentClass: string
  onApprove: () => void
  onDismiss: () => void
}

function SuggestionCard({ suggestion, actionState, accentClass, borderAccentClass, onApprove, onDismiss }: CardProps) {
  return (
    <div className={`border ${borderAccentClass} bg-house-bg/40 p-4 space-y-3`}>
      {/* Proposed state */}
      <div>
        <p className={`font-body text-[10px] text-text-muted tracking-widest uppercase mb-1.5`}>
          Proposed state
        </p>
        <p className="font-body text-sm text-text-primary leading-relaxed">
          {suggestion.proposed_state}
        </p>
      </div>

      {/* Rationale */}
      {suggestion.rationale && (
        <div>
          <p className="font-body text-[10px] text-text-muted tracking-widest uppercase mb-1">
            Rationale
          </p>
          <p className="font-body text-xs text-text-secondary leading-relaxed italic">
            {suggestion.rationale}
          </p>
        </div>
      )}

      {/* Source reflection preview */}
      {suggestion.reflection_summary && (
        <div>
          <p className="font-body text-[10px] text-text-muted tracking-widest uppercase mb-1">
            Source · {formatReflectionType(suggestion.reflection_summary.reflection_type)}
          </p>
          <p className="font-body text-xs text-text-muted leading-relaxed line-clamp-2">
            {suggestion.reflection_summary.content}
          </p>
        </div>
      )}

      {/* Timestamp */}
      <p className="font-body text-[10px] text-text-muted">
        {new Date(suggestion.created_at).toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
          day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {/* Actions */}
      {actionState === 'done' ? (
        <p className="font-body text-xs text-text-muted">Decision recorded.</p>
      ) : actionState === 'error' ? (
        <p className="font-body text-xs text-red-400">Something went wrong. Try again.</p>
      ) : (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onApprove}
            disabled={actionState === 'loading'}
            className={`
              font-body text-xs px-4 py-1.5 border transition-all duration-150
              ${actionState === 'loading'
                ? 'border-house-border text-text-muted cursor-not-allowed'
                : `border-house-border ${accentClass} hover:bg-house-border/20`
              }
            `}
          >
            {actionState === 'loading' ? '…' : 'Approve'}
          </button>
          <button
            onClick={onDismiss}
            disabled={actionState === 'loading'}
            className={`
              font-body text-xs px-4 py-1.5 border border-house-border transition-all duration-150
              ${actionState === 'loading'
                ? 'text-text-muted cursor-not-allowed'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// --- Decided suggestion row (compact) ---

function DecidedRow({ suggestion }: { suggestion: LivingStateSuggestionWithReflection }) {
  const statusColor = suggestion.status === 'approved' ? 'text-green-400' : 'text-text-muted'

  return (
    <div className="flex items-start gap-3 py-1">
      <span className={`font-body text-[10px] tracking-widest uppercase shrink-0 mt-0.5 ${statusColor}`}>
        {suggestion.status}
      </span>
      <p className="font-body text-xs text-text-muted leading-relaxed line-clamp-1 flex-1 min-w-0">
        {suggestion.proposed_state}
      </p>
    </div>
  )
}
