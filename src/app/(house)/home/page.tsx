import Link from 'next/link'
import { ROOMS } from '@/lib/rooms'

export default function HomePage() {
  return (
    <div className="min-h-screen p-4 md:p-8 lg:p-12 animate-fade-in">
      <div className="mb-8 md:mb-16">
        <h2 className="font-display text-2xl md:text-4xl font-light text-text-primary mb-2">
          Welcome home.
        </h2>
        <p className="font-body text-sm text-text-muted">
          Choose a room.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {ROOMS.map((room, i) => (
          <Link
            key={room.slug}
            href={room.path}
            className={`
              group relative p-6 border border-house-border
              bg-house-surface hover:bg-house-bg
              transition-all duration-300
              hover:border-current
              ${room.colorClass}
              animate-fade-in
            `}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                {room.icon}
              </span>
              <div>
                <h3 className="font-display text-xl font-medium text-text-primary mb-1">
                  {room.name}
                </h3>
                <p className="font-body text-xs text-text-muted leading-relaxed">
                  {room.description}
                </p>
              </div>
            </div>

            <div className={`
              absolute inset-0 opacity-0 group-hover:opacity-100
              transition-opacity duration-300 pointer-events-none
              ${room.bgClass}
            `} />
          </Link>
        ))}
      </div>
    </div>
  )
}
