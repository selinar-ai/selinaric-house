'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Note {
  id: string
  content: string
  type: 'note' | 'task' | 'reminder'
  status: 'active' | 'completed' | 'archived'
  created_at: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [type, setType] = useState<Note['type']>('note')

  useEffect(() => {
    loadNotes()
  }, [])

  async function loadNotes() {
    const { data } = await supabase
      .from('house_notes')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (data) setNotes(data)
    setLoading(false)
  }

  async function addNote() {
    if (!input.trim()) return

    const { data } = await supabase
      .from('house_notes')
      .insert({ content: input.trim(), type })
      .select()
      .single()

    if (data) {
      setNotes(prev => [data, ...prev])
      setInput('')
    }
  }

  async function completeNote(id: string) {
    await supabase
      .from('house_notes')
      .update({ status: 'completed' })
      .eq('id', id)

    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function deleteNote(id: string) {
    await supabase.from('house_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const typeColors: Record<Note['type'], string> = {
    note: 'text-text-secondary',
    task: 'text-eli-primary',
    reminder: 'text-ari-primary'
  }

  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 animate-fade-in">
      <div className="mb-6 md:mb-8 border-b border-house-border pb-4 md:pb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-text-secondary text-2xl">◧</span>
          <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary">
            Notes
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Shared space. Open loops.
        </p>
      </div>

      <div className="max-w-2xl">
        <div className="border border-house-border bg-house-surface p-4 mb-6">
          <div className="flex gap-2 mb-3">
            {(['note', 'task', 'reminder'] as Note['type'][]).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`font-body text-xs tracking-widest uppercase px-3 py-1.5 border transition-all duration-200 ${
                  type === t
                    ? `${typeColors[t]} border-current`
                    : 'text-text-muted border-house-border'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNote()}
              placeholder="Add a note..."
              className="
                flex-1 bg-house-bg border border-house-border
                px-4 py-3 font-body text-sm text-text-primary
                placeholder:text-text-muted outline-none
                focus:border-text-muted transition-colors duration-200
              "
            />
            <button
              onClick={addNote}
              disabled={!input.trim()}
              className={`
                px-4 py-3 font-body text-xs tracking-widest uppercase border
                transition-all duration-200
                ${input.trim()
                  ? 'text-text-secondary border-house-muted hover:text-text-primary'
                  : 'text-text-muted border-house-border cursor-not-allowed'
                }
              `}
            >
              Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
          </div>
        ) : notes.length === 0 ? (
          <div className="border border-house-border bg-house-surface p-8 text-center">
            <span className="text-text-muted text-2xl block mb-3">◧</span>
            <p className="font-body text-sm text-text-muted">No open loops.</p>
            <p className="font-body text-xs text-text-muted mt-1">
              Add a note, task, or reminder above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map(note => (
              <div
                key={note.id}
                className="border border-house-border bg-house-surface p-4 flex items-start gap-3 group animate-fade-in"
              >
                <span className={`text-xs mt-0.5 ${typeColors[note.type]}`}>
                  {note.type === 'task' ? '◉' : note.type === 'reminder' ? '◈' : '◌'}
                </span>
                <p className="flex-1 font-body text-sm text-text-primary leading-relaxed">
                  {note.content}
                </p>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  {note.type === 'task' && (
                    <button
                      onClick={() => completeNote(note.id)}
                      className="font-body text-xs text-eli-primary hover:text-text-primary transition-colors"
                    >
                      Done
                    </button>
                  )}
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
