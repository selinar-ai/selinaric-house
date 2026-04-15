'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ROOMS } from '@/lib/rooms'

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="
      md:hidden shrink-0
      bg-house-surface border-t border-house-border
      flex items-stretch
      safe-bottom
    ">
      {ROOMS.map(room => {
        const isActive = pathname === room.path ||
          pathname.startsWith(room.path + '/')

        return (
          <Link
            key={room.slug}
            href={room.path}
            className={`
              flex-1 flex flex-col items-center justify-center gap-0.5
              py-2 min-h-[56px]
              font-body text-xs transition-all duration-200
              ${isActive
                ? `${room.colorClass} bg-house-bg`
                : 'text-text-muted'
              }
            `}
          >
            <span className="text-lg">{room.icon}</span>
            <span className="text-[10px] tracking-wide">{room.name}</span>
          </Link>
        )
      })}
    </nav>
  )
}
