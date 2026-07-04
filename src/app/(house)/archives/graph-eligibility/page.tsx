'use client'

/**
 * Gate A1 — Graph Eligibility (Tara's bulk handle on the ontology intake gate)
 *
 * Lists CANONICAL archive items with filters; marks/unmarks eligible_for_graph in
 * bulk with exact-count confirmation. Marking triggers NOTHING downstream — it only
 * widens what a later, separately-declared extraction run may consider. Unmark is
 * refused per id when downstream ontology references exist. Every request writes one
 * audit event with full item-id traceability.
 */

import { useCallback, useState } from 'react'

type Item = {
  id: string
  title: string | null
  archive_name: string | null
  sensitivity: string | null
  import_label: string | null
  created_at: string
  eligible_for_graph: boolean | null
}

const ARCHIVES = ['all', 'velvet', 'violet', 'house'] as const
const SENSITIVITIES = ['all', 'ordinary', 'private', 'sacred', 'sensitive', 'technical'] as const
const ELIGIBILITY = ['unmarked', 'marked', 'all'] as const
const BULK_CAP = 100

export default function GraphEligibilityPage() {
  const [archive, setArchive] = useState<string>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sensitivity, setSensitivity] = useState<string>('all')
  const [importLabel, setImportLabel] = useState('')
  const [eligibility, setEligibility] = useState<string>('unmarked')
  const [items, setItems] = useState<Item[]>([])
  const [capped, setCapped] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setSelected(new Set())
    try {
      const q = new URLSearchParams()
      if (archive !== 'all') q.set('archive', archive)
      if (from) q.set('from', from)
      if (to) q.set('to', to)
      if (sensitivity !== 'all') q.set('sensitivity', sensitivity)
      if (importLabel.trim()) q.set('import_label', importLabel.trim())
      q.set('eligibility', eligibility)
      const res = await fetch(`/api/archives/graph-eligibility?${q.toString()}`)
      if (!res.ok) throw new Error(`list ${res.status}`)
      const json = (await res.json()) as { items?: Item[]; capped?: boolean }
      setItems(json.items ?? [])
      setCapped(json.capped ?? false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [archive, from, to, sensitivity, importLabel, eligibility])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectVisible = () => setSelected(new Set(items.map((i) => i.id)))
  const clearSelection = () => setSelected(new Set())

  // Bulk action — submits ONLY selected ids from the loaded view, declares the exact
  // count (server fails closed on mismatch), confirms with the human-readable count.
  const bulk = useCallback(async (action: 'mark' | 'unmark') => {
    const ids = [...selected]
    if (ids.length === 0) { setResult('Nothing selected.'); return }
    if (ids.length > BULK_CAP) { setResult(`Refused: ${ids.length} selected exceeds the cap of ${BULK_CAP} per request — narrow the selection.`); return }
    const verb = action === 'mark' ? 'MARK graph-eligible' : 'UNMARK graph-eligible'
    if (!window.confirm(`${verb}: ${ids.length} item(s)?`)) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/archives/graph-eligibility/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, action, expected_count: ids.length }),
      })
      const json = (await res.json()) as { succeeded?: number; failed?: { id: string; reason: string }[]; code?: string }
      if (!res.ok) throw new Error(json.code ?? `bulk ${res.status}`)
      const failedCount = json.failed?.length ?? 0
      const reasons = failedCount > 0 ? ` — ${json.failed!.slice(0, 3).map((f) => `${f.id.slice(0, 8)}: ${f.reason}`).join('; ')}${failedCount > 3 ? '; …' : ''}` : ''
      setResult(`${verb}: ${json.succeeded ?? 0} succeeded${failedCount > 0 ? `, ${failedCount} refused${reasons}` : ''}.`)
      await load()
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : 'bulk action failed')
    } finally {
      setBusy(false)
    }
  }, [selected, load])

  return (
    <div className="p-6 max-w-5xl mx-auto text-[var(--text-primary,#e8e8f0)]">
      <h1 className="text-2xl font-serif mb-1">Graph Eligibility</h1>
      <p className="text-sm opacity-70 mb-4">The ontology intake gate · canonical items only · Tara&apos;s hand</p>

      <div className="rounded-md border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] p-3 mb-5 text-xs leading-relaxed opacity-80">
        Marking an item graph-eligible triggers nothing — no extraction, no proposals, no approval.
        It only widens what a later, separately-declared extraction run may consider. Unmarking is
        refused for items already referenced downstream. Every request is audited with full item ids.
      </div>

      <div className="flex flex-wrap gap-3 mb-3 text-sm items-end">
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">Archive</span>
          <select className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={archive} onChange={(e) => setArchive(e.target.value)}>
            {ARCHIVES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">From</span>
          <input type="date" className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">To</span>
          <input type="date" className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">Sensitivity</span>
          <select className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}>
            {SENSITIVITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">Import label</span>
          <input className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={importLabel} onChange={(e) => setImportLabel(e.target.value)} placeholder="contains…" />
        </label>
        <label className="flex flex-col gap-1"><span className="opacity-60 text-xs">Eligibility</span>
          <select className="bg-[var(--house-surface,#12121a)] border border-[var(--house-border,#1e1e2e)] rounded px-2 py-1" value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
            {ELIGIBILITY.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="button" onClick={load} disabled={loading} className="text-xs rounded border border-[var(--house-border,#1e1e2e)] px-3 py-1.5 hover:opacity-80 disabled:opacity-40">
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error ? <p className="text-sm text-rose-400 mb-3">Error: {error}</p> : null}
      {result ? <p className="text-sm opacity-80 mb-3">{result}</p> : null}
      {capped ? <p className="text-xs opacity-60 mb-3">Listing capped at 500 — narrow the filters to see everything.</p> : null}

      {items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 mb-3 rounded-md border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2 text-xs">
          <span className="opacity-60">{items.length} shown · {selected.size} selected (cap {BULK_CAP}/request):</span>
          <button type="button" onClick={selectVisible} className="rounded border border-[var(--house-border,#1e1e2e)] px-2 py-1 hover:opacity-80">Select visible</button>
          <button type="button" onClick={clearSelection} className="rounded border border-[var(--house-border,#1e1e2e)] px-2 py-1 hover:opacity-80">Clear</button>
          <button type="button" onClick={() => bulk('mark')} disabled={busy || selected.size === 0} className="rounded border border-[var(--house-border,#1e1e2e)] px-2 py-1 hover:opacity-80 disabled:opacity-40">Mark eligible</button>
          <button type="button" onClick={() => bulk('unmark')} disabled={busy || selected.size === 0} className="rounded border border-[var(--house-border,#1e1e2e)] px-2 py-1 hover:opacity-80 disabled:opacity-40">Unmark</button>
          {busy ? <span className="opacity-50">Working…</span> : null}
        </div>
      ) : null}

      {items.length === 0 && !loading ? (
        <p className="text-sm opacity-50">No items loaded — set filters and press Load. (Canonical items only.)</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id} className="rounded border border-[var(--house-border,#1e1e2e)] bg-[var(--house-surface,#12121a)] px-3 py-2 text-xs flex items-center gap-3">
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
              <span className="flex-1 opacity-90">{i.title ?? i.id}</span>
              <span className="opacity-50">{i.archive_name} · {i.sensitivity} · {i.created_at.slice(0, 10)}</span>
              <span className={i.eligible_for_graph ? 'text-emerald-400/80' : 'opacity-40'}>
                {i.eligible_for_graph ? 'eligible' : 'not eligible'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
