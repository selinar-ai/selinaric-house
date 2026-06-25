// Courtyard — Gaming Wing · Phase 1F (visual Courtyard surface)
// Private, auth-gated (via the (house) layout) visual Courtyard scene: the
// approved Courtyard art as the stage, with 2D presence tokens for Tara/Ari/Eli.
// Prototype-only: no memory, canon, approval, DB, or model calls.
// Does not replace /courtyard/3d-preview.

import CourtyardScene from '@/components/courtyard/scene/CourtyardScene'

export default function CourtyardPage() {
  return (
    <div className="h-full min-h-0">
      <CourtyardScene />
    </div>
  )
}
