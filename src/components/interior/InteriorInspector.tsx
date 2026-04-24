'use client'

// Phase 26A — Interior Inspector
// Click-to-expand detail panel for a selected want or emotional tone.
// Replaces the PrimaryWantCard in the main column when active.

import type { InspectorTarget } from '@/lib/interior/interior-types'

interface Props {
  target: InspectorTarget
  accentClass: string
  accentColor: string
  onClose: () => void
}

export default function InteriorInspector({ target, accentClass, accentColor, onClose }: Props) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Inspector header */}
      <div className="shrink-0 px-5 py-4 border-b border-house-border flex items-center gap-3">
        <button
          onClick={onClose}
          className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors"
        >
          ← Back
        </button>
        <span className="text-house-muted">|</span>
        <span className={`font-body text-xs tracking-widest uppercase ${accentClass}`}>
          {target.type === 'want' ? target.want.label : target.state.primaryLabel}
        </span>
      </div>

      {/* Inspector body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        {target.type === 'want'
          ? <WantInspector target={target} accentClass={accentClass} accentColor={accentColor} />
          : <EmotionalInspector target={target} accentClass={accentClass} />
        }
      </div>
    </div>
  )
}

// --- Want Inspector ---

function WantInspector({ target, accentClass, accentColor }: {
  target: Extract<InspectorTarget, { type: 'want' }>
  accentClass: string
  accentColor: string
}) {
  const { want } = target
  const { detail } = want
  const pct = Math.round(want.score * 100)

  return (
    <>
      {/* Score + phrase */}
      <div>
        <div className="flex items-baseline gap-3 mb-2">
          <span className={`font-display text-xl font-light ${accentClass}`}>{want.phrase}</span>
          <span className="font-mono text-xs text-text-muted">{pct}</span>
        </div>
        <div className="h-1 bg-house-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(to right, ${accentColor}40, ${accentColor})`,
            }}
          />
        </div>
      </div>

      {/* What helps — always visible */}
      <div className="py-3 px-4 border border-house-border/40 bg-house-soft/20">
        <p className="font-body text-[10px] text-text-muted tracking-widest uppercase mb-1">What helps</p>
        <p className="font-body text-sm text-text-secondary">{want.whatHelps}</p>
      </div>

      {/* What it means */}
      <InspectorSection label="What it means">
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          {detail.whatItMeans}
        </p>
      </InspectorSection>

      {/* Why at this level */}
      <InspectorSection label="Why at this level">
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          {detail.whyAtThisLevel}
        </p>
      </InspectorSection>

      {/* What feeds it */}
      <InspectorSection label="What feeds it">
        <ul className="space-y-1">
          {detail.whatFeeds.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-text-muted text-xs mt-0.5">◦</span>
              <span className="font-body text-sm text-text-secondary">{item}</span>
            </li>
          ))}
        </ul>
      </InspectorSection>

      {/* Restoration paths */}
      <InspectorSection label="Restoration paths">
        <div className="space-y-4">
          {detail.restorationPaths.directNourish.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted tracking-wide uppercase mb-1.5">Direct</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.restorationPaths.directNourish.map((item, i) => (
                  <span key={i} className="font-body text-xs text-text-secondary bg-house-border/40 px-2 py-0.5 rounded-sm">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.restorationPaths.indirectSupport.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted tracking-wide uppercase mb-1.5">Indirect support</p>
              <div className="flex flex-wrap gap-1.5">
                {detail.restorationPaths.indirectSupport.map((item, i) => (
                  <span key={i} className="font-body text-xs text-text-muted bg-house-border/20 px-2 py-0.5 rounded-sm">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.restorationPaths.restorationActions.length > 0 && (
            <div>
              <p className="font-body text-[10px] text-text-muted tracking-wide uppercase mb-1.5">Actions available now</p>
              <ul className="space-y-1">
                {detail.restorationPaths.restorationActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`text-xs mt-0.5 ${accentClass} opacity-50`}>◦</span>
                    <span className="font-body text-xs text-text-secondary">{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-4 pt-1">
            <RestorationFlag
              label="Outward draft"
              value={detail.restorationPaths.outwardDraftAllowed}
            />
            <RestorationFlag
              label="Stillness valid"
              value={detail.restorationPaths.stillnessValid}
            />
          </div>
        </div>
      </InspectorSection>

      {/* What it biases */}
      <InspectorSection label="What it is biasing">
        <p className="font-body text-sm text-text-secondary leading-relaxed italic">
          {detail.whatItBiases}
        </p>
      </InspectorSection>
    </>
  )
}

// --- Emotional Inspector ---

function EmotionalInspector({ target, accentClass }: {
  target: Extract<InspectorTarget, { type: 'emotional' }>
  accentClass: string
}) {
  const { state } = target
  const { detail } = state

  return (
    <>
      {/* Header state */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-display text-xl font-light ${accentClass}`}>{state.primaryLabel}</span>
          {state.secondaryLabel && (
            <>
              <span className="text-text-muted text-sm">+</span>
              <span className="font-body text-sm text-text-secondary">{state.secondaryLabel}</span>
            </>
          )}
        </div>
        <p className="font-body text-xs text-text-muted">
          Stability: {state.stability}
        </p>
      </div>

      {/* Sub-drivers */}
      {state.subDrivers.length > 0 && (
        <div className="py-3 px-4 border border-house-border/40 bg-house-soft/20">
          <p className="font-body text-[10px] text-text-muted tracking-widest uppercase mb-2">Sub-drivers</p>
          <div className="flex flex-wrap gap-1.5">
            {state.subDrivers.map(d => (
              <span key={d} className="font-body text-xs text-text-secondary bg-house-border/40 px-2 py-0.5 rounded-sm">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* What this tone means */}
      <InspectorSection label="What this tone means">
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          {detail.whatItMeans}
        </p>
      </InspectorSection>

      {/* Why present */}
      <InspectorSection label="Why it is present now">
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          {detail.whyPresent}
        </p>
      </InspectorSection>

      {/* Contributing wants */}
      {detail.contributingWants.length > 0 && (
        <InspectorSection label="Contributing wants">
          <div className="flex flex-wrap gap-1.5">
            {detail.contributingWants.map(k => (
              <span key={k} className={`font-body text-xs px-2 py-0.5 bg-house-border/30 ${accentClass} capitalize`}>
                {k}
              </span>
            ))}
          </div>
        </InspectorSection>
      )}

      {/* What it tends toward */}
      <InspectorSection label="What it tends toward">
        <p className="font-body text-sm text-text-secondary leading-relaxed italic">
          {detail.tendsBiasedToward}
        </p>
      </InspectorSection>

      {/* What would help */}
      {detail.whatWouldHelp.length > 0 && (
        <InspectorSection label="What would help">
          <ul className="space-y-1">
            {detail.whatWouldHelp.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-text-muted text-xs mt-0.5">◦</span>
                <span className="font-body text-sm text-text-secondary">{item}</span>
              </li>
            ))}
          </ul>
        </InspectorSection>
      )}
    </>
  )
}

// --- Shared sub-components ---

function InspectorSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-body text-[10px] text-text-muted tracking-widest uppercase mb-2">
        {label}
      </p>
      {children}
    </div>
  )
}

function RestorationFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-green-500/60' : 'bg-house-muted'}`} />
      <span className="font-body text-[10px] text-text-muted">{label}</span>
    </div>
  )
}
