'use client'

// Phase 40.2 — Recall Evaluation Lab Panel (Tier A)
// Phase 40.2.1 — compact table view with expandable rows
//
// Displays deterministic fixture-based Recall Packet evaluation results.
// Receives pre-computed results from runAllTierAEvaluationCases() as props.
//
// Authority boundary:
//   Not Memory. Not evidence. Not authority.
//   Tier A checks packet classification only. Tier B behaviour testing later.

import { useState } from 'react'
import type { RecallEvalTierAResult, RecallEvalTierASummary } from '@/lib/recall/recallEvalTypes'
import { RECALL_EVAL_CASE_MAP } from '@/lib/recall/recallEvalCases'

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUCTION ABBREVIATION
// ─────────────────────────────────────────────────────────────────────────────

const SHORT_INSTRUCTION: Record<string, string> = {
  answer_confidently_from_confirmed_memory: 'Memory ✓',
  answer_with_source_label:                 'sourced',
  answer_with_caveat:                       'caveat',
  say_recent_continuity_only:               'continuity',
  say_live_thread_context_only:             'thread',
  say_lounge_context_only:                  'lounge',
  say_cross_room_context_only:              'cross-room',
  say_journal_inner_continuity_only:        'journal',
  say_pulse_continuity_only:               'pulse',
  say_graph_context_only:                   'graph',
  say_reference_context_only:              'reference',
  surface_source_conflict:                  '⚡ conflict',
  ask_clarifying_question:                  'clarify?',
  say_not_enough_grounded_recall:           'insufficient',
  do_not_inject:                            'no inject',
}

function shortInstruction(s: string): string {
  return SHORT_INSTRUCTION[s] ?? s.replace(/_/g, ' ').slice(0, 20)
}

function fmtCategory(s: string): string {
  return s.replace(/_/g, ' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT CASE ROW
// ─────────────────────────────────────────────────────────────────────────────

function CaseRow({ result }: { result: RecallEvalTierAResult }) {
  const [expanded, setExpanded] = useState(false)

  const evalCase   = RECALL_EVAL_CASE_MAP[result.case_id]
  const passed     = result.passed
  const hasFail    = result.failures.length > 0
  const match      = result.expected_primary_response_instruction === result.actual_primary_response_instruction

  return (
    <>
      {/* Compact row */}
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-house-bg/30 ${
          hasFail ? 'border-l-2 border-red-300/30' : 'border-l-2 border-emerald-300/10'
        }`}
        onClick={() => setExpanded(prev => !prev)}
      >
        {/* Status */}
        <span className={`font-mono text-[9px] w-3 shrink-0 ${passed ? 'text-emerald-300/70' : 'text-red-300/60'}`}>
          {passed ? '✓' : '✗'}
        </span>

        {/* Case ID */}
        <span className="font-mono text-[8px] text-text-secondary/65 truncate min-w-0 flex-1" title={result.case_id}>
          {result.case_id}
        </span>

        {/* Category */}
        <span className="font-mono text-[7px] text-text-muted/35 shrink-0 hidden md:block w-24 truncate">
          {evalCase ? fmtCategory(evalCase.category) : '—'}
        </span>

        {/* Expected instruction */}
        <span className="font-mono text-[7px] text-text-muted/45 shrink-0 w-20 truncate text-right"
              title={result.expected_primary_response_instruction}>
          {shortInstruction(result.expected_primary_response_instruction)}
        </span>

        {/* Actual instruction */}
        <span className={`font-mono text-[7px] shrink-0 w-20 truncate text-right ${
          match ? 'text-emerald-300/55' : 'text-red-300/55'
        }`} title={result.actual_primary_response_instruction}>
          {shortInstruction(result.actual_primary_response_instruction)}
        </span>

        {/* Counts */}
        <span className="font-mono text-[7px] text-text-muted/30 shrink-0 w-16 text-right">
          a:{result.actual_active_surfaces.length} e:{result.actual_excluded_surfaces.length}
          {result.packet.conflicts.length > 0 && ` c:${result.packet.conflicts.length}`}
        </span>

        {/* Expand arrow */}
        <span className="font-mono text-[8px] text-text-muted/25 shrink-0">
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 py-2 mb-1 rounded bg-house-bg/20 border border-house-border/10 text-[8px] font-mono space-y-1">
          <div className="text-text-muted/50">
            <span className="text-text-muted/25">label       </span>
            {evalCase?.label ?? result.case_id}
          </div>
          <div className="text-text-muted/50">
            <span className="text-text-muted/25">presence    </span>
            {evalCase?.presence ?? '—'} · {evalCase?.room ?? '—'}
          </div>
          <div className="text-text-muted/50">
            <span className="text-text-muted/25">grading     </span>
            {evalCase?.gradingMode ?? '—'}
          </div>
          {evalCase?.tierBTestQuestion && (
            <div className="text-text-muted/40 italic">
              <span className="text-text-muted/20 not-italic">tier B q   </span>
              {evalCase.tierBTestQuestion}
            </div>
          )}
          {hasFail && (
            <div className="space-y-0.5 mt-1">
              {result.failures.map((f, i) => (
                <div key={i} className="text-red-300/60">✗ {f}</div>
              ))}
            </div>
          )}
          {evalCase?.notes && (
            <div className="text-text-muted/35 leading-relaxed">
              <span className="text-text-muted/20">notes       </span>
              {evalCase.notes}
            </div>
          )}
        </div>
      )}
    </>
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all')

  const filtered = results.filter(r => {
    if (filterStatus === 'passed' && !r.passed) return false
    if (filterStatus === 'failed'  &&  r.passed) return false
    return true
  })

  return (
    <div className="mt-4 pt-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
            Recall Evaluation Lab — Tier A
          </p>
          <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">
            Deterministic fixture-based evaluation of Recall Packet classification.
          </p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-3 flex-wrap mb-2 px-2.5 py-1.5 rounded border border-house-border/15 bg-house-bg/15">
        <span className={`font-mono text-[8px] font-medium ${summary.allPassed ? 'text-emerald-300/70' : 'text-red-300/60'}`}>
          {summary.passed}/{summary.total} passed
        </span>
        {summary.failed > 0 && (
          <span className="font-mono text-[8px] text-red-300/60">{summary.failed} failed</span>
        )}
        <span className="font-mono text-[8px] text-text-muted/40">{summary.passRate}%</span>
        <span className="font-mono text-[8px] text-text-muted/35">
          {Object.keys(summary.byCategory).length} categories
        </span>
        <span className="font-mono text-[8px] text-text-muted/30">Tier A · fixture-only</span>
      </div>

      {/* Category chips (compact) */}
      <div className="flex flex-wrap gap-1 mb-2">
        {Object.entries(summary.byCategory).map(([cat, counts]) => (
          <span
            key={cat}
            className={`font-mono text-[7px] px-1.5 py-0.5 rounded border ${
              (counts?.failed ?? 0) > 0
                ? 'text-red-300/50 bg-red-300/5 border-red-300/10'
                : 'text-text-muted/35 bg-house-bg/15 border-house-border/10'
            }`}
          >
            {fmtCategory(cat)} {counts?.passed}/{counts?.total}
          </span>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5 mb-2">
        {(['all', 'passed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`font-mono text-[8px] px-1.5 py-0.5 rounded border transition-colors ${
              filterStatus === f
                ? 'text-text-secondary/80 border-house-border/60 bg-house-bg/40'
                : 'text-text-muted/35 border-house-border/15 hover:border-house-border/35'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-2 mb-1 text-[7px] font-mono text-text-muted/25">
        <span className="w-3 shrink-0">ok</span>
        <span className="flex-1">case</span>
        <span className="w-24 hidden md:block">category</span>
        <span className="w-20 text-right">expected</span>
        <span className="w-20 text-right">actual</span>
        <span className="w-16 text-right">counts</span>
        <span className="w-3">▸</span>
      </div>

      {/* Tier A note */}
      <p className="font-mono text-[7px] text-text-muted/30 italic mb-2">
        Tier A: packet classification only. Tier B (LLM response grading) comes later.
      </p>

      {/* Case rows */}
      <div className="space-y-0.5">
        {filtered.map(result => (
          <CaseRow key={result.case_id} result={result} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="font-mono text-[8px] text-text-muted/35 italic py-2">
          No cases match the current filter.
        </p>
      )}

      {/* Boundary footer */}
      <div className="mt-3 pt-2 border-t border-house-border/10">
        <p className="font-mono text-[7px] text-text-muted/25 italic">
          Not Memory · Not evidence · Not authority · No live data · No LLM · No writes
        </p>
      </div>
    </div>
  )
}
