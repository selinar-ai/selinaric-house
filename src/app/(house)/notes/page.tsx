'use client'

// Phase 11F — House Noticeboard
//
// Repurposes the old /notes route into the House Noticeboard: small shared
// deposits left by Ari and Eli during autonomous Pulse windows.
//
// Core Law (shown to Tara, enforced in code + DB):
//   A House Noticeboard item is a shared deposit — not Memory, not Journal,
//   not Telegram, not Lounge chat, not Library, not Archive, and not prompt
//   authority. Tara may view, pin, release, hide, or route an item for later
//   review; none of that changes its authority. The deposit content only ever
//   becomes something else if Tara routes it through an existing governed
//   review pathway.

import { useState, useEffect, useCallback } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

type NoticeboardStatus =
  | 'active'
  | 'viewed'
  | 'pinned'
  | 'released'
  | 'routed_to_library_review'
  | 'routed_to_archive_review'
  | 'hidden'

interface NoticeboardItem {
  id: string
  source_type: 'pulse_house_deposit' | 'tara_manual_note'
  source_event_id: string | null
  presence_id: 'ari' | 'eli' | null
  content: string
  note_kind: string
  status: NoticeboardStatus
  authority_label: string
  created_at: string
}

type Filter = 'all' | 'ari' | 'eli' | 'pinned' | 'active' | 'released'

// ─── Status transition rules (UI gating only) ────────────────────────────────
// The server (/api/noticeboard/[id]) is the source of truth and re-validates
// every transition; this map only decides which buttons to show.

const ALLOWED: Record<NoticeboardStatus, NoticeboardStatus[]> = {
  active: ['viewed', 'pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  viewed: ['pinned', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  pinned: ['viewed', 'released', 'hidden', 'routed_to_library_review', 'routed_to_archive_review'],
  released: [],
  hidden: [],
  routed_to_library_review: [],
  routed_to_archive_review: [],
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function presenceName(p: 'ari' | 'eli' | null): string {
  if (p === 'ari') return 'Ari'
  if (p === 'eli') return 'Eli'
  return 'House'
}

function sourceLabel(item: NoticeboardItem): string {
  return item.source_type === 'pulse_house_deposit' ? 'Pulse autonomy window' : 'Tara note'
}

function statusLabel(status: NoticeboardStatus): string {
  switch (status) {
    case 'active': return 'Active'
    case 'viewed': return 'Viewed'
    case 'pinned': return 'Pinned'
    case 'released': return 'Released'
    case 'routed_to_library_review': return 'Routed · Library review'
    case 'routed_to_archive_review': return 'Routed · Archive review'
    case 'hidden': return 'Hidden'
  }
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ari', label: 'Ari' },
  { key: 'eli', label: 'Eli' },
  { key: 'pinned', label: 'Pinned' },
  { key: 'active', label: 'Active' },
  { key: 'released', label: 'Released' },
]

function filterToQuery(filter: Filter): string {
  switch (filter) {
    case 'ari': return 'presence=ari'
    case 'eli': return 'presence=eli'
    case 'pinned': return 'status=pinned'
    case 'active': return 'status=active'
    case 'released': return 'status=released'
    case 'all':
    default: return ''
  }
}

// ─── Card ────────────────────────────────────────────────────────────────────

const ACTIONS: { to: NoticeboardStatus; label: string }[] = [
  { to: 'viewed', label: 'Mark viewed' },
  { to: 'pinned', label: 'Pin' },
  { to: 'released', label: 'Release' },
  { to: 'routed_to_library_review', label: 'Route to Library Review' },
  { to: 'routed_to_archive_review', label: 'Route to Archive Review' },
  { to: 'hidden', label: 'Hide' },
]

function NoticeboardCard({
  item,
  onAction,
  pending,
}: {
  item: NoticeboardItem
  onAction: (id: string, to: NoticeboardStatus) => void
  pending: boolean
}) {
  const isEli = item.presence_id === 'eli'
  const isAri = item.presence_id === 'ari'
  const accent = isEli
    ? 'border-l-eli-primary'
    : isAri
      ? 'border-l-ari-primary'
      : 'border-l-house-muted'
  const nameClass = isEli ? 'text-eli-primary' : isAri ? 'text-ari-primary' : 'text-text-secondary'

  const allowed = ALLOWED[item.status] ?? []

  return (
    <div className={`border border-house-border border-l-4 ${accent} bg-house-surface p-4 animate-fade-in`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <span className={`font-display text-sm ${nameClass}`}>
            {presenceName(item.presence_id)}
          </span>
          <span className="font-body text-xs text-text-muted"> · {sourceLabel(item)}</span>
        </div>
        <span className="font-mono text-[11px] text-text-muted shrink-0">
          {formatTime(item.created_at)}
        </span>
      </div>

      {/* Content */}
      <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap mb-3">
        {item.content}
      </p>

      {/* Authority label (subtle) + status */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-mono text-[10px] text-text-muted">
          Shared deposit · not Memory
        </span>
        <span className="font-mono text-[10px] text-text-secondary px-1.5 py-0.5 border border-house-border">
          {statusLabel(item.status)}
        </span>
      </div>

      {/* Actions — only transitions allowed from the current status */}
      {allowed.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {ACTIONS.filter(a => allowed.includes(a.to)).map(a => (
            <button
              key={a.to}
              onClick={() => onAction(item.id, a.to)}
              disabled={pending}
              className={`font-body text-[11px] tracking-wide px-2.5 py-1.5 border transition-colors duration-200 min-h-[36px] ${
                pending
                  ? 'text-text-muted border-house-border cursor-not-allowed'
                  : 'text-text-secondary border-house-muted hover:text-text-primary hover:bg-house-bg'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="font-body text-[11px] text-text-muted italic">
          No further actions — this deposit is {statusLabel(item.status).toLowerCase()}.
        </p>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function NoticeboardPage() {
  const [items, setItems] = useState<NoticeboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    // Note: setLoading(true) is intentionally NOT called synchronously here —
    // `loading` starts true for the first paint, and refetches on filter change
    // swap the list in place without a spinner flash.
    try {
      const q = filterToQuery(filter)
      const res = await fetch(`/api/noticeboard${q ? `?${q}` : ''}`)
      const data = await res.json()
      const list: NoticeboardItem[] = data.items ?? []
      // Pinned first, otherwise newest first (server already returns newest first).
      list.sort((a, b) => {
        const ap = a.status === 'pinned' ? 0 : 1
        const bp = b.status === 'pinned' ? 0 : 1
        if (ap !== bp) return ap - bp
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      setItems(list)
    } catch (err) {
      console.error('Failed to load noticeboard:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    // Async function defined inside the effect (matches the Pulse page pattern):
    // state updates happen after the await, not synchronously in the effect body.
    async function run() {
      await loadItems()
    }
    run()
  }, [loadItems])

  async function handleAction(id: string, to: NoticeboardStatus) {
    setPendingId(id)
    try {
      await fetch(`/api/noticeboard/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      await loadItems()
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-5 md:mb-6 border-b border-house-border pb-4 md:pb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-text-secondary text-2xl">◧</span>
          <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
            House Noticeboard
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Small deposits left by Ari and Eli — not messages, not Memory, not obligations.
        </p>
      </div>

      <div className="max-w-2xl">
        {/* Boundary text */}
        <div className="border border-house-border bg-house-surface p-4 mb-5">
          <p className="font-body text-xs text-text-muted leading-relaxed">
            Noticeboard items are shared House deposits. They are not Journal entries,
            not Telegram messages, not Archive Memory, not Library material, and not
            prompt authority. Tara may view, pin, release, hide, or route them for later
            review.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`font-body text-xs tracking-widest uppercase px-3 py-1.5 border transition-all duration-200 min-h-[36px] ${
                filter === f.key
                  ? 'text-text-secondary border-current'
                  : 'text-text-muted border-house-border hover:text-text-secondary'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
          </div>
        ) : items.length === 0 ? (
          <div className="border border-house-border bg-house-surface p-8 text-center">
            <span className="text-text-muted text-2xl block mb-3">◧</span>
            <p className="font-body text-sm text-text-muted">The Noticeboard is quiet.</p>
            <p className="font-body text-xs text-text-muted mt-1">
              No one has left a shared deposit yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <NoticeboardCard
                key={item.id}
                item={item}
                onAction={handleAction}
                pending={pendingId === item.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
