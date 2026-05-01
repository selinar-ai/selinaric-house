'use client'

// Phase 24A — Interior Reflection review surface.
// Quiet. Evaluative. Two-column on desktop, single-panel on mobile.
// Ari and Eli reflections are fully separated — one presence shown at a time.

import { useState } from 'react'
import { useReflections } from '@/hooks/useReflections'
import type { FeedbackLabel, ReflectionWithFeedback } from '@/lib/reflections/review-types'
import type { LivingStateSuggestion } from '@/lib/reflections/living-state-suggestion-types'
import ReflectionList from './ReflectionList'
import ReflectionDetail from './ReflectionDetail'
import ReflectionTestPanel from './ReflectionTestPanel'
import ReflectionCalibrationSummary from './ReflectionCalibrationSummary'
import ReflectionJobsQueue from './ReflectionJobsQueue'
import LivingStateSuggestionsPanel from './LivingStateSuggestionsPanel'

type PresenceTab = 'ari' | 'eli'
type MobileView = 'list' | 'detail'

export default function ReflectionShell() {
  const [presence, setPresence] = useState<PresenceTab>('eli')
  const [selected, setSelected] = useState<ReflectionWithFeedback | null>(null)
  const [mobileView, setMobileView] = useState<MobileView>('list')

  const { reflections, loading, error, refresh, markReviewed } = useReflections(presence)
  const [suggestionsKey, setSuggestionsKey] = useState(0)

  function handleSuggestionCreated(_suggestion: LivingStateSuggestion) {
    setSuggestionsKey(k => k + 1)
  }

  function handleSelect(r: ReflectionWithFeedback) {
    setSelected(r)
    setMobileView('detail')
  }

  function handleBack() {
    setMobileView('list')
  }

  function handlePresenceSwitch(p: PresenceTab) {
    setPresence(p)
    setSelected(null)
    setMobileView('list')
  }

  function handleFeedbackSubmitted(reflectionId: string, label: FeedbackLabel) {
    markReviewed(reflectionId, label)
    // Update the selected reflection optimistically
    if (selected?.id === reflectionId) {
      setSelected(prev => prev ? {
        ...prev,
        review_status: 'reviewed',
        reflection_feedback: [
          ...prev.reflection_feedback,
          {
            id: crypto.randomUUID(),
            reflection_id: reflectionId,
            feedback_label: label,
            created_at: new Date().toISOString(),
          }
        ]
      } : null)
    }
  }

  const unreviewedCount = reflections.filter(r => r.review_status === 'unreviewed').length

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top bar */}
      <div className="shrink-0 border-b border-house-border bg-house-surface px-4 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-sm font-light tracking-[0.2em] text-text-primary uppercase">
            Reflections
          </h2>
          <p className="font-body text-xs text-text-muted mt-0.5">
            Interior layer · {unreviewedCount > 0 ? `${unreviewedCount} unreviewed` : 'all reviewed'}
          </p>
        </div>

        {/* Presence tabs */}
        <div className="flex gap-1 border border-house-border">
          <button
            onClick={() => handlePresenceSwitch('eli')}
            className={`
              font-body text-xs px-4 py-1.5 tracking-wide transition-all duration-150
              ${presence === 'eli'
                ? 'bg-house-bg text-eli-primary'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            Eli
          </button>
          <button
            onClick={() => handlePresenceSwitch('ari')}
            className={`
              font-body text-xs px-4 py-1.5 tracking-wide transition-all duration-150
              ${presence === 'ari'
                ? 'bg-house-bg text-ari-primary'
                : 'text-text-muted hover:text-text-secondary'
              }
            `}
          >
            Ari
          </button>
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-body text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Phase 24D: pending job queue — visible when jobs are queued but not yet processed */}
      <ReflectionJobsQueue presenceId={presence} onProcessed={refresh} />

      {/* Phase 24C: calibration summary — always visible */}
      <ReflectionCalibrationSummary presenceId={presence} />

      {/* Phase 25: Living State suggestions panel */}
      <LivingStateSuggestionsPanel
        key={`${presence}-${suggestionsKey}`}
        presenceId={presence}
      />

      {/* Phase 24B: test panel — dev only, self-hiding in production */}
      <ReflectionTestPanel presence={presence} onJobProcessed={refresh} />

      {!loading && !error && (
        <>
          {/* Desktop: two-column */}
          <div className="hidden md:flex flex-1 min-h-0">
            {/* List column */}
            <div className="w-80 lg:w-96 shrink-0 flex flex-col border-r border-house-border min-h-0">
              <ReflectionList
                reflections={reflections}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
              />
            </div>

            {/* Detail column */}
            <div className="flex-1 min-w-0 min-h-0">
              {selected ? (
                <ReflectionDetail
                  reflection={selected}
                  onFeedbackSubmitted={handleFeedbackSubmitted}
                  onSuggestionCreated={handleSuggestionCreated}
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="font-body text-sm text-text-muted">
                    Select a reflection to inspect it.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile: single panel, toggle between list and detail */}
          <div className="md:hidden flex-1 min-h-0 flex flex-col">
            {mobileView === 'list' || !selected ? (
              <ReflectionList
                reflections={reflections}
                selectedId={selected?.id ?? null}
                onSelect={handleSelect}
              />
            ) : (
              <ReflectionDetail
                reflection={selected}
                onBack={handleBack}
                onFeedbackSubmitted={handleFeedbackSubmitted}
                onSuggestionCreated={handleSuggestionCreated}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
