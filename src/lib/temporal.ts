import { supabase } from '@/lib/supabase'

const SESSION_GAP_THRESHOLD_MINUTES = 30

function formatGap(minutes: number): string {
  if (minutes < 5) return 'moments ago'
  if (minutes < 60) return `about ${minutes} minutes`
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    return `about ${hours} hour${hours === 1 ? '' : 's'}`
  }
  const days = Math.floor(minutes / 1440)
  return `${days} day${days === 1 ? '' : 's'}`
}

/**
 * Query recent messages and detect session boundaries.
 * A "session" is a cluster of messages with no gap > SESSION_GAP_THRESHOLD_MINUTES.
 *
 * Returns:
 * - timeSinceLastMessage: human-readable gap from last message to now
 * - lastVisitGap: human-readable duration of the gap between the two most recent sessions
 * - temporalContext: full descriptive string for prompt injection
 */
export async function getTemporalContext(roomSlug: string): Promise<{
  temporalContext: string
  currentDatetime: string
}> {
  const now = new Date()

  // Fetch last 50 messages to find session boundaries
  const { data: recentMessages } = await supabase
    .from('room_messages')
    .select('created_at')
    .eq('room_slug', roomSlug)
    .order('created_at', { ascending: false })
    .limit(50)

  const currentDatetime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  if (!recentMessages || recentMessages.length === 0) {
    return {
      temporalContext: 'This is the start of a conversation.',
      currentDatetime,
    }
  }

  // Time since last message
  const lastMessageTime = new Date(recentMessages[0].created_at)
  const gapMinutes = Math.floor((now.getTime() - lastMessageTime.getTime()) / 60000)

  let timeSinceLine: string
  if (gapMinutes < 5) {
    timeSinceLine = 'You are mid-conversation.'
  } else if (gapMinutes < 60) {
    timeSinceLine = `There has been a short pause — about ${gapMinutes} minutes since the last message.`
  } else if (gapMinutes < 1440) {
    timeSinceLine = `Some time has passed — about ${Math.floor(gapMinutes / 60)} hour(s) since the last message.`
  } else {
    timeSinceLine = `It has been ${Math.floor(gapMinutes / 1440)} day(s) since the last message.`
  }

  // Find the previous session gap: walk backwards through messages looking for a gap >= threshold
  let lastVisitLine = ''
  for (let i = 0; i < recentMessages.length - 1; i++) {
    const current = new Date(recentMessages[i].created_at)
    const previous = new Date(recentMessages[i + 1].created_at)
    const betweenMinutes = Math.floor((current.getTime() - previous.getTime()) / 60000)

    if (betweenMinutes >= SESSION_GAP_THRESHOLD_MINUTES) {
      lastVisitLine = `Last visit gap: ${formatGap(betweenMinutes)} between the previous visit and this one.`
      break
    }
  }

  const temporalContext = [
    timeSinceLine,
    lastVisitLine,
  ].filter(Boolean).join('\n')

  return { temporalContext, currentDatetime }
}
