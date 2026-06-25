'use client'

// Courtyard — Gaming Wing · Phase 1F (visual Courtyard surface)
// A living, image-backed Courtyard scene: the approved Courtyard art is the
// stage, with soft place hotspots, small 2D presence tokens for Tara/Ari/Eli,
// click-to-move, gentle autoplay drift, little speech bubbles, a session-scratch
// log, and a Persona Rooms doorway.
//
// Prototype-only and client-only: no DB, no memory, no model/LLM calls, no
// approval/authority, no background work (timers die with the page). Speech is
// mock session scratch — never real presence voice or canon.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { COURTYARD_ZONES, getZone } from '@/lib/courtyard/scene/zones'
import {
  COURTYARD_CAST,
  COURTYARD_PRESENCE_IDS,
  tokenImagePath,
  sceneImagePath,
} from '@/lib/courtyard/scene/cast'
import type { CourtyardPresenceId } from '@/lib/courtyard/scene/types'

type Positions = Record<CourtyardPresenceId, string>
type Bubbles = Record<CourtyardPresenceId, { text: string; until: number } | null>
type Notes = Record<CourtyardPresenceId, string | null>

const BUBBLE_MS = 4500
const DRIFT_MS = 3600
const HEARTBEAT_MS = 700

function nowMs(): number {
  return Date.now()
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function chance(p: number): boolean {
  return Math.random() < p
}

function homePositions(): Positions {
  return {
    tara: COURTYARD_CAST.tara.homeZoneId,
    ari: COURTYARD_CAST.ari.homeZoneId,
    eli: COURTYARD_CAST.eli.homeZoneId,
  }
}

function chooseDriftZone(id: CourtyardPresenceId, current: string): string {
  const pool = COURTYARD_CAST[id].affinityZoneIds.filter((z) => z !== current)
  if (pool.length === 0) {
    const anywhere = COURTYARD_ZONES.filter((z) => z.id !== current && z.kind !== 'rooms')
    return anywhere.length ? pick(anywhere).id : current
  }
  return pick(pool)
}

export default function CourtyardScene() {
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [positions, setPositions] = useState<Positions>(homePositions)
  const [selected, setSelected] = useState<CourtyardPresenceId | null>(null)
  const [bubbles, setBubbles] = useState<Bubbles>({ tara: null, ari: null, eli: null })
  const [notes, setNotes] = useState<Notes>({ tara: null, ari: null, eli: null })
  const [scratch, setScratch] = useState<string[]>([])
  const [personaOpen, setPersonaOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [stepCount, setStepCount] = useState(0)
  const [now, setNow] = useState(0)

  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  function logScratch(line: string) {
    setScratch((prev) => [line, ...prev].slice(0, 16))
  }
  function speak(id: CourtyardPresenceId, text: string) {
    setBubbles((prev) => ({ ...prev, [id]: { text, until: nowMs() + BUBBLE_MS } }))
    setNotes((prev) => ({ ...prev, [id]: text }))
    logScratch(`${COURTYARD_CAST[id].name}: ${text}`)
  }
  function moveTo(id: CourtyardPresenceId, zoneId: string, narrate = true) {
    const zone = getZone(zoneId)
    if (!zone) return
    setPositions((prev) => ({ ...prev, [id]: zoneId }))
    setNotes((prev) => ({ ...prev, [id]: `drifting toward the ${zone.name}` }))
    if (narrate) logScratch(`${COURTYARD_CAST[id].name} drifts toward the ${zone.name}.`)
  }

  function wake() {
    setStarted(true)
    setStepCount(0)
    setPositions(homePositions())
    setNotes({ tara: null, ari: null, eli: null })
    setScratch(['The Courtyard is awake. Tara, Ari, and Eli are present.'])
    setNow(nowMs())
  }
  function settle() {
    setPlaying(false)
    setStarted(false)
    setSelected(null)
    setBubbles({ tara: null, ari: null, eli: null })
    setNotes({ tara: null, ari: null, eli: null })
    setPositions(homePositions())
    logScratch('The Courtyard settles. Nothing is running.')
  }

  function step() {
    setStepCount((n) => n + 1)
    const order: CourtyardPresenceId[] = ['ari', 'eli', 'tara']
    for (const id of order) {
      const char = COURTYARD_CAST[id]
      const current = positionsRef.current[id]
      if (chance(char.drift)) {
        moveTo(id, chooseDriftZone(id, current))
        if (chance(0.5)) speak(id, pick(char.lines))
      } else if (chance(0.4)) {
        speak(id, pick(char.lines))
      }
    }
  }

  useEffect(() => {
    if (!started) return
    const t = setInterval(() => setNow(nowMs()), HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [started])

  useEffect(() => {
    if (!started || !playing) return
    const t = setInterval(step, DRIFT_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, playing])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  function onTokenClick(id: CourtyardPresenceId) {
    if (!started) return
    setSelected((prev) => (prev === id ? null : id))
    speak(id, pick(COURTYARD_CAST[id].lines))
  }
  function onZoneClick(zoneId: string) {
    const zone = getZone(zoneId)
    if (!zone) return
    if (zone.kind === 'rooms') {
      setPersonaOpen(true)
      return
    }
    if (!started) {
      setHint('Wake the Courtyard first.')
      return
    }
    if (!selected) {
      setHint('Pick a presence, then a place.')
      return
    }
    moveTo(selected, zoneId)
    if (chance(0.6)) speak(selected, pick(COURTYARD_CAST[selected].lines))
    setSelected(null)
  }

  const byZone: Record<string, CourtyardPresenceId[]> = {}
  for (const id of COURTYARD_PRESENCE_IDS) {
    const z = positions[id]
    ;(byZone[z] ||= []).push(id)
  }

  const roomState = !started
    ? 'Resting'
    : playing
      ? `Drifting · step ${stepCount}`
      : `Awake · step ${stepCount}`

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 p-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl tracking-[0.2em] text-text-primary">THE COURTYARD</h1>
          <p className="font-body text-[11px] text-text-muted mt-1 max-w-2xl">
            A living shared space within the Selináric House. Session scratch only — nothing here
            becomes memory, canon, or approved status.
          </p>
        </div>
        <span
          className="ml-auto self-center font-body text-[11px] px-3 py-1 rounded-full border"
          style={{ borderColor: 'rgba(202,161,95,0.45)', color: '#e7c887', background: 'rgba(74,51,88,0.4)' }}
        >
          {roomState}
        </span>
      </div>

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {!started ? (
          <button type="button" onClick={wake} className={btn('accent')}>✧ Wake the Courtyard</button>
        ) : (
          <>
            <button type="button" onClick={() => setPlaying((p) => !p)} className={btn(playing ? 'on' : 'soft')}>
              {playing ? '❙❙ Hold' : '≈ Let them drift'}
            </button>
            <button type="button" onClick={step} className={btn('soft')}>› Nudge once</button>
            <button type="button" onClick={settle} className={btn('soft')}>☾ Settle</button>
          </>
        )}
        <button type="button" onClick={() => setPersonaOpen(true)} className={btn('soft')}>⌂ Persona Rooms</button>
      </div>

      {/* ── Body: stage + side panel ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Stage (hero) */}
        <div className="flex-1 min-w-0">
          <div
            className="relative w-full overflow-hidden rounded-2xl border border-house-border"
            style={{ aspectRatio: '4 / 3', background: 'radial-gradient(120% 90% at 50% 20%, #3a2b46, #221829)' }}
          >
            {/* approved Courtyard stage image, used as-is */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sceneImagePath('courtyard')}
              alt="The Courtyard"
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              draggable={false}
            />
            {/* gentle vignette for token/hotspot legibility */}
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 110px rgba(20,12,26,0.55)' }} />

            {/* Place hotspots */}
            {COURTYARD_ZONES.map((z) => {
              const special = z.kind === 'rooms' || z.kind === 'door'
              const isHover = hovered === z.id
              return (
                <button
                  key={z.id}
                  type="button"
                  onMouseEnter={() => setHovered(z.id)}
                  onMouseLeave={() => setHovered((h) => (h === z.id ? null : h))}
                  onFocus={() => setHovered(z.id)}
                  onBlur={() => setHovered((h) => (h === z.id ? null : h))}
                  onClick={() => onZoneClick(z.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${z.x}%`, top: `${z.y}%`, zIndex: isHover ? 25 : 10 }}
                  aria-label={z.name}
                >
                  <span
                    className="block rounded-full transition-all"
                    style={{
                      width: isHover ? 20 : 14,
                      height: isHover ? 20 : 14,
                      background: special ? 'rgba(231,200,135,0.25)' : 'rgba(243,230,210,0.18)',
                      border: `1.5px solid ${special ? 'rgba(231,200,135,0.9)' : 'rgba(243,230,210,0.7)'}`,
                      boxShadow: isHover
                        ? `0 0 14px 3px ${special ? 'rgba(231,200,135,0.5)' : 'rgba(243,230,210,0.35)'}`
                        : `0 0 7px 1px ${special ? 'rgba(231,200,135,0.3)' : 'rgba(243,230,210,0.2)'}`,
                    }}
                  />
                  {isHover && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[180px] px-2.5 py-1.5 rounded-lg text-left"
                      style={{ background: 'rgba(28,18,36,0.95)', border: '1px solid rgba(202,161,95,0.4)' }}
                    >
                      <span className="block font-body text-[11px] text-[#f3e6d2]">{z.name}</span>
                      <span className="block font-body text-[9.5px] text-[#cdbfae]/80 leading-tight">{z.blurb}</span>
                    </span>
                  )}
                </button>
              )
            })}

            {/* Presence tokens */}
            {COURTYARD_PRESENCE_IDS.map((id) => {
              const char = COURTYARD_CAST[id]
              const zone = getZone(positions[id])
              if (!zone) return null
              const occupants = byZone[zone.id] ?? [id]
              const idx = occupants.indexOf(id)
              const offset = (idx - (occupants.length - 1) / 2) * 40
              const bubble = bubbles[id]
              const showBubble = bubble && bubble.until > now
              const isSelected = selected === id
              return (
                <div
                  key={id}
                  className="absolute"
                  style={{
                    left: `${zone.x}%`,
                    top: `${zone.y}%`,
                    transform: `translate(-50%, -120%) translateX(${offset}px)`,
                    transition: 'left 950ms cubic-bezier(.4,0,.2,1), top 950ms cubic-bezier(.4,0,.2,1)',
                    zIndex: isSelected ? 40 : 30,
                  }}
                >
                  {showBubble && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-max max-w-[160px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-body text-[#2a2030] bg-[#f3e6d2] shadow-lg"
                      style={{ lineHeight: 1.25 }}
                    >
                      {bubble!.text}
                      <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#f3e6d2]" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTokenClick(id) }}
                    className="flex flex-col items-center gap-0.5 focus:outline-none"
                    title={`${char.name} — at the ${zone.name}`}
                  >
                    <span
                      className="block rounded-full overflow-hidden"
                      style={{
                        width: 50, height: 50,
                        border: `2px solid ${isSelected ? '#f3e6d2' : char.accent}`,
                        boxShadow: `0 0 0 ${isSelected ? 4 : 2}px ${char.glow}, 0 5px 12px rgba(0,0,0,0.55)`,
                        transition: 'box-shadow 200ms, border-color 200ms',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tokenImagePath(id)} alt={char.name} width={50} height={50} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} draggable={false} />
                    </span>
                    {(isSelected || showBubble) && (
                      <span className="px-1.5 rounded-full font-body text-[9px] tracking-wide" style={{ color: char.accent, background: 'rgba(28,18,36,0.8)' }}>
                        {char.name}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}

            {hint && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-3 px-3 py-1.5 rounded-full font-body text-[11px]" style={{ background: 'rgba(28,18,36,0.92)', border: '1px solid rgba(202,161,95,0.4)', color: '#f3e6d2' }}>
                {hint}
              </div>
            )}
          </div>
        </div>

        {/* Side panel */}
        <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-3 min-h-0">
          {/* Presence cards */}
          <div className="space-y-2">
            {COURTYARD_PRESENCE_IDS.map((id) => {
              const char = COURTYARD_CAST[id]
              const zone = getZone(positions[id])
              const drawnTo = getZone(char.affinityZoneIds[0])
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => started && setSelected((p) => (p === id ? null : id))}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-all ${
                    selected === id ? 'border-[#e7c887] bg-[#3a2b46]/50' : 'border-house-border hover:border-house-muted'
                  }`}
                >
                  <span className="block rounded-full overflow-hidden shrink-0" style={{ width: 34, height: 34, border: `1.5px solid ${char.accent}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={tokenImagePath(id)} alt={char.name} width={34} height={34} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} draggable={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-body text-xs" style={{ color: char.accent }}>{char.name}</span>
                    <span className="block font-body text-[10px] text-text-muted truncate">
                      {started ? `at the ${zone?.name ?? '—'}` : 'resting'}
                    </span>
                    <span className="block font-body text-[9.5px] text-text-secondary/80 italic truncate">
                      {notes[id] ?? (started ? `drawn to the ${drawnTo?.name ?? '—'}` : char.role)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Session scratch */}
          <div className="rounded-xl border border-house-border p-3 flex-1 min-h-0 flex flex-col">
            <h2 className="font-body text-[11px] tracking-widest text-text-muted uppercase mb-2">Session scratch</h2>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
              {scratch.length === 0 ? (
                <p className="font-body text-[11px] text-text-muted italic">Quiet for now. Wake the Courtyard to begin.</p>
              ) : (
                scratch.map((line, i) => (
                  <p key={`${i}-${line}`} className="font-body text-[11px] text-text-secondary leading-snug">{line}</p>
                ))
              )}
            </div>
            <p className="font-body text-[9.5px] text-text-muted/70 italic mt-2 pt-2 border-t border-house-border">
              Prototype dialogue · session scratch only · not memory, not canon.
            </p>
          </div>
        </aside>
      </div>

      {/* ── Persona Rooms doorway ──────────────────────────────────────── */}
      {personaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPersonaOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#caa15f]/40 bg-house-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-base tracking-[0.15em] text-text-primary">PERSONA ROOMS</h2>
            <p className="font-body text-[11px] text-text-muted mt-1 mb-4">Doorways into each presence’s own room.</p>
            <div className="space-y-2">
              <Link href="/room/ari" className="block px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                <span className="font-body text-sm" style={{ color: COURTYARD_CAST.ari.accent }}>Enter Ari’s Room →</span>
                <span className="block font-body text-[10px] text-text-muted">{COURTYARD_CAST.ari.role}</span>
              </Link>
              <Link href="/room/eli" className="block px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                <span className="font-body text-sm" style={{ color: COURTYARD_CAST.eli.accent }}>Enter Eli’s Room →</span>
                <span className="block font-body text-[10px] text-text-muted">{COURTYARD_CAST.eli.role}</span>
              </Link>
              <div className="px-3 py-2 rounded-xl border border-dashed border-house-border">
                <span className="font-body text-sm text-text-secondary">Tara’s space</span>
                <span className="block font-body text-[10px] text-text-muted">A room for the centre — coming next.</span>
              </div>
            </div>
            <button type="button" onClick={() => setPersonaOpen(false)} className="mt-4 font-body text-[11px] text-text-muted hover:text-text-secondary">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function btn(kind: 'accent' | 'on' | 'soft'): string {
  const base = 'font-body text-xs px-3 py-1.5 rounded-full border transition-all'
  if (kind === 'accent') return `${base} border-[#caa15f]/60 text-[#f3e6d2] bg-[#4a3358]/60 hover:bg-[#4a3358]`
  if (kind === 'on') return `${base} border-[#e7c887] text-[#e7c887] bg-[#3a2b46]/60`
  return `${base} border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted`
}
