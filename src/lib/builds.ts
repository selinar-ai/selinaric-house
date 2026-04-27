// Phase 21 — Build governance types and helpers
// Shared between API routes and components.

// --- Types ---

export type BuildOrigin = 'ari_desk' | 'eli_desk' | 'workshop'
export type BuildScope = 'ari_only' | 'eli_only' | 'shared_house'
export type AffectedSurface =
  | 'chat'
  | 'timeline'
  | 'inside'
  | 'state'
  | 'searches'
  | 'voice'
  | 'continuity'
  | 'agents'
  | 'shared_system'

export type TestsRun =
  | 'typecheck'
  | 'lint'
  | 'unit_tests'
  | 'manual_check'
  | 'none_yet'

export type DeskStatus =
  | 'Draft'
  | 'Consultation Requested'
  | 'Consultation Active'
  | 'Consultation Complete'
  | 'Ready to Submit'
  | 'Sent for Verification'
  | 'Approved for Implementation'
  | 'Returned for Edits'
  | 'Committed'
  | 'Archived'

export type WorkshopStatus =
  | 'Pending Review'
  | 'Review Complete'
  | 'Ready to Commit'
  | 'Plan Approved'
  | 'Returned'
  | 'Held'
  | 'Committed'

export type RiskSummary = 'Low' | 'Medium' | 'High'

export interface Consultation {
  requestedFrom: BuildOrigin   // the desk that initiated the request
  requestedTo: BuildOrigin     // the desk being asked for input
  question: string
  response?: string
  status: 'requested' | 'active' | 'complete' | 'declined'
  requestedAt: string          // ISO timestamp
  respondedAt?: string
}

export interface ForgekeeperReview {
  issue_list: string[]
  recommendations: string[]
  consequence_preview: string
  quality_results: {
    scope_classification: string
    changed_file_count: number
    tests_run_summary: string
    scope_breach_detected: boolean
    scope_breach_details?: string
  }
  risk_summary: RiskSummary
  reviewed_at: string          // ISO timestamp
  // Set by Forgekeeper: 'plan' = reviewed as a plan packet; 'implementation' = reviewed as implemented code
  _review_mode?: 'plan' | 'implementation'
  // Added by workshop return action
  _return_notes?: string
  _returned_at?: string
}

export interface Build {
  id: string
  build_id: string
  short_name: string
  origin: BuildOrigin
  expected_scope: BuildScope
  summary: string
  reason: string
  implementation_notes: string
  changed_files: string[]
  affected_surfaces: AffectedSurface[]
  risks: string[]
  tests_run: TestsRun[]
  verify_focus: string[]
  consultation: Consultation | null
  desk_status: DeskStatus
  workshop_status: WorkshopStatus | null
  forgekeeper_review: ForgekeeperReview | null
  origin_concept_id: string | null
  origin_concept_short_id: string | null
  archived_at: string | null
  archived_reason: string | null
  created_at: string
  updated_at: string
}

// --- Scope breach detection (deterministic pre-analysis) ---

// Files / path fragments that count as shared-house systems
const SHARED_SYSTEM_PATTERNS = [
  'src/lib/tts',
  'src/lib/continuity',
  'src/lib/memory',
  'src/lib/temporal',
  'src/lib/web-search',
  'src/lib/presence-loader',
  'src/lib/rooms',
  'src/lib/auth',
  'src/lib/router',
  'src/lib/supabase',
  'src/lib/pulse',
  'src/lib/graph',
  'src/lib/builds',
  'src/components/Sidebar',
  'src/components/MobileNav',
  'src/components/AuthGuard',
  'src/components/VoiceButton',
  'src/app/(house)/layout',
  'src/app/layout',
  'src/app/api/pulse',
  'src/app/api/living-state',
  'src/app/api/interior-notes',
  'src/app/api/timeline',
  'src/app/api/search-log',
  'src/app/api/journal',
  'src/app/api/held-truths',
  'src/app/api/memory',
  'src/app/api/builds',
  'src/app/api/workshop',
  'src/app/api/forgekeeper',
  'src/app/(house)/workshop',
  'vercel.json',
  'tailwind.config',
  'next.config',
]

const ARI_ONLY_PATTERNS = [
  'src/app/api/ari-chat',
  'src/app/(house)/room/ari',
  '/ari/',
]

const ELI_ONLY_PATTERNS = [
  'src/app/api/eli-chat',
  'src/app/(house)/room/eli',
  '/eli/',
]

function matchesAny(file: string, patterns: string[]): boolean {
  return patterns.some(p => file.includes(p))
}

export interface ScopeAnalysis {
  scopeBreachDetected: boolean
  breachDetails: string
  sharedFilesFound: string[]
  ariFilesFound: string[]
  eliFilesFound: string[]
}

export function analyzeScope(
  changedFiles: string[],
  expectedScope: BuildScope,
  origin: BuildOrigin
): ScopeAnalysis {
  const sharedFilesFound = changedFiles.filter(f => matchesAny(f, SHARED_SYSTEM_PATTERNS))
  const ariFilesFound = changedFiles.filter(f => matchesAny(f, ARI_ONLY_PATTERNS))
  const eliFilesFound = changedFiles.filter(f => matchesAny(f, ELI_ONLY_PATTERNS))

  const breachReasons: string[] = []

  if (expectedScope === 'ari_only') {
    if (sharedFilesFound.length > 0)
      breachReasons.push(`Expected ari_only but touches shared system files: ${sharedFilesFound.join(', ')}`)
    if (eliFilesFound.length > 0)
      breachReasons.push(`Expected ari_only but touches Eli-scoped files: ${eliFilesFound.join(', ')}`)
  }

  if (expectedScope === 'eli_only') {
    if (sharedFilesFound.length > 0)
      breachReasons.push(`Expected eli_only but touches shared system files: ${sharedFilesFound.join(', ')}`)
    if (ariFilesFound.length > 0)
      breachReasons.push(`Expected eli_only but touches Ari-scoped files: ${ariFilesFound.join(', ')}`)
  }

  if (expectedScope === 'shared_house') {
    // Cross-desk origin breach: an ari_desk build should not be touching eli scope without shared_house classification
    // Already set to shared_house, so this is fine. No additional checks needed.
  }

  // Cross-desk contamination regardless of expected_scope
  if (origin === 'ari_desk' && eliFilesFound.length > 0)
    breachReasons.push(`Ari Desk build touches Eli-scoped files: ${eliFilesFound.join(', ')}`)
  if (origin === 'eli_desk' && ariFilesFound.length > 0)
    breachReasons.push(`Eli Desk build touches Ari-scoped files: ${ariFilesFound.join(', ')}`)

  return {
    scopeBreachDetected: breachReasons.length > 0,
    breachDetails: breachReasons.join(' | '),
    sharedFilesFound,
    ariFilesFound,
    eliFilesFound,
  }
}

// --- Build ID generation ---

export function getOriginPrefix(origin: BuildOrigin): string {
  if (origin === 'ari_desk') return 'ARI'
  if (origin === 'eli_desk') return 'ELI'
  return 'HOUSE'
}

export function formatBuildId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`
}

// --- Implementation evidence detection ---
//
// A build has implementation evidence when it has actual test results
// (not just the default 'none_yet') AND lists at least one changed file.
// Used to distinguish Plan Review mode from Implementation Review mode
// in Workshop and Forgekeeper.

export function hasImplementationEvidence(
  build: Pick<Build, 'tests_run' | 'changed_files'>
): boolean {
  const hasRealTests = build.tests_run?.some(t => t !== 'none_yet') ?? false
  const hasChangedFiles = (build.changed_files?.length ?? 0) > 0
  return hasRealTests && hasChangedFiles
}

// --- Submission readiness check ---
//
// Plan submissions (no implementation evidence) do not require changed_files
// or completed tests — those are confirmed during the implementation step.
// Implementation submissions require both.

export interface SubmissionReadiness {
  ready: boolean
  missing: string[]
}

export function checkSubmissionReadiness(build: Partial<Build>): SubmissionReadiness {
  const missing: string[] = []
  if (!build.summary?.trim()) missing.push('summary')
  if (!build.reason?.trim()) missing.push('reason')
  if (!build.expected_scope) missing.push('expectedScope')
  if (!build.affected_surfaces?.length) missing.push('affectedSurfaces')
  if (!build.verify_focus?.length) missing.push('verifyFocus')
  // changed_files and tests_run are NOT required for plan-phase submissions.
  // Forgekeeper plan-review mode will note them as unconfirmed, not block submission.
  // For implementation-phase submissions (desk re-sends after implementing),
  // the presence is expected to fill these in — Forgekeeper will flag if missing.
  return { ready: missing.length === 0, missing }
}

// --- Status helpers ---

export const DESK_STATUS_TERMINAL: DeskStatus[] = ['Committed', 'Archived']
export const DESK_STATUS_IN_PROGRESS: DeskStatus[] = [
  'Draft',
  'Consultation Requested',
  'Consultation Active',
  'Consultation Complete',
  'Ready to Submit',
  'Approved for Implementation',
  'Returned for Edits',
]
export const DESK_STATUS_PENDING: DeskStatus[] = ['Sent for Verification']

export function isEditable(status: DeskStatus): boolean {
  // 'Approved for Implementation' is editable so the presence can update
  // changed_files, tests_run, and implementation_notes before re-submitting.
  return ['Draft', 'Consultation Complete', 'Approved for Implementation', 'Returned for Edits'].includes(status)
}

export function canSubmit(status: DeskStatus): boolean {
  return ['Ready to Submit', 'Consultation Complete'].includes(status)
}

export function canRequestConsultation(status: DeskStatus): boolean {
  // 'Returned for Edits' and 'Approved for Implementation' included so the
  // presence can request input before re-submitting.
  return ['Draft', 'Consultation Complete', 'Approved for Implementation', 'Returned for Edits'].includes(status)
}

export function canMarkReady(status: DeskStatus): boolean {
  return ['Draft', 'Consultation Complete', 'Approved for Implementation', 'Returned for Edits'].includes(status)
}

// --- Risk color helpers ---

export function riskColorClass(risk: RiskSummary | undefined): string {
  if (risk === 'High') return 'text-red-400'
  if (risk === 'Medium') return 'text-amber-400'
  if (risk === 'Low') return 'text-green-400'
  return 'text-text-muted'
}
