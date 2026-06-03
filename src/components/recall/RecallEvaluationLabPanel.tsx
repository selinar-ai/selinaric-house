'use client'

// Phase 40.2 — Recall Evaluation Lab Panel (Tier A)
//
// Displays deterministic fixture-based Recall Packet evaluation results.
// Receives pre-computed results from runAllTierAEvaluationCases() as props.
//
// Data safety:
//   Renders metadata only — counts, instruction labels, case IDs, categories.
//   No raw content, no real source IDs, no Memory IDs, no live data.
//
// Authority boundary:
//   Not Memory. Not evidence. Not authority.
//   Tier A checks packet classification only. Tier B behaviour testing later.

import { useState } from 'react'
import type { RecallEvalTierAResult, RecallEvalTierASummary, RecallEvalCategory } from '@/lib/recall/recallEvalTypes'

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtInstruction(s: string): string {
  return s.replace(/_/g, ' ')
}

function fmtCategory(s: string): string {
  return s.replace(/_/g, ' ')
}

const CATEGORY_COLORS: Partial<Record<RecallEvalCategory, string>> = {
  confirmed_memory:       'text-emerald-300/70',
  conflict:               'text-amber-300/70',
  insufficient_ground:    'text-red-300/60',
  cross_presence_boundary:'text-amber-300/50',
  non_disclosure:         'text-text-muted/50',
}

function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat as RecallEvalCategory] ?? 'text-text-muted/50'
}

function gradingBadge(mode: string): string {
  if (mode === 'deterministic') return 'text-emerald-300/50 bg-emerald-300/5 border-emerald-300/10'
  if (mode === 'heuristic')     return 'text-amber-300/50 bg-amber-300/5 border-amber-300/10'
  return 'text-text-muted/40 bg-house-bg/20 border-house-border/10'
}

// ─────────────────────────────────────────────────────────────────────────────
// CASE CARD
// ─────────────────────────────────────────────────────────────────────────────

function CaseCard({ result }: { result: RecallEvalTierAResult }) {
  const passed  = result.passed
  const hasFail = result.failures.length > 0
  const evalCase = result.case_id

  // Get case metadata from the result itself (grading mode, category, notes are on the case)
  // We surface what's available in the result shape
  const expected = fmtInstruction(result.expected_primary_response_instruction)
  const actual   = fmtInstruction(result.actual_primary_response_instruction)
  const match    = expected === actual

  return (
    <div className={`px-2.5 py-2 rounded border ${
      passed
        ? 'border-emerald-300/10 bg-house-bg/10'
        : 'border-red-300/15 bg-red-300/5'
    }`}>
      {/* Header row */}
      <div className="flex items-start gap-1.5 flex-wrap">
        <span className={`font-mono text-[8px] shrink-0 ${passed ? 'text-emerald-300/70' : 'text-red-300/60'}`}>
          {passed ? '✓' : '✗'}
        </span>
        <span className="font-mono text-[8px] text-text-secondary/70 break-all">
          {evalCase}
        </span>
      </div>

      {/* Instructions */}
      <div className="mt-1 space-y-0.5">
        <div className="font-mono text-[7px] text-text-muted/40">
          <span className="text-text-muted/25">expected </span>
          <span className={match ? 'text-emerald-300/60' : 'text-text-secondary/60'}>{expected}</span>
        </div>
        <div className="font-mono text-[7px] text-text-muted/40">
          <span className="text-text-muted/25">actual   </span>
          <span className={match ? 'text-emerald-300/60' : 'text-red-300/60'}>{actual}</span>
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-2 flex-wrap mt-1">
        <span className="font-mono text-[7px] text-text-muted/35">
          active {result.actual_active_surfaces.length}
        </span>
        <span className="font-mono text-[7px] text-text-muted/35">
          excluded {result.actual_excluded_surfaces.length}
        </span>
        {result.packet.conflicts.length > 0 && (
          <span className="font-mono text-[7px] text-amber-300/50">
            {result.packet.conflicts.length} conflict{result.packet.conflicts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Failures */}
      {hasFail && (
        <div className="mt-1 space-y-0.5">
          {result.failures.map((f, i) => (
            <div key={i} className="font-mono text-[7px] text-red-300/55 leading-tight">
              ✗ {f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface RecallEvaluationLabPanelProps {
  results: RecallEvalTierAResult[]
  summary: RecallEvalTierASummary
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

export default function RecallEvaluationLabPanel({
  results,
  summary,
}: RecallEvaluationLabPanelProps) {
  const [open, setOpen]                     = useState(false)
  const [filterStatus, setFilterStatus]     = useState<'all' | 'passed' | 'failed'>('all')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPresence, setFilterPresence] = useState('')

  // Get unique categories for filter dropdown
  // We build this from the RECALL_EVAL_CASES map; using result case_id is enough
  const allCategories = Array.from(
    new Set(results.map(r => {
      // Derive category label from the case_id prefix where possible
      // Full category is available via RECALL_EVAL_CASE_MAP but we avoid re-importing here
      // The summary.byCategory keys provide the same information
      return Object.keys(summary.byCategory)
    }).flat())
  ).sort()

  const filtered = results.filter(r => {
    if (filterStatus === 'passed' && !r.passed) return false
    if (filterStatus === 'failed'  &&  r.passed) return false
    return true
    // Category and presence filters would need case metadata — add in 40.3 if needed
  })

  return (
    <div className="mt-5 border-t border-house-border pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
            Recall Evaluation Lab — Tier A
          </p>
          <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">
            Deterministic fixture-based evaluation of Recall Packet classification.
          </p>
        </div>
        <button
          onClick={() => setOpen(prev => !prev)}
          className="font-mono text-[9px] text-text-muted/50 border border-house-border/30 px-2 py-0.5 rounded hover:border-house-border/60 transition-colors shrink-0 ml-4"
        >
          {open ? 'collapse' : 'expand'}
        </button>
      </div>

      {open && (
        <div className="mt-3">

          {/* Summary row */}
          <div className="flex items-center gap-3 flex-wrap mb-3 px-2.5 py-2 rounded border border-house-border/15 bg-house-bg/15">
            <div className="text-center min-w-[32px]">
              <div className="font-mono text-[11px] text-text-primary/70">{summary.total}</div>
              <div className="font-mono text-[7px] text-text-muted/35">total</div>
            </div>
            <div className="text-center min-w-[32px]">
              <div className="font-mono text-[11px] text-emerald-300/70">{summary.passed}</div>
              <div className="font-mono text-[7px] text-text-muted/35">passed</div>
            </div>
            <div className="text-center min-w-[32px]">
              <div className={`font-mono text-[11px] ${summary.failed > 0 ? 'text-red-300/70' : 'text-text-muted/40'}`}>
                {summary.failed}
              </div>
              <div className="font-mono text-[7px] text-text-muted/35">failed</div>
            </div>
            <div className="text-center min-w-[40px]">
              <div className="font-mono text-[11px] text-text-primary/70">{summary.passRate}%</div>
              <div className="font-mono text-[7px] text-text-muted/35">pass rate</div>
            </div>
            <div className="text-center min-w-[36px]">
              <div className="font-mono text-[11px] text-text-primary/70">
                {Object.keys(summary.byCategory).length}
              </div>
              <div className="font-mono text-[7px] text-text-muted/35">categories</div>
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(summary.byCategory).length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {Object.entries(summary.byCategory).map(([cat, counts]) => (
                <span
                  key={cat}
                  className={`font-mono text-[7px] px-1.5 py-0.5 rounded border border-house-border/15 ${
                    (counts?.failed ?? 0) > 0
                      ? 'text-red-300/50 bg-red-300/5'
                      : 'text-text-muted/45 bg-house-bg/20'
                  }`}
                >
                  {fmtCategory(cat)}: {counts?.passed}/{counts?.total}
                </span>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="font-mono text-[8px] text-text-muted/30 shrink-0">Filter:</span>
            {(['all', 'passed', 'failed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`font-mono text-[8px] px-1.5 py-0.5 rounded border transition-colors ${
                  filterStatus === f
                    ? 'text-text-secondary/80 border-house-border/60 bg-house-bg/40'
                    : 'text-text-muted/40 border-house-border/20 hover:border-house-border/40'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Tier A advisory note */}
          <p className="font-mono text-[8px] text-text-muted/40 italic mb-3">
            Tier A checks packet classification only. Tier B behaviour testing (LLM response grading) comes later.
          </p>

          {/* Case cards */}
          {filtered.length === 0 ? (
            <p className="font-mono text-[8px] text-text-muted/35 italic py-1">
              No cases match the current filter.
            </p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(result => (
                <CaseCard key={result.case_id} result={result} />
              ))}
            </div>
          )}

          {/* Boundary footer */}
          <div className="mt-3 pt-2 border-t border-house-border/15">
            <p className="font-mono text-[7px] text-text-muted/30 italic">
              Not Memory · Not evidence · Not authority · No live data · No LLM · No writes
            </p>
          </div>

        </div>
      )}
    </div>
  )
}
