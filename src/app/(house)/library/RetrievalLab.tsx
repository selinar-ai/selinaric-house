'use client'

// Phase 33F — Library Retrieval Lab
//
// Deterministic retrieval preview. No chat injection. No Memory.
// Preview only. Not sent to Ari/Eli chat.
// Retrieval is not Memory. RAG preview is not chat injection.

import { useState, useCallback } from 'react'
import {
  COLLECTIONS, AUTHORITY_LABELS, AUTHORITY_COLORS, PRESENCE_LABELS,
  EXTRACTION_METHOD_LABELS,
} from '@/lib/library/constants'
import type { AuthorityStatus, PresenceScope } from '@/lib/library/authority'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MatchedFile {
  file_id: string
  file_name: string
  file_type: string
  extraction_method: string | null
  extraction_status: string | null
  ocr_quality: string | null
  needs_review: boolean | null
  matched_field: 'extracted_text' | 'cleaned_extracted_text' | 'file_name'
  snippet: string
}

interface Snippet {
  field: string
  text: string
}

interface RetrievalResult {
  item: {
    id: string
    title: string
    description: string | null
    collection: string
    item_type: string
    phase_code: string | null
    phase_label: string | null
    presence_scope: string
    authority_status: string
    tags: string[]
    [key: string]: unknown
  }
  effective_authority_status: string
  raw_authority_status: string
  authority_warning?: string
  score: number
  rank: number
  matched_fields: string[]
  matched_files: MatchedFile[]
  snippets: Snippet[]
  retrieval_reason: string
}

interface RetrievalResponse {
  query: string
  result_count: number
  results: RetrievalResult[]
  preview_block: string
  warnings: string[]
  duration_ms: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  content_text: 'Content',
  phase_code: 'Phase code',
  phase_label: 'Phase label',
  tags: 'Tags',
  collection: 'Collection',
  item_type: 'Item type',
  presence_scope: 'Presence scope',
  extracted_text: 'Extracted text',
  cleaned_extracted_text: 'Cleaned OCR',
  file_name: 'File name',
}

const FILE_TYPE_ICONS: Record<string, string> = {
  docx: '📄', pdf: '📕', image: '🖼', markdown: '📝',
  audio: '🎵', video: '🎬', other: '📎',
}

const OCR_QUALITY_COLORS: Record<string, string> = {
  clean: 'text-green-400/80',
  partial: 'text-amber-400/80',
  noisy: 'text-red-400/80',
  failed: 'text-red-400',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function RetrievalLab() {
  const [query, setQuery] = useState('')
  const [running, setRunning] = useState(false)
  const [response, setResponse] = useState<RetrievalResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<RetrievalResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Filters
  const [filterCollection, setFilterCollection] = useState('')
  const [filterAuthority, setFilterAuthority] = useState('')
  const [filterPresence, setFilterPresence] = useState('')
  const [filterPhaseCode, setFilterPhaseCode] = useState('')
  const [includeAttachments, setIncludeAttachments] = useState(true)

  const runRetrieval = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) return

    setRunning(true)
    setError(null)
    setSelectedResult(null)
    setCopied(false)

    try {
      const filters: Record<string, string> = {}
      if (filterCollection) filters.collection = filterCollection
      if (filterAuthority) filters.authority_status = filterAuthority
      if (filterPresence) filters.presence_scope = filterPresence
      if (filterPhaseCode.trim()) filters.phase_code = filterPhaseCode.trim()

      const res = await fetch('/api/library-retrieval-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query.trim(),
          filters,
          include_attachments: includeAttachments,
          limit: 20,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResponse(data as RetrievalResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retrieval failed')
    } finally {
      setRunning(false)
    }
  }, [query, filterCollection, filterAuthority, filterPresence, filterPhaseCode, includeAttachments])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      runRetrieval()
    }
  }

  async function copyPreviewBlock() {
    if (!response?.preview_block) return
    try {
      await navigator.clipboard.writeText(response.preview_block)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">

      {/* Query + filters bar */}
      <div className="shrink-0 border-b border-house-border/60 bg-house-bg px-4 py-3 space-y-2">
        {/* Retrieval Lab notice */}
        <p className="font-body text-[10px] text-text-muted italic">
          This does not send anything to Ari or Eli. This does not create Memory.
        </p>

        {/* Query input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter retrieval query..."
            className="flex-1 font-body text-sm bg-house-surface border border-house-border text-text-primary px-3 py-2 outline-none focus:border-house-muted placeholder:text-text-muted"
          />
          <button
            onClick={runRetrieval}
            disabled={running || !query.trim() || query.trim().length < 2}
            className="font-body text-xs px-4 py-2 border border-house-muted text-text-secondary hover:bg-house-surface transition-all disabled:opacity-40"
          >
            {running ? 'Retrieving...' : 'Run retrieval'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={filterCollection}
            onChange={e => setFilterCollection(e.target.value)}
            className="font-body text-[10px] bg-house-surface border border-house-border text-text-secondary px-1.5 py-1 outline-none"
          >
            <option value="">All collections</option>
            {COLLECTIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select
            value={filterAuthority}
            onChange={e => setFilterAuthority(e.target.value)}
            className="font-body text-[10px] bg-house-surface border border-house-border text-text-secondary px-1.5 py-1 outline-none"
          >
            <option value="">All authority</option>
            {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterPresence}
            onChange={e => setFilterPresence(e.target.value)}
            className="font-body text-[10px] bg-house-surface border border-house-border text-text-secondary px-1.5 py-1 outline-none"
          >
            <option value="">All scopes</option>
            {Object.entries(PRESENCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="text"
            value={filterPhaseCode}
            onChange={e => setFilterPhaseCode(e.target.value)}
            placeholder="Phase code"
            className="font-body text-[10px] bg-house-surface border border-house-border text-text-secondary px-1.5 py-1 outline-none w-20 placeholder:text-text-muted"
          />
          <label className="flex items-center gap-1 font-body text-[10px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={includeAttachments}
              onChange={e => setIncludeAttachments(e.target.checked)}
              className="w-3 h-3"
            />
            Include attachments
          </label>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">

        {/* Results list */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

          {/* Error */}
          {error && (
            <div className="px-4 py-3">
              <p className="font-body text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!response && !error && !running && (
            <div className="flex items-center justify-center flex-1">
              <div className="text-center px-8">
                <p className="font-body text-sm text-text-muted">
                  Run a query to preview what the Library would retrieve.
                </p>
                <p className="font-body text-[10px] text-text-muted mt-2 italic">
                  Preview only. Not sent to Ari/Eli chat.
                </p>
              </div>
            </div>
          )}

          {/* Loading */}
          {running && (
            <div className="flex items-center justify-center py-12">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          {/* Results */}
          {response && !running && (
            <>
              {/* Meta bar */}
              <div className="shrink-0 px-4 py-2 border-b border-house-border/40 flex items-center justify-between">
                <span className="font-body text-xs text-text-muted">
                  {response.result_count} result{response.result_count === 1 ? '' : 's'} · {response.duration_ms}ms
                </span>
                <button
                  onClick={copyPreviewBlock}
                  className="font-body text-[10px] px-2 py-0.5 border border-house-border text-text-muted hover:text-text-secondary transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy preview block'}
                </button>
              </div>

              {/* Warnings */}
              {response.warnings.length > 0 && (
                <div className="px-4 py-2 border-b border-amber-400/20 bg-amber-400/5">
                  {response.warnings.map((w, i) => (
                    <p key={i} className="font-body text-[10px] text-amber-400/80">{w}</p>
                  ))}
                </div>
              )}

              {/* No results */}
              {response.result_count === 0 && (
                <div className="flex items-center justify-center flex-1 py-12">
                  <p className="font-body text-sm text-text-muted">No Library matches found.</p>
                </div>
              )}

              {/* Result rows */}
              {response.results.map(result => (
                <ResultRow
                  key={result.item.id}
                  result={result}
                  isSelected={selectedResult?.item.id === result.item.id}
                  onClick={() => setSelectedResult(result)}
                />
              ))}
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedResult && (
          <div className="w-full md:w-[420px] md:max-w-[50%] shrink-0 border-l border-house-border bg-house-surface flex flex-col overflow-y-auto">
            <ResultDetail
              result={selectedResult}
              previewBlock={response?.preview_block ?? ''}
              onClose={() => setSelectedResult(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Result Row ─────────────────────────────────────────────────────────────

function ResultRow({
  result,
  isSelected,
  onClick,
}: {
  result: RetrievalResult
  isSelected: boolean
  onClick: () => void
}) {
  const { item, effective_authority_status, authority_warning, score, rank, matched_fields, matched_files, snippets } = result
  const authorityColor = AUTHORITY_COLORS[effective_authority_status as AuthorityStatus] ?? 'text-text-muted'
  const authorityLabel = AUTHORITY_LABELS[effective_authority_status as AuthorityStatus] ?? effective_authority_status

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3 border-b border-house-border/30 transition-colors
        ${isSelected ? 'bg-house-bg' : 'hover:bg-house-bg/40'}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Rank + title */}
          <div className="flex items-center gap-2">
            <span className="font-body text-[10px] text-text-muted shrink-0">#{rank}</span>
            <h3 className="font-body text-sm text-text-primary truncate">{item.title}</h3>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
            <span className={`font-body text-[10px] ${authorityColor}`}>
              {authorityLabel}
            </span>
            <span className="font-body text-[10px] text-text-muted">
              {PRESENCE_LABELS[item.presence_scope as PresenceScope] ?? item.presence_scope}
            </span>
            <span className="font-body text-[10px] text-text-muted">
              {COLLECTIONS.find(c => c.id === item.collection)?.label ?? item.collection}
            </span>
            {item.phase_code && (
              <span className="font-body text-[10px] text-text-muted">{item.phase_code}</span>
            )}
          </div>

          {/* Matched fields */}
          <div className="flex flex-wrap gap-1 mt-1">
            {matched_fields.map(f => (
              <span key={f} className="font-body text-[10px] text-blue-400/60 bg-blue-400/5 px-1 py-0.5">
                {FIELD_LABELS[f] ?? f}
              </span>
            ))}
          </div>

          {/* Matched files cue */}
          {matched_files.length > 0 && (
            <div className="mt-1">
              {matched_files.map(mf => (
                <span key={mf.file_id + mf.matched_field} className="font-body text-[10px] text-amber-400/70 mr-2">
                  {FILE_TYPE_ICONS[mf.file_type] ?? '📎'} {mf.file_name}
                  {mf.ocr_quality === 'noisy' && ' (noisy OCR)'}
                  {mf.needs_review && mf.ocr_quality !== 'noisy' && ' (needs review)'}
                </span>
              ))}
            </div>
          )}

          {/* First snippet */}
          {snippets.length > 0 && (
            <p className="font-body text-[10px] text-text-muted mt-1 line-clamp-2 italic">
              {snippets[0].text.substring(0, 200)}
            </p>
          )}

          {/* Authority warning */}
          {authority_warning && (
            <p className="font-body text-[10px] text-red-400/70 mt-1 italic">
              Authority downgraded
            </p>
          )}
        </div>

        {/* Score */}
        <div className="shrink-0 text-right">
          <span className="font-body text-sm text-text-secondary font-medium">{score}</span>
          <span className="font-body text-[10px] text-text-muted block">score</span>
        </div>
      </div>
    </button>
  )
}

// ─── Result Detail ──────────────────────────────────────────────────────────

function ResultDetail({
  result,
  previewBlock,
  onClose,
}: {
  result: RetrievalResult
  previewBlock: string
  onClose: () => void
}) {
  const [showPreview, setShowPreview] = useState(false)
  const [detailCopied, setDetailCopied] = useState(false)
  const { item, effective_authority_status, raw_authority_status, authority_warning, score, rank, matched_fields, matched_files, snippets, retrieval_reason } = result

  const authorityColor = AUTHORITY_COLORS[effective_authority_status as AuthorityStatus] ?? 'text-text-muted'
  const authorityLabel = AUTHORITY_LABELS[effective_authority_status as AuthorityStatus] ?? effective_authority_status
  const isDowngraded = effective_authority_status !== raw_authority_status

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(previewBlock)
      setDetailCopied(true)
      setTimeout(() => setDetailCopied(false), 2000)
    } catch { /* silent */ }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-house-border flex items-center justify-between">
        <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
          Result #{rank}
        </span>
        <button
          onClick={onClose}
          className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <h3 className="font-body text-base text-text-primary font-medium">{item.title}</h3>

        {item.description && (
          <p className="font-body text-xs text-text-secondary">{item.description as string}</p>
        )}

        {/* Score + reason */}
        <div className="bg-house-bg border border-house-border/40 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-body text-[10px] text-text-muted">Score</span>
            <span className="font-body text-sm text-text-secondary font-medium">{score}</span>
          </div>
          <p className="font-body text-[10px] text-text-muted">{retrieval_reason}</p>
        </div>

        {/* Authority */}
        <div className="space-y-1">
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block mb-0.5">
              Effective authority
            </span>
            <span className={`font-body text-xs ${authorityColor}`}>
              {authorityLabel}
            </span>
          </div>
          {isDowngraded && (
            <div className="px-3 py-2 border border-red-400/20 bg-red-400/5 space-y-0.5">
              <p className="font-body text-[10px] text-red-400">
                Raw authority: {AUTHORITY_LABELS[raw_authority_status as AuthorityStatus] ?? raw_authority_status}
              </p>
              <p className="font-body text-[10px] text-red-400/70">
                {authority_warning}
              </p>
            </div>
          )}
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <DetailField label="Collection">
            {COLLECTIONS.find(c => c.id === item.collection)?.label ?? item.collection}
          </DetailField>
          <DetailField label="Presence scope">
            {PRESENCE_LABELS[item.presence_scope as PresenceScope] ?? item.presence_scope}
          </DetailField>
          {item.phase_code && (
            <DetailField label="Phase">{item.phase_code}{item.phase_label ? ` — ${item.phase_label}` : ''}</DetailField>
          )}
          <DetailField label="Item type">{item.item_type}</DetailField>
        </div>

        {/* Matched fields */}
        <div>
          <span className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
            Matched fields
          </span>
          <div className="flex flex-wrap gap-1">
            {matched_fields.map(f => (
              <span key={f} className="font-body text-[10px] text-blue-400/70 bg-blue-400/5 px-1.5 py-0.5">
                {FIELD_LABELS[f] ?? f}
              </span>
            ))}
          </div>
        </div>

        {/* Snippets */}
        {snippets.length > 0 && (
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Snippets
            </span>
            <div className="space-y-2">
              {snippets.map((s, i) => (
                <div key={i} className="bg-house-bg border border-house-border/30 p-2.5">
                  <span className="font-body text-[10px] text-text-muted block mb-1">
                    {FIELD_LABELS[s.field] ?? s.field}
                  </span>
                  <p className="font-body text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed">
                    {s.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Matched files */}
        {matched_files.length > 0 && (
          <div>
            <span className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Matched attachments
            </span>
            <div className="space-y-2">
              {matched_files.map(mf => (
                <div key={mf.file_id + mf.matched_field} className="bg-house-bg border border-house-border/30 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-sm">{FILE_TYPE_ICONS[mf.file_type] ?? '📎'}</span>
                    <span className="font-body text-xs text-text-secondary">{mf.file_name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-1.5">
                    <span className="font-body text-[10px] text-text-muted">
                      {FIELD_LABELS[mf.matched_field] ?? mf.matched_field}
                    </span>
                    {mf.extraction_method && (
                      <span className="font-body text-[10px] text-text-muted">
                        via {EXTRACTION_METHOD_LABELS[mf.extraction_method] ?? mf.extraction_method}
                      </span>
                    )}
                    {mf.ocr_quality && (
                      <span className={`font-body text-[10px] ${OCR_QUALITY_COLORS[mf.ocr_quality] ?? 'text-text-muted'}`}>
                        OCR: {mf.ocr_quality}
                      </span>
                    )}
                    {mf.needs_review && (
                      <span className="font-body text-[10px] text-amber-400 italic">Needs review</span>
                    )}
                  </div>
                  {mf.ocr_quality === 'noisy' && (
                    <p className="font-body text-[10px] text-red-400/70 italic mb-1">
                      OCR may be incomplete or unreliable for this image.
                    </p>
                  )}
                  <p className="font-body text-[11px] text-text-secondary whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {mf.snippet}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Item ID */}
        <DetailField label="Library item ID">
          <span className="font-mono text-[10px]">{item.id}</span>
        </DetailField>

        {/* Copyable preview block */}
        <div className="pt-3 border-t border-house-border/40">
          <div className="flex items-center justify-between mb-2">
            <span className="font-body text-[10px] text-text-muted tracking-widest uppercase">
              Context preview
            </span>
            <button
              onClick={copyPreview}
              className="font-body text-[10px] px-2 py-0.5 border border-house-border text-text-muted hover:text-text-secondary transition-colors"
            >
              {detailCopied ? 'Copied!' : 'Copy full preview'}
            </button>
          </div>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="font-body text-[10px] text-text-muted hover:text-text-secondary transition-colors mb-1"
          >
            {showPreview ? '▾ Hide preview block' : '▸ Show preview block'}
          </button>
          {showPreview && (
            <div className="font-mono text-[10px] text-text-muted bg-house-bg p-3 whitespace-pre-wrap max-h-60 overflow-y-auto border border-house-border/30 leading-relaxed">
              {previewBlock}
            </div>
          )}
          <p className="font-body text-[10px] text-text-muted italic mt-2">
            Preview only. Not sent to Ari/Eli chat.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Field ───────────────────────────────────────────────────────────

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-body text-[10px] text-text-muted tracking-wide block mb-0.5">
        {label}
      </span>
      <span className="font-body text-xs text-text-secondary">
        {children}
      </span>
    </div>
  )
}
