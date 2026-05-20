import Link from 'next/link'
import { ROOMS } from '@/lib/rooms'
import CelestialBackground from '@/components/CelestialBackground'

export default function HomePage() {
  return (
    <div className="relative min-h-screen animate-fade-in">
      <CelestialBackground />

      <div className="relative z-10 p-4 md:p-8 lg:p-12">
        <div className="mb-10 md:mb-16 pt-4 md:pt-8">
          <h2 className="font-display text-3xl md:text-5xl font-light text-text-primary mb-3 tracking-wide">
            Welcome back, Tara.
          </h2>
          <p className="font-body text-sm md:text-base text-text-muted tracking-wide">
            Let&apos;s continue&hellip;
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          {ROOMS.map((room, i) => (
            <Link
              key={room.slug}
              href={room.path}
              className={`
                group relative p-6 border border-house-border
                bg-house-surface/80 backdrop-blur-sm
                hover:bg-house-bg/90 active:bg-house-bg/90
                transition-all duration-300
                hover:border-current active:border-current
                focus-visible:border-current focus-visible:outline-none
                ${room.colorClass}
                animate-fade-in
              `}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {/* Decorative hover overlay — behind content */}
              <div className={`
                absolute inset-0 opacity-0
                group-hover:opacity-100 group-active:opacity-100 group-focus-visible:opacity-100
                transition-opacity duration-300 pointer-events-none
                ${room.presence ? room.bgClass : 'bg-house-muted/20'}
              `} />

              {/* Content — above overlay */}
              <div className="relative z-10 flex items-start gap-4">
                <span className="text-2xl mt-0.5 opacity-60 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                  {room.icon}
                </span>
                <div>
                  <h3 className="font-display text-xl font-medium text-text-primary mb-1">
                    {room.name}
                  </h3>
                  <p className="font-body text-xs text-text-muted leading-relaxed group-hover:text-text-secondary group-active:text-text-secondary transition-colors">
                    {room.description}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
