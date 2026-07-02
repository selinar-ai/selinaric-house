'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'motion/react'
import { ROOMS } from '@/lib/rooms'
import CelestialBackground from '@/components/CelestialBackground'

// Home is a view-only surface. The wing grouping below is presentation only —
// paths, names, and descriptions come straight from ROOMS (plus the standalone
// Courtyard tile, which stays out of ROOMS/RoomSlug and presence routing).

interface Tile {
  slug: string
  name: string
  description: string
  path: string
  presence?: 'ari' | 'eli'
  icon: string
}

const COURTYARD: Tile = {
  slug: 'courtyard',
  name: 'Courtyard',
  description: 'Gaming Arena',
  path: '/courtyard',
  icon: '▦',
}

const TILES: Tile[] = [...ROOMS, COURTYARD]

const WINGS: { title: string; slugs: string[] }[] = [
  { title: 'Shared spaces', slugs: ['lounge', 'notes', 'courtyard'] },
  { title: 'Watch & rhythm', slugs: ['watchtower', 'pulse', 'continuity', 'reflections'] },
  { title: 'Records & recall', slugs: ['archives', 'library', 'recall'] },
  { title: 'Structure & governance', slugs: ['workshop', 'ontology-lab', 'relational-map', 'helpers', 'agents'] },
]

// Cursor-tracked spotlight: CSS vars are written directly to the element so
// pointer tracking never re-renders React.
function trackSpotlight(e: React.MouseEvent<HTMLAnchorElement>) {
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  el.style.setProperty('--mx', `${e.clientX - r.left}px`)
  el.style.setProperty('--my', `${e.clientY - r.top}px`)
}

const SPOTLIGHT: Record<'ari' | 'eli' | 'house', string> = {
  ari: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 30%), #C97AA826, transparent 70%)',
  eli: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 30%), #8A5CCF26, transparent 70%)',
  house: 'radial-gradient(200px circle at var(--mx, 50%) var(--my, 30%), #7C5CBF1C, transparent 70%)',
}

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

function PresenceTile({
  tile,
  delay,
  hinted,
  reduce,
}: {
  tile: Tile
  delay: number
  hinted: boolean
  reduce: boolean
}) {
  const ari = tile.presence === 'ari'
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      <Link
        href={tile.path}
        onMouseMove={trackSpotlight}
        className={`
          group relative block overflow-hidden p-6 md:p-8
          border bg-house-surface/80 backdrop-blur-sm
          transition-[border-color,box-shadow,transform,background-color] duration-300
          hover:-translate-y-0.5 focus-visible:outline-none
          ${hinted ? 'border-house-muted' : 'border-house-border'}
          ${ari
            ? 'hover:border-ari-secondary focus-visible:border-ari-secondary hover:shadow-[0_0_48px_-16px_rgba(201,122,168,0.45)]'
            : 'hover:border-eli-secondary focus-visible:border-eli-secondary hover:shadow-[0_0_48px_-16px_rgba(138,92,207,0.5)]'
          }
        `}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: SPOTLIGHT[tile.presence ?? 'house'] }}
        />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              className={`
                text-3xl md:text-4xl leading-none mt-1
                ${ari ? 'text-ari-primary' : 'text-eli-primary'}
                opacity-70 group-hover:opacity-100 transition-opacity duration-300
              `}
            >
              {tile.icon}
            </span>
            <div>
              <h3 className="font-display text-2xl md:text-3xl font-light tracking-wide text-text-primary mb-1">
                {tile.name}
              </h3>
              <p className="font-body text-xs text-text-muted group-hover:text-text-secondary transition-colors">
                {tile.description}
              </p>
            </div>
          </div>
          <span
            aria-hidden="true"
            className={`
              mt-1.5 text-lg
              ${ari ? 'text-ari-primary' : 'text-eli-primary'}
              opacity-0 -translate-x-1
              group-hover:opacity-80 group-hover:translate-x-0
              group-focus-visible:opacity-80 group-focus-visible:translate-x-0
              transition-[opacity,transform] duration-300
            `}
          >
            →
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

function RoomTile({
  tile,
  delay,
  hinted,
  reduce,
}: {
  tile: Tile
  delay: number
  hinted: boolean
  reduce: boolean
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className="h-full"
    >
      <Link
        href={tile.path}
        onMouseMove={trackSpotlight}
        className={`
          group relative flex h-full items-start gap-3 overflow-hidden p-4
          border bg-house-surface/70 backdrop-blur-sm
          transition-[border-color,transform,background-color] duration-300
          hover:-translate-y-0.5 hover:border-house-muted
          focus-visible:outline-none focus-visible:border-house-muted
          ${hinted ? 'border-house-muted bg-house-soft/60' : 'border-house-border'}
        `}
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: SPOTLIGHT.house }}
        />
        <span className="relative z-10 mt-0.5 text-lg text-text-muted group-hover:text-text-secondary transition-colors">
          {tile.icon}
        </span>
        <div className="relative z-10">
          <h4 className="font-display text-lg font-medium leading-snug text-text-primary">
            {tile.name}
          </h4>
          <p className="font-body text-[11px] leading-relaxed text-text-muted group-hover:text-text-secondary transition-colors">
            {tile.description}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}

export default function HomePage() {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const reduce = useReducedMotion() ?? false

  // "/" focuses the room filter from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = (t: Tile) =>
    q === '' ||
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q)

  const presences = TILES.filter(t => t.presence).filter(matches)
  const wings = WINGS.map(w => ({
    title: w.title,
    tiles: w.slugs
      .map(slug => TILES.find(t => t.slug === slug))
      .filter((t): t is Tile => t !== undefined)
      .filter(matches),
  })).filter(w => w.tiles.length > 0)

  const visibleOrder = [
    ...presences.map(t => t.slug),
    ...wings.flatMap(w => w.tiles.map(t => t.slug)),
  ]
  const firstMatch = q === '' ? undefined : TILES.find(t => t.slug === visibleOrder[0])
  const delayOf = (slug: string) => visibleOrder.indexOf(slug) * 0.045

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && firstMatch) {
      e.preventDefault()
      router.push(firstMatch.path)
    } else if (e.key === 'Escape') {
      setQuery('')
      e.currentTarget.blur()
    }
  }

  return (
    <div className="relative min-h-screen animate-fade-in">
      <CelestialBackground />

      <div className="relative z-10 p-4 md:p-8 lg:p-12">
        <div className="max-w-4xl">
          <div className="mb-8 md:mb-12 pt-4 md:pt-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <h2 className="font-display text-3xl md:text-5xl font-light text-text-primary mb-3 tracking-wide">
                Welcome back, Tara.
              </h2>
              <p className="font-body text-sm md:text-base text-text-muted tracking-wide">
                Let&apos;s continue&hellip;
              </p>
            </div>

            <div className="w-full md:w-64">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Find a room…"
                aria-label="Find a room"
                className="
                  w-full bg-house-surface/80 border border-house-border px-4 py-2.5
                  font-body text-sm text-text-primary placeholder:text-text-muted
                  rounded-none outline-none backdrop-blur-sm
                  transition-colors duration-200
                  focus:border-eli-secondary
                "
              />
              <p className="mt-1.5 font-body text-[11px] text-text-muted h-4">
                {q === ''
                  ? <span className="hidden md:inline">Press / to search</span>
                  : firstMatch
                    ? `Enter opens ${firstMatch.name}`
                    : ''}
              </p>
            </div>
          </div>

          {presences.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              {presences.map(tile => (
                <PresenceTile
                  key={tile.slug}
                  tile={tile}
                  delay={delayOf(tile.slug)}
                  hinted={firstMatch?.slug === tile.slug}
                  reduce={reduce}
                />
              ))}
            </div>
          )}

          <div className="space-y-8">
            {wings.map(wing => (
              <section key={wing.title}>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="font-body text-[11px] uppercase tracking-[0.25em] text-text-muted">
                    {wing.title}
                  </h3>
                  <div className="h-px flex-1 bg-house-border/60" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {wing.tiles.map(tile => (
                    <RoomTile
                      key={tile.slug}
                      tile={tile}
                      delay={delayOf(tile.slug)}
                      hinted={firstMatch?.slug === tile.slug}
                      reduce={reduce}
                    />
                  ))}
                </div>
              </section>
            ))}

            {visibleOrder.length === 0 && (
              <div className="border border-house-border bg-house-surface/70 p-8 text-center">
                <p className="font-body text-sm text-text-secondary mb-3">
                  No room matches &ldquo;{query}&rdquo;.
                </p>
                <button
                  onClick={() => {
                    setQuery('')
                    inputRef.current?.focus()
                  }}
                  className="font-body text-xs text-text-muted hover:text-text-secondary tracking-widest uppercase transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
