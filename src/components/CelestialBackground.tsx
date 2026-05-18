'use client'

import { useEffect, useRef, useState } from 'react'

// Phase 1B — Animated celestial background for the House home screen.
//
// Layered approach:
// 1. Deep plum/black gradient base (CSS)
// 2. Soft nebula haze (CSS radial gradients, animated)
// 3. Sparse twinkling stars (canvas)
// 4. Faint constellation lines (canvas)
//
// Performance:
// - Canvas for stars/constellations (GPU-composited via will-change)
// - CSS for gradient/haze (no JS overhead)
// - Respects prefers-reduced-motion (static gradient only)
// - Mobile: fewer stars, no constellations, simplified haze

const STAR_COUNT_DESKTOP = 90
const STAR_COUNT_MOBILE = 35
const CONSTELLATION_COUNT = 4
const CONSTELLATION_MIN_STARS = 3
const CONSTELLATION_MAX_STARS = 5

interface Star {
  x: number
  y: number
  radius: number
  baseOpacity: number
  twinkleSpeed: number
  twinkleOffset: number
  color: string
}

interface ConstellationStar {
  x: number
  y: number
}

const STAR_COLORS = [
  '#E8D8B8',  // warm gold-white
  '#F3EAF6',  // cool white
  '#D8C6F6',  // soft violet-white
  '#C4924A',  // gold accent
  '#C45E8A',  // orchid (rare)
]

function pickStarColor(): string {
  const r = Math.random()
  if (r < 0.45) return STAR_COLORS[0]
  if (r < 0.75) return STAR_COLORS[1]
  if (r < 0.90) return STAR_COLORS[2]
  if (r < 0.97) return STAR_COLORS[3]
  return STAR_COLORS[4]
}

function createStars(count: number, w: number, h: number): Star[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    radius: Math.random() * 1.2 + 0.3,
    baseOpacity: Math.random() * 0.5 + 0.2,
    twinkleSpeed: Math.random() * 0.0008 + 0.0003,
    twinkleOffset: Math.random() * Math.PI * 2,
    color: pickStarColor(),
  }))
}

function createConstellations(count: number, w: number, h: number): ConstellationStar[][] {
  const constellations: ConstellationStar[][] = []
  for (let c = 0; c < count; c++) {
    const starCount = CONSTELLATION_MIN_STARS + Math.floor(Math.random() * (CONSTELLATION_MAX_STARS - CONSTELLATION_MIN_STARS + 1))
    const cx = Math.random() * w * 0.7 + w * 0.15
    const cy = Math.random() * h * 0.6 + h * 0.1
    const spread = Math.min(w, h) * 0.12
    const stars: ConstellationStar[] = []
    for (let s = 0; s < starCount; s++) {
      stars.push({
        x: cx + (Math.random() - 0.5) * spread * 2,
        y: cy + (Math.random() - 0.5) * spread * 2,
      })
    }
    constellations.push(stars)
  }
  return constellations
}

export default function CelestialBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0
    let stars: Star[] = []
    let constellations: ConstellationStar[][] = []

    function resize() {
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = w
      canvas!.height = h
      const count = isMobile ? STAR_COUNT_MOBILE : STAR_COUNT_DESKTOP
      stars = createStars(count, w, h)
      constellations = isMobile ? [] : createConstellations(CONSTELLATION_COUNT, w, h)
    }

    resize()
    window.addEventListener('resize', resize)

    function draw(time: number) {
      ctx!.clearRect(0, 0, w, h)

      // Draw stars
      for (const star of stars) {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset)
        const opacity = star.baseOpacity + twinkle * 0.25
        ctx!.beginPath()
        ctx!.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
        ctx!.fillStyle = star.color
        ctx!.globalAlpha = Math.max(0.05, Math.min(0.9, opacity))
        ctx!.fill()
      }

      // Draw constellation lines (desktop only)
      if (constellations.length > 0) {
        ctx!.globalAlpha = 0.06
        ctx!.strokeStyle = '#7C5CBF'
        ctx!.lineWidth = 0.5
        for (const constellation of constellations) {
          if (constellation.length < 2) continue
          ctx!.beginPath()
          ctx!.moveTo(constellation[0].x, constellation[0].y)
          for (let i = 1; i < constellation.length; i++) {
            ctx!.lineTo(constellation[i].x, constellation[i].y)
          }
          ctx!.stroke()

          // Small dots at constellation vertices
          for (const s of constellation) {
            ctx!.beginPath()
            ctx!.arc(s.x, s.y, 1.2, 0, Math.PI * 2)
            ctx!.globalAlpha = 0.15
            ctx!.fillStyle = '#9B7DE0'
            ctx!.fill()
          }
        }
      }

      ctx!.globalAlpha = 1
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [reducedMotion, isMobile])

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Layer 1: Deep plum gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(160deg, #09060F 0%, #100B1A 30%, #181020 60%, #21152E 100%)',
        }}
      />

      {/* Layer 2: Nebula haze — soft animated radial gradients */}
      {!reducedMotion ? (
        <>
          <div
            className="absolute celestial-haze-1"
            style={{
              width: '60vw',
              height: '60vw',
              top: '5%',
              right: '-10%',
              background: 'radial-gradient(ellipse at center, #3B1D5A18 0%, #3B1D5A08 40%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(40px)',
            }}
          />
          <div
            className="absolute celestial-haze-2"
            style={{
              width: isMobile ? '50vw' : '45vw',
              height: isMobile ? '50vw' : '45vw',
              bottom: '10%',
              left: '-5%',
              background: 'radial-gradient(ellipse at center, #C45E8A0A 0%, #5A2A7708 40%, transparent 70%)',
              borderRadius: '50%',
              filter: 'blur(50px)',
            }}
          />
          <div
            className="absolute celestial-haze-3"
            style={{
              width: '35vw',
              height: '35vw',
              top: '40%',
              left: '30%',
              background: 'radial-gradient(ellipse at center, #7C5CBF06 0%, transparent 60%)',
              borderRadius: '50%',
              filter: 'blur(60px)',
            }}
          />
        </>
      ) : (
        /* Reduced motion: static subtle haze only */
        <div
          className="absolute"
          style={{
            width: '60vw',
            height: '60vw',
            top: '10%',
            right: '-10%',
            background: 'radial-gradient(ellipse at center, #3B1D5A10 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(40px)',
          }}
        />
      )}

      {/* Layer 3+4: Stars and constellation canvas */}
      {!reducedMotion && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ willChange: 'transform' }}
        />
      )}
    </div>
  )
}
