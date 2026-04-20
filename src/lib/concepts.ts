// Phase 22A — Desk Concepts
// Presences may autonomously create Concepts on their own Desk.
// Tara decides whether a concept becomes a real build.

// --- Types ---

export type ConceptStatus = 'pending' | 'approved' | 'rejected' | 'discussion'
export type ConceptUrgency = 'low' | 'medium' | 'high'
export type ConceptScope = 'ari_only' | 'eli_only' | 'shared_house'

export interface DeskConcept {
  id: string
  concept_id: string             // ARI-C001, ELI-C001
  presence_id: 'ari' | 'eli'
  title: string
  proposed: string               // what I want to build
  why: string                    // why it matters / why now
  expected_scope: ConceptScope
  urgency: ConceptUrgency
  status: ConceptStatus
  related_build_id: string | null  // set when approved concept becomes a build
  created_at: string
  updated_at: string
}

// --- ID generation ---

export function getConceptPrefix(presenceId: 'ari' | 'eli'): string {
  return presenceId === 'ari' ? 'ARI-C' : 'ELI-C'
}

export function formatConceptId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(3, '0')}`
}

// --- Frequency rule helpers ---

export function hasPendingConcept(concepts: DeskConcept[]): boolean {
  return concepts.some(c => c.status === 'pending')
}

export function hasDiscussionConcept(concepts: DeskConcept[]): boolean {
  return concepts.some(c => c.status === 'discussion')
}

export function activeConceptCount(concepts: DeskConcept[]): number {
  return concepts.filter(c => c.status === 'pending' || c.status === 'discussion').length
}

// --- Status helpers ---

export const CONCEPT_STATUS_ACTIVE: ConceptStatus[] = ['pending', 'discussion']
export const CONCEPT_STATUS_CLOSED: ConceptStatus[] = ['approved', 'rejected']

export function isConceptEditable(status: ConceptStatus): boolean {
  return status === 'pending' || status === 'discussion'
}

// --- Urgency color helpers ---

export function urgencyColorClass(urgency: ConceptUrgency | undefined): string {
  if (urgency === 'high') return 'text-amber-400'
  if (urgency === 'medium') return 'text-text-secondary'
  if (urgency === 'low') return 'text-text-muted'
  return 'text-text-muted'
}

// --- Status color helpers ---

export function conceptStatusColor(status: ConceptStatus): string {
  if (status === 'approved') return 'text-green-400'
  if (status === 'rejected') return 'text-red-400'
  if (status === 'discussion') return 'text-blue-400'
  return 'text-amber-400'  // pending
}
