'use client'

// Phase 37E — Governance banner for the Relational Map.
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.

export default function RelationalMapGovernanceBanner() {
  return (
    <div className="
      flex items-start gap-3 px-4 py-3
      bg-house-surface/60 border border-house-border rounded-lg
      text-text-muted text-xs font-body leading-relaxed
    ">
      <span className="text-sm mt-0.5 shrink-0 opacity-60">ⓘ</span>
      <div>
        <p>
          Graph canvas from approved graph proposals.
          This is graph structure, not Memory and not Archive authority.
        </p>
        <p className="mt-1 opacity-70">
          Workspace layout is visual metadata only. Dragging does not mutate graph meaning.
          Provenance and supporting records are available in the inspector.
        </p>
      </div>
    </div>
  )
}
