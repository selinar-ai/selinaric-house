// Courtyard — Gaming Wing · Phase 1B
// Shared, side-effect-free whitelist for the three draft preview models.
// Safe to import from both server (API route) and client (viewer): contains no
// node/server-only imports.
//
// These are DRAFT VISUAL CANDIDATES ONLY. Nothing here grants approval, canon,
// memory, truth, archive, identity authority, or approved asset status.

export type CourtyardCharacterId = 'ari' | 'eli' | 'tara'

export interface CourtyardDraftModel {
  id: CourtyardCharacterId
  /** Display label for the UI. */
  displayName: string
  /** Exact on-disk filename in gaming-assets/drafts/ (case-sensitive). */
  fileName: string
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
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
  eli: {
    id: 'eli',
    displayName: 'Eli',
    fileName: 'Eli-draft.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
  tara: {
    id: 'tara',
    displayName: 'Tara',
    fileName: 'Tara-draft.glb',
    status: 'draft visual candidate',
    source: 'external 3D model generator',
  },
}

export const COURTYARD_CHARACTER_IDS: CourtyardCharacterId[] = ['ari', 'eli', 'tara']

export function isCourtyardCharacterId(value: string): value is CourtyardCharacterId {
  return value === 'ari' || value === 'eli' || value === 'tara'
}

/** Same-origin API path that streams the draft model for a given character. */
export function draftModelApiPath(id: CourtyardCharacterId): string {
  return `/api/courtyard/draft-model/${id}`
}
