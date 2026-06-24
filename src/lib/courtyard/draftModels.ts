// Courtyard — Gaming Wing · Phase 1B / 1D
// Shared, side-effect-free whitelist for the Courtyard preview models.
// Safe to import from both server (API route) and client (viewer): contains no
// node/server-only imports.
//
// These are DRAFT VISUAL CANDIDATES ONLY. Nothing here grants approval, canon,
// memory, truth, archive, identity authority, or approved asset status.

export type CourtyardCharacterId = 'ari' | 'eli' | 'tara'

/** Base variant: the original draft file, or the Blender-fixed copy. */
export type CourtyardVariant = 'draft' | 'fixed'

/**
 * A preview-only candidate file for a single character (e.g. a Phase 1D
 * regeneration candidate). Local-preview only — never approval/canon.
 * The `id` is the variant token accepted by the API; `fileName` is the exact,
 * whitelisted on-disk name in gaming-assets/drafts/ (case-sensitive).
 */
export interface CourtyardCandidate {
  id: string
  label: string
  fileName: string
}

export interface CourtyardDraftModel {
  id: CourtyardCharacterId
  /** Display label for the UI. */
  displayName: string
  /** Exact on-disk filename in gaming-assets/drafts/ (case-sensitive). */
  fileName: string
  /** Exact on-disk filename of the Blender-fixed copy (case-sensitive). */
  fixedFileName: string
  /** Fixed, non-authoritative status label. */
  status: 'draft visual candidate'
  /** Provenance note shown in the UI. */
  source: 'external 3D model generator'
  /** Optional preview-only candidate files for THIS character only. */
  candidates?: CourtyardCandidate[]
}

export const COURTYARD_DRAFT_MODELS: Record<CourtyardCharacterId, CourtyardDraftModel> = {
  ari: {
    id: 'ari',
    displayName: 'Ari',
    fileName: 'Ari-draft.glb',
    fixedFileName: 'Ari-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
    candidates: [
      {
        id: 'run1-candidate-01',
        label: 'Ari Run 1 Candidate 01 — local preview only',
        fileName: 'Ari-run1-candidate-01.glb',
      },
      {
        id: 'run1-candidate-01-optimised',
        label: 'Ari Run 1 Candidate 01 optimised — local preview only',
        fileName: 'Ari-run1-candidate-01-optimised.glb',
      },
    ],
  },
  eli: {
    id: 'eli',
    displayName: 'Eli',
    fileName: 'Eli-draft.glb',
    fixedFileName: 'Eli-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
    candidates: [
      {
        id: 'run1-candidate-01',
        label: 'Eli Run 1 Candidate 01 — local preview only',
        fileName: 'Eli-run1-candidate-01.glb',
      },
    ],
  },
  tara: {
    id: 'tara',
    displayName: 'Tara',
    fileName: 'Tara-draft.glb',
    fixedFileName: 'Tara-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
    candidates: [
      {
        id: 'run1-candidate-01',
        label: 'Tara Run 1 Candidate 01 — local preview only',
        fileName: 'Tara-run1-candidate-01.glb',
      },
    ],
  },
}

export const COURTYARD_CHARACTER_IDS: CourtyardCharacterId[] = ['ari', 'eli', 'tara']

export function isCourtyardCharacterId(value: string): value is CourtyardCharacterId {
  return value === 'ari' || value === 'eli' || value === 'tara'
}

export function isCourtyardBaseVariant(value: string): value is CourtyardVariant {
  return value === 'draft' || value === 'fixed'
}

/**
 * Resolve the exact on-disk filename for a character + variant token.
 * Accepts only 'draft', 'fixed', or one of THIS character's whitelisted
 * candidate ids. Returns null for anything else (→ caller responds 404).
 * Arbitrary filenames / paths can never resolve here.
 */
export function courtyardModelFileName(id: CourtyardCharacterId, variant: string): string | null {
  const m = COURTYARD_DRAFT_MODELS[id]
  if (variant === 'draft') return m.fileName
  if (variant === 'fixed') return m.fixedFileName
  const candidate = m.candidates?.find((c) => c.id === variant)
  return candidate ? candidate.fileName : null
}

/** Variant options to show in the viewer for a given character (base + candidates). */
export function courtyardVariantOptions(id: CourtyardCharacterId): { id: string; label: string }[] {
  const m = COURTYARD_DRAFT_MODELS[id]
  const opts = [
    { id: 'draft', label: 'Original draft' },
    { id: 'fixed', label: 'Blender fixed copy — local draft only' },
  ]
  for (const c of m.candidates ?? []) opts.push({ id: c.id, label: c.label })
  return opts
}

/** Same-origin API path that streams the model for a given character + variant. */
export function draftModelApiPath(id: CourtyardCharacterId, variant: string = 'draft'): string {
  return `/api/courtyard/draft-model/${id}${variant === 'draft' ? '' : `?variant=${encodeURIComponent(variant)}`}`
}
