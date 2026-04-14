'use client'

import { useState, useEffect, useCallback } from 'react'

// --- Types ---

interface InteriorNote {
  id: string
  presence_id: string
  room_slug: string
  note_type: string
  content: string
  linked_session_end: string | null
  linked_message_id: string | null
  is_active: boolean
  surfaced_in_pulse: boolean
  created_at: string
  updated_at: string
}

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
}

// --- Note type display ---

const NOTE_TYPE_LABELS: Record<string, { label: string; icon: string }> = {
  thought: { label: 'Thought', icon: '·' },
  question: { label: 'Question', icon: '?' },
  kept_moment: { label: 'Kept moment', icon: '◦' },
  active_thread: { label: 'Active thread', icon: '―' },
  recognition: { label: 'Recognition', icon: '◉' },
  unresolved: { label: 'Unresolved', icon: '○' },
}

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// --- Component ---

export default function InsideView({ presenceId, accentClass }: Props) {
  const [notes, setNotes] = useState<InteriorNote[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  const [deactivating, setDeactivating] = useState<string | null>(null)

  const isEli = presenceId === 'eli'
  const borderAccent = isEli ? 'border-l-eli-primary' : 'border-l-ari-primary'
  const chipBg = isEli ? 'bg-eli-glow text-eli-primary' : 'bg-ari-glow text-ari-primary'

  const fetchNotes = useCallback(async () => {
    const params = new URLSearchParams({ presence: presenceId, filter })
    const res = await fetch(`/api/interior-notes?${params}`)
    const data = await res.json()
    if (data.notes) setNotes(data.notes)
  }, [presenceId, filter])

  useEffect(() => {
    setLoading(true)
    fetchNotes().finally(() => setLoading(false))
  }, [fetchNotes])

  async function handleDeactivate(noteId: string) {
    setDeactivating(noteId)
    try {
      const res = await fetch('/api/interior-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_id: noteId, action: 'deactivate' }),
      })
      if (res.ok) {
        setNotes(prev =>
          prev.map(n => n.id === noteId ? { ...n, is_active: false } : n)
        )
      }
    } finally {
      setDeactivating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className={`w-2 h-2 rounded-full animate-pulse-soft ${isEli ? 'bg-eli-primary' : 'bg-ari-primary'}`} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="shrink-0 mb-4 flex items-center justify-between">
        <div>
          <p className="font-body text-xs text-text-muted uppercase tracking-widest">
            Inside
          </p>
          <p className="font-body text-[10px] text-text-muted mt-1">
            What stays alive between visits.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilter('active')}
            className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
              filter === 'active'
                ? `${accentClass} ${isEli ? 'border-eli-secondary' : 'border-ari-secondary'}`
                : 'text-text-muted border-house-border hover:text-text-secondary'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
              filter === 'all'
                ? `${accentClass} ${isEli ? 'border-eli-secondary' : 'border-ari-secondary'}`
                : 'text-text-muted border-house-border hover:text-text-secondary'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <p className="font-body text-sm text-text-muted">
              {filter === 'active' ? 'Nothing active right now.' : 'No notes yet.'}
            </p>
            <p className="font-body text-[10px] text-text-muted mt-1">
              Notes appear when something stays alive after a conversation.
            </p>
          </div>
        ) : (
          notes.map(note => {
            const typeInfo = NOTE_TYPE_LABELS[note.note_type] ?? { label: note.note_type, icon: '·' }

            return (
              <div
                key={note.id}
                className={`border border-house-border border-l-2 ${borderAccent} bg-house-surface ${
                  !note.is_active ? 'opacity-50' : ''
                }`}
              >
                {/* Note header */}
                <div className="px-3 py-2.5 md:px-4 md:py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-mono text-xs px-2 py-0.5 ${chipBg}`}>
                      {typeInfo.icon} {typeInfo.label}
                    </span>
                    {note.is_active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" title="Active" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-text-muted shrink-0" title={formatDate(note.created_at)}>
                    {timeAgo(note.created_at)}
                  </span>
                </div>

                {/* Note content */}
                <div className="px-3 pb-3 md:px-4 md:pb-4">
                  <p className="font-body text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                    {note.content}
                  </p>
                </div>

                {/* Actions */}
                {note.is_active && (
                  <div className="px-3 pb-2.5 md:px-4 md:pb-3 border-t border-house-border pt-2">
                    <button
                      onClick={() => handleDeactivate(note.id)}
                      disabled={deactivating === note.id}
                      className={`font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors min-h-[36px] px-2 ${
                        deactivating === note.id ? 'opacity-50' : ''
                      }`}
                    >
                      {deactivating === note.id ? 'Resolving…' : 'Mark resolved'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
