// Courtyard — Gaming Wing · Phase 1B
// Private, auth-gated (via (house) layout AuthGuard), local, read-only 3D draft
// preview lab. Renders draft visual candidates only. Creates no memory, canon,
// truth, archive, identity authority, or approved asset status.

import CourtyardPreviewLoader from '@/components/courtyard/CourtyardPreviewLoader'

export default function CourtyardPreviewPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Persistent draft-only governance banner */}
      <div className="px-4 py-3 border-b border-house-border bg-house-bg">
        <h1 className="font-body text-sm text-text-secondary">
          Courtyard — Draft Model Preview Lab
        </h1>
        <p className="font-body text-[11px] text-text-muted mt-1 max-w-3xl">
          3D draft models are preview-only visual assets. They do not create memory, canon,
          truth, archive, identity authority, or approved asset status.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <CourtyardPreviewLoader />
      </div>
    </div>
  )
}
