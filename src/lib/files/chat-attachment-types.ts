// Phase 34A — Chat Attachment types.
//
// Chat attachments are temporary source context for the current chat exchange.
// They are NOT Memory. NOT Library items. NOT Archive entries.
// Read ≠ Remember. Attach ≠ Ingest. Save ≠ Memory.

export type ChatAttachmentExtractionStatus =
  | 'extracted'
  | 'failed'
  | 'unsupported'
  | 'too_large'

export interface ChatAttachmentContext {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  extractionStatus: ChatAttachmentExtractionStatus
  extractionMethod?: string
  extractedText?: string
  charCount?: number
  truncated?: boolean
  error?: string
}

export interface ChatAttachmentReference {
  fileName: string
  mimeType: string
  sizeBytes: number
  extractionStatus: ChatAttachmentExtractionStatus
  extractionMethod?: string
  charCount?: number
  truncated?: boolean
  usedInPrompt: boolean
  error?: string
}

// Limits
export const CHAT_ATTACHMENT_MAX_FILES = 5
export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 30 * 1024 * 1024 // 30MB intake
export const CHAT_ATTACHMENT_PER_FILE_TEXT_LIMIT = 8000         // per-file prompt cap
export const CHAT_ATTACHMENT_TOTAL_CONTEXT_LIMIT = 18000        // total prompt cap
