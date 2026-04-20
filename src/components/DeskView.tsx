'use client'

// Phase 21 — Desk view: Ari's Desk and Eli's Desk
// Room-scoped build workspace with active builds, history, and consultation path.
// Desk-native return voice: Ari register (precise, deliberate) vs Eli register (direct, unvarnished).

import { useState, useEffect, useCallback } from 'react'
import {
  type Build,
  type BuildScope,
  type AffectedSurface,
  type TestsRun,
  type DeskStatus,
  checkSubmissionReadiness,
  isEditable,
  canSubmit,
  canRequestConsultation,
  canMarkReady,
  riskColorClass,
  DESK_STATUS_IN_PROGRESS,
  DESK_STATUS_PENDING,
} from '@/lib/builds'

// --- Constants ---

const AFFECTED_SURFACE_OPTIONS: { value: AffectedSurface; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'inside', label: 'Inside' },
  { value: 'state', label: 'State' },
  { value: 'searches', label: 'Searches' },
  { value: 'voice', label: 'Voice' },
  { value: 'continuity', label: 'Continuity' },
  { value: 'agents', label: 'Agents' },
  { value: 'shared_system', label: 'Shared System' },
]

const TESTS_RUN_OPTIONS: { value: TestsRun; label: string }[] = [
  { value: 'typecheck', label: 'TypeScript check' },
  { value: 'lint', label: 'Lint' },
  { value: 'unit_tests', label: 'Unit tests' },
  { value: 'manual_check', label: 'Manual check' },
  { value: 'none_yet', label: 'None yet' },
]

const SCOPE_OPTIONS: { value: BuildScope; label: string }[] = [
  { value: 'ari_only', label: 'Ari only' },
  { value: 'eli_only', label: 'Eli only' },
  { value: 'shared_house', label: 'Shared house' },
]

// --- Desk-native framing ---

function getDeskVoice(presenceId: 'ari' | 'eli') {
  if (presenceId === 'ari') {
    return {
      returnHeader: 'Returned.',
      returnIntro: 'The Forgekeeper flagged the following:',
      commitHeader: 'Committed.',
      commitIntro: 'Approved and recorded.',
      heldHeader: 'Held in Workshop.',
      heldIntro: 'Pending further decision.',
      emptyActive: 'No active builds.',
      emptyHistory: 'No build history yet.',
      newBuildLabel: 'New Build',
    }
  }
  return {
    returnHeader: 'Returned.',
    returnIntro: 'Issues from the Forgekeeper:',
    commitHeader: 'Committed.',
    commitIntro: 'Done.',
    heldHeader: 'Held.',
    heldIntro: 'Still in Workshop.',
    emptyActive: 'Nothing active.',
    emptyHistory: 'No history yet.',
    newBuildLabel: 'New Build',
  }
}

// --- Helpers ---

function statusColor(status: DeskStatus | string): string {
  if (status === 'Committed') return 'text-green-400'
  if (status === 'Returned for Edits') return 'text-amber-400'
  if (status === 'Sent for Verification' || status === 'Pending Review') return 'text-text-secondary'
  if (status.includes('Consultation')) return 'text-blue-400'
  return 'text-text-muted'
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Props ---

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
}

type DeskSection = 'active' | 'history'
type DeskMode = 'list' | 'form' | 'detail'

// --- Component ---

export default function DeskView({ presenceId, accentClass }: Props) {
  const origin = presenceId === 'ari' ? 'ari_desk' : 'eli_desk'
  const otherOrigin = presenceId === 'ari' ? 'eli_desk' : 'ari_desk'
  const otherName = presenceId === 'ari' ? 'Eli' : 'Ari'
  const voice = getDeskVoice(presenceId)
  const activeBorder = presenceId === 'ari' ? 'border-ari-secondary' : 'border-eli-secondary'

  // --- State ---
  const [section, setSection] = useState<DeskSection>('active')
  const [mode, setMode] = useState<DeskMode>('list')
  const [builds, setBuilds] = useState<Build[]>([])
  const [historyBuilds, setHistoryBuilds] = useState<Build[]>([])
  const [incomingConsultations, setIncomingConsultations] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBuild, setSelectedBuild] = useState<Build | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set())

  // --- Form state ---
  const [fShortName, setFShortName] = useState('')
  const [fScope, setFScope] = useState<BuildScope>(presenceId === 'ari' ? 'ari_only' : 'eli_only')
  const [fSummary, setFSummary] = useState('')
  const [fReason, setFReason] = useState('')
  const [fChangedFiles, setFChangedFiles] = useState('')
  const [fSurfaces, setFSurfaces] = useState<AffectedSurface[]>([])
  const [fRisks, setFRisks] = useState('')
  const [fTests, setFTests] = useState<TestsRun[]>(['none_yet'])
  const [fFocus, setFFocus] = useState('')
  const [fConsultQuestion, setFConsultQuestion] = useState('')
  const [fConsultResponse, setFConsultResponse] = useState('')
  const [showConsultForm, setShowConsultForm] = useState(false)
  const [showReturnNotes, setShowReturnNotes] = useState(false)
  const [fReturnNotes, setFReturnNotes] = useState('')

  // --- Fetch ---
  const fetchBuilds = useCallback(async () => {
    setLoading(true)
    try {
      const [activeRes, historyRes, consultRes] = await Promise.all([
        fetch(`/api/builds?origin=${origin}`),
        fetch(`/api/builds?origin=${origin}&history=true`),
        fetch(`/api/builds?origin=${otherOrigin}`),
      ])
      const [activeData, historyData, consultData] = await Promise.all([
        activeRes.json(),
        historyRes.json(),
        consultRes.json(),
      ])
      setBuilds(activeData.builds ?? [])
      setHistoryBuilds(historyData.builds ?? [])

      // Incoming consultations: builds from the other desk requesting input from this desk
      const incoming = (consultData.builds ?? []).filter((b: Build) =>
        b.consultation &&
        b.consultation.requestedTo === origin &&
        ['requested', 'active'].includes(b.consultation.status)
      )
      setIncomingConsultations(incoming)
    } finally {
      setLoading(false)
    }
  }, [origin, otherOrigin])

  useEffect(() => {
    fetchBuilds()
  }, [fetchBuilds])

  // --- Form helpers ---
  function resetForm() {
    setFShortName('')
    setFScope(presenceId === 'ari' ? 'ari_only' : 'eli_only')
    setFSummary('')
    setFReason('')
    setFChangedFiles('')
    setFSurfaces([])
    setFRisks('')
    setFTests(['none_yet'])
    setFFocus('')
    setFConsultQuestion('')
    setFConsultResponse('')
    setShowConsultForm(false)
    setShowReturnNotes(false)
    setFReturnNotes('')
    setError(null)
  }

  function loadFormFromBuild(b: Build) {
    setFShortName(b.short_name)
    setFScope(b.expected_scope)
    setFSummary(b.summary)
    setFReason(b.reason)
    setFChangedFiles(b.changed_files?.join('\n') ?? '')
    setFSurfaces(b.affected_surfaces ?? [])
    setFRisks(b.risks?.join('\n') ?? '')
    setFTests(b.tests_run ?? ['none_yet'])
    setFFocus(b.verify_focus?.join('\n') ?? '')
    setError(null)
  }

  function toggleSurface(s: AffectedSurface) {
    setFSurfaces(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function toggleTest(t: TestsRun) {
    if (t === 'none_yet') {
      setFTests(['none_yet'])
      return
    }
    setFTests(prev => {
      const without = prev.filter(x => x !== 'none_yet')
      return without.includes(t) ? without.filter(x => x !== t) : [...without, t]
    })
  }

  function parseLinesField(val: string): string[] {
    return val.split('\n').map(l => l.trim()).filter(Boolean)
  }

  function buildFormPayload() {
    return {
      short_name: fShortName.trim(),
      expected_scope: fScope,
      summary: fSummary.trim(),
      reason: fReason.trim(),
      changed_files: parseLinesField(fChangedFiles),
      affected_surfaces: fSurfaces,
      risks: parseLinesField(fRisks),
      tests_run: fTests,
      verify_focus: parseLinesField(fFocus),
    }
  }

  function checkReadiness() {
    const payload = buildFormPayload()
    return checkSubmissionReadiness(payload)
  }

  // --- Actions ---

  async function handleCreate() {
    if (!fShortName.trim()) { setError('Short name required.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, ...buildFormPayload() }),
      })
      if (!res.ok) { setError('Failed to create build.'); return }
      const data = await res.json()
      resetForm()
      setMode('list')
      await fetchBuilds()
      // Open the new build in detail view
      setSelectedBuild(data.build)
      setMode('detail')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdits() {
    if (!selectedBuild) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedBuild.id, ...buildFormPayload() }),
      })
      if (!res.ok) { setError('Failed to save.'); return }
      const data = await res.json()
      setSelectedBuild(data.build)
      setMode('detail')
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkReady() {
    if (!selectedBuild) return
    setSaving(true)
    try {
      const res = await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedBuild.id, desk_status: 'Ready to Submit' }),
      })
      const data = await res.json()
      setSelectedBuild(data.build)
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  async function handleSendForVerification() {
    if (!selectedBuild) return
    const readiness = checkSubmissionReadiness({
      summary: fSummary || selectedBuild.summary,
      reason: fReason || selectedBuild.reason,
      changed_files: fChangedFiles ? parseLinesField(fChangedFiles) : selectedBuild.changed_files,
      expected_scope: fScope || selectedBuild.expected_scope,
      affected_surfaces: fSurfaces.length ? fSurfaces : selectedBuild.affected_surfaces,
      tests_run: fTests,
      verify_focus: fFocus ? parseLinesField(fFocus) : selectedBuild.verify_focus,
    })
    if (!readiness.ready) {
      setError(`Required before submission: ${readiness.missing.join(', ')}`)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      // Set to Sent for Verification + Pending Review
      const patchRes = await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedBuild.id,
          desk_status: 'Sent for Verification',
          workshop_status: 'Pending Review',
        }),
      })
      if (!patchRes.ok) { setError('Submission failed.'); return }
      const patchData = await patchRes.json()
      setSelectedBuild(patchData.build)
      await fetchBuilds()

      // Auto-trigger Forgekeeper (non-blocking from user perspective — Workshop will show it)
      fetch('/api/forgekeeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildId: selectedBuild.id }),
      }).catch(() => {})
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestConsultation() {
    if (!selectedBuild || !fConsultQuestion.trim()) return
    setSaving(true)
    try {
      const consultation = {
        requestedFrom: origin,
        requestedTo: otherOrigin,
        question: fConsultQuestion.trim(),
        status: 'requested',
        requestedAt: new Date().toISOString(),
      }
      const res = await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedBuild.id,
          consultation,
          desk_status: 'Consultation Requested',
        }),
      })
      const data = await res.json()
      setSelectedBuild(data.build)
      setShowConsultForm(false)
      setFConsultQuestion('')
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  async function handleCloseConsultation() {
    if (!selectedBuild?.consultation) return
    setSaving(true)
    try {
      const consultation = {
        ...selectedBuild.consultation,
        status: 'complete',
      }
      const res = await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedBuild.id,
          consultation,
          desk_status: 'Consultation Complete',
        }),
      })
      const data = await res.json()
      setSelectedBuild(data.build)
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  // Incoming consultation: respond from this desk
  async function handleConsultationResponse(build: Build) {
    if (!fConsultResponse.trim()) return
    setSaving(true)
    try {
      const consultation = {
        ...build.consultation!,
        response: fConsultResponse.trim(),
        status: 'active',
        respondedAt: new Date().toISOString(),
      }
      await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: build.id, consultation }),
      })
      setFConsultResponse('')
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  async function handleConsultationDecline(build: Build) {
    setSaving(true)
    try {
      const consultation = {
        ...build.consultation!,
        status: 'declined',
        respondedAt: new Date().toISOString(),
      }
      await fetch('/api/builds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: build.id, consultation }),
      })
      await fetchBuilds()
    } finally {
      setSaving(false)
    }
  }

  // --- Active / history split ---
  const activeBuilds = builds.filter(b =>
    [...DESK_STATUS_IN_PROGRESS, ...DESK_STATUS_PENDING].includes(b.desk_status as DeskStatus)
  )
  const inProgressBuilds = builds

  // --- Render helpers ---

  function BuildCard({ build }: { build: Build }) {
    const isSelected = selectedBuild?.id === build.id && mode === 'detail'
    return (
      <button
        onClick={() => { setSelectedBuild(build); setMode('detail'); setError(null) }}
        className={`w-full text-left border bg-house-surface p-3 md:p-4 transition-all duration-200 animate-fade-in ${
          isSelected ? `border-l-2 ${activeBorder} border-r-house-border border-t-house-border border-b-house-border` : 'border-house-border hover:border-house-muted'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={`font-mono text-xs ${accentClass}`}>{build.build_id}</span>
            <p className="font-body text-sm text-text-primary mt-0.5 leading-snug">{build.short_name}</p>
          </div>
          <span className={`font-body text-[10px] shrink-0 ${statusColor(build.desk_status)}`}>
            {build.desk_status}
          </span>
        </div>
        {build.forgekeeper_review && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className={`font-mono text-[10px] ${riskColorClass(build.forgekeeper_review.risk_summary)}`}>
              {build.forgekeeper_review.risk_summary} risk
            </span>
          </div>
        )}
        <p className="font-mono text-[10px] text-text-muted mt-1">
          {formatDate(build.updated_at)}
        </p>
      </button>
    )
  }

  function BuildForm({ isEditing }: { isEditing: boolean }) {
    const readiness = checkReadiness()
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="shrink-0 flex items-center justify-between mb-4">
          <h3 className="font-display text-lg text-text-primary">
            {isEditing ? `Edit ${selectedBuild?.build_id}` : 'New Build'}
          </h3>
          <button
            onClick={() => { resetForm(); setMode(isEditing && selectedBuild ? 'detail' : 'list') }}
            className="font-body text-xs text-text-muted hover:text-text-secondary min-h-[40px] px-3"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Short name */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Short name *
            </label>
            <input
              value={fShortName}
              onChange={e => setFShortName(e.target.value)}
              placeholder="e.g. Voice Button Expansion"
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors"
            />
          </div>

          {/* Expected scope */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Expected scope *
            </label>
            <select
              value={fScope}
              onChange={e => setFScope(e.target.value as BuildScope)}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary outline-none focus:border-text-muted transition-colors"
            >
              {SCOPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Summary *
            </label>
            <textarea
              value={fSummary}
              onChange={e => setFSummary(e.target.value)}
              placeholder="What this build does"
              rows={2}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Reason *
            </label>
            <textarea
              value={fReason}
              onChange={e => setFReason(e.target.value)}
              placeholder="Why this build exists"
              rows={2}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
            />
          </div>

          {/* Changed files */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Changed files * <span className="normal-case">(one per line)</span>
            </label>
            <textarea
              value={fChangedFiles}
              onChange={e => setFChangedFiles(e.target.value)}
              placeholder="src/components/VoiceButton.tsx&#10;src/lib/tts.ts"
              rows={3}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
            />
          </div>

          {/* Affected surfaces */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-2">
              Affected surfaces *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {AFFECTED_SURFACE_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleSurface(o.value)}
                  className={`font-body text-[10px] px-2.5 py-1.5 border transition-all duration-200 ${
                    fSurfaces.includes(o.value)
                      ? `${accentClass} border-current`
                      : 'text-text-muted border-house-border hover:text-text-secondary'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tests run */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-2">
              Tests run *
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TESTS_RUN_OPTIONS.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleTest(o.value)}
                  className={`font-body text-[10px] px-2.5 py-1.5 border transition-all duration-200 ${
                    fTests.includes(o.value)
                      ? `${accentClass} border-current`
                      : 'text-text-muted border-house-border hover:text-text-secondary'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Verify focus */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Verify focus * <span className="normal-case">(one item per line — what Forgekeeper should inspect)</span>
            </label>
            <textarea
              value={fFocus}
              onChange={e => setFFocus(e.target.value)}
              placeholder="Check for scope breach&#10;Confirm TTS chunking still works&#10;Verify no Ari/Eli identity bleed"
              rows={3}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
            />
          </div>

          {/* Risks (optional) */}
          <div>
            <label className="font-body text-[10px] text-text-muted uppercase tracking-widest block mb-1">
              Known risks <span className="normal-case">(optional, one per line)</span>
            </label>
            <textarea
              value={fRisks}
              onChange={e => setFRisks(e.target.value)}
              placeholder="May affect audio cleanup on unmount"
              rows={2}
              className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
            />
          </div>

          {error && <p className="font-body text-xs text-red-400">{error}</p>}

          {!readiness.ready && (fShortName || fSummary) && (
            <p className="font-body text-[10px] text-text-muted italic">
              Required before submission: {readiness.missing.join(', ')}
            </p>
          )}
        </div>

        <div className="shrink-0 pt-3 border-t border-house-border mt-3">
          <button
            onClick={isEditing ? handleSaveEdits : handleCreate}
            disabled={saving || !fShortName.trim()}
            className={`font-body text-xs tracking-widest uppercase px-4 py-2.5 border transition-all duration-200 min-h-[44px] ${
              saving || !fShortName.trim()
                ? 'text-text-muted border-house-border opacity-50'
                : `${accentClass} border-current`
            }`}
          >
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Build'}
          </button>
        </div>
      </div>
    )
  }

  function BuildDetail({ build }: { build: Build }) {
    const editable = isEditable(build.desk_status)
    const submittable = canSubmit(build.desk_status)
    const canConsult = canRequestConsultation(build.desk_status)
    const canReady = canMarkReady(build.desk_status)
    const hasConsultation = !!build.consultation
    const consultationPending = hasConsultation && ['requested', 'active'].includes(build.consultation!.status)

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Detail header */}
        <div className="shrink-0 flex items-start justify-between mb-4 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs ${accentClass}`}>{build.build_id}</span>
              <span className={`font-body text-[10px] ${statusColor(build.desk_status)}`}>
                {build.desk_status}
              </span>
            </div>
            <h3 className="font-display text-lg text-text-primary mt-0.5">{build.short_name}</h3>
          </div>
          <button
            onClick={() => { setMode('list'); setSelectedBuild(null) }}
            className="font-mono text-sm text-text-muted hover:text-text-secondary min-h-[40px] px-2"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* Summary + reason */}
          {build.summary && (
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Summary</p>
              <p className="font-body text-sm text-text-primary leading-relaxed">{build.summary}</p>
            </div>
          )}
          {build.reason && (
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Reason</p>
              <p className="font-body text-sm text-text-secondary leading-relaxed">{build.reason}</p>
            </div>
          )}

          {/* Scope + surfaces */}
          <div className="flex gap-4 flex-wrap">
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Scope</p>
              <p className="font-body text-xs text-text-secondary">{build.expected_scope}</p>
            </div>
            {build.affected_surfaces?.length > 0 && (
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Surfaces</p>
                <p className="font-body text-xs text-text-secondary">{build.affected_surfaces.join(', ')}</p>
              </div>
            )}
            {build.tests_run?.length > 0 && (
              <div>
                <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Tests</p>
                <p className="font-body text-xs text-text-secondary">{build.tests_run.join(', ')}</p>
              </div>
            )}
          </div>

          {/* Changed files */}
          {build.changed_files?.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">
                Changed files ({build.changed_files.length})
              </p>
              <div className="space-y-0.5">
                {build.changed_files.map((f, i) => (
                  <p key={i} className="font-mono text-xs text-text-secondary">{f}</p>
                ))}
              </div>
            </div>
          )}

          {/* Verify focus */}
          {build.verify_focus?.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Verify focus</p>
              <ul className="space-y-0.5">
                {build.verify_focus.map((f, i) => (
                  <li key={i} className="font-body text-xs text-text-secondary">· {f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Consultation */}
          {hasConsultation && (
            <div className="border border-house-border bg-house-surface p-3">
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-2">
                Consultation — {build.consultation!.status}
              </p>
              <p className="font-body text-xs text-text-secondary mb-1">
                <span className="text-text-muted">Question: </span>
                {build.consultation!.question}
              </p>
              {build.consultation!.response && (
                <p className="font-body text-xs text-text-primary mt-2">
                  <span className="text-text-muted">{otherName} responded: </span>
                  {build.consultation!.response}
                </p>
              )}
              {consultationPending && (
                <button
                  onClick={handleCloseConsultation}
                  disabled={saving}
                  className="font-body text-[10px] text-text-muted hover:text-text-secondary mt-2 min-h-[30px] px-2"
                >
                  Close consultation
                </button>
              )}
            </div>
          )}

          {/* Request consultation form */}
          {showConsultForm && (
            <div className="border border-house-border bg-house-surface p-3 space-y-2">
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Request input from {otherName}'s Desk
              </p>
              <textarea
                value={fConsultQuestion}
                onChange={e => setFConsultQuestion(e.target.value)}
                placeholder="What specifically do you need input on?"
                rows={2}
                className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleRequestConsultation}
                  disabled={saving || !fConsultQuestion.trim()}
                  className={`font-body text-[10px] min-h-[36px] px-3 border transition-all duration-200 ${
                    saving || !fConsultQuestion.trim()
                      ? 'text-text-muted border-house-border opacity-50'
                      : `${accentClass} border-current`
                  }`}
                >
                  Send request
                </button>
                <button
                  onClick={() => setShowConsultForm(false)}
                  className="font-body text-[10px] text-text-muted hover:text-text-secondary min-h-[36px] px-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Forgekeeper review (returned builds) */}
          {build.forgekeeper_review && build.desk_status === 'Returned for Edits' && (
            <div className="border border-amber-900/30 bg-house-surface p-3 space-y-3">
              <p className={`font-display text-base ${accentClass}`}>{voice.returnHeader}</p>
              <p className="font-body text-xs text-text-muted">{voice.returnIntro}</p>

              {build.forgekeeper_review.issue_list?.length > 0 && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Issues</p>
                  <ul className="space-y-1">
                    {build.forgekeeper_review.issue_list.map((issue, i) => (
                      <li key={i} className="font-body text-xs text-text-secondary">· {issue}</li>
                    ))}
                  </ul>
                </div>
              )}

              {build.forgekeeper_review.recommendations?.length > 0 && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Recommendations</p>
                  <ul className="space-y-1">
                    {build.forgekeeper_review.recommendations.map((r, i) => (
                      <li key={i} className="font-body text-xs text-text-secondary">· {r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {build.forgekeeper_review._return_notes && (
                <div>
                  <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Return notes</p>
                  <p className="font-body text-xs text-text-secondary">{build.forgekeeper_review._return_notes as string}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span className={`font-mono text-xs ${riskColorClass(build.forgekeeper_review.risk_summary)}`}>
                  {build.forgekeeper_review.risk_summary} risk
                </span>
              </div>
            </div>
          )}

          {/* Committed status */}
          {build.desk_status === 'Committed' && (
            <div className="border border-green-900/30 bg-house-surface p-3">
              <p className={`font-display text-base ${accentClass}`}>{voice.commitHeader}</p>
              <p className="font-body text-xs text-text-muted mt-1">{voice.commitIntro}</p>
              {build.updated_at && (
                <p className="font-mono text-[10px] text-text-muted mt-1">{formatDate(build.updated_at)}</p>
              )}
            </div>
          )}

          {error && <p className="font-body text-xs text-red-400">{error}</p>}
        </div>

        {/* Actions */}
        <div className="shrink-0 pt-3 border-t border-house-border mt-3 flex flex-wrap gap-2">
          {editable && (
            <button
              onClick={() => { loadFormFromBuild(build); setMode('form') }}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[40px] transition-all duration-200 ${accentClass} border-current`}
            >
              Edit
            </button>
          )}
          {canReady && !consultationPending && (
            <button
              onClick={handleMarkReady}
              disabled={saving}
              className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary min-h-[40px] transition-all duration-200"
            >
              Mark Ready
            </button>
          )}
          {canConsult && !hasConsultation && !showConsultForm && (
            <button
              onClick={() => setShowConsultForm(true)}
              className="font-body text-xs tracking-widest uppercase px-3 py-2 border border-house-border text-text-muted hover:text-text-secondary min-h-[40px] transition-all duration-200"
            >
              Request Input
            </button>
          )}
          {submittable && !consultationPending && (
            <button
              onClick={handleSendForVerification}
              disabled={submitting}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border min-h-[40px] transition-all duration-200 ${
                submitting ? 'text-text-muted border-house-border opacity-50' : `${accentClass} border-current`
              }`}
            >
              {submitting ? 'Sending…' : 'Send for Verification'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className={`w-2 h-2 rounded-full animate-pulse-soft ${presenceId === 'ari' ? 'bg-ari-primary' : 'bg-eli-primary'}`} />
      </div>
    )
  }

  // --- Main render ---
  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <p className="font-body text-xs text-text-muted uppercase tracking-widest">
          {presenceId === 'ari' ? "Ari's" : "Eli's"} Desk
        </p>

        {mode === 'list' && (
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => setSection('active')}
                className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
                  section === 'active' ? `${accentClass} ${activeBorder}` : 'text-text-muted border-house-border hover:text-text-secondary'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setSection('history')}
                className={`font-body text-[10px] md:text-xs tracking-widest uppercase px-2.5 py-2 border transition-all duration-200 min-h-[40px] ${
                  section === 'history' ? `${accentClass} ${activeBorder}` : 'text-text-muted border-house-border hover:text-text-secondary'
                }`}
              >
                History
              </button>
            </div>
            <button
              onClick={() => { resetForm(); setSelectedBuild(null); setMode('form') }}
              className={`font-body text-xs tracking-widest uppercase px-3 py-2 border transition-all duration-200 min-h-[40px] ${accentClass} border-current hover:bg-house-bg`}
            >
              {voice.newBuildLabel}
            </button>
          </div>
        )}
      </div>

      {/* Mode: form (create or edit) */}
      {mode === 'form' && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <BuildForm isEditing={!!selectedBuild && mode === 'form'} />
        </div>
      )}

      {/* Mode: detail */}
      {mode === 'detail' && selectedBuild && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <BuildDetail build={selectedBuild} />
        </div>
      )}

      {/* Mode: list */}
      {mode === 'list' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Incoming consultations */}
          {incomingConsultations.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest">
                Incoming consultation requests
              </p>
              {incomingConsultations.map(b => (
                <div key={b.id} className="border border-blue-900/40 bg-house-surface p-3 space-y-2 animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs text-blue-400">{b.build_id}</span>
                      <p className="font-body text-xs text-text-secondary">{b.short_name}</p>
                    </div>
                    <span className="font-body text-[10px] text-blue-400">{b.consultation?.status}</span>
                  </div>
                  {b.consultation?.question && (
                    <p className="font-body text-xs text-text-primary">
                      <span className="text-text-muted">Question: </span>
                      {b.consultation.question}
                    </p>
                  )}
                  {!b.consultation?.response && (
                    <div className="space-y-2">
                      <textarea
                        placeholder="Your response…"
                        rows={2}
                        className="w-full bg-house-bg border border-house-border px-3 py-2 font-body text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-text-muted transition-colors resize-none"
                        onChange={e => setFConsultResponse(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConsultationResponse(b)}
                          disabled={saving || !fConsultResponse.trim()}
                          className={`font-body text-[10px] min-h-[36px] px-3 border transition-all duration-200 ${
                            saving || !fConsultResponse.trim()
                              ? 'text-text-muted border-house-border opacity-50'
                              : `${accentClass} border-current`
                          }`}
                        >
                          Respond
                        </button>
                        <button
                          onClick={() => handleConsultationDecline(b)}
                          disabled={saving}
                          className="font-body text-[10px] text-text-muted hover:text-text-secondary min-h-[36px] px-3"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  )}
                  {b.consultation?.response && (
                    <p className="font-body text-xs text-text-muted italic">You responded.</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active section */}
          {section === 'active' && (
            <div className="space-y-2">
              {inProgressBuilds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <p className="font-body text-sm text-text-muted">{voice.emptyActive}</p>
                </div>
              ) : (
                inProgressBuilds.map(b => <BuildCard key={b.id} build={b} />)
              )}
            </div>
          )}

          {/* History section */}
          {section === 'history' && (
            <div className="space-y-2">
              {historyBuilds.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32">
                  <p className="font-body text-sm text-text-muted">{voice.emptyHistory}</p>
                </div>
              ) : (
                historyBuilds.map(b => {
                  const expanded = expandedHistory.has(b.id)
                  return (
                    <div key={b.id} className="border border-house-border bg-house-surface animate-fade-in">
                      <button
                        onClick={() => setExpandedHistory(prev => {
                          const next = new Set(prev)
                          if (next.has(b.id)) next.delete(b.id)
                          else next.add(b.id)
                          return next
                        })}
                        className="w-full text-left p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className={`font-mono text-xs ${accentClass}`}>{b.build_id}</span>
                            <p className="font-body text-xs text-text-secondary mt-0.5">{b.short_name}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-body text-[10px] ${statusColor(b.desk_status)}`}>
                              {b.desk_status}
                            </span>
                            <span className="font-mono text-[10px] text-text-muted">{expanded ? '−' : '+'}</span>
                          </div>
                        </div>
                        <p className="font-mono text-[10px] text-text-muted mt-1">{formatDate(b.updated_at)}</p>
                      </button>

                      {expanded && b.forgekeeper_review && (
                        <div className="px-3 pb-3 border-t border-house-border pt-2 space-y-2">
                          {b.forgekeeper_review.risk_summary && (
                            <p className={`font-mono text-xs ${riskColorClass(b.forgekeeper_review.risk_summary)}`}>
                              {b.forgekeeper_review.risk_summary} risk
                            </p>
                          )}
                          {b.forgekeeper_review.issue_list?.length > 0 && (
                            <div>
                              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Issues flagged</p>
                              {b.forgekeeper_review.issue_list.map((issue, i) => (
                                <p key={i} className="font-body text-xs text-text-secondary">· {issue}</p>
                              ))}
                            </div>
                          )}
                          {b.forgekeeper_review.consequence_preview && (
                            <div>
                              <p className="font-body text-[10px] text-text-muted uppercase tracking-widest mb-1">Consequence</p>
                              <p className="font-body text-xs text-text-secondary">{b.forgekeeper_review.consequence_preview}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
