// Courtyard — Gaming Wing · Living Room Spike (Phase 1H)
// Private, auth-gated (via the (house) layout), client-side play space. Separate
// from /courtyard/3d-preview, which continues to work unchanged.
//
// Prototype only: no LLM, no DB, no network writes, no background work. Nothing
// here is approval, canon, memory, or identity authority.

import CourtyardLivingRoom from '@/components/courtyard/living/CourtyardLivingRoom'

export default function CourtyardLivingRoomPage() {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-house-bg">
      <CourtyardLivingRoom />
    </div>
  )
}
