'use client'

// Courtyard — Gaming Wing · Phase 1B
// Private, local, read-only draft model preview viewer.
//
// Features: Ari/Eli/Tara switcher (one model at a time), neutral studio
// lighting, sRGB output, ACES tone mapping with an adjustable exposure slider,
// debug-grey material toggle, auto-framing, Suspense loading + error fallback.
//
// Governance: viewer-only. No approval, save, memory, archive, library, database,
// model calls, or autonomy. Nothing here mutates the source .glb files.

import { Suspense, useState, Component, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import CourtyardDraftModel from './CourtyardDraftModel'
import {
  COURTYARD_CHARACTER_IDS,
  COURTYARD_DRAFT_MODELS,
  courtyardModelFileName,
  courtyardVariantOptions,
  type CourtyardCharacterId,
} from '@/lib/courtyard/draftModels'

function LoadingDot() {
  return (
    <Html center>
      <div className="w-2 h-2 bg-eli-primary rounded-full animate-pulse-soft" />
    </Html>
  )
}

function FailureNotice() {
  return (
    <Html center>
      <div className="w-64 text-center space-y-2 pointer-events-none">
        <p className="font-body text-sm text-amber-300">Draft model could not be loaded.</p>
        <p className="font-body text-[11px] text-text-muted">
          Local preview-only asset; unavailable unless the House is running locally with
          the draft files present. This does not indicate an approved or failed asset.
        </p>
      </div>
    </Html>
  )
}

// Error boundary lives inside the Canvas so it reliably catches loader errors
// from the R3F tree. Resets when the selected model / debug mode changes.
class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

export default function CourtyardPreviewClient() {
  const [selected, setSelected] = useState<CourtyardCharacterId>('ari')
  const [variant, setVariant] = useState<string>('draft')
  const [exposure, setExposure] = useState(1.0)
  const [debugGrey, setDebugGrey] = useState(false)

  const model = COURTYARD_DRAFT_MODELS[selected]
  const variantOptions = courtyardVariantOptions(selected)
  // Guard: if the active variant isn't valid for this character (e.g. a candidate
  // selected on Ari then switching to Eli), fall back to 'draft'.
  const effectiveVariant = variantOptions.some((o) => o.id === variant) ? variant : 'draft'
  const activeFileName = courtyardModelFileName(selected, effectiveVariant) ?? model.fileName
  const variantLabel = variantOptions.find((o) => o.id === effectiveVariant)?.label ?? 'Original draft'
  const resetKey = `${selected}:${effectiveVariant}:${debugGrey}`

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b border-house-border">
        <div className="flex gap-1.5">
          {COURTYARD_CHARACTER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSelected(id); setVariant('draft') }}
              className={`font-body text-xs px-3 py-1.5 border transition-all ${
                selected === id
                  ? 'border-eli-primary text-eli-primary'
                  : 'border-house-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {COURTYARD_DRAFT_MODELS[id].displayName}
            </button>
          ))}
        </div>

        {/* Variant selector: original / fixed / per-character candidate (viewer-only) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-body text-[11px] text-text-muted">Variant</span>
          {variantOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setVariant(opt.id)}
              className={`font-body text-xs px-3 py-1.5 border transition-all ${
                effectiveVariant === opt.id
                  ? 'border-eli-primary text-eli-primary'
                  : 'border-house-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 font-body text-[11px] text-text-muted">
          Exposure
          <input
            type="range"
            min={0.2}
            max={2.0}
            step={0.05}
            value={exposure}
            onChange={(e) => setExposure(parseFloat(e.target.value))}
          />
          <span className="tabular-nums text-text-secondary w-9">{exposure.toFixed(2)}</span>
        </label>

        <label className="flex items-center gap-2 font-body text-[11px] text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={debugGrey}
            onChange={(e) => setDebugGrey(e.target.checked)}
          />
          Debug grey
        </label>
      </div>

      {/* Viewer */}
      <div className="relative flex-1 min-h-0 bg-house-bg">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [2.5, 1.6, 3.2], fov: 45 }}
          gl={{
            antialias: true,
            // sRGB output + neutral (ACES) tone mapping + adjustable exposure.
            // R3F re-applies these gl props on each render, so exposure is live.
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: exposure,
          }}
        >
          {/* Neutral studio lighting (no external HDR / CDN environment). */}
          <ambientLight intensity={0.5} />
          <hemisphereLight args={['#ffffff', '#3a3a44', 0.6]} />
          <directionalLight position={[5, 6, 5]} intensity={1.1} />
          <directionalLight position={[-4, 2, -3]} intensity={0.5} />
          <directionalLight position={[0, 3, -6]} intensity={0.4} />

          <Suspense fallback={<LoadingDot />}>
            <ModelErrorBoundary resetKey={resetKey} fallback={<FailureNotice />}>
              <group key={resetKey}>
                <CourtyardDraftModel id={selected} variant={effectiveVariant} debugGrey={debugGrey} />
              </group>
            </ModelErrorBoundary>
          </Suspense>

          <OrbitControls makeDefault enableDamping minDistance={0.5} maxDistance={30} />
        </Canvas>
      </div>

      {/* Per-selection draft metadata (no approval / save / memory affordances) */}
      <div className="px-4 py-3 border-t border-house-border grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-body text-[11px]">
        <div>
          <span className="text-text-muted">Current file: </span>
          <span className="text-text-secondary">{activeFileName}</span>
        </div>
        <div>
          <span className="text-text-muted">Variant: </span>
          <span className="text-text-secondary">{variantLabel}</span>
        </div>
        <div>
          <span className="text-text-muted">Asset status: </span>
          <span className="text-text-secondary">{model.status}</span>
        </div>
        <div>
          <span className="text-text-muted">Source: </span>
          <span className="text-text-secondary">{model.source}</span>
        </div>
        <div>
          <span className="text-text-muted">Replit status: </span>
          <span className="text-text-secondary">
            prototype/design preview lab only; not approval authority
          </span>
        </div>
      </div>
    </div>
  )
}
