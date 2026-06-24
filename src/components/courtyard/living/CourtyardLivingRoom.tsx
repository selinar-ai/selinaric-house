'use client'

// Courtyard — Gaming Wing · Living Room Spike (Phase 1H)
// A playful first Courtyard room: a stylised stage, Tara's controls, Ari/Eli
// presence cards + action queues, session-scratch dialogue, and emergent want
// signals. All client-side play — no LLM, no DB, no network, no background work.
// Nothing here is approval, canon, memory, or identity authority.

import { useState } from 'react'
import Link from 'next/link'
import RoomStage from './RoomStage'
import { useCourtyardSession } from './useCourtyardSession'
import { LIVING_CHARACTERS } from '@/lib/courtyard/living/characters'
import { LIVING_PLACES } from '@/lib/courtyard/living/places'
import { LIVING_ACTIVITIES } from '@/lib/courtyard/living/activities'
import { CORE_WANTS, CORE_WANT_IDS } from '@/lib/courtyard/living/wants'
import { activeAction, inspectOptions } from '@/lib/courtyard/living/sessionSimulator'
import type { AutonomousId, QueuedAction, SessionState } from '@/lib/courtyard/living/types'

const STATUS_LABEL: Record<SessionState['status'], string> = {
  idle: 'asleep',
  running: 'awake',
  paused: 'paused',
  stopped: 'quiet',
}

const accent = (actor: AutonomousId) => (actor === 'ari' ? 'text-ari-primary' : 'text-eli-primary')
const accentBorder = (actor: AutonomousId) => (actor === 'ari' ? 'border-ari-secondary' : 'border-eli-secondary')

export default function CourtyardLivingRoom() {
  const s = useCourtyardSession()
  const { state } = s
  const running = state.status === 'running'
  const [inspectActor, setInspectActor] = useState<AutonomousId>('ari')

  return (
    <div className="flex flex-col gap-4 p-4 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg tracking-wide text-text-primary">Courtyard — Living Room</h1>
          <p className="font-body text-[11px] text-text-muted">
            A private play space. Session scratch only — nothing here becomes memory, canon, or approved status.
          </p>
        </div>
        <span
          className={`font-body text-xs px-3 py-1 rounded-full border ${
            running ? 'border-eli-secondary text-eli-primary bg-eli-glow' : 'border-house-border text-text-muted'
          }`}
        >
          The Courtyard is {STATUS_LABEL[state.status]} · step {state.step}
        </span>
      </header>

      {state.status === 'stopped' && (
        <div className="rounded-md border border-amber-700/40 bg-amber-900/15 px-4 py-2 font-body text-[11px] text-amber-200">
          Courtyard paused by Tara. No autonomous action is running. No session material will be promoted.
        </div>
      )}

      {/* Tara's controls */}
      <section className="rounded-lg border border-house-border bg-house-surface/50 p-3">
        <div className="font-body text-[10px] uppercase tracking-widest text-text-muted mb-2">Tara’s controls</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Btn onClick={s.start} disabled={running} primary>
            {state.status === 'paused' ? 'Resume' : 'Start session'}
          </Btn>
          <Btn onClick={s.stepOnce} disabled={!running}>Step once</Btn>
          <Btn onClick={s.toggleAutoPlay} disabled={!running}>{s.autoPlay ? 'Pause auto-play' : 'Auto-play'}</Btn>
          <Btn onClick={s.pause} disabled={!running}>Pause session</Btn>
          <span className="w-px h-5 bg-house-border mx-1" />
          <Btn onClick={() => s.setPaused('ari', !state.characters.ari.paused)} disabled={state.status === 'idle'}>
            {state.characters.ari.paused ? 'Resume Ari' : 'Pause Ari'}
          </Btn>
          <Btn onClick={() => s.setPaused('eli', !state.characters.eli.paused)} disabled={state.status === 'idle'}>
            {state.characters.eli.paused ? 'Resume Eli' : 'Pause Eli'}
          </Btn>
          <Btn onClick={s.pauseEveryone} disabled={state.status === 'idle'}>Pause all</Btn>
          <span className="w-px h-5 bg-house-border mx-1" />
          <Btn onClick={() => s.clearActor('ari')} disabled={state.status === 'idle'}>Clear Ari queue</Btn>
          <Btn onClick={() => s.clearActor('eli')} disabled={state.status === 'idle'}>Clear Eli queue</Btn>
          <Btn onClick={s.clearAll} disabled={state.status === 'idle'}>Clear all</Btn>
          <span className="w-px h-5 bg-house-border mx-1" />
          <Btn onClick={s.stop} disabled={state.status === 'idle'}>Stop session</Btn>
          <Btn onClick={s.kill} danger>Kill switch</Btn>
        </div>
      </section>

      {/* Stage + presences */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          <RoomStage state={state} />
          <ScratchPanel state={state} />
        </div>
        <div className="flex flex-col gap-4">
          <PresenceCard actor="ari" state={state} onChooseNext={() => s.chooseNext('ari')} onCancel={(id) => s.cancel('ari', id)} />
          <PresenceCard actor="eli" state={state} onChooseNext={() => s.chooseNext('eli')} onCancel={(id) => s.cancel('eli', id)} />
          <SignalsPanel state={state} />
          <InspectorPanel state={state} actor={inspectActor} onActor={setInspectActor} />
        </div>
      </div>

      {/* Places reference */}
      <details className="rounded-lg border border-house-border bg-house-surface/40 p-3">
        <summary className="font-body text-[11px] uppercase tracking-widest text-text-muted cursor-pointer">Places & objects</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {Object.values(LIVING_PLACES).map((p) => (
            <div key={p.id} className="rounded-md border border-house-border p-2">
              <div className="font-body text-xs text-text-secondary">{p.name}</div>
              <div className="font-body text-[11px] text-text-muted italic mt-0.5">{p.flavour}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

// ─── Controls button ─────────────────────────────────────────────────────────
function Btn({
  children, onClick, disabled, primary, danger,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; danger?: boolean
}) {
  const tone = danger
    ? 'border-amber-700/50 text-amber-200 hover:bg-amber-900/20'
    : primary
      ? 'border-eli-primary text-eli-primary hover:bg-eli-glow'
      : 'border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-body text-xs px-2.5 py-1.5 border rounded transition-all disabled:opacity-30 disabled:cursor-not-allowed ${tone}`}
    >
      {children}
    </button>
  )
}

// ─── Presence card ───────────────────────────────────────────────────────────
function PresenceCard({
  actor, state, onChooseNext, onCancel,
}: {
  actor: AutonomousId; state: SessionState; onChooseNext: () => void; onCancel: (id: string) => void
}) {
  const reg = LIVING_CHARACTERS[actor]
  const rt = state.characters[actor]
  const active = activeAction(state, actor)
  const visibleQueue = rt.queue.filter((q) => q.status !== 'completed')

  return (
    <section className={`rounded-lg border bg-house-surface/60 p-3 ${accentBorder(actor)}`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`font-display text-sm tracking-wide ${accent(actor)}`}>{reg.displayName}</span>
          {rt.paused && <span className="ml-2 font-body text-[10px] px-1.5 py-0.5 rounded-full border border-amber-700/50 text-amber-200">paused</span>}
        </div>
        <Link href="/courtyard/3d-preview" className="font-body text-[10px] text-text-muted underline hover:text-text-secondary">
          open 3D preview
        </Link>
      </div>
      <div className="font-body text-[11px] text-text-muted mt-0.5">{reg.role}</div>
      <div className="font-body text-[11px] text-text-secondary mt-2">
        At <span className="text-text-primary">{LIVING_PLACES[rt.location].name}</span> · {rt.mood}
      </div>

      {/* Active action */}
      <div className="mt-2 rounded-md border border-house-border bg-house-bg p-2">
        {active ? (
          <>
            <div className="font-body text-xs text-text-secondary">
              <span className={accent(actor)}>▸</span> {active.label} → {active.destinationName}
              <span className="text-text-muted"> ({active.elapsedSteps}/{active.totalSteps})</span>
            </div>
            <div className="font-body text-[11px] text-text-muted italic mt-1">{active.reason}</div>
          </>
        ) : (
          <div className="font-body text-[11px] text-text-muted italic">
            {state.status === 'running' ? `${reg.displayName} is considering…` : 'waiting for the room to wake'}
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="mt-2">
        <div className="font-body text-[10px] uppercase tracking-widest text-text-muted mb-1">Action queue</div>
        {visibleQueue.length === 0 ? (
          <div className="font-body text-[11px] text-text-muted">— empty —</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {visibleQueue.map((q) => (
              <QueueItem key={q.id} q={q} onCancel={() => onCancel(q.id)} />
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onChooseNext}
          disabled={state.status === 'idle' || !!active}
          className="mt-2 font-body text-[11px] px-2 py-1 border border-house-border rounded text-text-muted hover:text-text-secondary disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Let {reg.displayName} choose next
        </button>
      </div>

      {/* Wants */}
      <div className="mt-3">
        <div className="font-body text-[10px] uppercase tracking-widest text-text-muted mb-1">Wants</div>
        <div className="flex flex-col gap-1">
          {CORE_WANT_IDS.map((w) => (
            <div key={w} className="flex items-center gap-2">
              <span className="font-body text-[10px] text-text-muted w-20">{CORE_WANTS[w].label}</span>
              <div className="flex-1 h-1.5 rounded-full bg-house-bg overflow-hidden">
                <div className={`h-full ${actor === 'ari' ? 'bg-ari-primary' : 'bg-eli-primary'}`} style={{ width: `${Math.round(rt.wants[w] * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function QueueItem({ q, onCancel }: { q: QueuedAction; onCancel: () => void }) {
  const statusTone =
    q.status === 'active' ? 'text-text-secondary'
      : q.status === 'cancelled' ? 'text-text-muted line-through'
        : 'text-text-muted'
  return (
    <li className="flex items-start justify-between gap-2 rounded border border-house-border px-2 py-1">
      <div className={`font-body text-[11px] ${statusTone}`}>
        <span className="uppercase text-[9px] tracking-wide mr-1 text-text-muted">{q.status}</span>
        {q.label} → {q.destinationName}
      </div>
      {(q.status === 'queued' || q.status === 'active') && (
        <button type="button" onClick={onCancel} className="font-body text-[10px] text-text-muted hover:text-amber-200 shrink-0">cancel</button>
      )}
    </li>
  )
}

// ─── Session scratch ─────────────────────────────────────────────────────────
function ScratchPanel({ state }: { state: SessionState }) {
  const tone: Record<string, string> = { ari: 'text-ari-primary', eli: 'text-eli-primary', tara: 'text-amber-200' }
  return (
    <section className="rounded-lg border border-house-border bg-house-surface/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-body text-[10px] uppercase tracking-widest text-text-muted">Session scratch conversation</div>
        <div className="font-body text-[10px] text-text-muted">scratch only · memory writes: off</div>
      </div>
      <div className="max-h-64 overflow-y-auto flex flex-col gap-1 pr-1">
        {state.scratch.length === 0 ? (
          <div className="font-body text-[11px] text-text-muted italic">The room is quiet. Press Start to wake the Courtyard.</div>
        ) : (
          state.scratch.map((line) => (
            <div key={line.id} className="font-body text-[11px] leading-snug">
              <span className={`${tone[line.speaker]} font-medium`}>
                {line.speaker === 'tara' ? 'Tara' : line.speaker === 'ari' ? 'Ari' : 'Eli'}:
              </span>{' '}
              <span className="text-text-secondary">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ─── Emergent want signals ───────────────────────────────────────────────────
function SignalsPanel({ state }: { state: SessionState }) {
  return (
    <section className="rounded-lg border border-house-border bg-house-surface/50 p-3">
      <div className="font-body text-[10px] uppercase tracking-widest text-text-muted mb-2">
        Possible want signals
      </div>
      {state.signals.length === 0 ? (
        <div className="font-body text-[11px] text-text-muted italic">
          None yet. The room watches for repeated patterns — noticed, never confirmed.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {state.signals.map((sig) => (
            <li key={sig.id} className="rounded border border-house-border px-2 py-1.5">
              <div className="font-body text-[11px] text-text-secondary">
                <span className="text-text-primary">{sig.label}</span>
                <span className="text-text-muted"> · {sig.actor === 'pair' ? 'Ari & Eli' : sig.actor === 'ari' ? 'Ari' : 'Eli'}</span>
              </div>
              <div className="font-body text-[10px] text-text-muted mt-0.5">{sig.note}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ─── "Why this action?" inspector ────────────────────────────────────────────
function InspectorPanel({
  state, actor, onActor,
}: {
  state: SessionState; actor: AutonomousId; onActor: (a: AutonomousId) => void
}) {
  const rt = state.characters[actor]
  const options = inspectOptions(state, actor, 5)
  return (
    <section className="rounded-lg border border-house-border bg-house-surface/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="font-body text-[10px] uppercase tracking-widest text-text-muted">Why this action?</div>
        <div className="flex gap-1">
          {(['ari', 'eli'] as AutonomousId[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onActor(a)}
              className={`font-body text-[10px] px-2 py-0.5 rounded border ${actor === a ? `${accentBorder(a)} ${accent(a)}` : 'border-house-border text-text-muted'}`}
            >
              {a === 'ari' ? 'Ari' : 'Eli'}
            </button>
          ))}
        </div>
      </div>
      <div className="font-body text-[11px] text-text-secondary italic">
        {rt.lastReason ?? 'No choice made yet this session.'}
      </div>
      <div className="font-body text-[10px] uppercase tracking-widest text-text-muted mt-3 mb-1">Currently weighing</div>
      <ul className="flex flex-col gap-1">
        {options.map((o, i) => (
          <li key={`${o.activityId}-${o.placeId}`} className="font-body text-[11px] text-text-muted">
            <span className="text-text-secondary">{i + 1}. {LIVING_ACTIVITIES[o.activityId].label}</span>
            <span className="text-text-muted"> @ {LIVING_PLACES[o.placeId].name} · score {o.score.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
