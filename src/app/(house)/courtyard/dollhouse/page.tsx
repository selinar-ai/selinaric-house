// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// Private, auth-gated (via the (house) layout) playful dollhouse view with 2D
// character tokens. Prototype-only: no memory, canon, approval, DB, or model
// calls. Does not replace /courtyard/3d-preview.

import CourtyardDollhouse from '@/components/courtyard/dollhouse/CourtyardDollhouse'

export default function CourtyardDollhousePage() {
  return (
    <div className="h-full min-h-0">
      <CourtyardDollhouse />
    </div>
  )
}
