'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ROOMS } from '@/lib/rooms'
import { logout } from '@/lib/auth'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  function handleLogout() {
    logout()
    router.push('/')
  }

  return (
    <aside className="
      fixed left-0 top-0 h-full w-56
      bg-house-surface border-r border-house-border
      flex flex-col z-40
      animate-slide-in
    ">
      <div className="px-6 py-6 border-b border-house-border">
        <h1 className="font-display text-lg font-light tracking-[0.25em] text-text-primary">
          SELINÁRIC
        </h1>
        <p className="font-body text-xs text-text-muted tracking-widest mt-1">
          HOUSE
        </p>
      </div>

      <nav className="flex-1 py-4">
        {ROOMS.map(room => {
          const isActive = pathname === room.path ||
            pathname.startsWith(room.path + '/')

          return (
            <Link
              key={room.slug}
              href={room.path}
              className={`
                flex items-center gap-3 px-6 py-3.5
                font-body text-sm transition-all duration-200
                border-l-2 group
                ${isActive
                  ? `${room.colorClass} border-current bg-house-bg`
                  : 'text-text-muted border-transparent hover:text-text-secondary hover:bg-house-bg hover:border-house-muted'
                }
              `}
            >
              <span className={`text-base ${isActive ? room.colorClass : ''}`}>
                {room.icon}
              </span>
              <div>
                <div className="font-medium tracking-wide">
                  {room.name}
                </div>
                <div className="text-xs text-text-muted mt-0.5 leading-tight">
                  {room.description}
                </div>
              </div>
            </Link>
          )
        })}
      </nav>

      <div className="px-6 py-4 border-t border-house-border">
        <button
          onClick={handleLogout}
          className="
            font-body text-xs text-text-muted
            hover:text-text-secondary tracking-widest uppercase
            transition-colors duration-200
          "
        >
          Leave
        </button>
      </div>
    </aside>
  )
}
