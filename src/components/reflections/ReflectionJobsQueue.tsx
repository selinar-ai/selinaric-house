'use client'

// Phase 24D — Reflection job queue panel.
// Makes the pipeline visible: pending jobs appear here before they become reflections.
// "Run" processes all pending jobs for this presence and refreshes the reflection list.
// Hidden entirely when there are no pending or failed jobs.

import { useState } from 'react'
import { useReflectionJobs } from '@/hooks/useReflectionJobs'
import type { ReflectionJob } from '@/lib/reflections/reflection-types'
import { PROCESSABLE_TRIGGER_TYPES } from '@/lib/reflections/reflection-types'
import { formatTriggerType, formatReflectionDate } from '@/lib/reflections/reflection-format'

const TRIGGER_CHIP: Record<string, { label: string; color: string }> = {
  timeline_keep:           { label: 'Timeline kept',     color: 'text-amber-300 bg-amber-400/10' },
  concept_approved:        { label: 'Concept approved',  color: 'text-blue-300 bg-blue-400/10' },
  forgekeeper_accepted:    { label: 'Build committed',   color: 'text-green-300 bg-green-400/10' },
  living_state_transition: { label: 'Living state',      color: 'text-violet-300 bg-violet-400/10' },
  cross_room_event:        { label: 'Cross-room',        color: 'text-teal-300 bg-teal-400/10' },
}

interface Props {
  presenceId: 'ari' | 'eli'
  onProcessed: () => void
}

export default function ReflectionJobsQueue({ presenceId, onProcessed }: Props) {
  const { pendingJobs, failedJobs, loading, refresh } = useReflectionJobs(presenceId)
  const [running, setRunning] = useState(false)
  const [runStatus, setRunStatus] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const actionableJobs = [...pendingJobs, ...failedJobs]

  // Only processable trigger types count toward the Run button
  const processablePending = pendingJobs.filter(
    j => PROCESSABLE_TRIGGER_TYPES.includes(j.trigger_type)
  )

  // Don't render if there's nothing to show
  if (!loading && actionableJobs.length === 0) return null

  async function handleRun() {
    setRunning(true)
    setRunStatus(null)
    try {
      const res = await fetch('/api/reflections/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceId, limit: 5 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const { processed, completed, failed } = data
      if (processed === 0) {
        setRunStatus({ kind: 'ok', message: 'Nothing to process' })
      } else {
        setRunStatus({
          kind: 'ok',
          message: `${completed} completed${failed > 0 ? `, ${failed} failed` : ''}`,
        })
        if (completed > 0) onProcessed()
      }
      await refresh()
    } catch (err) {
      setRunStatus({ kind: 'err', message: err instanceof Error ? err.message : 'Failed' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="border-b border-house-border shrink-0">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="font-body text-xs text-text-muted tracking-widest uppercase">
          Queued
        </span>
        {pendingJobs.length > 0 && (
          <span className="font-mono text-[10px] bg-amber-400/10 text-amber-300 px-1.5 py-0.5 rounded">
            {pendingJobs.length} pending
          </span>
        )}
        {failedJobs.length > 0 && (
          <span className="font-mono text-[10px] bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded">
            {failedJobs.length} failed
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {runStatus && (
            <span className={`font-body text-xs ${runStatus.kind === 'ok' ? 'text-text-muted' : 'text-red-400'}`}>
              {runStatus.message}
            </span>
          )}
          <button
            onClick={handleRun}
            disabled={running || processablePending.length === 0}
            className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
          >
            {running ? '…' : 'Run'}
          </button>
        </div>
      </div>

      {/* Job rows */}
      {actionableJobs.map(job => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  )
}

function JobRow({ job }: { job: ReflectionJob }) {
  const chip = TRIGGER_CHIP[job.trigger_type]
  const isCrossRoom = job.trigger_type === 'cross_room_event'

  return (
    <div className="flex items-start gap-3 px-4 py-2 border-t border-house-border/40">
      <span className={`font-body text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${chip?.color ?? 'text-text-muted bg-house-surface'}`}>
        {chip?.label ?? formatTriggerType(job.trigger_type)}
      </span>
      <div className="flex-1 min-w-0">
        {job.source_summary ? (
          <p className="font-body text-xs text-text-secondary truncate">{job.source_summary}</p>
        ) : (
          <p className="font-body text-xs text-text-muted italic">{formatTriggerType(job.trigger_type)}</p>
        )}
        {isCrossRoom && (
          <p className="font-mono text-[10px] text-teal-400/60 mt-0.5">
            Processing deferred — cross-room source loading not yet supported
          </p>
        )}
        {job.status === 'failed' && job.error_message && (
          <p className="font-body text-[10px] text-red-400 mt-0.5 truncate">{job.error_message}</p>
        )}
      </div>
      <span className="font-mono text-[10px] text-text-muted shrink-0 mt-0.5">
        {formatReflectionDate(job.created_at)}
      </span>
    </div>
  )
}
