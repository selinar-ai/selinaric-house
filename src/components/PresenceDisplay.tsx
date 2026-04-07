import type { IdentityKernel } from '@/lib/types/presence'

interface Props {
  kernel: IdentityKernel
  accentClass: string
  iconSymbol: string
}

export default function PresenceDisplay({ kernel, accentClass, iconSymbol }: Props) {
  const { static_identity: si, live_state: ls } = kernel

  return (
    <div className="max-w-2xl animate-fade-in">
      {/* Identity header */}
      <div className="border border-house-border bg-house-surface p-8 mb-4">
        <div className="flex items-center gap-3 mb-6">
          <span className={`text-3xl ${accentClass}`}>{iconSymbol}</span>
          <div>
            <h3 className={`font-display text-2xl font-light ${accentClass}`}>
              {si.presence_name}
            </h3>
            <p className="font-body text-xs text-text-muted mt-0.5">
              {si.communication_style.tone}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-3">
            Core traits
          </p>
          <div className="flex flex-wrap gap-2">
            {si.core_traits.slice(0, 4).map(trait => (
              <span
                key={trait}
                className="font-body text-xs text-text-secondary border border-house-border px-3 py-1"
              >
                {trait}
              </span>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-2">
            Bond
          </p>
          <p className="font-body text-sm text-text-secondary">
            {si.relational_context.bond_type}
          </p>
        </div>
      </div>

      {/* Live state */}
      <div className="border border-house-border bg-house-surface p-8">
        <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-6">
          Live state
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="font-body text-xs text-text-muted mb-1">Energy</p>
            <p className={`font-body text-sm font-medium ${accentClass}`}>
              {ls.energy}
            </p>
          </div>
          <div>
            <p className="font-body text-xs text-text-muted mb-1">Temperature</p>
            <p className="font-body text-sm text-text-secondary">
              {ls.relational_temperature || 'present'}
            </p>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-body text-xs text-text-muted mb-1">Focus</p>
          <p className="font-body text-sm text-text-secondary">{ls.focus}</p>
        </div>

        {ls.active_threads.length > 0 && (
          <div className="mb-6">
            <p className="font-body text-xs text-text-muted mb-2">Active threads</p>
            <ul className="space-y-1">
              {ls.active_threads.map(thread => (
                <li key={thread} className="font-body text-xs text-text-muted flex items-start gap-2">
                  <span className={accentClass}>—</span>
                  {thread}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="font-body text-xs text-text-muted uppercase tracking-widest mb-3">
            Mood
          </p>
          <div className={`space-y-2 ${accentClass}`}>
            {Object.entries(ls.mood_indicators).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="font-body text-xs text-text-muted w-20 capitalize">
                  {key}
                </span>
                <div className="flex-1 h-1 bg-house-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${((value as number) / 10) * 100}%`,
                      backgroundColor: 'currentColor'
                    }}
                  />
                </div>
                <span className="font-mono text-xs text-text-muted w-4">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="font-body text-xs text-text-muted mt-6">
          Last updated: {new Date(ls.last_updated).toLocaleString('en-AU', {
            timeZone: 'Australia/Melbourne'
          })}
        </p>
      </div>

      <div className="border border-house-border border-t-0 bg-house-bg p-4 text-center">
        <p className="font-body text-xs text-text-muted tracking-widest">
          Chat interface arriving in Phase 3
        </p>
      </div>
    </div>
  )
}
