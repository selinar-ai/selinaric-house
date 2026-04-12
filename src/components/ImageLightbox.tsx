'use client'

import { useEffect } from 'react'

interface Props {
  url: string
  onClose: () => void
}

export default function ImageLightbox({ url, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
        title="Close"
      >
        ✕
      </button>
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
