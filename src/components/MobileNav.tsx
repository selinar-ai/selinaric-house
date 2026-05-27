'use client'

// Phase 1C — Mobile bottom navigation.
// Horizontally scrollable row of equal-width House-style tiles.
// Replaces the cramped icon dock with readable labels and clean spacing.
// Desktop sidebar is unchanged — this component is md:hidden.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROOMS } from '@/lib/rooms'

// Mobile navigation order — most-used rooms first, then reference, then support.
const MOBILE_NAV_ORDER: string[] = [
  'ari', 'eli', 'lounge', 'continuity', 'library', 'archives',
  'recall', 'watchtower', 'workshop', 'ontology-lab', 'relational-map', 'pulse', 'notes',
  'reflections',
]

export default function MobileNav() {
  const pathname = usePathname()

  // Sort rooms by MOBILE_NAV_ORDER. Any room not in the order list goes at the end.
  const orderedRooms = [...ROOMS].sort((a, b) => {
    const ai = MOBILE_NAV_ORDER.indexOf(a.slug)
    const bi = MOBILE_NAV_ORDER.indexOf(b.slug)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return (
    <nav
      className="
        md:hidden shrink-0
        bg-house-surface border-t border-house-border
        overflow-x-auto scrollbar-hide
      "
      style={{
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex w-max min-w-full">
        {orderedRooms.map(room => {
          const isActive = pathname === room.path ||
            pathname.startsWith(room.path + '/')

          return (
            <Link
              key={room.slug}
              href={room.path}
              className={`
                flex items-center justify-center
                min-w-[88px] min-h-[48px] px-3
                border-r border-house-border
                font-body text-[11px] tracking-wide
                transition-all duration-200
                whitespace-nowrap
                ${isActive
                  ? `${room.colorClass} bg-house-bg border-b-2 ${room.presence ? (room.presence === 'ari' ? 'border-b-ari-secondary' : 'border-b-eli-secondary') : 'border-b-house-muted'}`
                  : 'text-text-muted hover:text-text-secondary'
                }
              `}
            >
              {room.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
