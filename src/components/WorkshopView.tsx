'use client'

// Phase 21 — Workshop view: shared house verification and decision space.
// Shows all submitted builds, their Forgekeeper reviews, and action controls.
// Forgekeeper review auto-triggers on load when a build is Pending Review with no review yet.
// Non-relational. No presence voice. Structured output only.

import { useState, useEffect, useCallback } from 'react'
import { type Build, type WorkshopStatus, riskColorClass } from '@/lib/builds'

// --- Helpers ---

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function originLabel(origin: string): string {
  if (origin === 'ari_desk') return "Ari's Desk"
  if (origin === 'eli_desk') return "Eli's Desk"
  return 'Workshop'
}

function workshopStatusColor(status: WorkshopStatus | string | null): string {
  if (!status) return 'text-text-muted'
  if (status === 'Committed') return 'text-green-400'
  if (status === 'Returned') return 'text-amber-400'
  if (status === 'Held') return 'text-text-muted'
  if (status === 'Pending Review') return 'text-blue-400 animate-pulse-soft'
  if (status === 'Review Complete' || status === 'Ready to Commit') return 'text-text-secondary'
  return 'text-text-muted'
}

// --- Types ---

type WorkshopSection = 'pending' | 'history'

// --- Component ---

export default function WorkshopView() {
  const [section, setSection] = useState<WorkshopSection>('pending')
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null)
  const [running, setRunning] = useState<string | null>(null) // buildId being reviewed
  const [actioning, setActioning] = useState<string | null>(null)
  const [returnNotes, setReturnNotes] = useState('')
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- Fetch ---
  const fetchBuilds = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/builds')
      const data = await res.json()
      setBuilds(data.builds ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBuilds()
  }, [fetchBuilds])

  // Auto-trigger Forgekeeper for any Pending Review build without a review
  useEffect(() => {
    const pending = builds.filter(
      b => b.workshop_status === 'Pending Review' && !b.forgekeeper_review
    )
    pending.forEach(b => {
      if (running === b.id) return
      runForgekeeper(b.id)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds])

  // --- Forgekeeper trigger ---
  async function runForgekeeper(buildId: string) {
    setRunning(buildId)
    setError(null)
    try {
      const res = await fetch('/api/forgekeeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId }),
      })
      if (!res.ok) {
        const errData = await res.json()
        setError(`Forgekeeper error: ${errData.error ?? 'unknown'}`)
      } else {
        const data = await res.json()
        // Update the specific build in state
        setBuilds(prev => prev.map(b => b.id === buildId ? data.build : b))
        if (selectedBuild?.id === buildId) {
          setSelectedBuild(data.build)
        }
      }
    } catch (err) {
      setError(`Forgekeeper unreachable: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setRunning(null)
    }
  }

  // --- Workshop actions ---
  async function handleAction(buildId: string, action: string, notes?: string) {
    setActioning(buildId)
    setError(null)
    try {
      const res = await fetch('/api/workshop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId, action, returnNotes: notes }),
      })
      if (!res.ok) { setError('Action failed.'); return }
      const data = await res.json()
      setBuilds(prev => prev.map(b => b.id === buildId ? data.build : b))
      setSelectedBuild(data.build)
      setShowReturnForm(false)
      setReturnNotes('')
    } finally {
      setActioning(null)
    }
  }

  // --- Split into pending / history ---
  const pendingStatuses: WorkshopStatus[] = ['Pending Review', 'Review Complete', 'Ready to Commit', 'Held']
  const historyStatuses: WorkshopStatus[] = ['Committed', 'Returned']

  const pendingBuilds = builds.filter(b => b.workshop_status && pendingStatuses.includes(b.workshop_status as WorkshopStatus))
  const historyBuilds = builds.filter(b => b.workshop_status && historyStatuses.includes(b.workshop_status as WorkshopStatus))

  // --- Render helpers ---

  function BuildListItem({ build }: { build: Build }) {
    const isSelected = selectedBuild?.id === build.id
    const isRunning = running === build.id
    return (
      <button
        onClick={() => { setSelectedBuild(build); setShowReturnForm(false); setError(null) }}
        className={`w-full text-left border bg-house-surface p-3 transition-all duration-200 animate-fade-in ${
          isSelected ? 'border-house-muted border-l-2 border-l-text-secondary' : 'border-house-border hover:border-house-muted'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-text-secondary">{build.build_id}</span>
              <span className="font-body text-[10px] text-text-muted">{originLabel(build.origin)}</span>
            </div>
            <p className="font-body text-sm text-text-primary mt-0.5">{build.short_name}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`font-body text-[10px] ${workshopStatusColor(build.workshop_status)}`}>
              {isRunning ? 'Running review…' : build.workshop_status}
            </span>
            {build.forgekeeper_review?.risk_summary && (
              <span className={`font-mono text-[10px] ${riskColorClass(build.forgekeeper_review.risk_summary)}`}>
                {build.forgekeeper_review.risk_summary}
              </span>
            )}
          </div>
        </div>
        <p className="font-mono text-[10px] text-text-muted mt-1">{formatDate(build.updated_at)}</p>
      </button>
    )
  }

  function ReviewPanel({ build }: { build: Build }) {
    const isRunning = running === build.id
    const isActioning_ = actioning === build.id
    const review = build.forgekeeper_review
    const canAct = build.workshop_status !== 'Committed' && build.workshop_status !== 'Returned'

    return (
      <div className="flex flex-col h-full overflow-hidden border border-house-border bg-house-surface animate-fade-in">
        {/* Panel header */}
        <div className="shrink-0 border-b border-house-border px-4 py-3 flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-text-secondary">{build.build_id}</span>
              <span className="font-body text-[10px] text-text-muted">{originLabel(build.origin)}</span>
              <span className={`font-body text-[10px] ${workshopStatusColor(build.workshop_status)}`}>
                {build.workshop_status}
              </span>
            </div>
            <p className="font-display text-lg text-text-primary mt-0.5">{build.short_name}</p>
          </div>
          <button
            onClick={() => setSelectedBuild(null)}
            className="font-mono text-sm text-text-muted hover:text-text-secondary min-h-[40px] px-2 shrink-0"
          >
            ×
          </button>
        </div>

        {/* Panel body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">

          {/* Build metadata */}
          <div className="space-y-2">
            {build.summary && (
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Summary</p>
                <p className="font-body text-sm text-text-primary">{build.summary}</p>
              </div>
            )}
            {build.reason && (
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Reason</p>
                <p className="font-body text-xs text-text-secondary">{build.reason}</p>
              </div>
            )}
            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Scope</p>
                <p className="font-body text-xs text-text-secondary">{build.expected_scope}</p>
              </div>
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Tests</p>
                <p className="font-body text-xs text-text-secondary">{build.tests_run?.join(', ')}</p>
              </div>
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Surfaces</p>
                <p className="font-body text-xs text-text-secondary">{build.affected_surfaces?.join(', ') || '—'}</p>
              </div>
            </div>
            {build.changed_files?.length > 0 && (
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">
                  Changed files ({build.changed_files.length})
                </p>
                <div className="space-y-0.5">
                  {build.changed_files.map((f, i) => (
                    <p key={i} className="font-mono text-xs text-text-secondary">{f}</p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-house-border" />

          {/* Forgekeeper review */}
          {isRunning && (
            <div className="flex items-center gap-2 py-4">
              <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
              <p className="font-body text-sm text-text-muted">Forgekeeper running review…</p>
            </div>
          )}

          {!review && !isRunning && (
            <div className="py-4">
              <p className="font-body text-sm text-text-muted">No review yet.</p>
              <button
                onClick={() => runForgekeeper(build.id)}
                className="font-body text-xs text-text-muted hover:text-text-secondary mt-2 border border-house-border px-3 py-2 min-h-[40px] transition-colors"
              >
                Run Review
              </button>
            </div>
          )}

          {review && !isRunning && (
            <div className="space-y-4">
              {/* Risk + quality */}
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Risk</p>
                  <p className={`font-mono text-sm font-medium ${riskColorClass(review.risk_summary)}`}>
                    {review.risk_summary}
                  </p>
                </div>
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-0.5">Scope</p>
                  <p className="font-body text-xs text-text-secondary">{review.quality_results?.scope_classification}</p>
                </div>
                {review.quality_results?.scope_breach_detected && (
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <p className="font-body text-xs text-red-400">Scope breach</p>
                  </div>
                )}
              </div>

              {/* Scope breach details */}
              {review.quality_results?.scope_breach_detected && review.quality_results?.scope_breach_details && (
                <div className="border border-red-900/40 bg-house-bg p-3">
                  <p className="font-body text-[10px] text-red-400 uppercase tracking-widest mb-1">Scope breach</p>
                  <p className="font-body text-xs text-text-secondary">{review.quality_results.scope_breach_details}</p>
                </div>
              )}

              {/* Issue list */}
              {review.issue_list?.length > 0 && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">Issues</p>
                  <ul className="space-y-1.5">
                    {review.issue_list.map((issue, i) => (
                      <li key={i} className="font-body text-xs text-text-secondary flex gap-2">
                        <span className="text-text-muted shrink-0">·</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Consequence preview */}
              {review.consequence_preview && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">
                    Consequence preview
                  </p>
                  <p className="font-body text-sm text-text-primary leading-relaxed">
                    {review.consequence_preview}
                  </p>
                </div>
              )}

              {/* Recommendations */}
              {review.recommendations?.length > 0 && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
                    Recommendations
                  </p>
                  <ul className="space-y-1.5">
                    {review.recommendations.map((r, i) => (
                      <li key={i} className="font-body text-xs text-text-secondary flex gap-2">
                        <span className="text-text-muted shrink-0">→</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quality results */}
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
                  Build quality
                </p>
                <div className="space-y-1">
                  <p className="font-body text-xs text-text-secondary">
                    Files changed: {review.quality_results?.changed_file_count ?? build.changed_files?.length ?? 0}
                  </p>
                  <p className="font-body text-xs text-text-secondary">
                    Tests: {review.quality_results?.tests_run_summary}
                  </p>
                </div>
              </div>

              {/* Reviewed at */}
              {review.reviewed_at && (
                <p className="font-mono text-[10px] text-text-muted">
                  Reviewed {formatDate(review.reviewed_at)}
                </p>
              )}
            </div>
          )}

          {/* Return notes (if returned) */}
          {review?._return_notes && (
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Return notes</p>
              <p className="font-body text-xs text-text-secondary">{review._return_notes as string}</p>
            </div>
          )}

          {error && <p className="font-body text-xs text-red-400">{error}</p>}

          {/* Return form */}
          {showReturnForm && canAct && (
            <div className="space-y-2 border-t border-house-border pt-3">
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">Return notes (optional)</p>
              <textarea
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                placeholder="What needs to change before this can be approved…"
                rows={2}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(build.id, 'return', returnNotes)}
                  disabled={!!isActioning_}
                  className="font-body text-xs px-3 py-2 border border-amber-700/60 text-amber-400 hover:bg-amber-900/10 min-h-[40px] transition-all duration-200"
                >
                  {isActioning_ ? 'Returning…' : 'Confirm Return'}
                </button>
                <button
                  onClick={() => { setShowReturnForm(false); setReturnNotes('') }}
                  className="font-body text-xs text-text-muted hover:text-text-secondary min-h-[40px] px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {canAct && !showReturnForm && (
          <div className="shrink-0 border-t border-house-border px-4 py-3 flex flex-wrap gap-2">
            <button
              onClick={() => handleAction(build.id, 'approve')}
              disabled={!!isActioning_ || isRunning || !review}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[40px] transition-all duration-200 ${
                isActioning_ || isRunning || !review
                  ? 'text-text-muted border-house-border opacity-50'
                  : 'text-green-400 border-green-900/60 hover:bg-green-900/10'
              }`}
            >
              {isActioning_ ? 'Working…' : 'Approve for Commit'}
            </button>

            <button
              onClick={() => setShowReturnForm(true)}
              disabled={!!isActioning_ || isRunning}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[40px] transition-all duration-200 ${
                isActioning_ || isRunning
                  ? 'text-text-muted border-house-border opacity-50'
                  : 'text-amber-400 border-amber-900/60 hover:bg-amber-900/10'
              }`}
            >
              Return for Edits
            </button>

            {build.workshop_status !== 'Held' && (
              <button
                onClick={() => handleAction(build.id, 'hold')}
                disabled={!!isActioning_}
                className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary min-h-[40px] transition-all duration-200"
              >
                Hold
              </button>
            )}

            {build.workshop_status === 'Held' && (
              <button
                onClick={() => handleAction(build.id, 'reopen')}
                disabled={!!isActioning_}
                className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary min-h-[40px] transition-all duration-200"
              >
                Reopen
              </button>
            )}

            {review && (
              <button
                onClick={() => runForgekeeper(build.id)}
                disabled={isRunning || !!isActioning_}
                className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary min-h-[40px] transition-all duration-200"
              >
                Refresh Review
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
      </div>
    )
  }

  // --- Main render ---
  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <p className="font-body text-xs text-text-muted uppercase tracking-widest">Workshop</p>
        <p className="font-body text-[10px] text-text-muted mt-1">
          Build verification and decision space.
        </p>
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => setSection('pending')}
            className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
              section === 'pending'
                ? 'text-text-secondary border-house-muted'
                : 'text-text-muted border-house-border hover:text-text-secondary'
            }`}
          >
            Active ({pendingBuilds.length})
          </button>
          <button
            onClick={() => setSection('history')}
            className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
              section === 'history'
                ? 'text-text-secondary border-house-muted'
                : 'text-text-muted border-house-border hover:text-text-secondary'
            }`}
          >
            History ({historyBuilds.length})
          </button>
        </div>
      </div>

      {/* Two-column layout on md+ */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Build list */}
        <div className={`shrink-0 overflow-y-auto space-y-2 ${selectedBuild ? 'hidden md:block md:w-72' : 'w-full'}`}>
          {section === 'pending' && (
            pendingBuilds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32">
                <p className="font-body text-sm text-text-muted">No builds awaiting review.</p>
              </div>
            ) : (
              pendingBuilds.map(b => <BuildListItem key={b.id} build={b} />)
            )
          )}
          {section === 'history' && (
            historyBuilds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32">
                <p className="font-body text-sm text-text-muted">No build history yet.</p>
              </div>
            ) : (
              historyBuilds.map(b => <BuildListItem key={b.id} build={b} />)
            )
          )}
        </div>

        {/* Review panel */}
        {selectedBuild && (
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <ReviewPanel build={selectedBuild} />
          </div>
        )}
      </div>
    </div>
  )
}
