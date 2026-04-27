'use client'

import { useState, useRef, useEffect } from 'react'

const EMOJI_CATEGORIES = [
  {
    label: 'Faces',
    icon: '😊',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑',
      '🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','😏','😒',
      '🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧',
      '🥵','🥶','🥴','😵','🤯','🥳','😎','🤓','🧐','😕','😟','🙁','☹️','😮',
      '😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣',
      '😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️',
    ],
  },
  {
    label: 'Hands',
    icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞',
      '🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊',
      '🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅',
    ],
  },
  {
    label: 'Hearts',
    icon: '❤️',
    emojis: [
      '❤️','🩷','🧡','💛','💚','💙','🩵','💜','🤎','🖤','🩶','🤍','💔',
      '❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟',
      '✨','⭐','🌟','💫','🔥','🕯️','🗝️','🛡️','🪞','🧿','🪶','🪽',
      '♾️','✅','❌','⚠️','🛑','📌',
    ],
  },
  {
    label: 'Food',
    icon: '☕',
    emojis: [
      '☕','🍵','🧃','🥛','🍷','🍺','🍻','🥂','🍰','🎂','🍕','🍔','🌮',
      '🌯','🍟','🌭','🍜','🍝','🍣','🍱','🍫','🍪','🍯','🥑','🍳','🥩',
      '🥗','🥐','🍓','🍒','🍋',
    ],
  },
  {
    label: 'Nature',
    icon: '🌿',
    emojis: [
      '🐶','🐱','🦁','🐯','🐵','🐼','🐻','🐨','🐰','🦊','🐺','🐴','🐦',
      '🐧','🐸','🐢','🐍','🐝','🦋','🐙','🐠','🐋','🌸','🌹','🌷','🌻',
      '🌙','☀️','🌧️','⛈️','🌈','🌊','🌲','🌿','🍃','🌵',
    ],
  },
  {
    label: 'Things',
    icon: '🏠',
    emojis: [
      '🏠','🏡','🛠️','🧱','🧰','🔧','🔨','⚙️','💻','🖥️','📱','📷','🎧',
      '🎙️','🔍','📚','📖','📝','📎','🗂️','🗃️','🧭','🗺️','⏰','🕰️','💡',
      '🔒','🔓',
    ],
  },
  {
    label: 'People',
    icon: '🙋',
    emojis: [
      '🙋‍♀️','🙋‍♂️','🤷‍♀️','🤷‍♂️','🏃‍♀️','🏃‍♂️','💃','🕺','🧘‍♀️','🧘‍♂️',
      '👩‍💻','👨‍💻','🧑‍🍳','👮‍♀️','👰‍♀️','🤵‍♂️','🧙‍♀️','🧙‍♂️',
    ],
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
          {/* Category tabs — emoji icons, horizontally scrollable */}
          <div className="flex border-b border-house-border overflow-x-auto scrollbar-none">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(i)}
                title={cat.label}
                className={`shrink-0 px-3 py-2.5 text-base transition-colors ${
                  activeCategory === i
                    ? 'bg-house-bg opacity-100'
                    : 'opacity-50 hover:opacity-80'
                }`}
              >
                {cat.icon}
              </button>
            ))}
          </div>

          {/* Category label */}
          <div className="px-3 pt-2 pb-0.5">
            <span className="font-body text-[9px] tracking-widest uppercase text-text-muted">
              {EMOJI_CATEGORIES[activeCategory].label}
            </span>
          </div>

          {/* Emoji grid */}
          <div className="p-2 grid grid-cols-7 gap-0.5 max-h-52 overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory].emojis.map(emoji => (
              <button
                key={emoji}
                onClick={() => {
                  onSelect(emoji)
                  setOpen(false)
                }}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-xl hover:bg-house-bg rounded transition-colors"
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
