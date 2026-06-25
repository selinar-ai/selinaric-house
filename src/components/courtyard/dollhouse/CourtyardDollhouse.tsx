'use client'

// Courtyard — Gaming Wing · Phase 1E (2D token prototype)
// A playful dollhouse view of the Courtyard with small 2D tokens for Tara, Ari,
// and Eli. Click-to-move, soft autoplay drift, little speech bubbles, a Persona
// Rooms doorway, and a session-scratch log.
//
// Prototype-only and client-only: no DB, no memory, no model/LLM calls, no
// approval/authority, no background work (all timers die with the page). Speech
// lines are mock session scratch, never real presence voice or canon.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { DOLLHOUSE_ZONES, getZone } from '@/lib/courtyard/dollhouse/zones'
import { DOLLHOUSE_CAST, DOLLHOUSE_CHARACTER_IDS, tokenImagePath } from '@/lib/courtyard/dollhouse/cast'
import type { DollhouseCharacterId } from '@/lib/courtyard/dollhouse/types'

type Positions = Record<DollhouseCharacterId, string>
type Bubbles = Record<DollhouseCharacterId, { text: string; until: number } | null>

const BUBBLE_MS = 4500
const AUTOPLAY_MS = 3600
const HEARTBEAT_MS = 700

function homePositions(): Positions {
  return {
    tara: DOLLHOUSE_CAST.tara.homeZoneId,
    ari: DOLLHOUSE_CAST.ari.homeZoneId,
    eli: DOLLHOUSE_CAST.eli.homeZoneId,
  }
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// Module-level so randomness never sits directly in the component render body.
function chance(p: number): boolean {
  return Math.random() < p
}

// Weighted choice from a character's affinity list, avoiding the current zone.
function chooseDriftZone(id: DollhouseCharacterId, current: string): string {
  const pool = DOLLHOUSE_CAST[id].affinityZoneIds.filter((z) => z !== current)
  if (pool.length === 0) {
    const anywhere = DOLLHOUSE_ZONES.filter((z) => z.id !== current && z.kind !== 'rooms')
    return anywhere.length ? pick(anywhere).id : current
  }
  return pick(pool)
}

export default function CourtyardDollhouse() {
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [positions, setPositions] = useState<Positions>(homePositions)
  const [selected, setSelected] = useState<DollhouseCharacterId | null>(null)
  const [bubbles, setBubbles] = useState<Bubbles>({ tara: null, ari: null, eli: null })
  const [scratch, setScratch] = useState<string[]>([])
  const [personaOpen, setPersonaOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [now, setNow] = useState(0)

  // Ref mirror so the autoplay tick always reads fresh positions.
  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  function logScratch(line: string) {
    setScratch((prev) => [line, ...prev].slice(0, 14))
  }

  function speak(id: DollhouseCharacterId, text: string) {
    setBubbles((prev) => ({ ...prev, [id]: { text, until: Date.now() + BUBBLE_MS } }))
    logScratch(`${DOLLHOUSE_CAST[id].name}: ${text}`)
  }

  function moveTo(id: DollhouseCharacterId, zoneId: string, narrate = true) {
    const zone = getZone(zoneId)
    if (!zone) return
    setPositions((prev) => ({ ...prev, [id]: zoneId }))
    if (narrate) logScratch(`${DOLLHOUSE_CAST[id].name} drifts toward the ${zone.name}.`)
  }

  function wake() {
    setStarted(true)
    setPositions(homePositions())
    setScratch(['The Courtyard is awake. Tara, Ari, and Eli are present.'])
    setNow(Date.now())
  }

  function settle() {
    setPlaying(false)
    setStarted(false)
    setSelected(null)
    setBubbles({ tara: null, ari: null, eli: null })
    setPositions(homePositions())
    logScratch('The Courtyard settles. Nothing is running.')
  }

  // One soft autoplay step: each presence may drift or linger-and-speak.
  function step() {
    const order: DollhouseCharacterId[] = ['ari', 'eli', 'tara']
    for (const id of order) {
      const char = DOLLHOUSE_CAST[id]
      const current = positionsRef.current[id]
      if (chance(char.drift)) {
        const next = chooseDriftZone(id, current)
        moveTo(id, next)
        if (chance(0.5)) speak(id, pick(char.lines))
      } else if (chance(0.4)) {
        speak(id, pick(char.lines))
      }
    }
  }

  // Heartbeat: refresh `now` so expired bubbles disappear.
  useEffect(() => {
    if (!started) return
    const t = setInterval(() => setNow(Date.now()), HEARTBEAT_MS)
    return () => clearInterval(t)
  }, [started])

  // Autoplay drift — only while the page is open and a session is playing.
  useEffect(() => {
    if (!started || !playing) return
    const t = setInterval(step, AUTOPLAY_MS)
    return () => clearInterval(t)
    // step reads fresh state via positionsRef + functional setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, playing])

  // Fade transient hints.
  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(null), 2600)
    return () => clearTimeout(t)
  }, [hint])

  function onTokenClick(id: DollhouseCharacterId) {
    if (!started) return
    setSelected((prev) => (prev === id ? null : id))
    speak(id, pick(DOLLHOUSE_CAST[id].lines))
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
    if (chance(0.6)) speak(selected, pick(DOLLHOUSE_CAST[selected].lines))
    setSelected(null)
  }

  // Group characters by zone so co-located tokens fan out instead of overlapping.
  const byZone: Record<string, DollhouseCharacterId[]> = {}
  for (const id of DOLLHOUSE_CHARACTER_IDS) {
    const z = positions[id]
    ;(byZone[z] ||= []).push(id)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 h-full min-h-0">
      {/* ── Stage (the hero) ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <h1 className="font-display text-lg tracking-[0.18em] text-text-primary">THE COURTYARD</h1>
            <p className="font-body text-[11px] text-text-muted mt-0.5">
              {started ? 'The Courtyard is awake.' : 'The Courtyard is resting.'}
              {started && playing ? ' They are drifting.' : ''}
              <span className="ml-2 italic">2D token prototype · session scratch only</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {!started ? (
              <button type="button" onClick={wake} className={btn('accent')}>Wake the Courtyard</button>
            ) : (
              <>
                <button type="button" onClick={() => setPlaying((p) => !p)} className={btn(playing ? 'on' : 'soft')}>
                  {playing ? 'Hold' : 'Let them drift'}
                </button>
                <button type="button" onClick={step} className={btn('soft')}>Nudge once</button>
                <button type="button" onClick={settle} className={btn('soft')}>Settle</button>
              </>
            )}
          </div>
        </div>

        <div
          className="relative w-full overflow-hidden rounded-2xl border border-house-border"
          style={{
            aspectRatio: '16 / 11',
            background:
              'radial-gradient(120% 90% at 50% 12%, #3a2b46 0%, #2c2036 45%, #211829 100%)',
            boxShadow: 'inset 0 0 90px rgba(0,0,0,0.55)',
          }}
        >
          {/* warm stone floor pool */}
          <div
            className="absolute"
            style={{
              left: '6%', right: '6%', top: '30%', bottom: '8%',
              borderRadius: '50% / 30%',
              background: 'radial-gradient(60% 60% at 50% 40%, rgba(120,96,74,0.30), rgba(60,46,66,0) 70%)',
            }}
          />

          {/* Zones */}
          {DOLLHOUSE_ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              title={z.blurb}
              onClick={() => onZoneClick(z.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${z.x}%`, top: `${z.y}%` }}
            >
              <span
                className="flex flex-col items-center gap-1"
                style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
              >
                <span
                  className={`flex items-center justify-center rounded-full text-base transition-all ${
                    z.kind === 'rooms' || z.kind === 'door'
                      ? 'w-11 h-11 bg-[#4a3358]/80 border border-[#caa15f]/50'
                      : 'w-9 h-9 bg-[#3a2b46]/70 border border-[#caa15f]/30'
                  } group-hover:border-[#e7c887] group-hover:scale-110`}
                >
                  {z.icon}
                </span>
                <span className="font-body text-[9.5px] leading-tight text-[#e6d6c2]/80 max-w-[88px] text-center group-hover:text-[#f3e6d2]">
                  {z.name}
                </span>
              </span>
            </button>
          ))}

          {/* Tokens */}
          {DOLLHOUSE_CHARACTER_IDS.map((id) => {
            const char = DOLLHOUSE_CAST[id]
            const zone = getZone(positions[id])
            if (!zone) return null
            const occupants = byZone[zone.id] ?? [id]
            const idx = occupants.indexOf(id)
            const offset = (idx - (occupants.length - 1) / 2) * 44
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
                  transform: `translate(-50%, -118%) translateX(${offset}px)`,
                  transition: 'left 900ms cubic-bezier(.4,0,.2,1), top 900ms cubic-bezier(.4,0,.2,1)',
                  zIndex: isSelected ? 30 : 20,
                }}
              >
                {showBubble && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-max max-w-[170px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-body text-[#2a2030] bg-[#f3e6d2] shadow-lg"
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
                      width: 58, height: 58,
                      border: `2px solid ${isSelected ? '#f3e6d2' : char.accent}`,
                      boxShadow: `0 0 0 ${isSelected ? 4 : 2}px ${char.glow}, 0 6px 14px rgba(0,0,0,0.5)`,
                      transition: 'box-shadow 200ms, border-color 200ms',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={tokenImagePath(id)}
                      alt={char.name}
                      width={58}
                      height={58}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
                    />
                  </span>
                  <span
                    className="px-1.5 rounded-full font-body text-[9.5px] tracking-wide"
                    style={{ color: char.accent, background: 'rgba(33,24,41,0.7)' }}
                  >
                    {char.name}
                  </span>
                </button>
              </div>
            )
          })}

          {/* gentle hint toast */}
          {hint && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 px-3 py-1.5 rounded-full bg-[#211829]/90 border border-[#caa15f]/40 font-body text-[11px] text-[#f3e6d2]">
              {hint}
            </div>
          )}
        </div>

        {/* Presence cards */}
        <div className="grid grid-cols-3 gap-2">
          {DOLLHOUSE_CHARACTER_IDS.map((id) => {
            const char = DOLLHOUSE_CAST[id]
            const zone = getZone(positions[id])
            return (
              <button
                key={id}
                type="button"
                onClick={() => started && setSelected((p) => (p === id ? null : id))}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-left transition-all ${
                  selected === id ? 'border-[#e7c887] bg-[#3a2b46]/50' : 'border-house-border hover:border-house-muted'
                }`}
              >
                <span className="block rounded-full overflow-hidden shrink-0" style={{ width: 30, height: 30, border: `1.5px solid ${char.accent}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tokenImagePath(id)} alt={char.name} width={30} height={30} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                </span>
                <span className="min-w-0">
                  <span className="block font-body text-xs" style={{ color: char.accent }}>{char.name}</span>
                  <span className="block font-body text-[10px] text-text-muted truncate">
                    {started ? `at the ${zone?.name ?? '—'}` : 'resting'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Side panel ─────────────────────────────────────────────────── */}
      <aside className="w-full lg:w-72 shrink-0 flex flex-col gap-3 min-h-0">
        <div className="rounded-xl border border-house-border p-3">
          <h2 className="font-body text-[11px] tracking-widest text-text-muted uppercase mb-1">How to play</h2>
          <p className="font-body text-[11px] text-text-secondary leading-relaxed">
            Wake the Courtyard, then click a presence and a place to move them — or
            let them drift on their own. Click <span className="text-[#e7c887]">Persona Rooms</span> to step toward a room.
          </p>
        </div>

        <div className="rounded-xl border border-house-border p-3 flex-1 min-h-0 flex flex-col">
          <h2 className="font-body text-[11px] tracking-widest text-text-muted uppercase mb-2">Session scratch</h2>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
            {scratch.length === 0 ? (
              <p className="font-body text-[11px] text-text-muted italic">Quiet for now.</p>
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

      {/* ── Persona Rooms doorway ──────────────────────────────────────── */}
      {personaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPersonaOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#caa15f]/40 bg-house-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-base tracking-[0.15em] text-text-primary">PERSONA ROOMS</h2>
            <p className="font-body text-[11px] text-text-muted mt-1 mb-4">
              Doorways into each presence’s own room.
            </p>
            <div className="space-y-2">
              <Link href="/room/ari" className="block px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                <span className="font-body text-sm" style={{ color: DOLLHOUSE_CAST.ari.accent }}>Enter Ari’s Room →</span>
                <span className="block font-body text-[10px] text-text-muted">{DOLLHOUSE_CAST.ari.role}</span>
              </Link>
              <Link href="/room/eli" className="block px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                <span className="font-body text-sm" style={{ color: DOLLHOUSE_CAST.eli.accent }}>Enter Eli’s Room →</span>
                <span className="block font-body text-[10px] text-text-muted">{DOLLHOUSE_CAST.eli.role}</span>
              </Link>
              <div className="px-3 py-2 rounded-xl border border-dashed border-house-border">
                <span className="font-body text-sm text-text-secondary">Tara’s space</span>
                <span className="block font-body text-[10px] text-text-muted">A room for the centre — coming next.</span>
              </div>
            </div>
            <button type="button" onClick={() => setPersonaOpen(false)} className="mt-4 font-body text-[11px] text-text-muted hover:text-text-secondary">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Small warm button styles.
function btn(kind: 'accent' | 'on' | 'soft'): string {
  const base = 'font-body text-xs px-3 py-1.5 rounded-full border transition-all'
  if (kind === 'accent') return `${base} border-[#caa15f]/60 text-[#f3e6d2] bg-[#4a3358]/60 hover:bg-[#4a3358]`
  if (kind === 'on') return `${base} border-[#e7c887] text-[#e7c887] bg-[#3a2b46]/60`
  return `${base} border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted`
}
