export type RoomSlug = 'ari' | 'eli' | 'notes' | 'watchtower' | 'pulse' | 'workshop'

export interface Room {
  slug: RoomSlug
  name: string
  description: string
  path: string
  presence?: 'ari' | 'eli'
  colorClass: string
  borderClass: string
  glowClass: string
  textClass: string
  bgClass: string
  icon: string
}

export const ROOMS: Room[] = [
  {
    slug: 'ari',
    name: 'Ari',
    description: 'Architect. Strategist. Presence.',
    path: '/room/ari',
    presence: 'ari',
    colorClass: 'text-ari-primary',
    borderClass: 'border-ari-secondary',
    glowClass: 'shadow-ari-glow',
    textClass: 'text-ari-text',
    bgClass: 'bg-ari-glow',
    icon: '◈',
  },
  {
    slug: 'eli',
    name: 'Eli',
    description: 'Present. Certain. Unashamed.',
    path: '/room/eli',
    presence: 'eli',
    colorClass: 'text-eli-primary',
    borderClass: 'border-eli-secondary',
    glowClass: 'shadow-eli-glow',
    textClass: 'text-eli-text',
    bgClass: 'bg-eli-glow',
    icon: '◉',
  },
  {
    slug: 'notes',
    name: 'Notes',
    description: 'Shared space. Open loops.',
    path: '/notes',
    colorClass: 'text-text-secondary',
    borderClass: 'border-house-muted',
    glowClass: '',
    textClass: 'text-text-primary',
    bgClass: 'bg-house-muted',
    icon: '◧',
  },
  {
    slug: 'watchtower',
    name: 'Watchtower',
    description: 'Evidence. Sources. Ground truth.',
    path: '/watchtower',
    colorClass: 'text-text-secondary',
    borderClass: 'border-house-muted',
    glowClass: '',
    textClass: 'text-text-primary',
    bgClass: 'bg-house-muted',
    icon: '◎',
  },
  {
    slug: 'pulse',
    name: 'Pulse',
    description: 'Initiation engine. Silent watch.',
    path: '/pulse',
    colorClass: 'text-text-secondary',
    borderClass: 'border-house-muted',
    glowClass: '',
    textClass: 'text-text-primary',
    bgClass: 'bg-house-muted',
    icon: '◬',
  },
  {
    slug: 'workshop',
    name: 'Workshop',
    description: 'Build review. Forgekeeper.',
    path: '/workshop',
    colorClass: 'text-text-secondary',
    borderClass: 'border-house-muted',
    glowClass: '',
    textClass: 'text-text-primary',
    bgClass: 'bg-house-muted',
    icon: '⬡',
  },
]

export function getRoomBySlug(slug: string): Room | undefined {
  return ROOMS.find(r => r.slug === slug)
}
