'use client'

/**
 * Phase 42.3.3b — Maintenance Room (review / triage-only surface)
 *
 * Reads persisted findings + run history via the auth-protected /api/agents routes.
 * The only actions are Acknowledge / Dismiss / Reopen (review_state). There are no
 * Fix / Apply / Approve / Remedy / Re-run / Generate-plan / LLM controls — the kernel
 * may inspect, report, and record; it may not act.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

type Finding = {
  id: string
  domain: string
  capability_id: string
  issue_code: string
  target_table: string
  target_id: string
  target_label: string | null
  severity: string
  review_burden: string
  summary: string
  payload: Record<string, unknown>
  detection_status: string
  review_state: string
  reviewed_by: string | null
  reviewed_at: string | null
  first_seen_run_id: string
  last_seen_run_id: string
}

type Run = {
  id: string
  domain: string
  scope_type: string
  scope_ref: string | null
  finding_count: number
  capped: boolean
  created_at: string
}

const DOMAINS = ['all', 'library', 'archive_graph'] as const
const REVIEW_FILTERS = ['all', 'open', 'acknowledged', 'dismissed'] as const
const DETECTION_FILTERS = ['all', 'active', 'not_redetected'] as const

export default function MaintenanceRoomPage() {
  const [domain, setDomain] = useState<string>('all')
  const [reviewFilter, setReviewFilter] = useState<string>('all')
  const [detectionFilter, setDetectionFilter] = useState<string>('all')
  const [findings, setFindings] = useState<Finding[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams()
      if (domain !== 'all') q.set('domain', domain)
      if (reviewFilter !== 'all') q.set('review_state', reviewFilter)
      if (detectionFilter !== 'all') q.set('detection_status', detectionFilter)
      const [fRes, rRes] = await Promise.all([
        fetch(`/api/agents/findings?${q.toString()}`),
        fetch(`/api/agents/runs${domain !== 'all' ? `?domain=${domain}` : ''}`),
      ])
      if (!fRes.ok) throw new Error(`findings ${fRes.status}`)
      const fJson = (await fRes.json()) as { findings?: Finding[] }
      const rJson = rRes.ok ? ((await rRes.json()) as { runs?: Run[] }) : { runs: [] }
      setFindings(fJson.findings ?? [])
      setRuns(rJson.runs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [domain, reviewFilter, detectionFilter])

  useEffect(() => {
    // Mount + filter-change data fetch. This is the repo-wide read-only review-queue
    // idiom (see src/app/(house)/helpers/page.tsx); loadData only mutates state to
    // reflect fetched data — there is no cascading-render risk. The rule cannot model
    // the deferred fetch, so it is suppressed narrowly on this single line only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
  }, [loadData])

  const setReviewState = useCallback(async (id: string, review_state: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/agents/findings/${id}/review-state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ review_state }),
      })
      if (!res.ok) throw new Error(`review-state ${res.status}`)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'review update failed')
    } finally {
      setBusyId(null)
    }
  }, [loadData])

  const grouped = useMemo(() => {
    const byDomain = new Map<string, Map<string, Finding[]>>()
    for (const f of findings) {
      const sev = byDomain.get(f.domain) ?? new Map<string, Finding[]>()
      const key = `${f.severity}:${f.issue_code}`
      const list = sev.get(key) ?? []
      list.push(f)
      sev.set(key, list)
      byDomain.set(f.domain, sev)
    }
    return byDomain
  }, [findings])

  return (
    <div className="p-6 max-w-5xl mx-auto text-[var(--text-primary,#e8e8f0)]">
      <h1 className="text-2xl font-serif mb-1">Maintenance Room</h1>
      <p className="text-sm opacity-70 mb-4">Governed findings · review &amp; triage</p>

      <div className="rounded-md border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] p-3 mb-5 text-xs leading-relaxed opacity-80">
        Review surface only. Persisted findings are durable operational records — not Memory,
        not evidence, not authority, not proposals, not queued work. The kernel may inspect,
        report, and record; it may not act.
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <Filter label="Domain" value={domain} options={DOMAINS} onChange={setDomain} />
        <Filter label="Review" value={reviewFilter} options={REVIEW_FILTERS} onChange={setReviewFilter} />
        <Filter label="Detection" value={detectionFilter} options={DETECTION_FILTERS} onChange={setDetectionFilter} />
      </div>

      {error ? <p className="text-sm text-rose-400 mb-4">Error: {error}</p> : null}
      {loading ? <p className="text-sm opacity-60">Loading…</p> : null}

      {!loading && findings.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--house-border,#1e1e2e)] p-8 text-center opacity-60 text-sm">
          No findings to review. (The durable store is empty for this view — nothing has been
          recorded yet, or all findings are filtered out.)
        </div>
      ) : null}

      {[...grouped.entries()].map(([dom, sevMap]) => (
        <section key={dom} className="mb-6">
          <h2 className="text-lg font-medium mb-2 capitalize">{dom.replace('_', ' ')}</h2>
          {[...sevMap.entries()].map(([key, list]) => (
            <div key={key} className="mb-3">
              <div className="text-xs uppercase tracking-wide opacity-50 mb-1">
                {list[0].severity} · {list[0].issue_code} · {list.length}
              </div>
              <ul className="space-y-1">
                {list.map((f) => (
                  <li
                    key={f.id}
                    className="rounded border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        className="text-left text-sm flex-1 hover:opacity-80"
                        onClick={() => setSelected(f.id === selected ? null : f.id)}
                      >
                        <span className="opacity-90">{f.summary}</span>
                        <span className="opacity-50"> — {f.target_label ?? f.target_id}</span>
                        <span className="ml-2 text-xs opacity-50">[{f.review_state}/{f.detection_status}]</span>
                      </button>
                      <div className="flex gap-1 shrink-0">
                        <ReviewButton label="Acknowledge" disabled={busyId === f.id} onClick={() => setReviewState(f.id, 'acknowledged')} />
                        <ReviewButton label="Dismiss" disabled={busyId === f.id} onClick={() => setReviewState(f.id, 'dismissed')} />
                        <ReviewButton label="Reopen" disabled={busyId === f.id} onClick={() => setReviewState(f.id, 'open')} />
                      </div>
                    </div>
                    {selected === f.id ? (
                      <pre className="mt-2 text-xs opacity-70 whitespace-pre-wrap break-words">
                        {JSON.stringify({ capability_id: f.capability_id, target: `${f.target_table}:${f.target_id}`, payload: f.payload, reviewed_by: f.reviewed_by, reviewed_at: f.reviewed_at }, null, 2)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-lg font-medium mb-2">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm opacity-50">No runs recorded for this view.</p>
        ) : (
          <ul className="text-xs space-y-1 opacity-75">
            {runs.map((r) => (
              <li key={r.id}>
                {r.created_at} · {r.domain} · {r.scope_type}{r.scope_ref ? ` (${r.scope_ref})` : ''} · {r.finding_count} findings{r.capped ? ' · capped' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Filter(props: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="opacity-60">{props.label}</span>
      <select
        className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  )
}

function ReviewButton(props: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="text-xs rounded border border-[var(--house-border,#1e1e2e)] px-2 py-1 hover:opacity-80 disabled:opacity-40"
    >
      {props.label}
    </button>
  )
}
