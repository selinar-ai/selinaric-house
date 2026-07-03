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

// Phase 42.3.4b — an approval authority event (append-only), shown read-only as history.
type ApprovalEventRow = {
  event_sequence: number
  decision: string
  decided_by: string
  decision_reason: string | null
  created_at: string
}

// Phase 42.3.4a — a proposed remedy plan, shown under its finding. 42.3.4b adds the derived
// approval status + append-only event history. Approve/Reject/Revoke are authority decisions,
// NOT execution — nothing is ever applied here.
type PlanRow = {
  id: string
  finding_id: string
  action_type: string
  target_table: string
  target_field: string
  current_value: string
  proposed_value: string
  deterministic_reason: string
  plan_state: string
  approval_status: string
  approval_events: ApprovalEventRow[]
}

// Phase 42.4.1 — a deterministic graph-structure proposal (suggest-only; triage, never truth).
type GraphProposalRow = {
  id: string
  target_graph: string
  edge_type: string
  from_node_id: string
  to_node_id: string
  source_item_ids: string[]
  rationale: string
  review_state: string
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
  const [plansByFinding, setPlansByFinding] = useState<Map<string, PlanRow[]>>(new Map())
  const [graphProposals, setGraphProposals] = useState<GraphProposalRow[]>([])
  const [nodeLabels, setNodeLabels] = useState<Record<string, string>>({})
  const [gBulkBusy, setGBulkBusy] = useState(false)
  const [gBulkResult, setGBulkResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams()
      if (domain !== 'all') q.set('domain', domain)
      if (reviewFilter !== 'all') q.set('review_state', reviewFilter)
      if (detectionFilter !== 'all') q.set('detection_status', detectionFilter)
      const [fRes, rRes, pRes, gRes] = await Promise.all([
        fetch(`/api/agents/findings?${q.toString()}`),
        fetch(`/api/agents/runs${domain !== 'all' ? `?domain=${domain}` : ''}`),
        fetch('/api/agents/remedy-plans'),
        fetch('/api/agents/graph-proposals'),
      ])
      if (!fRes.ok) throw new Error(`findings ${fRes.status}`)
      const fJson = (await fRes.json()) as { findings?: Finding[] }
      const rJson = rRes.ok ? ((await rRes.json()) as { runs?: Run[] }) : { runs: [] }
      const pJson = pRes.ok ? ((await pRes.json()) as { remedy_plans?: PlanRow[] }) : { remedy_plans: [] }
      const gJson = gRes.ok
        ? ((await gRes.json()) as { graph_proposals?: GraphProposalRow[]; node_labels?: Record<string, string> })
        : { graph_proposals: [], node_labels: {} }
      const byFinding = new Map<string, PlanRow[]>()
      for (const p of pJson.remedy_plans ?? []) {
        const list = byFinding.get(p.finding_id) ?? []
        list.push(p)
        byFinding.set(p.finding_id, list)
      }
      setFindings(fJson.findings ?? [])
      setRuns(rJson.runs ?? [])
      setPlansByFinding(byFinding)
      setGraphProposals(gJson.graph_proposals ?? [])
      setNodeLabels(gJson.node_labels ?? {})
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

  // Phase 43 (bulk triage) — apply ONE review state to the findings currently shown by the
  // active filters. Submits only displayed ids; confirm shows the exact count; the route
  // loops the same governed single-finding RPC (no new SQL, no new verbs) and reports
  // per-id failures honestly. Capped at 200 ids — fail closed, never truncate silently.
  const bulkReview = useCallback(async (review_state: string) => {
    const ids = findings.map((f) => f.id)
    if (ids.length === 0) { setBulkResult('Nothing to update — no findings in the current view.'); return }
    if (ids.length > 200) { setBulkResult(`Refused: ${ids.length} findings exceeds the bulk cap of 200 — narrow the filters first.`); return }
    if (!window.confirm(`Set review state to "${review_state}" on the ${ids.length} finding(s) currently shown?`)) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/agents/findings/review-state/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, review_state }),
      })
      const json = (await res.json()) as { succeeded?: number; failed?: { id: string; error: string }[]; code?: string }
      if (!res.ok) throw new Error(json.code ?? `bulk review ${res.status}`)
      const failedCount = json.failed?.length ?? 0
      setBulkResult(`Bulk ${review_state}: ${json.succeeded ?? 0} succeeded${failedCount > 0 ? `, ${failedCount} FAILED` : ''}.`)
      await loadData()
    } catch (e) {
      setBulkResult(null)
      setError(e instanceof Error ? e.message : 'bulk review failed')
    } finally {
      setBulkBusy(false)
    }
  }, [findings, loadData])

  // Phase 42.3.4b — record an approval authority decision (approved/rejected/revoked).
  // This authorises a future apply; it does NOT apply, queue, or run anything.
  const doApproval = useCallback(async (planId: string, decision: string) => {
    setBusyId(planId)
    try {
      const res = await fetch(`/api/agents/remedy-plans/${planId}/approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!res.ok) throw new Error(`approval ${res.status}`)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approval decision failed')
    } finally {
      setBusyId(null)
    }
  }, [loadData])

  // Phase 43 (graph bulk triage) — apply ONE review state to the proposals currently shown.
  // Submits only displayed ids + a declared expected_count (server fails closed on mismatch);
  // the route loops the same governed single-proposal RPC. Never touches graph truth.
  const bulkReviewProposals = useCallback(async (review_state: string) => {
    const ids = graphProposals.map((g) => g.id)
    if (ids.length === 0) { setGBulkResult('Nothing to update — no proposals in the current view.'); return }
    if (ids.length > 200) { setGBulkResult(`Refused: ${ids.length} proposals exceeds the bulk cap of 200.`); return }
    if (!window.confirm(`Set review state to "${review_state}" on the ${ids.length} proposal(s) currently shown?`)) return
    setGBulkBusy(true)
    setGBulkResult(null)
    try {
      const res = await fetch('/api/agents/graph-proposals/review-state/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, review_state, expected_count: ids.length }),
      })
      const json = (await res.json()) as { succeeded?: number; failed?: { id: string; error: string }[]; code?: string }
      if (!res.ok) throw new Error(json.code ?? `bulk proposal review ${res.status}`)
      const failedCount = json.failed?.length ?? 0
      setGBulkResult(`Bulk ${review_state}: ${json.succeeded ?? 0} succeeded${failedCount > 0 ? `, ${failedCount} FAILED` : ''}.`)
      await loadData()
    } catch (e) {
      setGBulkResult(null)
      setError(e instanceof Error ? e.message : 'bulk proposal review failed')
    } finally {
      setGBulkBusy(false)
    }
  }, [graphProposals, loadData])

  // Phase 42.4.1 — triage a graph proposal (open/acknowledged/dismissed). Never touches graph truth.
  const reviewProposal = useCallback(async (id: string, review_state: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/agents/graph-proposals/${id}/review-state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ review_state }),
      })
      if (!res.ok) throw new Error(`graph review ${res.status}`)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'graph review failed')
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

      {!loading && findings.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 mb-4 rounded-md border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2 text-xs">
          <span className="opacity-60">
            Bulk action · applies to the {findings.length} finding(s) currently shown by these filters:
          </span>
          <ReviewButton label="Acknowledge all" disabled={bulkBusy} onClick={() => bulkReview('acknowledged')} />
          <ReviewButton label="Dismiss all" disabled={bulkBusy} onClick={() => bulkReview('dismissed')} />
          <ReviewButton label="Reopen all" disabled={bulkBusy} onClick={() => bulkReview('open')} />
          {bulkBusy ? <span className="opacity-50">Working…</span> : null}
        </div>
      ) : null}
      {bulkResult ? <p className="text-sm opacity-80 mb-4">{bulkResult}</p> : null}

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
                      <>
                        <pre className="mt-2 text-xs opacity-70 whitespace-pre-wrap break-words">
                          {JSON.stringify({ capability_id: f.capability_id, target: `${f.target_table}:${f.target_id}`, payload: f.payload, reviewed_by: f.reviewed_by, reviewed_at: f.reviewed_at }, null, 2)}
                        </pre>
                        {(plansByFinding.get(f.id) ?? []).map((p) => (
                          <div key={p.id} className="mt-2 rounded border border-dashed border-[var(--house-border,#1e1e2e)] p-2 text-xs">
                            <div className="opacity-60 mb-1">Proposed remedy</div>
                            <div><span className="opacity-50">Current value:</span> <code className="opacity-90">{JSON.stringify(p.current_value)}</code></div>
                            <div><span className="opacity-50">Proposed value:</span> <code className="opacity-90">{JSON.stringify(p.proposed_value)}</code></div>
                            <div className="opacity-60 mt-1">Deterministic reason: {p.deterministic_reason}</div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="opacity-50">Approval status: <span className="opacity-90">{p.approval_status}</span></span>
                              <div className="flex gap-1 shrink-0">
                                <ReviewButton label="Approve" disabled={busyId === p.id} onClick={() => doApproval(p.id, 'approved')} />
                                <ReviewButton label="Reject" disabled={busyId === p.id} onClick={() => doApproval(p.id, 'rejected')} />
                                {p.approval_status === 'approved' ? (
                                  <ReviewButton label="Revoke" disabled={busyId === p.id} onClick={() => doApproval(p.id, 'revoked')} />
                                ) : null}
                              </div>
                            </div>
                            {p.approval_events.length > 0 ? (
                              <ul className="mt-1 opacity-50">
                                {p.approval_events.map((ev) => (
                                  <li key={ev.event_sequence}>#{ev.event_sequence} {ev.decision} by {ev.decided_by}{ev.decision_reason ? ` — ${ev.decision_reason}` : ''}</li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ))}
                      </>
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

      <section className="mt-8">
        <h2 className="text-lg font-medium mb-1">Graph proposals</h2>
        <p className="text-xs opacity-50 mb-2">Suggest-only. Deterministic structure candidates for review — not graph truth, not Memory. Triage only.</p>
        {graphProposals.length === 0 ? (
          <p className="text-sm opacity-50">No graph proposals to review.</p>
        ) : (
          <>
          <div className="flex flex-wrap items-center gap-2 mb-2 rounded-md border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2 text-xs">
            <span className="opacity-60">
              Bulk action · applies to the {graphProposals.length} proposal(s) currently shown:
            </span>
            <ReviewButton label="Acknowledge all" disabled={gBulkBusy} onClick={() => bulkReviewProposals('acknowledged')} />
            <ReviewButton label="Dismiss all" disabled={gBulkBusy} onClick={() => bulkReviewProposals('dismissed')} />
            <ReviewButton label="Reopen all" disabled={gBulkBusy} onClick={() => bulkReviewProposals('open')} />
            {gBulkBusy ? <span className="opacity-50">Working…</span> : null}
          </div>
          {gBulkResult ? <p className="text-sm opacity-80 mb-2">{gBulkResult}</p> : null}
          <ul className="space-y-1">
            {graphProposals.map((g) => (
              <li key={g.id} className="rounded border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="opacity-80">
                    {/* labels are best-effort read enrichment — a missing label falls back to the short id */}
                    <span className="opacity-95">{nodeLabels[g.from_node_id] ?? g.from_node_id.slice(0, 8)}</span>
                    {' ↔ '}
                    <span className="opacity-95">{nodeLabels[g.to_node_id] ?? g.to_node_id.slice(0, 8)}</span>
                    <code className="ml-2 opacity-60">{g.edge_type}</code>
                    <span className="ml-2 opacity-40">{g.from_node_id.slice(0, 8)} ↔ {g.to_node_id.slice(0, 8)}</span>
                    <span className="ml-2 opacity-50">[{g.review_state}]</span>
                  </span>
                  <div className="flex gap-1 shrink-0">
                    <ReviewButton label="Acknowledge" disabled={busyId === g.id} onClick={() => reviewProposal(g.id, 'acknowledged')} />
                    <ReviewButton label="Dismiss" disabled={busyId === g.id} onClick={() => reviewProposal(g.id, 'dismissed')} />
                    <ReviewButton label="Reopen" disabled={busyId === g.id} onClick={() => reviewProposal(g.id, 'open')} />
                  </div>
                </div>
                <div className="opacity-60 mt-1">{g.rationale}</div>
                <div className="opacity-50 mt-1">shared sources: {g.source_item_ids.length}</div>
              </li>
            ))}
          </ul>
          </>
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
