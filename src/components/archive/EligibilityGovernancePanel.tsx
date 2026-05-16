'use client'

// Phase 30B — Eligibility Governance Panel
// Dry-run audit + explicit apply for recall eligibility backfill.
// canonical_status remains the only Memory authority.
// eligible_for_recall is a routing flag only.

import { useState } from 'react'
import type { EligibilityAuditResult, EligibilityApplyResult } from '@/lib/archive-memory'

type BreakdownKey = 'by_archive' | 'by_owner' | 'by_visibility' | 'by_sensitivity' | 'by_category'

const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  by_archive:    'Archive',
  by_owner:      'Owner',
  by_visibility: 'Visibility',
  by_sensitivity:'Sensitivity',
  by_category:   'Category',
}

export default function EligibilityGovernancePanel() {
  const [audit, setAudit] = useState<EligibilityAuditResult | null>(null)
  const [applyResult, setApplyResult] = useState<EligibilityApplyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  async function runAudit() {
    setLoading(true)
    setError(null)
    setApplyResult(null)
    try {
      const res = await fetch('/api/archive-memory/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'audit' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Audit failed')
      setAudit(data)
      setExpanded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed')
    } finally {
      setLoading(false)
    }
  }

  async function runApply() {
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/archive-memory/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Apply failed')
      setApplyResult(data)
      setAudit(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="px-4 py-3 border-b border-house-border/40">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-body text-xs text-text-muted">
            Recall Eligibility Governance
          </p>
          <p className="font-body text-[10px] text-text-muted/60 mt-0.5">
            Confirmed Memory should be recall-eligible by default. Audit and reconcile routing flags.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="font-body text-xs px-3 py-1 border border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted transition-all disabled:opacity-40"
        >
          {loading ? 'Auditing…' : 'Run Audit'}
        </button>
      </div>

      {error && (
        <p className="font-body text-xs text-red-400 mt-2">{error}</p>
      )}

      {audit && expanded && audit.canonical_recall_ineligible > 0 && (
        <div className="mt-3 space-y-3">
          {/* Summary counts */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="font-body text-base font-medium text-green-400 leading-none">{audit.total_canonical}</p>
              <p className="font-body text-[10px] text-text-muted mt-0.5">Total canonical</p>
            </div>
            <div>
              <p className="font-body text-base font-medium text-amber-400 leading-none">{audit.canonical_recall_ineligible}</p>
              <p className="font-body text-[10px] text-text-muted mt-0.5">Recall-ineligible</p>
            </div>
            <div>
              <p className="font-body text-base font-medium text-text-secondary leading-none">{audit.canonical_recall_eligible}</p>
              <p className="font-body text-[10px] text-text-muted mt-0.5">Already eligible</p>
            </div>
          </div>

          {/* Breakdowns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(Object.keys(BREAKDOWN_LABELS) as BreakdownKey[]).map(key => {
              const data = audit[key]
              if (!data || Object.keys(data).length === 0) return null
              return (
                <div key={key}>
                  <p className="font-body text-[10px] text-text-muted/60 mb-1">{BREAKDOWN_LABELS[key]}</p>
                  {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
                    <p key={label} className="font-body text-[10px] text-text-muted">
                      <span className="text-text-secondary">{count}</span> {label}
                    </p>
                  ))}
                </div>
              )
            })}
          </div>

          {/* Sample entries */}
          {audit.sample_entries.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted/60 mb-1">Sample affected entries</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {audit.sample_entries.map(e => (
                  <p key={e.id} className="font-body text-[10px] text-text-muted truncate">
                    <span className="text-text-secondary">{e.archive_name}</span> · {e.title}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Apply button */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={runApply}
              disabled={applying}
              className="font-body text-xs px-3 py-1 border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40"
            >
              {applying ? 'Applying…' : `Apply: set ${audit.canonical_recall_ineligible} entries recall-eligible`}
            </button>
            <p className="font-body text-[10px] text-text-muted/60">
              Sets eligible_for_recall only. Does not change canonical_status, embedding, or graph flags.
            </p>
          </div>
        </div>
      )}

      {audit && expanded && audit.canonical_recall_ineligible === 0 && (
        <p className="font-body text-xs text-green-400/80 mt-2">
          All {audit.total_canonical} canonical entries are already recall-eligible. Nothing to reconcile.
        </p>
      )}

      {applyResult && (
        <div className="mt-3 space-y-1">
          <p className="font-body text-xs text-green-400">
            Backfill complete: {applyResult.updated} entries set recall-eligible.
          </p>
          <p className="font-body text-[10px] text-text-muted">
            {applyResult.already_eligible} were already eligible · {applyResult.total_canonical} total canonical
          </p>
          {applyResult.sample_titles.length > 0 && (
            <div className="mt-1">
              <p className="font-body text-[10px] text-text-muted/60">Sample updated:</p>
              {applyResult.sample_titles.map((t, i) => (
                <p key={i} className="font-body text-[10px] text-text-muted truncate">{t}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
