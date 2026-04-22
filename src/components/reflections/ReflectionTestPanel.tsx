'use client'

// Phase 24B — Reflection test panel.
// A builder door into the reflection engine. Not a product feature.
// Only rendered in development mode.

import { useState } from 'react'
import { VALID_TRIGGER_TYPES, type ReflectionTriggerType } from '@/lib/reflections/reflection-types'

// Map trigger type → the source ref type it expects
const TRIGGER_SOURCE_TYPE: Record<ReflectionTriggerType, string> = {
  concept_approved:        'concept',
  timeline_keep:           'timeline_entry',
  forgekeeper_accepted:    'build',
  living_state_transition: 'living_state',
}

const TRIGGER_LABELS: Record<ReflectionTriggerType, string> = {
  concept_approved:        'Concept approved',
  timeline_keep:           'Timeline keep',
  forgekeeper_accepted:    'Forgekeeper accepted',
  living_state_transition: 'Living State transition',
}

interface Props {
  presence: 'ari' | 'eli'
  onJobProcessed: () => void
}

type Status = { kind: 'idle' } | { kind: 'ok'; message: string } | { kind: 'err'; message: string }

export default function ReflectionTestPanel({ presence, onJobProcessed }: Props) {
  // Only render in dev
  if (process.env.NODE_ENV !== 'development') return null

  const [open, setOpen] = useState(false)
  const [triggerType, setTriggerType] = useState<ReflectionTriggerType>('concept_approved')
  const [sourceId, setSourceId] = useState('')
  const [creating, setCreating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  function flash(kind: 'ok' | 'err', message: string) {
    setStatus({ kind, message })
    setTimeout(() => setStatus({ kind: 'idle' }), 5000)
  }

  async function handleCreateJob() {
    if (!sourceId.trim()) {
      flash('err', 'Source ID is required')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/reflection-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          presenceId: presence,
          triggerType,
          sourceRefs: [{ type: TRIGGER_SOURCE_TYPE[triggerType], id: sourceId.trim() }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      flash('ok', `Job created — ${data.job?.id?.slice(0, 8)}…`)
      setSourceId('')
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to create job')
    } finally {
      setCreating(false)
    }
  }

  async function handleProcess() {
    setProcessing(true)
    try {
      const res = await fetch('/api/reflections/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceId: presence, limit: 5 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const { processed, completed, failed } = data
      if (processed === 0) {
        flash('ok', 'No pending jobs')
      } else {
        flash('ok', `Processed ${processed} — ${completed} ok, ${failed} failed`)
        if (completed > 0) onJobProcessed()
      }
    } catch (err) {
      flash('err', err instanceof Error ? err.message : 'Failed to process')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="border-b border-house-border bg-house-bg/60">
      {/* Toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-house-surface/40 transition-colors"
      >
        <span className="font-mono text-[10px] text-text-muted">{open ? '▾' : '▸'}</span>
        <span className="font-body text-xs text-text-muted tracking-widest uppercase">
          Test controls
        </span>
        <span className="font-mono text-[10px] text-amber-400/60 ml-1">dev</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {/* Trigger type */}
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={triggerType}
              onChange={e => setTriggerType(e.target.value as ReflectionTriggerType)}
              className="font-body text-xs bg-house-surface border border-house-border text-text-secondary px-2 py-1.5 outline-none focus:border-house-muted"
            >
              {VALID_TRIGGER_TYPES.map(t => (
                <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
              ))}
            </select>

            <span className="font-mono text-[10px] text-text-muted">
              ref type: <span className="text-text-secondary">{TRIGGER_SOURCE_TYPE[triggerType]}</span>
            </span>
          </div>

          {/* Source ID + create */}
          <div className="flex gap-2">
            <input
              type="text"
              value={sourceId}
              onChange={e => setSourceId(e.target.value)}
              placeholder="Source UUID"
              className="flex-1 font-mono text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 placeholder:text-text-muted outline-none focus:border-house-muted min-w-0"
            />
            <button
              onClick={handleCreateJob}
              disabled={creating}
              className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40 shrink-0"
            >
              {creating ? '…' : 'Create job'}
            </button>
          </div>

          {/* Process */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleProcess}
              disabled={processing}
              className="font-body text-xs px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
            >
              {processing ? '…' : 'Run reflection jobs'}
            </button>

            {status.kind !== 'idle' && (
              <span className={`font-body text-xs ${status.kind === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {status.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
