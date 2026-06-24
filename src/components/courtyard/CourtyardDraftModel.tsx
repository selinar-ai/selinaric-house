'use client'

// Courtyard — Gaming Wing · Phase 1B
// Loads and displays ONE draft model. Suspends while loading; throws on failure
// (caught by the viewer's error boundary). All transformations are viewer-only:
// the model is deep-cloned so the cached source scene is never mutated, and no
// data is ever written back to the .glb.

import { useMemo } from 'react'
import { Bounds, Center, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { draftModelApiPath, type CourtyardCharacterId } from '@/lib/courtyard/draftModels'

export default function CourtyardDraftModel({
  id,
  variant,
  debugGrey,
}: {
  id: CourtyardCharacterId
  variant: string
  debugGrey: boolean
}) {
  const { scene } = useGLTF(draftModelApiPath(id, variant))

  // Viewer-only deep clone. Debug-grey swaps a flat neutral material on the
  // clone to isolate geometry from the texture/colour pipeline — it never
  // touches the original scene or asset.
  const display = useMemo(() => {
    const clone = scene.clone(true)
    if (debugGrey) {
      const grey = new THREE.MeshStandardMaterial({
        color: '#9a9a9a',
        roughness: 0.85,
        metalness: 0.0,
      })
      clone.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) mesh.material = grey
      })
    }
    return clone
  }, [scene, debugGrey])

  return (
    <Bounds fit clip observe margin={1.2}>
      <Center>
        <primitive object={display} />
      </Center>
    </Bounds>
  )
}
