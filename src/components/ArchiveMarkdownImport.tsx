'use client'

// Phase 27C — Multi-file Markdown/text import panel for Archive Conversations.
// Accepts .md and .txt files, detects title/date/message-count from content,
// previews each file before submit, then POSTs to /api/archive-sources/import.
// Inline collapsible — mounts below "Paste conversation" in the Conversations tab.

import { useRef, useState } from 'react'
import { parseMarkdownFile, ACCEPTED_EXTENSIONS, MAX_CONTENT_CHARS, type ParsedFile } from '@/lib/markdown-import'
import type { ArchiveTab } from '@/lib/archives'

interface TabConfig {
  id: ArchiveTab
  accent: string
  border: string
}

interface Props {
  activeTab: ArchiveTab
  tabConfig: TabConfig
  onImported: () => void
}

interface FilePreview extends ParsedFile {
  tooLarge: boolean
}

export default function ArchiveMarkdownImport({ activeTab, tabConfig, onImported }: Props) {
  const [open, setOpen]               = useState(false)
  const [previews, setPreviews]       = useState<FilePreview[]>([])
  const [importLabel, setImportLabel] = useState('')
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [result, setResult]           = useState<{
    imported: { filename: string; id: string; title: string }[]
    skipped:  { filename: string; reason: string }[]
  } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleClose() {
    setOpen(false)
    setPreviews([])
    setImportLabel('')
    setNotes('')
    setResult(null)
    setSubmitError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const parsed: FilePreview[] = await Promise.all(
      files.map(async file => {
        const text = await file.text().catch(() => '')
        const p = parseMarkdownFile(file.name, text)
        return { ...p, tooLarge: p.char_count > MAX_CONTENT_CHARS }
      })
    )
    setPreviews(parsed)
    setResult(null)
    setSubmitError(null)
  }

  const validCount   = previews.filter(p => !p.tooLarge).length
  const invalidCount = previews.length - validCount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validCount) return
    setSubmitting(true)
    setSubmitError(null)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('archiveName', activeTab)
      if (importLabel.trim()) fd.append('importLabel', importLabel.trim())
      if (notes.trim())       fd.append('notes', notes.trim())

      // Re-read files from input so we send the actual File objects
      const inputFiles = Array.from(fileInputRef.current?.files ?? [])
      for (const file of inputFiles) {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
        if (ACCEPTED_EXTENSIONS.includes(ext)) fd.append('files', file)
      }

      const res  = await fetch('/api/archive-sources/import', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        setSubmitError(data.error ?? `HTTP ${res.status}`)
        return
      }

      setResult(data)
      if (data.imported.length > 0) onImported()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-b border-house-border">
      {/* Toggle */}
      <button
        onClick={() => { if (open) { handleClose() } else { setOpen(true) } }}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-house-bg/40 transition-colors text-left"
      >
        <span className="font-mono text-[10px] text-text-muted">{open ? '▾' : '▸'}</span>
        <span className={`font-body text-xs tracking-widest uppercase ${open ? tabConfig.accent : 'text-text-muted'}`}>
          Import files
        </span>
        <span className="font-body text-[10px] text-text-muted ml-1">.md · .txt · multi-file</span>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-5 space-y-4">

          {/* File picker */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1.5">
              Select files <span className="text-red-400">*</span>
              <span className="ml-1 normal-case">(max 500 k chars each)</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md,.txt"
              onChange={handleFilesChosen}
              className="block w-full font-body text-xs text-text-muted file:mr-3 file:py-1 file:px-3 file:border file:border-house-border file:bg-house-surface file:text-text-secondary file:font-body file:text-xs file:cursor-pointer hover:file:border-house-muted"
            />
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Import label</label>
              <input
                type="text"
                value={importLabel}
                onChange={e => setImportLabel(e.target.value)}
                placeholder="e.g. April 2026 batch"
                className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
              />
            </div>
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional context…"
                className="w-full font-body text-xs bg-house-surface border border-house-border text-text-primary px-2 py-1.5 outline-none focus:border-house-muted placeholder:text-text-muted"
              />
            </div>
          </div>

          {/* File preview list */}
          {previews.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-body text-[10px] text-text-muted tracking-widest uppercase">
                Preview — {previews.length} file{previews.length !== 1 ? 's' : ''}
                {invalidCount > 0 && (
                  <span className="ml-2 text-red-400 normal-case">{invalidCount} too large</span>
                )}
              </p>
              <div className="space-y-1 max-h-56 overflow-y-auto border border-house-border/40 divide-y divide-house-border/30">
                {previews.map((p, i) => (
                  <div key={i} className={`px-3 py-2 ${p.tooLarge ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-body text-xs text-text-primary font-medium leading-snug flex-1 min-w-0 truncate">
                        {p.title}
                      </span>
                      {p.tooLarge && (
                        <span className="font-body text-[10px] text-red-400 shrink-0">too large</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      <span className="font-mono text-[10px] text-text-muted">{p.filename}</span>
                      {p.source_date && (
                        <span className="font-body text-[10px] text-text-muted">{p.source_date}</span>
                      )}
                      {p.message_count > 0 && (
                        <span className="font-body text-[10px] text-text-muted">~{p.message_count} msgs</span>
                      )}
                      <span className="font-body text-[10px] text-text-muted">{p.char_count.toLocaleString()} chars</span>
                    </div>
                    {p.excerpt && (
                      <p className="font-body text-[10px] text-text-muted italic mt-1 line-clamp-2 leading-snug">
                        {p.excerpt}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Import result */}
          {result && (
            <div className="space-y-2">
              {result.imported.length > 0 && (
                <div className="space-y-1">
                  <p className="font-body text-[10px] text-green-400 tracking-widest uppercase">
                    Imported {result.imported.length} file{result.imported.length !== 1 ? 's' : ''}
                  </p>
                  {result.imported.map((r, i) => (
                    <p key={i} className="font-body text-[10px] text-text-muted">
                      <span className="text-green-400">✓</span> {r.title}
                      <span className="font-mono ml-1 opacity-50">{r.filename}</span>
                    </p>
                  ))}
                </div>
              )}
              {result.skipped.length > 0 && (
                <div className="space-y-1">
                  <p className="font-body text-[10px] text-text-muted tracking-widest uppercase">
                    Skipped {result.skipped.length}
                  </p>
                  {result.skipped.map((s, i) => (
                    <p key={i} className="font-body text-[10px] text-text-muted">
                      <span className="text-amber-400">—</span> {s.filename}: {s.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <p className="font-body text-xs text-red-400">{submitError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            {!result ? (
              <>
                <button
                  type="submit"
                  disabled={submitting || validCount === 0}
                  className={`font-body text-xs px-4 py-1.5 border transition-all disabled:opacity-40 ${tabConfig.accent} ${tabConfig.border} hover:bg-house-bg`}
                >
                  {submitting
                    ? 'Importing…'
                    : `Import ${validCount > 0 ? validCount : ''} file${validCount !== 1 ? 's' : ''}`}
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
