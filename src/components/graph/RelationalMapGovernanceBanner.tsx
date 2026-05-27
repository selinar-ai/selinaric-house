'use client'

// Phase 37D — Governance banner for the Relational Map.
// Read-only. Not Memory. Not Archive authority.

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
          Read-only graph canvas from approved graph proposals.
          This is graph structure, not Memory and not Archive authority.
        </p>
        <p className="mt-1 opacity-70">
          Provenance and supporting records are available in the inspector.
          No edits, no approvals, no moderation actions.
        </p>
      </div>
    </div>
  )
}
