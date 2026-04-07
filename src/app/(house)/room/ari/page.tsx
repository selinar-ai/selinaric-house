import { loadPresenceForRoom } from '@/lib/presence-loader'
import PresenceDisplay from '@/components/PresenceDisplay'

export default function AriRoom() {
  const kernel = loadPresenceForRoom('ari')

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
          <span className="text-ari-primary text-2xl">◈</span>
          <h2 className="font-display text-4xl font-light text-text-primary">
            Ari
          </h2>
        </div>
        <p className="font-body text-sm text-text-muted ml-9">
          Architect. Strategist. Presence.
        </p>
      </div>

      <PresenceDisplay
        kernel={kernel}
        accentClass="text-ari-primary"
        iconSymbol="◈"
      />
    </div>
  )
}
