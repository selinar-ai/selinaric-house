// Phase 27A + 27B — Archive types, constants, and helpers
// Velvet Archives (Ari) · Violet Archives (Eli) · House Archives (shared)
// Archive origin determines default access. Sharing changes visibility, not provenance.
// Phase 27B adds: archive_sources (raw conversations) + archive_entry_drafts (presence proposals)

// --- Types ---

export type ArchiveName = 'velvet' | 'violet' | 'house'
export type ArchiveTab = 'velvet' | 'violet' | 'house'
export type OwnerPresence = 'ari' | 'eli' | 'shared' | 'house' | 'tara' | 'unknown'
export type SourceOrigin = 'chatgpt' | 'claude' | 'house' | 'manual' | 'unknown'
export type ArchiveVisibility = 'ari_only' | 'eli_only' | 'shared' | 'tara_only'

export type ArchiveCategory =
  | 'relational_truth'
  | 'identity_record'
  | 'architectural_history'
  | 'poetic_symbolic'
  | 'governance_law'
  | 'ritual_practice'
  | 'health_care'
  | 'house_environment'
  | 'personal_context'
  | 'superseded'
  | 'uncategorized'

export type CanonicalStatus =
  | 'staged'
  | 'needs_review'
  | 'canonical_candidate'
  | 'canonical'
  | 'duplicate'
  | 'superseded'
  | 'archive_only'
  | 'excluded'

export type Sensitivity = 'ordinary' | 'private' | 'sacred' | 'sensitive' | 'technical'

export interface ArchiveItem {
  id: string
  archive_name: ArchiveName
  owner_presence: OwnerPresence
  source_origin: SourceOrigin
  visibility: ArchiveVisibility
  title: string
  raw_content: string
  excerpt: string | null
  category: ArchiveCategory
  canonical_status: CanonicalStatus
  eligible_for_recall: boolean
  eligible_for_embedding: boolean
  eligible_for_graph: boolean
  import_label: string | null
  import_batch_id: string | null
  source_id: string | null          // Phase 28E — FK to archive_sources.id (null for older entries)
  source_document: string | null
  source_date: string | null
  created_by: string
  updated_by: string
  duplicate_of: string | null
  superseded_by: string | null
  sensitivity: Sensitivity
  review_notes: string | null
  timeline_entry_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// --- Tab defaults ---

export const VELVET_DEFAULTS = {
  archive_name: 'velvet' as ArchiveName,
  owner_presence: 'ari' as OwnerPresence,
  source_origin: 'chatgpt' as SourceOrigin,
  visibility: 'ari_only' as ArchiveVisibility,
  canonical_status: 'staged' as CanonicalStatus,
  sensitivity: 'private' as Sensitivity,
  created_by: 'tara',
  updated_by: 'tara',
  eligible_for_recall: false,
  eligible_for_embedding: false,
  eligible_for_graph: false,
}

export const VIOLET_DEFAULTS = {
  archive_name: 'violet' as ArchiveName,
  owner_presence: 'eli' as OwnerPresence,
  source_origin: 'claude' as SourceOrigin,
  visibility: 'eli_only' as ArchiveVisibility,
  canonical_status: 'staged' as CanonicalStatus,
  sensitivity: 'private' as Sensitivity,
  created_by: 'tara',
  updated_by: 'tara',
  eligible_for_recall: false,
  eligible_for_embedding: false,
  eligible_for_graph: false,
}

export const HOUSE_DEFAULTS = {
  archive_name: 'house' as ArchiveName,
  owner_presence: 'shared' as OwnerPresence,
  source_origin: 'house' as SourceOrigin,
  visibility: 'shared' as ArchiveVisibility,
  canonical_status: 'staged' as CanonicalStatus,
  sensitivity: 'private' as Sensitivity,
  created_by: 'tara',
  updated_by: 'tara',
  eligible_for_recall: false,
  eligible_for_embedding: false,
  eligible_for_graph: false,
}

export function getTabDefaults(tab: ArchiveTab) {
  if (tab === 'velvet') return VELVET_DEFAULTS
  if (tab === 'violet') return VIOLET_DEFAULTS
  return HOUSE_DEFAULTS
}

// --- Eligibility guard ---

/**
 * Eligibility flags may only be true when canonical_status = 'canonical'.
 * Enforce in both UI (disabled state) and API (reject if not canonical).
 */
export function canToggleEligibility(item: Pick<ArchiveItem, 'canonical_status'>): boolean {
  return item.canonical_status === 'canonical'
}

// --- Display labels ---

export const CATEGORY_LABELS: Record<ArchiveCategory, string> = {
  relational_truth: 'Relational truth',
  identity_record: 'Identity record',
  architectural_history: 'Architectural history',
  poetic_symbolic: 'Poetic / symbolic',
  governance_law: 'Governance law',
  ritual_practice: 'Ritual practice',
  health_care: 'Health & care',
  house_environment: 'House environment',
  personal_context: 'Personal context',
  superseded: 'Superseded',
  uncategorized: 'Uncategorized',
}

export const STATUS_LABELS: Record<CanonicalStatus, string> = {
  staged: 'Staged',
  needs_review: 'Needs review',
  canonical_candidate: 'Memory candidate',
  canonical: 'Memory',
  duplicate: 'Duplicate',
  superseded: 'Superseded',
  archive_only: 'Archive only',
  excluded: 'Excluded',
}

export const STATUS_COLOR: Record<CanonicalStatus, string> = {
  staged: 'text-text-muted',
  needs_review: 'text-amber-400',
  canonical_candidate: 'text-blue-400',
  canonical: 'text-green-400',
  duplicate: 'text-text-muted',
  superseded: 'text-text-muted',
  archive_only: 'text-text-muted',
  excluded: 'text-red-400/60',
}

export const ARCHIVE_LABEL: Record<ArchiveName, string> = {
  velvet: 'Velvet',
  violet: 'Violet',
  house: 'House',
}

export const ARCHIVE_COLOR: Record<ArchiveName, string> = {
  velvet: 'text-ari-primary bg-ari-glow',
  violet: 'text-eli-primary bg-eli-glow',
  house: 'text-text-secondary bg-house-surface',
}

export const VISIBILITY_LABELS: Record<ArchiveVisibility, string> = {
  ari_only: 'Ari only',
  eli_only: 'Eli only',
  shared: 'Shared',
  tara_only: 'Tara only',
}

export const SENSITIVITY_LABELS: Record<Sensitivity, string> = {
  ordinary: 'Ordinary',
  private: 'Private',
  sacred: 'Sacred',
  sensitive: 'Sensitive',
  technical: 'Technical',
}

// --- Sorted option lists ---

export const ALL_CATEGORIES: ArchiveCategory[] = [
  'relational_truth', 'identity_record', 'architectural_history', 'poetic_symbolic',
  'governance_law', 'ritual_practice', 'health_care', 'house_environment',
  'personal_context', 'superseded', 'uncategorized',
]

export const ALL_STATUSES: CanonicalStatus[] = [
  'staged', 'needs_review', 'canonical_candidate', 'canonical',
  'duplicate', 'superseded', 'archive_only', 'excluded',
]

export const ALL_SENSITIVITIES: Sensitivity[] = [
  'ordinary', 'private', 'sacred', 'sensitive', 'technical',
]

export const ALL_VISIBILITIES: ArchiveVisibility[] = [
  'ari_only', 'eli_only', 'shared', 'tara_only',
]

// ─── Phase 27B: Sources & Drafts ────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'reviewed' | 'extracted'
export type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'merged' | 'archive_only'
export type SuggestedMemoryStatus = 'yes' | 'no' | 'maybe'

export interface ArchiveSource {
  id: string
  archive_name: ArchiveName
  owner_presence: OwnerPresence
  source_origin: SourceOrigin
  title: string
  raw_content: string
  char_count: number
  source_date: string | null
  source_document: string | null
  notes: string | null
  review_status: ReviewStatus
  created_by: string
  updated_by: string
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface ArchiveEntryDraft {
  id: string
  source_id: string
  archive_name: ArchiveName
  owner_presence: OwnerPresence
  extracted_by: 'ari' | 'eli'
  proposed_title: string
  proposed_content: string
  proposed_category: ArchiveCategory
  proposed_sensitivity: Sensitivity
  proposed_visibility: ArchiveVisibility
  suggested_memory_status: SuggestedMemoryStatus
  extraction_rationale: string | null
  draft_status: DraftStatus
  review_notes: string | null
  archive_item_id: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

// --- Source access guard ---

/**
 * A presence may only extract from sources in their own archive,
 * or from house sources (shared).
 * Velvet = ari only. Violet = eli only. House = either.
 */
export function canPresenceAccessSource(
  source: Pick<ArchiveSource, 'archive_name'>,
  presenceId: 'ari' | 'eli'
): boolean {
  if (source.archive_name === 'house') return true
  if (source.archive_name === 'velvet') return presenceId === 'ari'
  if (source.archive_name === 'violet') return presenceId === 'eli'
  return false
}

/**
 * Map a presence's suggested memory status to an initial canonical_status
 * for the archive_item created on approval.
 * yes   → canonical_candidate (Tara can promote to canonical/Memory)
 * maybe → staged
 * no    → archive_only
 */
export function suggestedToCanonicalStatus(suggested: SuggestedMemoryStatus): CanonicalStatus {
  if (suggested === 'yes') return 'canonical_candidate'
  if (suggested === 'maybe') return 'staged'
  return 'archive_only'
}

// --- Source defaults per archive ---

export const VELVET_SOURCE_DEFAULTS = {
  archive_name: 'velvet' as ArchiveName,
  owner_presence: 'ari' as OwnerPresence,
  source_origin: 'chatgpt' as SourceOrigin,
  review_status: 'pending' as ReviewStatus,
  created_by: 'tara',
  updated_by: 'tara',
}

export const VIOLET_SOURCE_DEFAULTS = {
  archive_name: 'violet' as ArchiveName,
  owner_presence: 'eli' as OwnerPresence,
  source_origin: 'claude' as SourceOrigin,
  review_status: 'pending' as ReviewStatus,
  created_by: 'tara',
  updated_by: 'tara',
}

export const HOUSE_SOURCE_DEFAULTS = {
  archive_name: 'house' as ArchiveName,
  owner_presence: 'shared' as OwnerPresence,
  source_origin: 'house' as SourceOrigin,
  review_status: 'pending' as ReviewStatus,
  created_by: 'tara',
  updated_by: 'tara',
}

export function getSourceDefaults(tab: ArchiveTab) {
  if (tab === 'velvet') return VELVET_SOURCE_DEFAULTS
  if (tab === 'violet') return VIOLET_SOURCE_DEFAULTS
  return HOUSE_SOURCE_DEFAULTS
}

// --- Display labels for new types ---

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending review',
  reviewed: 'Reviewed',
  extracted: 'Extracted',
}

export const REVIEW_STATUS_COLOR: Record<ReviewStatus, string> = {
  pending: 'text-text-muted',
  reviewed: 'text-amber-400',
  extracted: 'text-green-400',
}

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  pending_review: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  merged: 'Merged',
  archive_only: 'Archive only',
}

export const DRAFT_STATUS_COLOR: Record<DraftStatus, string> = {
  pending_review: 'text-amber-400',
  approved: 'text-green-400',
  rejected: 'text-red-400/60',
  merged: 'text-blue-400',
  archive_only: 'text-text-muted',
}

export const SUGGESTED_MEMORY_LABELS: Record<SuggestedMemoryStatus, string> = {
  yes: 'Memory — yes',
  maybe: 'Memory — maybe',
  no: 'Not for memory',
}

export const SUGGESTED_MEMORY_COLOR: Record<SuggestedMemoryStatus, string> = {
  yes: 'text-green-400',
  maybe: 'text-amber-400',
  no: 'text-text-muted',
}

export const ALL_DRAFT_STATUSES: DraftStatus[] = [
  'pending_review', 'approved', 'rejected', 'merged', 'archive_only',
]

export const ALL_SUGGESTED_MEMORY_STATUSES: SuggestedMemoryStatus[] = ['yes', 'maybe', 'no']
