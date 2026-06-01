'use client'

// Phase 37H.2 — Graph-Assisted Candidate Suggestion Creation Form
//
// Graph assistance is evidence support, not Memory authority.
// A graph-supported suggestion is still only a suggestion.
// prompt_eligible is always false on suggestions.
//
// This form writes ONLY to graph_candidate_suggestions + events via API.
// It does not create Memory, Held Truth, or mutate any other table.

import { useState } from 'react'
import { CANDIDATE_TYPES, EVIDENCE_STRENGTHS, EVIDENCE_ROLES } from '@/lib/graph/candidateSuggestionTypes'
import type { CandidateType, EvidenceRole } from '@/lib/graph/candidateSuggestionTypes'

interface Props {
  onClose: () => void
  onCreated?: () => void
  prefillProposalIds?: string[]
  prefillLabel?: string
}

interface ArchiveSourceRow {
  archive_item_id: string
  archive_item_title: string
  canonical_status_display: string
  evidence_role: EvidenceRole
  used_for_weighting: boolean
}

export default function GraphSuggestionCreateForm({ onClose, onCreated, prefillProposalIds, prefillLabel }: Props) {
  const [candidateType, setCandidateType] = useState<CandidateType>('memory_candidate')
  const [proposedLabel, setProposedLabel] = useState(prefillLabel ?? '')
  const [proposedSummary, setProposedSummary] = useState('')
  const [reasonForCandidate, setReasonForCandidate] = useState('')
  const [evidenceStrength, setEvidenceStrength] = useState<string>('moderate')
  const [limitsOrUncertainties, setLimitsOrUncertainties] = useState('')

  // Memory candidate fields
  const [targetArchiveItemId, setTargetArchiveItemId] = useState('')
  const [archiveItemSearch, setArchiveItemSearch] = useState('')
  const [archiveSearchResults, setArchiveSearchResults] = useState<Array<{ id: string; title: string; canonical_status: string }>>([])
  const [archiveSearchLoading, setArchiveSearchLoading] = useState(false)
  const [selectedArchiveTitle, setSelectedArchiveTitle] = useState('')

  // Held Truth candidate fields
  const [targetPresenceId, setTargetPresenceId] = useState<'ari' | 'eli'>('ari')
  const [proposedTruthText, setProposedTruthText] = useState('')

  // Evidence arrays
  const [proposalIds] = useState<string[]>(prefillProposalIds ?? [])
  const [archiveSources, setArchiveSources] = useState<ArchiveSourceRow[]>([])
  const [evidenceSearch, setEvidenceSearch] = useState('')
  const [evidenceSearchResults, setEvidenceSearchResults] = useState<Array<{ id: string; title: string; canonical_status: string }>>([])
  const [evidenceSearchLoading, setEvidenceSearchLoading] = useState(false)

  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  // ── Archive search (for target item and evidence) ──────────────────────

  async function searchArchiveItems(query: string, setter: typeof setArchiveSearchResults, loadingSetter: typeof setArchiveSearchLoading) {
    if (query.trim().length < 2) { setter([]); return }
    loadingSetter(true)
    try {
      const res = await fetch(`/api/archives?search=${encodeURIComponent(query)}&limit=10`)
      const data = await res.json()
      setter((data.items ?? []).map((i: Record<string, unknown>) => ({
        id: i.id as string,
        title: i.title as string,
        canonical_status: i.canonical_status as string,
      })))
    } catch { setter([]) }
    finally { loadingSetter(false) }
  }

  function deriveEvidenceRole(canonicalStatus: string, requestedRole?: string): EvidenceRole {
    if (canonicalStatus === 'canonical') {
      if (requestedRole === 'archive_provenance') return 'archive_provenance'
      return 'confirmed_memory_evidence'
    }
    if (canonicalStatus === 'canonical_candidate') return 'candidate_context'
    return 'archive_provenance'
  }

  function addArchiveSource(item: { id: string; title: string; canonical_status: string }) {
    if (archiveSources.some(s => s.archive_item_id === item.id)) return
    setArchiveSources(prev => [...prev, {
      archive_item_id: item.id,
      archive_item_title: item.title,
      canonical_status_display: item.canonical_status,
      evidence_role: deriveEvidenceRole(item.canonical_status),
      used_for_weighting: item.canonical_status === 'canonical',
    }])
    setEvidenceSearch('')
    setEvidenceSearchResults([])
  }

  function removeArchiveSource(id: string) {
    setArchiveSources(prev => prev.filter(s => s.archive_item_id !== id))
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setResult(null)

    try {
      const payload: Record<string, unknown> = {
        candidate_type: candidateType,
        proposed_label: proposedLabel.trim(),
        proposed_summary: proposedSummary.trim() || null,
        reason_for_candidate: reasonForCandidate.trim(),
        evidence_strength: evidenceStrength,
        limits_or_uncertainties: limitsOrUncertainties.trim() || null,
        supporting_proposal_ids: proposalIds,
        supporting_graph_node_ids: [],
        supporting_graph_edge_ids: [],
        supporting_archive_sources: archiveSources.map(s => ({
          archive_item_id: s.archive_item_id,
          evidence_role: s.evidence_role,
          used_for_weighting: s.used_for_weighting,
        })),
      }

      if (candidateType === 'memory_candidate') {
        payload.target_archive_item_id = targetArchiveItemId || null
      } else {
        payload.target_presence_id = targetPresenceId
        payload.proposed_truth_text = proposedTruthText.trim()
      }

      const res = await fetch('/api/graph-candidate-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setResult({ ok: true, message: 'Suggestion created for review.' })
        onCreated?.()
      } else {
        const errMsg = data.errors?.join('; ') ?? data.error ?? 'Failed to create suggestion.'
        setResult({ ok: false, message: errMsg })
      }
    } catch {
      setResult({ ok: false, message: 'Request failed.' })
    } finally {
      setSubmitting(false)
    }
  }

  const isMemory = candidateType === 'memory_candidate'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary tracking-wide">
          New Graph-Assisted Suggestion
        </span>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary text-xs">✕</button>
      </div>

      <div className="text-[10px] text-text-muted/70 italic font-body leading-relaxed border border-amber-700/20 bg-amber-900/10 px-2.5 py-1.5 rounded">
        Graph-assisted suggestion only. Not Memory. Not Held Truth. Not prompt eligible.
        Memory Review / Held Truth governance still required.
      </div>

      {result ? (
        <div className={`px-3 py-2 rounded text-xs font-body ${result.ok ? 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/30' : 'bg-red-900/20 text-red-300 border border-red-700/30'}`}>
          {result.message}
        </div>
      ) : null}

      {(!result?.ok) && (
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Candidate type toggle */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Suggestion Type <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-1">
              {CANDIDATE_TYPES.map(ct => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setCandidateType(ct)}
                  className={`font-body text-[10px] px-2.5 py-1 border rounded transition-all ${
                    candidateType === ct
                      ? 'border-purple-600/60 bg-purple-900/20 text-purple-300'
                      : 'border-house-border text-text-muted hover:border-purple-600/30'
                  }`}
                >
                  {ct === 'memory_candidate' ? 'Memory Suggestion' : 'Held Truth Suggestion'}
                </button>
              ))}
            </div>
          </div>

          {/* Proposed label */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Label <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={proposedLabel}
              onChange={e => setProposedLabel(e.target.value)}
              maxLength={120}
              required
              placeholder="Short descriptive label"
              className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none"
            />
          </div>

          {/* Summary */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Summary</label>
            <textarea
              value={proposedSummary}
              onChange={e => setProposedSummary(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Optional summary of the suggestion"
              className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none resize-none"
            />
          </div>

          {/* ── Memory candidate fields ──────────────────────────────────── */}
          {isMemory && (
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                Target Archive Item <span className="text-red-400">*</span>
              </label>
              {selectedArchiveTitle ? (
                <div className="flex items-center gap-2 bg-house-bg border border-house-border rounded px-2.5 py-1.5">
                  <span className="text-xs text-text-secondary font-body flex-1 truncate">{selectedArchiveTitle}</span>
                  <button type="button" onClick={() => { setTargetArchiveItemId(''); setSelectedArchiveTitle('') }} className="text-text-muted hover:text-red-300 text-[10px]">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={archiveItemSearch}
                    onChange={e => { setArchiveItemSearch(e.target.value); searchArchiveItems(e.target.value, setArchiveSearchResults, setArchiveSearchLoading) }}
                    placeholder="Search archive items..."
                    className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none"
                  />
                  {archiveSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-house-surface border border-house-border rounded shadow-lg max-h-40 overflow-y-auto">
                      {archiveSearchResults.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setTargetArchiveItemId(item.id)
                            setSelectedArchiveTitle(item.title)
                            setArchiveItemSearch('')
                            setArchiveSearchResults([])
                          }}
                          className="w-full text-left px-2.5 py-1.5 text-xs font-body text-text-secondary hover:bg-purple-900/20 border-b border-house-border/30 last:border-0"
                        >
                          <span className="truncate block">{item.title}</span>
                          <span className="text-[10px] text-text-muted">{item.canonical_status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {archiveSearchLoading && <span className="absolute right-2 top-1.5 text-[10px] text-text-muted">...</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Held Truth candidate fields ──────────────────────────────── */}
          {!isMemory && (
            <>
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                  Target Presence <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-1">
                  {(['ari', 'eli'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTargetPresenceId(p)}
                      className={`font-body text-[10px] px-2.5 py-1 border rounded transition-all ${
                        targetPresenceId === p
                          ? p === 'ari' ? 'border-ari-secondary bg-ari-glow/10 text-ari-primary' : 'border-eli-secondary bg-eli-glow/10 text-eli-primary'
                          : 'border-house-border text-text-muted hover:border-house-border/70'
                      }`}
                    >
                      {p === 'ari' ? 'Ari' : 'Eli'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                  Proposed Truth Text <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={proposedTruthText}
                  onChange={e => setProposedTruthText(e.target.value)}
                  rows={2}
                  maxLength={300}
                  required={!isMemory}
                  placeholder="The truth statement to be considered"
                  className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none resize-none"
                />
              </div>
            </>
          )}

          {/* Reason */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reasonForCandidate}
              onChange={e => setReasonForCandidate(e.target.value)}
              rows={2}
              maxLength={500}
              required
              placeholder="Why should this be considered?"
              className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none resize-none"
            />
          </div>

          {/* Evidence strength */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Evidence Strength</label>
            <div className="flex gap-1">
              {EVIDENCE_STRENGTHS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEvidenceStrength(s)}
                  className={`font-body text-[10px] px-2.5 py-1 border rounded capitalize transition-all ${
                    evidenceStrength === s
                      ? 'border-purple-600/60 bg-purple-900/20 text-purple-300'
                      : 'border-house-border text-text-muted hover:border-purple-600/30'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Limits / uncertainties */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Limits / Uncertainties</label>
            <textarea
              value={limitsOrUncertainties}
              onChange={e => setLimitsOrUncertainties(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="What is missing, uncertain, or incomplete?"
              className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none resize-none"
            />
          </div>

          {/* Supporting archive sources */}
          <div>
            <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">Supporting Archive Sources</label>
            {archiveSources.length > 0 && (
              <div className="space-y-1 mb-2">
                {archiveSources.map(src => (
                  <div key={src.archive_item_id} className="flex items-center gap-2 bg-house-bg border border-house-border/50 rounded px-2 py-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-text-secondary truncate">{src.archive_item_title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-text-muted bg-house-surface px-1 rounded">{src.canonical_status_display}</span>
                        <span className="text-[9px] text-text-muted bg-house-surface px-1 rounded">{src.evidence_role.replace(/_/g, ' ')}</span>
                        <label className="flex items-center gap-1 text-[9px] text-text-muted">
                          <input
                            type="checkbox"
                            checked={src.used_for_weighting}
                            onChange={e => {
                              setArchiveSources(prev => prev.map(s =>
                                s.archive_item_id === src.archive_item_id
                                  ? { ...s, used_for_weighting: e.target.checked }
                                  : s
                              ))
                            }}
                            className="w-3 h-3"
                          />
                          weight
                        </label>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeArchiveSource(src.archive_item_id)} className="text-text-muted hover:text-red-300 text-[10px]">✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                type="text"
                value={evidenceSearch}
                onChange={e => { setEvidenceSearch(e.target.value); searchArchiveItems(e.target.value, setEvidenceSearchResults, setEvidenceSearchLoading) }}
                placeholder="Search to add archive evidence..."
                className="w-full bg-house-bg border border-house-border rounded px-2.5 py-1.5 text-xs text-text-secondary font-body placeholder:text-text-muted/40 focus:border-purple-600/50 focus:outline-none"
              />
              {evidenceSearchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-house-surface border border-house-border rounded shadow-lg max-h-40 overflow-y-auto">
                  {evidenceSearchResults.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addArchiveSource(item)}
                      className="w-full text-left px-2.5 py-1.5 text-xs font-body text-text-secondary hover:bg-purple-900/20 border-b border-house-border/30 last:border-0"
                    >
                      <span className="truncate block">{item.title}</span>
                      <span className="text-[10px] text-text-muted">{item.canonical_status}</span>
                    </button>
                  ))}
                </div>
              )}
              {evidenceSearchLoading && <span className="absolute right-2 top-1.5 text-[10px] text-text-muted">...</span>}
            </div>
          </div>

          {/* Prefilled proposal IDs (read-only) */}
          {proposalIds.length > 0 && (
            <div>
              <label className="font-body text-[10px] text-text-muted tracking-wide block mb-1">
                Supporting Proposals ({proposalIds.length})
              </label>
              <div className="text-[10px] text-text-muted/60 font-body">
                {proposalIds.length} approved graph proposal(s) linked from Relational Map context.
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="font-body text-[10px] px-3 py-1.5 border border-purple-600/50 text-purple-300 hover:bg-purple-900/20 rounded transition-all disabled:opacity-40"
            >
              {submitting ? 'Creating...' : 'Create Suggestion'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="font-body text-[10px] px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary rounded transition-all"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
