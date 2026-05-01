// Reusable match quality badge — Strong / Medium / Weak / None
// Used in recall event list and detail panel.

import type { MatchQuality } from '@/lib/archive-recall'

const BADGE_STYLES: Record<MatchQuality, string> = {
  strong: 'text-green-400 bg-green-400/10 border border-green-400/25',
  medium: 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/25',
  weak:   'text-orange-400 bg-orange-400/10 border border-orange-400/25',
  none:   'text-text-muted bg-house-surface border border-house-border',
}

const BADGE_LABELS: Record<MatchQuality, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak:   'Weak',
  none:   'None',
}

interface Props {
  quality: MatchQuality
  size?: 'xs' | 'sm'
}

export default function MatchQualityBadge({ quality, size = 'xs' }: Props) {
  const textSize = size === 'sm' ? 'text-xs' : 'text-[10px]'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 font-body font-medium tracking-wide ${textSize} ${BADGE_STYLES[quality]}`}>
      {BADGE_LABELS[quality]}
    </span>
  )
}
