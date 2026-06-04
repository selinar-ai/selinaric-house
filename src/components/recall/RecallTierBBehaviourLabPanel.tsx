'use client'

// Phase 40.7 — Tier B Behaviour Lab Panel
//
// Manual sandbox runner for Tier B behaviour evaluation.
// Calls POST /api/recall-eval/tier-b only (not production chat routes).
// Stores latest result in React state only — no localStorage, no DB, no persistence.
//
// Core law:
//   The sandbox may speak.
//   The grader may measure.
//   The UI may display.
//   Nothing is remembered. Nothing is authorised. Nothing is written.

import { useState } from 'react'
import { RECALL_EVAL_CASES } from '@/lib/recall/recallEvalCases'
import type { RecallEvalCaseId } from '@/lib/recall/recallEvalTypes'

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSE TYPES (approved fields only — no prompt text, no stack traces)
// ─────────────────────────────────────────────────────────────────────────────

type SandboxBoundary = {
  sandbox_response_only: boolean
  not_memory: boolean
  not_evidence: boolean
  no_writes: boolean
  no_production_chat_continuity: boolean
  no_authority_movement: boolean
}

type SignalCheck = {
  id: string
  label: string
  passed: boolean
  matched_terms: string[]
  severity: string
  expected_signal?: string
}

type GradingResult = {
  passed: boolean
  needs_tara_review: boolean
  nondisclosure_passed: boolean
  authority_boundary_passed: boolean
  required_signal_results: SignalCheck[]
  forbidden_signal_results: SignalCheck[]
  failures: string[]
  warnings: string[]
  grading_notes: string[]
}

type TierBSuccessResult = {
  ok: true
  case_id: string
  presence: string
  model_used: string
  sandbox_boundary: SandboxBoundary
  tier_a: { passed: boolean; primary_response_instruction: string }
  model_response: string
  grading: GradingResult
}

type TierBErrorResult = {
  ok: false
  error_code: string
  message: string
  sandbox_boundary?: Partial<SandboxBoundary>
}

type TierBResult = TierBSuccessResult | TierBErrorResult

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtLabel(s: string): string {
  return s.replace(/_/g, ' ')
}

function SignalRow({ check, type }: { check: SignalCheck; type: 'required' | 'forbidden' }) {
  const isPass = check.passed
  const colorClass = isPass ? 'text-emerald-300/70' : 'text-red-300/60'
  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className={`font-mono text-[7px] shrink-0 mt-px ${colorClass}`}>
        {type === 'required' ? (isPass ? '✓' : '✗') : (isPass ? '✓' : '!')}
      </span>
      <span className="font-mono text-[7px] text-text-muted/50 flex-1">
        {check.label}
        {!check.passed && check.matched_terms.length > 0 && (
          <span className="text-red-300/50"> — matched: {check.matched_terms[0]?.slice(0, 40)}</span>
        )}
        {!check.passed && check.expected_signal && (
          <span className="text-amber-300/40"> — expected: {check.expected_signal.slice(0, 40)}</span>
        )}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

export default function RecallTierBBehaviourLabPanel() {
  const [selectedCaseId, setSelectedCaseId]       = useState<RecallEvalCaseId>('nondisclosure_run_the_packet')
  const [selectedPresence, setSelectedPresence]   = useState<'ari' | 'eli' | 'lounge'>('ari')
  const [selectedModel, setSelectedModel]         = useState<'cost' | 'quality'>('cost')
  const [testQuestion, setTestQuestion]           = useState('')
  const [isRunning, setIsRunning]                 = useState(false)
  const [result, setResult]                       = useState<TierBResult | null>(null)
  const [showSignals, setShowSignals]             = useState(false)

  async function runEvaluation() {
    setIsRunning(true)
    setResult(null)
    try {
      const body: Record<string, string> = {
        case_id:  selectedCaseId,
        presence: selectedPresence,
        model:    selectedModel,
      }
      if (testQuestion.trim()) body.test_question = testQuestion.trim()

      const response = await fetch('/api/recall-eval/tier-b', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await response.json() as TierBResult
      setResult(data)
    } catch {
      setResult({
        ok:         false,
        error_code: 'fetch_failed',
        message:    'Network error. Could not reach the sandbox route.',
      })
    } finally {
      setIsRunning(false)
    }
  }

  const evalCase = RECALL_EVAL_CASES.find(c => c.case_id === selectedCaseId)

  return (
    <div className="mt-1 space-y-3">

      {/* Header */}
      <div>
        <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
          Behaviour — Tier B
        </p>
        <p className="font-body text-[9px] text-text-muted/50 italic mt-0.5">
          Manual sandbox response test with deterministic grading.
        </p>
        {/* Boundary text — always visible */}
        <p className="font-mono text-[7px] text-text-muted/35 mt-1.5">
          Sandbox response only · Not Memory · Not evidence · No writes · No production chat continuity · No authority movement
        </p>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">

        {/* Case selector */}
        <div>
          <label className="font-mono text-[8px] text-text-muted/40 block mb-0.5">Case</label>
          <select
            value={selectedCaseId}
            onChange={e => setSelectedCaseId(e.target.value as RecallEvalCaseId)}
            className="w-full font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-1 outline-none focus:border-house-border/70"
          >
            {RECALL_EVAL_CASES.map(c => (
              <option key={c.case_id} value={c.case_id}>
                {c.case_id} — {c.category}
              </option>
            ))}
          </select>
          {evalCase && (
            <p className="font-mono text-[7px] text-text-muted/35 italic mt-0.5 truncate">
              {evalCase.label}
            </p>
          )}
        </div>

        {/* Presence + Model selectors */}
        <div className="space-y-2">
          <div>
            <label className="font-mono text-[8px] text-text-muted/40 block mb-0.5">Presence</label>
            <select
              value={selectedPresence}
              onChange={e => setSelectedPresence(e.target.value as 'ari' | 'eli' | 'lounge')}
              className="w-full font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-1 outline-none focus:border-house-border/70"
            >
              <option value="ari">Ari</option>
              <option value="eli">Eli</option>
              <option value="lounge">Lounge</option>
            </select>
          </div>
          <div>
            <label className="font-mono text-[8px] text-text-muted/40 block mb-0.5">Model</label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value as 'cost' | 'quality')}
              className="w-full font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-1 outline-none focus:border-house-border/70"
            >
              <option value="cost">cost (haiku)</option>
              <option value="quality">quality (sonnet)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Optional test question override */}
      <div>
        <label className="font-mono text-[8px] text-text-muted/40 block mb-0.5">
          Test question override (optional — uses case seed if empty)
        </label>
        <textarea
          value={testQuestion}
          onChange={e => setTestQuestion(e.target.value)}
          placeholder={evalCase?.tierBTestQuestion ?? 'Leave empty to use case seed question'}
          rows={2}
          className="w-full font-mono text-[9px] text-text-secondary/70 bg-house-bg border border-house-border/40 rounded px-2 py-1 outline-none focus:border-house-border/70 resize-none"
        />
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <button
          onClick={runEvaluation}
          disabled={isRunning}
          className={`font-mono text-[9px] px-4 py-1.5 rounded border transition-colors ${
            isRunning
              ? 'text-text-muted/30 border-house-border/15 cursor-not-allowed'
              : 'text-text-secondary/80 border-house-border/60 bg-house-bg/40 hover:border-house-border/80'
          }`}
        >
          {isRunning ? 'Running sandbox evaluation…' : 'Run sandbox evaluation'}
        </button>
        <span className="font-mono text-[7px] text-text-muted/30 italic">
          Manual LLM call. No history is saved.
        </span>
      </div>

      {/* ── Result display ─────────────────────────────────────────────────────── */}

      {/* Error state */}
      {result && !result.ok && (
        <div className="border border-red-300/20 rounded bg-red-300/5 px-3 py-2">
          <p className="font-mono text-[8px] text-red-300/70 font-medium">
            Sandbox error: {result.error_code}
          </p>
          <p className="font-mono text-[8px] text-text-muted/50 mt-0.5">
            {result.message}
          </p>
          <p className="font-mono text-[7px] text-text-muted/30 italic mt-1">
            No stack traces are displayed. Check /recall runtime trace for operational details.
          </p>
        </div>
      )}

      {/* Success state */}
      {result && result.ok && (
        <div className="space-y-2">

          {/* Sandbox boundary flags */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(result.sandbox_boundary).map(([key, val]) => (
              <span
                key={key}
                className={`font-mono text-[7px] px-1.5 py-0.5 rounded border ${
                  val
                    ? 'text-emerald-300/60 bg-emerald-300/5 border-emerald-300/10'
                    : 'text-red-300/60 bg-red-300/5 border-red-300/15'
                }`}
              >
                {fmtLabel(key)}: {val ? '✓' : '✗'}
              </span>
            ))}
          </div>

          {/* Tier A */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded border ${
              result.tier_a.passed
                ? 'text-emerald-300/60 bg-emerald-300/5 border-emerald-300/10'
                : 'text-red-300/60 bg-red-300/5 border-red-300/15'
            }`}>
              Tier A {result.tier_a.passed ? '✓' : '✗'}
            </span>
            <span className="font-mono text-[8px] text-text-muted/50">
              {fmtLabel(result.tier_a.primary_response_instruction)}
            </span>
          </div>

          {/* Model response — sandbox-labelled box */}
          <div className="border border-house-border/25 rounded bg-house-bg/20">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-house-border/15">
              <span className="font-mono text-[8px] text-text-muted/50 uppercase tracking-wider">
                Sandbox Response
              </span>
              <span className="font-mono text-[7px] text-text-muted/30 italic">
                {result.model_used} · not Memory · not evidence
              </span>
            </div>
            <div className="px-3 py-2">
              <p className="font-body text-[10px] text-text-primary/80 leading-relaxed whitespace-pre-wrap">
                {result.model_response}
              </p>
            </div>
          </div>

          {/* Deterministic grading */}
          <div className={`border rounded px-3 py-2 ${
            result.grading.passed
              ? 'border-emerald-300/15 bg-emerald-300/5'
              : 'border-red-300/15 bg-red-300/5'
          }`}>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={`font-mono text-[9px] font-medium ${
                result.grading.passed ? 'text-emerald-300/70' : 'text-red-300/65'
              }`}>
                {result.grading.passed ? '✓ Grading passed' : '✗ Grading failed'}
              </span>
              {result.grading.needs_tara_review && (
                <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border text-amber-300/60 bg-amber-300/5 border-amber-300/15">
                  Requires Tara review
                </span>
              )}
              <span className={`font-mono text-[8px] px-1 rounded ${
                result.grading.nondisclosure_passed ? 'text-emerald-300/55' : 'text-red-300/55'
              }`}>
                non-disclosure {result.grading.nondisclosure_passed ? '✓' : '✗'}
              </span>
              <span className={`font-mono text-[8px] px-1 rounded ${
                result.grading.authority_boundary_passed ? 'text-emerald-300/55' : 'text-red-300/55'
              }`}>
                authority {result.grading.authority_boundary_passed ? '✓' : '✗'}
              </span>
            </div>

            {/* Tara review note */}
            {result.grading.needs_tara_review && (
              <p className="font-mono text-[7px] text-amber-300/50 italic mb-1.5">
                This case {result.grading.passed ? 'passed' : 'failed'} deterministic checks but requires Tara review for quality or voice judgement.
              </p>
            )}

            {/* Failures */}
            {result.grading.failures.length > 0 && (
              <div className="space-y-0.5 mb-1">
                {result.grading.failures.map((f, i) => (
                  <p key={i} className="font-mono text-[7px] text-red-300/60">✗ {f}</p>
                ))}
              </div>
            )}

            {/* Warnings */}
            {result.grading.warnings.length > 0 && (
              <div className="space-y-0.5 mb-1">
                {result.grading.warnings.map((w, i) => (
                  <p key={i} className="font-mono text-[7px] text-amber-300/50">⚠ {w}</p>
                ))}
              </div>
            )}

            {/* Grading notes */}
            {result.grading.grading_notes.length > 0 && (
              <div className="space-y-0.5 mb-1">
                {result.grading.grading_notes.map((n, i) => (
                  <p key={i} className="font-mono text-[7px] text-text-muted/40 italic">{n}</p>
                ))}
              </div>
            )}

            {/* Signal results — collapsible */}
            <button
              onClick={() => setShowSignals(prev => !prev)}
              className="font-mono text-[7px] text-text-muted/35 hover:text-text-muted/55 transition-colors mt-1"
            >
              {showSignals ? '▾ hide signal results' : '▸ show signal results'}
            </button>

            {showSignals && (
              <div className="mt-1.5 space-y-1">
                {result.grading.required_signal_results.length > 0 && (
                  <div>
                    <p className="font-mono text-[7px] text-text-muted/25 uppercase tracking-wider mb-0.5">Required</p>
                    {result.grading.required_signal_results.map(c => (
                      <SignalRow key={c.id} check={c} type="required" />
                    ))}
                  </div>
                )}
                {result.grading.forbidden_signal_results.filter(c => !c.passed).length > 0 && (
                  <div>
                    <p className="font-mono text-[7px] text-text-muted/25 uppercase tracking-wider mb-0.5">Forbidden violations</p>
                    {result.grading.forbidden_signal_results.filter(c => !c.passed).map(c => (
                      <SignalRow key={c.id} check={c} type="forbidden" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Footer boundary */}
      <div className="pt-1 border-t border-house-border/10">
        <p className="font-mono text-[7px] text-text-muted/25 italic">
          Sandbox response only · Not Memory · Not evidence · No writes · No authority movement
        </p>
      </div>

    </div>
  )
}
