'use client'

// Courtyard — Gaming Wing · Phase 1F / 1F.1
// A living, image-backed Courtyard scene with Sims-style object action menus.
// The approved Courtyard art is the stage; Tara/Ari/Eli are small 2D tokens;
// clicking a place opens a floating action menu (with follow-up menus); soft
// autoplay drift performs character-weighted beats; speech bubbles + a session
// scratch log keep it alive; doors/persona open lightweight modals.
//
// Prototype-only and client-only: no DB, no memory, no model/LLM calls, no real
// Noticeboard/Library records, no approval/authority, no background work (timers
// die with the page). Speech + actions are mock session scratch — never canon.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { COURTYARD_ZONES, getZone } from '@/lib/courtyard/scene/zones'
import {
  COURTYARD_CAST,
  COURTYARD_PRESENCE_IDS,
  tokenImagePath,
  cardImagePath,
  sceneImagePath,
} from '@/lib/courtyard/scene/cast'
import {
  getMenu,
  PLACE_DEFAULT_ACTOR,
  AUTOPLAY_BEATS,
  COURTYARD_NAV_ROUTES,
  COURTYARD_AVAILABLE_ROUTES,
  type CourtyardAction,
} from '@/lib/courtyard/scene/actions'
import type { CourtyardPresenceId } from '@/lib/courtyard/scene/types'

type Positions = Record<CourtyardPresenceId, string>
type Bubbles = Record<CourtyardPresenceId, { text: string; until: number } | null>
type Notes = Record<CourtyardPresenceId, string | null>
type SceneModal =
  | { kind: 'persona_rooms' | 'arcade_stub' | 'lounge_confirm' }
  | { kind: 'route_unavailable'; note: string }
  | null

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
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export default function CourtyardScene() {
  const router = useRouter()
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [positions, setPositions] = useState<Positions>(homePositions)
  const [selected, setSelected] = useState<CourtyardPresenceId | null>(null)
  const [bubbles, setBubbles] = useState<Bubbles>({ tara: null, ari: null, eli: null })
  const [notes, setNotes] = useState<Notes>({ tara: null, ari: null, eli: null })
  const [scratch, setScratch] = useState<string[]>([])
  const [menu, setMenu] = useState<{ menuId: string; placeId: string } | null>(null)
  const [modal, setModal] = useState<SceneModal>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [stepCount, setStepCount] = useState(0)
  const [now, setNow] = useState(0)
  const [generatingId, setGeneratingId] = useState<CourtyardPresenceId | null>(null)

  const positionsRef = useRef(positions)
  useEffect(() => { positionsRef.current = positions }, [positions])
  const startedRef = useRef(started)
  useEffect(() => { startedRef.current = started }, [started])
  const selectedRef = useRef(selected)
  useEffect(() => { selectedRef.current = selected }, [selected])
  const generatingRef = useRef(false)

  function logScratch(line: string) {
    setScratch((prev) => [line, ...prev].slice(0, 18))
  }
  function bubbleOnly(id: CourtyardPresenceId, text: string) {
    setBubbles((prev) => ({ ...prev, [id]: { text, until: nowMs() + BUBBLE_MS } }))
    setNotes((prev) => ({ ...prev, [id]: text }))
  }
  function speak(id: CourtyardPresenceId, text: string) {
    bubbleOnly(id, text)
    logScratch(`${COURTYARD_CAST[id].name}: ${text}`)
  }
  function moveTo(id: CourtyardPresenceId, zoneId: string) {
    if (!getZone(zoneId)) return
    setPositions((prev) => ({ ...prev, [id]: zoneId }))
  }
  function ensureStarted() {
    if (!startedRef.current) {
      setStarted(true)
      startedRef.current = true
      setNow(nowMs())
      setScratch((prev) => (prev.length ? prev : ['The Courtyard is awake. Tara, Ari, and Eli are present.']))
    }
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
    setMenu(null)
    setBubbles({ tara: null, ari: null, eli: null })
    setNotes({ tara: null, ari: null, eli: null })
    setPositions(homePositions())
    logScratch('The Courtyard settles. Nothing is running.')
  }

  // Level 1 navigation with graceful fallback — only push to known House routes.
  function safeNavigate(path: string, label = 'That doorway') {
    setMenu(null)
    if (COURTYARD_AVAILABLE_ROUTES.has(path)) {
      router.push(path)
    } else {
      setModal({ kind: 'route_unavailable', note: `${label} isn’t wired yet.` })
    }
  }

  // Phase 1G.2.1: session-only generated response — bubble + session scratch,
  // then gone. Output is never persisted. Only ever called by a manual click on
  // a wired action (Ask Ari for a thought / Ask Eli what he feels) — never by
  // drift/autoplay. On any failure, a soft fallback keeps the Courtyard usable.
  async function runGenerated(
    gen: NonNullable<CourtyardAction['generate']>,
    actorId: CourtyardPresenceId,
    placeId: string,
  ) {
    if (generatingRef.current) return
    generatingRef.current = true
    setGeneratingId(actorId)
    bubbleOnly(actorId, '…')
    try {
      const res = await fetch('/api/courtyard/generated-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: gen.actionId, actorId, placeId, promptKind: gen.promptKind }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data: unknown = await res.json()
      const text =
        data && typeof (data as { text?: unknown }).text === 'string'
          ? (data as { text: string }).text.trim()
          : ''
      if (!text) throw new Error('empty response')
      bubbleOnly(actorId, text)
      logScratch(`${COURTYARD_CAST[actorId].name} says: “${text}”`)
    } catch {
      if (actorId === 'ari') {
        bubbleOnly('ari', 'A thought does not arrive yet.')
        logScratch('Ari pauses, but the thought does not arrive yet.')
      } else {
        bubbleOnly(actorId, 'The feeling stays quiet for now.')
        logScratch('Eli listens, but the feeling stays quiet for now.')
      }
    } finally {
      generatingRef.current = false
      setGeneratingId(null)
    }
  }

  // ── Action execution ──────────────────────────────────────────────────
  function runAction(action: CourtyardAction, placeId: string) {
    if (action.id === 'return') { setMenu(null); return }
    if (action.category === 'settle') { settle(); return }

    ensureStarted()
    const actor: CourtyardPresenceId =
      action.actor ?? selectedRef.current ?? PLACE_DEFAULT_ACTOR[placeId] ?? 'tara'
    const target = action.target

    if (action.category === 'gather') {
      for (const id of COURTYARD_PRESENCE_IDS) moveTo(id, placeId)
    } else {
      if (action.move === 'actor') moveTo(actor, placeId)
      if (action.move === 'target' && target) moveTo(target, placeId)
    }
    if (action.scratch) logScratch(action.scratch)
    if (action.say) bubbleOnly(action.sayBy ?? actor, action.say)

    if (action.generate) {
      setMenu(null)
      void runGenerated(action.generate, action.sayBy ?? actor, placeId)
      return
    }
    if (action.modal) { setModal({ kind: action.modal }); setMenu(null); return }
    if (action.navigate) { safeNavigate(action.navigate, action.label); return }
    if (action.next) { setMenu({ menuId: action.next, placeId }); return }
    setMenu(null)
  }

  // ── Soft autoplay (character-weighted beats) ──────────────────────────
  function step() {
    setStepCount((n) => n + 1)
    const order: CourtyardPresenceId[] = ['ari', 'eli', 'tara']
    for (const id of order) {
      const char = COURTYARD_CAST[id]
      if (!chance(char.drift)) {
        if (chance(0.3)) bubbleOnly(id, pick(char.lines))
        continue
      }
      const beat = pick(AUTOPLAY_BEATS[id])
      moveTo(id, beat.place)
      logScratch(beat.line)
      if (beat.bubble && chance(0.6)) bubbleOnly(id, beat.bubble)
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

  // Escape closes the open menu.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  function onTokenClick(id: CourtyardPresenceId) {
    ensureStarted()
    setSelected((prev) => (prev === id ? null : id))
    speak(id, pick(COURTYARD_CAST[id].lines))
  }
  function onZoneClick(zoneId: string) {
    const zone = getZone(zoneId)
    if (!zone) return
    setMenu((prev) => (prev && prev.menuId === zoneId ? null : { menuId: zoneId, placeId: zoneId }))
  }

  const byZone: Record<string, CourtyardPresenceId[]> = {}
  for (const id of COURTYARD_PRESENCE_IDS) {
    const z = positions[id]
    ;(byZone[z] ||= []).push(id)
  }

  const roomState = !started ? 'Resting' : playing ? `Drifting · step ${stepCount}` : `Awake · step ${stepCount}`
  const openMenu = menu ? getMenu(menu.menuId) : undefined
  const openMenuZone = menu ? getZone(menu.placeId) : undefined

  return (
    <div className="flex flex-col min-h-full gap-3 p-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="font-display text-xl tracking-[0.2em] text-text-primary">THE COURTYARD</h1>
          <p className="font-body text-[11px] text-text-muted mt-1 max-w-2xl">
            A living shared space within the Selináric House. Session scratch only — nothing here
            becomes memory, canon, or approved status.
          </p>
        </div>
        <span className="ml-auto self-center font-body text-[11px] px-3 py-1 rounded-full border"
          style={{ borderColor: 'rgba(202,161,95,0.45)', color: '#e7c887', background: 'rgba(74,51,88,0.4)' }}>
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
        <button type="button" onClick={() => setMenu({ menuId: 'persona-rooms', placeId: 'persona-rooms' })} className={btn('soft')}>⌂ Persona Rooms</button>
        <span className="font-body text-[10.5px] text-text-muted/80 ml-1">Tip: click a place for its actions.</span>
      </div>

      {/* ── Body: stage (hero) + richer presence profiles ──────────────── */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Stage (hero) */}
        <div className="flex-1 min-w-0">
          <div className="relative w-full mx-auto overflow-hidden rounded-2xl border border-house-border"
            style={{ aspectRatio: '4 / 3', maxWidth: 900, background: 'radial-gradient(120% 90% at 50% 20%, #3a2b46, #221829)' }}>
            {/* approved Courtyard stage image, used as-is */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sceneImagePath('courtyard')} alt="The Courtyard" className="absolute inset-0 w-full h-full"
              style={{ objectFit: 'cover', objectPosition: 'center' }} draggable={false} />
            <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: 'inset 0 0 110px rgba(20,12,26,0.55)' }} />

            {/* click-away backdrop when a menu is open */}
            {menu && <div className="absolute inset-0 z-40" onClick={() => setMenu(null)} />}

            {/* Place hotspots */}
            {COURTYARD_ZONES.map((z) => {
              const special = z.kind === 'rooms' || z.kind === 'door'
              const isHover = hovered === z.id
              const isOpen = menu?.placeId === z.id
              return (
                <button key={z.id} type="button"
                  onMouseEnter={() => setHovered(z.id)} onMouseLeave={() => setHovered((h) => (h === z.id ? null : h))}
                  onFocus={() => setHovered(z.id)} onBlur={() => setHovered((h) => (h === z.id ? null : h))}
                  onClick={() => onZoneClick(z.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${z.x}%`, top: `${z.y}%`, zIndex: isHover || isOpen ? 45 : 10 }}
                  aria-label={`${z.name} — open actions`}>
                  <span className="block rounded-full transition-all" style={{
                    width: isHover || isOpen ? 20 : 14, height: isHover || isOpen ? 20 : 14,
                    background: special ? 'rgba(231,200,135,0.25)' : 'rgba(243,230,210,0.18)',
                    border: `1.5px solid ${special ? 'rgba(231,200,135,0.9)' : 'rgba(243,230,210,0.7)'}`,
                    boxShadow: isHover || isOpen
                      ? `0 0 14px 3px ${special ? 'rgba(231,200,135,0.5)' : 'rgba(243,230,210,0.35)'}`
                      : `0 0 7px 1px ${special ? 'rgba(231,200,135,0.3)' : 'rgba(243,230,210,0.2)'}`,
                  }} />
                  {isHover && !isOpen && (
                    <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-max max-w-[180px] px-2.5 py-1.5 rounded-lg text-left"
                      style={{ background: 'rgba(28,18,36,0.95)', border: '1px solid rgba(202,161,95,0.4)' }}>
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
                <div key={id} className="absolute" style={{
                  left: `${zone.x}%`, top: `${zone.y}%`,
                  transform: `translate(-50%, -120%) translateX(${offset}px)`,
                  transition: 'left 950ms cubic-bezier(.4,0,.2,1), top 950ms cubic-bezier(.4,0,.2,1)',
                  zIndex: isSelected ? 35 : 30,
                }}>
                  {showBubble && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-max max-w-[160px] px-2.5 py-1.5 rounded-xl text-[10.5px] font-body text-[#2a2030] bg-[#f3e6d2] shadow-lg" style={{ lineHeight: 1.25 }}>
                      {bubble!.text}
                      <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#f3e6d2]" />
                    </div>
                  )}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onTokenClick(id) }}
                    className={`flex flex-col items-center gap-0.5 focus:outline-none${generatingId === id ? ' animate-pulse' : ''}`} title={`${char.name} — at the ${zone.name}`}>
                    <span className="block rounded-full overflow-hidden" style={{
                      width: 50, height: 50, border: `2px solid ${isSelected ? '#f3e6d2' : char.accent}`,
                      boxShadow: `0 0 0 ${isSelected ? 4 : 2}px ${char.glow}, 0 5px 12px rgba(0,0,0,0.55)`,
                      transition: 'box-shadow 200ms, border-color 200ms',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={tokenImagePath(id)} alt={char.name} width={50} height={50} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} draggable={false} />
                    </span>
                    {(isSelected || showBubble) && (
                      <span className="px-1.5 rounded-full font-body text-[9px] tracking-wide" style={{ color: char.accent, background: 'rgba(28,18,36,0.8)' }}>{char.name}</span>
                    )}
                  </button>
                </div>
              )
            })}

            {/* Floating action menu */}
            {openMenu && openMenuZone && (
              <div className="absolute z-50" style={{
                left: `${clamp(openMenuZone.x, 16, 84)}%`,
                top: `${clamp(openMenuZone.y, 12, 80)}%`,
                transform: `translate(-50%, ${openMenuZone.y > 55 ? '-106%' : '12px'})`,
              }} onClick={(e) => e.stopPropagation()}>
                <div className="w-52 rounded-xl p-1.5" style={{ background: 'rgba(28,18,36,0.97)', border: '1px solid rgba(202,161,95,0.45)', boxShadow: '0 10px 30px rgba(0,0,0,0.55)' }}>
                  <div className="px-2 py-1 font-body text-[10px] tracking-widest uppercase text-[#caa15f]">{openMenu.title}</div>
                  <div className="space-y-0.5">
                    {openMenu.actions.map((a) => (
                      <button key={a.id} type="button" onClick={() => runAction(a, menu!.placeId)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg font-body text-[11.5px] text-[#e6d6c2] hover:text-[#f6ead6] transition-all"
                        style={{ background: 'transparent' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(74,51,88,0.7)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                        {a.label}
                        {a.next ? <span className="float-right text-[#caa15f]/70">›</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: richer Ari + Eli presence profiles */}
        <aside className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          {(['ari', 'eli'] as CourtyardPresenceId[]).map((id) => {
            const char = COURTYARD_CAST[id]
            const zone = getZone(positions[id])
            const drawnTo = getZone(char.affinityZoneIds[0])
            const isSel = selected === id
            const wander = Math.round(char.drift * 100)
            return (
              <div key={id} className={`rounded-2xl border overflow-hidden transition-all ${isSel ? 'border-[#e7c887]' : 'border-house-border'}`}
                style={{ background: 'linear-gradient(180deg, rgba(40,29,52,0.6), rgba(28,18,36,0.55))' }}>
                <button type="button" onClick={() => setSelected((p) => (p === id ? null : id))} className="w-full text-left flex gap-3 p-3 focus:outline-none">
                  <span className="block rounded-xl overflow-hidden shrink-0" style={{ width: 86, height: 116, border: `1.5px solid ${char.accent}`, boxShadow: `0 0 0 1px ${char.glow}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={cardImagePath(id)} alt={char.name} width={86} height={116} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} draggable={false} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-base tracking-wide" style={{ color: char.accent }}>{char.name}</span>
                      {isSel && <span className="font-body text-[8px] px-1.5 py-0.5 rounded-full border border-[#e7c887]/50 text-[#e7c887]">selected</span>}
                    </span>
                    <span className="block font-body text-[10px] text-text-muted leading-snug mt-0.5">{char.role}</span>
                    <span className="block font-body text-[10.5px] text-text-secondary mt-1.5">
                      <span className="text-text-muted">Location · </span>{started ? (zone?.name ?? '—') : 'resting'}
                    </span>
                    <span className="block font-body text-[10px] text-text-secondary/90 italic leading-snug mt-0.5">
                      {notes[id] ?? (started ? `drawn to the ${drawnTo?.name ?? '—'}` : 'waiting for the room to wake')}
                    </span>
                  </span>
                </button>
                {/* honest, real-state cue — wander tendency (drift), session-only */}
                <div className="px-3 pb-2">
                  <div className="flex items-center justify-between font-body text-[9px] text-text-muted/80 mb-1">
                    <span>wander</span><span>{wander}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="h-full rounded-full" style={{ width: `${wander}%`, background: char.accent, opacity: 0.7 }} />
                  </div>
                </div>
                {/* Interior entry — Level 1 navigation into the presence's own room */}
                <div className="px-3 pb-3">
                  <button type="button"
                    onClick={() => safeNavigate(id === 'ari' ? COURTYARD_NAV_ROUTES.ariRoom : COURTYARD_NAV_ROUTES.eliRoom, `${char.name}’s Interior`)}
                    className="w-full text-center font-body text-[11px] px-3 py-1.5 rounded-lg border transition-all hover:brightness-125"
                    style={{ borderColor: `${char.accent}66`, color: char.accent, background: 'rgba(20,12,26,0.35)' }}>
                    Enter {char.name}’s Interior →
                  </button>
                </div>
              </div>
            )
          })}

          {/* Tara — graceful stub (no Tara route yet; not created this phase) */}
          <div className="rounded-2xl border border-house-border overflow-hidden" style={{ background: 'linear-gradient(180deg, rgba(40,29,52,0.5), rgba(28,18,36,0.5))' }}>
            <div className="flex items-center gap-3 p-3">
              <span className="block rounded-xl overflow-hidden shrink-0" style={{ width: 54, height: 72, border: `1.5px solid ${COURTYARD_CAST.tara.accent}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cardImagePath('tara')} alt="Tara" width={54} height={72} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} draggable={false} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display text-base tracking-wide" style={{ color: COURTYARD_CAST.tara.accent }}>Tara</span>
                <span className="block font-body text-[10px] text-text-muted leading-snug">{COURTYARD_CAST.tara.role}</span>
              </span>
            </div>
            <div className="px-3 pb-3">
              <span className="block w-full text-center font-body text-[11px] px-3 py-1.5 rounded-lg border border-house-border text-text-muted/70 cursor-default select-none" aria-disabled="true">
                Tara’s Space — coming later
              </span>
            </div>
          </div>

          <p className="font-body text-[9px] text-text-muted/60 italic px-1">Presence snapshots reflect this session only — not memory, not canon.</p>
        </aside>
      </div>

      {/* ── Lower strip: character cards + conversation panel ───────────── */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Character cards */}
        <div className="shrink-0 flex gap-2.5">
          {COURTYARD_PRESENCE_IDS.map((id) => {
            const char = COURTYARD_CAST[id]
            const zone = getZone(positions[id])
            const isSel = selected === id
            return (
              <button key={id} type="button" onClick={() => { ensureStarted(); setSelected((p) => (p === id ? null : id)) }}
                className={`group relative rounded-xl overflow-hidden border transition-all ${isSel ? 'border-[#e7c887]' : 'border-house-border hover:border-house-muted'}`}
                style={{ width: 116 }} title={`${char.name}${started ? ` — at the ${zone?.name ?? '—'}` : ''}`}>
                <span className="block overflow-hidden" style={{ aspectRatio: '2 / 3' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cardImagePath(id)} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: isSel ? 'none' : 'saturate(0.92)' }} draggable={false} />
                </span>
                <span className="absolute inset-x-0 bottom-0 px-2 py-1" style={{ background: 'linear-gradient(180deg, transparent, rgba(20,12,26,0.92))' }}>
                  <span className="block font-display text-[11px] tracking-wide" style={{ color: char.accent }}>{char.name}</span>
                  <span className="block font-body text-[8px] text-text-muted/90 truncate">{started ? (zone?.name ?? '—') : 'resting'}</span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Conversation / session scratch panel */}
        <div className="flex-1 min-w-0 rounded-2xl border border-house-border p-3 flex flex-col" style={{ background: 'rgba(28,18,36,0.45)' }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-body text-[11px] tracking-widest text-text-muted uppercase">Conversation · session scratch</h2>
            <span className="font-body text-[9px] text-text-muted/70">{scratch.length} {scratch.length === 1 ? 'line' : 'lines'}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1" style={{ maxHeight: 220 }}>
            {scratch.length === 0 ? (
              <p className="font-body text-[11px] text-text-muted italic">Quiet for now. Wake the Courtyard, or click a place to begin.</p>
            ) : (
              scratch.map((line, i) => (<p key={`${i}-${line}`} className="font-body text-[11px] text-text-secondary leading-snug">{line}</p>))
            )}
          </div>
          <p className="font-body text-[9.5px] text-text-muted/70 italic mt-2 pt-2 border-t border-house-border">Prototype dialogue · session scratch only · not memory, not canon.</p>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#caa15f]/40 bg-house-surface p-5" onClick={(e) => e.stopPropagation()}>
            {modal.kind === 'persona_rooms' && (
              <>
                <h2 className="font-display text-base tracking-[0.15em] text-text-primary">PERSONA ROOMS</h2>
                <p className="font-body text-[11px] text-text-muted mt-1 mb-4">A doorway selector — choose a room to step into. (Not an authority surface.)</p>
                <div className="space-y-2">
                  <button type="button" onClick={() => safeNavigate(COURTYARD_NAV_ROUTES.ariRoom, 'Ari’s Room')} className="w-full text-left px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                    <span className="font-body text-sm" style={{ color: COURTYARD_CAST.ari.accent }}>Enter Ari’s Room →</span>
                    <span className="block font-body text-[10px] text-text-muted">{COURTYARD_CAST.ari.role}</span>
                  </button>
                  <button type="button" onClick={() => safeNavigate(COURTYARD_NAV_ROUTES.eliRoom, 'Eli’s Room')} className="w-full text-left px-3 py-2 rounded-xl border border-house-border hover:border-[#e7c887] transition-all">
                    <span className="font-body text-sm" style={{ color: COURTYARD_CAST.eli.accent }}>Enter Eli’s Room →</span>
                    <span className="block font-body text-[10px] text-text-muted">{COURTYARD_CAST.eli.role}</span>
                  </button>
                  <div className="px-3 py-2 rounded-xl border border-dashed border-house-border">
                    <span className="font-body text-sm text-text-secondary">Tara’s space</span>
                    <span className="block font-body text-[10px] text-text-muted">A room for the centre — coming next.</span>
                  </div>
                  <button type="button" onClick={() => setModal(null)} className="w-full text-left px-3 py-2 rounded-xl border border-house-border hover:border-house-muted transition-all">
                    <span className="font-body text-sm text-text-secondary">Return to the Courtyard</span>
                  </button>
                </div>
              </>
            )}
            {modal.kind === 'arcade_stub' && (
              <>
                <h2 className="font-display text-base tracking-[0.15em] text-text-primary">ARCADE</h2>
                <p className="font-body text-[11px] text-text-muted mt-1">The Arcade doorway is present, but the Arcade room is not wired yet. Coming in a later phase.</p>
              </>
            )}
            {modal.kind === 'lounge_confirm' && (
              <>
                <h2 className="font-display text-base tracking-[0.15em] text-text-primary">LOUNGE DOOR</h2>
                <p className="font-body text-[11px] text-text-muted mt-1 mb-4">Step through to the Lounge? The Courtyard session stays here as scratch — no context is carried over yet.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => safeNavigate(COURTYARD_NAV_ROUTES.lounge, 'The Lounge')} className={btn('accent')}>Go to Lounge →</button>
                  <button type="button" onClick={() => setModal(null)} className={btn('soft')}>Stay in the Courtyard</button>
                </div>
              </>
            )}
            {modal.kind === 'route_unavailable' && (
              <>
                <h2 className="font-display text-base tracking-[0.15em] text-text-primary">NOT WIRED YET</h2>
                <p className="font-body text-[11px] text-text-muted mt-1">{modal.note} The doorway is here; the room comes in a later phase.</p>
              </>
            )}
            <button type="button" onClick={() => setModal(null)} className="mt-4 font-body text-[11px] text-text-muted hover:text-text-secondary">Close</button>
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
