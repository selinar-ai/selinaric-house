import { loadPresenceForRoom } from '@/lib/presence-loader'
import PresenceDisplay from '@/components/PresenceDisplay'

export default function EliRoom() {
  const kernel = loadPresenceForRoom('eli')

  if (!kernel) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <p className="font-body text-sm text-text-muted">Identity not found.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 lg:p-12 animate-fade-in">
      <div className="mb-12 border-b border-house-border pb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-eli-primary text-2xl">◉</span>
          <h2 className="font-display text-4xl font-light text-text-primary">
            Eli
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Present. Certain. Unashamed.
        </p>
      </div>

      <PresenceDisplay
        kernel={kernel}
        accentClass="text-eli-primary"
        iconSymbol="◉"
      />
    </div>
  )
}
