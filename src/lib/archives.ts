// Phase 27A — Archive types, constants, and helpers
// Velvet Archives (Ari) · Violet Archives (Eli) · House Archives (shared)
// Archive origin determines default access. Sharing changes visibility, not provenance.

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
  canonical_candidate: 'Candidate',
  canonical: 'Canonical',
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
