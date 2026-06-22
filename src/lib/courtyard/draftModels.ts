// Courtyard — Gaming Wing · Phase 1B
// Shared, side-effect-free whitelist for the three draft preview models.
// Safe to import from both server (API route) and client (viewer): contains no
// node/server-only imports.
//
// These are DRAFT VISUAL CANDIDATES ONLY. Nothing here grants approval, canon,
// memory, truth, archive, identity authority, or approved asset status.

export type CourtyardCharacterId = 'ari' | 'eli' | 'tara'

/** Which local draft file to preview: the original, or the Blender-fixed copy. */
export type CourtyardVariant = 'draft' | 'fixed'

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
}

export const COURTYARD_DRAFT_MODELS: Record<CourtyardCharacterId, CourtyardDraftModel> = {
  ari: {
    id: 'ari',
    displayName: 'Ari',
    fileName: 'Ari-draft.glb',
    fixedFileName: 'Ari-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
  eli: {
    id: 'eli',
    displayName: 'Eli',
    fileName: 'Eli-draft.glb',
    fixedFileName: 'Eli-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
  tara: {
    id: 'tara',
    displayName: 'Tara',
    fileName: 'Tara-draft.glb',
    fixedFileName: 'Tara-draft-fixed.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
}

export const COURTYARD_CHARACTER_IDS: CourtyardCharacterId[] = ['ari', 'eli', 'tara']

export function isCourtyardCharacterId(value: string): value is CourtyardCharacterId {
  return value === 'ari' || value === 'eli' || value === 'tara'
}

export function isCourtyardVariant(value: string): value is CourtyardVariant {
  return value === 'draft' || value === 'fixed'
}

/** Resolve the exact on-disk filename for a character + variant. */
export function courtyardModelFileName(id: CourtyardCharacterId, variant: CourtyardVariant): string {
  const m = COURTYARD_DRAFT_MODELS[id]
  return variant === 'fixed' ? m.fixedFileName : m.fileName
}

/** Same-origin API path that streams the model for a given character + variant. */
export function draftModelApiPath(id: CourtyardCharacterId, variant: CourtyardVariant = 'draft'): string {
  return `/api/courtyard/draft-model/${id}${variant === 'fixed' ? '?variant=fixed' : ''}`
}
