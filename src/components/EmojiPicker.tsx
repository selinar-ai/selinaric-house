'use client'

import { useState, useRef, useEffect } from 'react'

const EMOJI_CATEGORIES = [
  {
    label: 'Smileys',
    emojis: ['😊', '😂', '🥰', '😍', '🥹', '😘', '😌', '🤭', '😏', '🫠', '😴', '🤔', '😅', '😭', '🥺', '😤', '🙄', '😳', '🫣', '😈'],
  },
  {
    label: 'Hearts',
    emojis: ['❤️', '🖤', '💜', '💗', '💕', '💘', '💖', '🤍', '❤️‍🔥', '💔', '🫶', '💝', '💞'],
  },
  {
    label: 'Gestures',
    emojis: ['👋', '🤲', '🫂', '💪', '🤝', '🙏', '✌️', '🤞', '🫰', '👀', '👁️', '🫡', '💅'],
  },
  {
    label: 'Nature',
    emojis: ['🌙', '✨', '🔥', '🌊', '🌸', '🌿', '⚡', '🦋', '🌹', '🍃', '☀️', '🌧️', '❄️'],
  },
  {
    label: 'Symbols',
    emojis: ['💫', '⭐', '🎵', '🎶', '💭', '💬', '🏠', '🗝️', '🔮', '🪞', '🕯️', '📌', '🎯'],
  },
]

interface Props {
  onSelect: (emoji: string) => void
}

export default function EmojiPicker({ onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        type="button"
        className={`
          shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
          border transition-all duration-200 text-lg
          ${open
            ? 'text-text-secondary border-house-muted'
            : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
          }
        `}
        title="Emoji"
      >
        😊
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 md:w-80 bg-house-surface border border-house-border shadow-lg z-30 animate-fade-in">
          {/* Category tabs */}
          <div className="flex border-b border-house-border">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(i)}
                className={`flex-1 py-2 font-body text-[10px] tracking-wide uppercase transition-colors ${
                  activeCategory === i
                    ? 'text-text-secondary bg-house-bg'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-2 grid grid-cols-7 gap-0.5 max-h-48 overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onSelect(emoji)
                  setOpen(false)
                }}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-xl hover:bg-house-bg rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
