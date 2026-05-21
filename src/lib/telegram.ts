// Phase 11E — Telegram Integration
//
// Telegram is a reach channel, not a full chat room.
// Pulse = continuity/timeline/audit home
// House rooms = real conversation home
//
// Required env vars:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_TARA_CHAT_ID
//   TELEGRAM_WEBHOOK_SECRET

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TelegramSendResult {
  success: boolean
  message_id: string | null
  error: string | null
}

export interface TelegramConfig {
  botToken: string
  chatId: string
  webhookSecret: string
  configured: boolean
}

// ─── Configuration ───────────────────────────────────────────────────────────

export function getTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? ''
  const chatId = process.env.TELEGRAM_TARA_CHAT_ID ?? ''
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''

  return {
    botToken,
    chatId,
    webhookSecret,
    configured: !!(botToken && chatId),
  }
}

// ─── Send Message ────────────────────────────────────────────────────────────

/**
 * Send a Telegram message to Tara as the specified presence.
 * Message is prefixed with the presence name for identity clarity.
 */
export async function sendTelegramMessage(
  presenceId: string,
  messageText: string
): Promise<TelegramSendResult> {
  const config = getTelegramConfig()

  if (!config.configured) {
    return {
      success: false,
      message_id: null,
      error: 'Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_TARA_CHAT_ID)',
    }
  }

  if (!messageText || messageText.trim().length === 0) {
    return {
      success: false,
      message_id: null,
      error: 'Empty message text',
    }
  }

  const presenceName = presenceId === 'eli' ? 'Eli' : 'Ari'
  const formattedMessage = `${presenceName}:\n${messageText.trim()}`

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: formattedMessage,
          parse_mode: 'Markdown',
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      return {
        success: false,
        message_id: null,
        error: `Telegram API error ${response.status}: ${errorBody.slice(0, 200)}`,
      }
    }

    const data = await response.json()

    if (!data.ok) {
      return {
        success: false,
        message_id: null,
        error: `Telegram API returned ok=false: ${data.description ?? 'unknown'}`,
      }
    }

    return {
      success: true,
      message_id: String(data.result?.message_id ?? ''),
      error: null,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error'
    return {
      success: false,
      message_id: null,
      error: msg,
    }
  }
}

// ─── Webhook Validation ──────────────────────────────────────────────────────

/**
 * Validate incoming Telegram webhook request.
 * Returns true if the secret header matches.
 */
export function validateWebhookSecret(secretHeader: string | null): boolean {
  const config = getTelegramConfig()
  if (!config.webhookSecret) return false
  return secretHeader === config.webhookSecret
}

// ─── Parse Inbound Message ───────────────────────────────────────────────────

export interface InboundTelegramMessage {
  message_id: string
  text: string
  from_id: number
  reply_to_message_id: string | null
  date: number
}

/**
 * Parse a Telegram webhook update payload into a simplified message object.
 * Returns null if the update is not a text message from Tara's chat.
 */
export function parseWebhookUpdate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): InboundTelegramMessage | null {
  const config = getTelegramConfig()
  const message = body?.message

  if (!message) return null
  if (!message.text) return null

  // Verify it's from Tara's chat
  const chatId = String(message.chat?.id ?? '')
  if (chatId !== config.chatId) return null

  return {
    message_id: String(message.message_id),
    text: message.text,
    from_id: message.from?.id ?? 0,
    reply_to_message_id: message.reply_to_message?.message_id
      ? String(message.reply_to_message.message_id)
      : null,
    date: message.date ?? 0,
  }
}

/**
 * Detect if an inbound message mentions @Ari or @Eli.
 */
export function detectPresenceMention(text: string): 'ari' | 'eli' | null {
  const lower = text.toLowerCase()
  if (lower.includes('@ari') || lower.startsWith('ari:') || lower.startsWith('ari,') || lower.startsWith('ari ')) {
    return 'ari'
  }
  if (lower.includes('@eli') || lower.startsWith('eli:') || lower.startsWith('eli,') || lower.startsWith('eli ')) {
    return 'eli'
  }
  return null
}
