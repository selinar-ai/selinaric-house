'use client'

// Client-only loader for the Courtyard preview lab. WebGL/three.js must never
// run during SSR, so the actual viewer is dynamically imported with ssr:false.

import dynamic from 'next/dynamic'

const CourtyardPreviewClient = dynamic(
  () => import('./CourtyardPreviewClient'),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-house-bg">
        <div className="w-2 h-2 bg-eli-primary rounded-full animate-pulse-soft" />
      </div>
    ),
  }
)

export default function CourtyardPreviewLoader() {
  return <CourtyardPreviewClient />
}
