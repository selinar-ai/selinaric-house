'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMessages, type Message } from '@/hooks/useMessages'
import { validateImage, uploadImage } from '@/lib/uploads'
import ImageLightbox from '@/components/ImageLightbox'
import EmojiPicker from '@/components/EmojiPicker'
import VoiceButton from '@/components/VoiceButton'
import RecallIndicator from '@/components/RecallIndicator'
import LibraryReferenceIndicator from '@/components/LibraryReferenceIndicator'
import ChatAttachmentReferenceIndicator from '@/components/ChatAttachmentReferenceIndicator'
import { stopAllTTS } from '@/lib/tts'
import type { RecallEntry, MatchQuality, RecallMode } from '@/lib/archive-recall'
import type { LibraryReference } from '@/lib/library/chat-library-search'
import type { ChatAttachmentContext, ChatAttachmentReference } from '@/lib/files/chat-attachment-types'
import {
  CHAT_ATTACHMENT_MAX_FILES,
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
} from '@/lib/files/chat-attachment-types'

const MAX_IMAGES = 4
const DOC_ACCEPT = '.txt,.md,.csv,.json,.docx,.pdf,.png,.jpg,.jpeg,.webp'

interface Props {
  presenceId: 'ari' | 'eli'
  accentClass: string
  iconSymbol: string
  presenceName: string
}

export default function ChatInterface({
  presenceId,
  accentClass,
  iconSymbol,
  presenceName
}: Props) {
  const { messages, loading, saveMessage, clearMessages, setMessages } = useMessages(presenceId)
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  // Phase 17: Continuity state
  const [continuityActive, setContinuityActive] = useState(false)
  const [continuityMessageIds, setContinuityMessageIds] = useState<Set<string>>(new Set())

  // Phase 19: Emotional continuity state
  const [emotionalContinuityMessageIds, setEmotionalContinuityMessageIds] = useState<Set<string>>(new Set())

  // Phase 28A + 28B + 28D: Archive recall state
  const [recallMessageMap, setRecallMessageMap] = useState<Map<string, RecallEntry[]>>(new Map())
  const [recallEventIdMap, setRecallEventIdMap] = useState<Map<string, string>>(new Map())
  const [recallMatchQualityMap, setRecallMatchQualityMap] = useState<Map<string, MatchQuality>>(new Map())
  const [recallModeMap, setRecallModeMap] = useState<Map<string, RecallMode>>(new Map())

  // Phase 33G + 33L: Library search state
  const [librarySearchMessageIds, setLibrarySearchMessageIds] = useState<Set<string>>(new Set())
  const [libraryReferenceMap, setLibraryReferenceMap] = useState<Map<string, LibraryReference[]>>(new Map())

  // Phase 25A: Multi-image upload state
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Phase 34A: Chat attachment state
  const [pendingAttachments, setPendingAttachments] = useState<{ file: File; context?: ChatAttachmentContext; extracting: boolean; error?: string }[]>([])
  const docInputRef = useRef<HTMLInputElement>(null)
  const [chatAttachmentRefMap, setChatAttachmentRefMap] = useState<Map<string, ChatAttachmentReference[]>>(new Map())

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Image selection (multi) ---

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const remaining = MAX_IMAGES - selectedImages.length
    if (remaining <= 0) {
      setError(`Maximum ${MAX_IMAGES} images per message.`)
      e.target.value = ''
      return
    }

    const toAdd = files.slice(0, remaining)
    const valid: File[] = []
    const previews: string[] = []

    for (const file of toAdd) {
      const err = validateImage(file)
      if (err) {
        setError(err)
        continue
      }
      valid.push(file)
      previews.push(URL.createObjectURL(file))
    }

    if (valid.length) {
      setSelectedImages(prev => [...prev, ...valid])
      setImagePreviewUrls(prev => [...prev, ...previews])
      setError(null)
    }

    e.target.value = '' // reset so same file can be re-selected
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviewUrls[index])
    setSelectedImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  function clearAllImages() {
    imagePreviewUrls.forEach(url => URL.revokeObjectURL(url))
    setSelectedImages([])
    setImagePreviewUrls([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- Emoji insertion at cursor ---

  function handleEmojiSelect(emoji: string) {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = input.slice(0, start) + emoji + input.slice(end)
      setInput(newValue)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
      })
    } else {
      setInput(prev => prev + emoji)
    }
  }

  // --- Phase 34A: Document attachment selection + staging extraction ---

  async function handleDocSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const remaining = CHAT_ATTACHMENT_MAX_FILES - pendingAttachments.length
    if (remaining <= 0) {
      setError(`Maximum ${CHAT_ATTACHMENT_MAX_FILES} document attachments per message.`)
      e.target.value = ''
      return
    }

    const toAdd = files.slice(0, remaining)

    for (const file of toAdd) {
      if (file.size > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
        const sizeMB = Math.round(CHAT_ATTACHMENT_MAX_FILE_BYTES / 1024 / 1024)
        setPendingAttachments(prev => [...prev, {
          file,
          extracting: false,
          error: `File exceeds the ${sizeMB}MB limit.`,
          context: {
            id: `local-${Date.now()}`,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            extractionStatus: 'too_large',
            error: `File exceeds the ${sizeMB}MB limit.`,
          },
        }])
        continue
      }

      // Add as extracting
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setPendingAttachments(prev => [...prev, { file, extracting: true }])

      // Stage to Supabase and extract
      extractAttachment(file, localId)
    }

    e.target.value = ''
  }

  /** Resolve a reliable MIME type from extension — browsers are unreliable for .md, .csv, etc. */
  function resolveContentType(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      txt: 'text/plain',
      md: 'text/markdown',
      csv: 'text/csv',
      json: 'application/json',
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    }
    return map[ext ?? ''] || file.type || 'application/octet-stream'
  }

  async function extractAttachment(file: File, localId: string) {
    try {
      // Upload to Supabase chat-attachments bucket (tmp/ prefix required by RLS)
      // Use crypto-random path — no user-visible filename in storage key
      const randomId = crypto.randomUUID()
      const storagePath = `tmp/${randomId}`
      const contentType = resolveContentType(file)

      const formData = new FormData()
      formData.append('storagePaths', storagePath)
      formData.append('fileNames', file.name)
      formData.append('mimeTypes', contentType)
      formData.append('fileSizes', String(file.size))

      // First upload file to staging bucket
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      // upsert: false — we only have an INSERT policy (no UPDATE)
      // contentType must match bucket allowed_mime_types
      const { error: uploadErr } = await supabase.storage
        .from('chat-attachments')
        .upload(storagePath, file, { contentType })

      if (uploadErr) {
        // Classify the upload error for clearer UI feedback
        const msg = uploadErr.message ?? ''
        const reason = msg.includes('mime')  || msg.includes('type')
          ? `MIME type not allowed: ${contentType}`
          : msg.includes('size') || msg.includes('limit')
          ? 'File too large for staging bucket'
          : msg.includes('policy') || msg.includes('security')
          ? 'Upload denied by storage policy'
          : `Upload failed: ${msg || 'unknown error'}`

        setPendingAttachments(prev => prev.map(pa =>
          pa.file === file ? {
            ...pa,
            extracting: false,
            error: reason,
            context: {
              id: localId,
              fileName: file.name,
              mimeType: contentType,
              sizeBytes: file.size,
              extractionStatus: 'failed' as const,
              error: reason,
            },
          } : pa
        ))
        return
      }

      // Call extraction API
      const extractRes = await fetch('/api/chat-attachments/extract', {
        method: 'POST',
        body: formData,
      })

      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}))
        setPendingAttachments(prev => prev.map(pa =>
          pa.file === file ? {
            ...pa,
            extracting: false,
            error: errData.error || 'Extraction failed.',
            context: {
              id: localId,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              extractionStatus: 'failed' as const,
              error: errData.error || 'Extraction failed.',
            },
          } : pa
        ))
        return
      }

      const data = await extractRes.json()
      const ctx = data.attachments?.[0] as ChatAttachmentContext | undefined

      if (ctx) {
        setPendingAttachments(prev => prev.map(pa =>
          pa.file === file ? { ...pa, extracting: false, context: ctx } : pa
        ))
      }
    } catch (err) {
      setPendingAttachments(prev => prev.map(pa =>
        pa.file === file ? {
          ...pa,
          extracting: false,
          error: err instanceof Error ? err.message : 'Attachment processing failed.',
          context: {
            id: localId,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            extractionStatus: 'failed' as const,
            error: err instanceof Error ? err.message : 'Attachment processing failed.',
          },
        } : pa
      ))
    }
  }

  function removeAttachment(index: number) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index))
  }

  function clearAllAttachments() {
    setPendingAttachments([])
    if (docInputRef.current) docInputRef.current.value = ''
  }

  // --- Send ---

  async function handleSend() {
    const hasText = !!input.trim()
    const hasImages = selectedImages.length > 0
    const hasAttachments = pendingAttachments.length > 0
    const stillExtracting = pendingAttachments.some(pa => pa.extracting)

    if ((!hasText && !hasImages && !hasAttachments) || sending || submittingRef.current || stillExtracting) return
    submittingRef.current = true

    const userContent = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    const uploadedUrls: string[] = []
    const uploadedPaths: string[] = []

    try {
      // Upload all images sequentially; abort on first failure
      for (const image of selectedImages) {
        try {
          const result = await uploadImage(image, presenceId)
          uploadedUrls.push(result.url)
          uploadedPaths.push(result.path)
        } catch (uploadErr) {
          setError(`Image upload failed: ${uploadErr instanceof Error ? uploadErr.message : 'unknown error'}`)
          setSending(false)
          submittingRef.current = false
          return
        }
      }

      const messageType = hasImages && hasText ? 'text_image' : hasImages ? 'image' : 'text'

      const savedUserMessage = await saveMessage({
        role: 'user',
        content: userContent || '',
        message_type: messageType,
        // Backward compat: first image in legacy column; full array in image_urls
        image_url: uploadedUrls[0] ?? null,
        image_path: uploadedPaths[0] ?? null,
        image_urls: uploadedUrls.length > 1 ? uploadedUrls : null,
      })

      if (!savedUserMessage) {
        setError('Failed to save your message. Check your connection and try again.')
        return
      }

      clearAllImages()
      clearAllAttachments()

      const recentHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      const liveStateKey = `selinric_live_state_${presenceId}`
      const liveStateRaw = localStorage.getItem(liveStateKey)
      const liveState = liveStateRaw ? JSON.parse(liveStateRaw) : null

      // Phase 34A: Collect extracted attachment contexts for the chat route
      const attachmentContexts = pendingAttachments
        .filter(pa => pa.context && pa.context.extractionStatus !== 'too_large')
        .map(pa => pa.context!)

      const response = await fetch(`/api/${presenceId}-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userContent || null,
          history: recentHistory,
          liveState,
          // Send full array; API routes handle both
          imageUrl: uploadedUrls[0] ?? null,
          imageUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
          sessionId: sessionIdRef.current,
          chatAttachments: attachmentContexts.length > 0 ? attachmentContexts : undefined,
        }),
        signal: AbortSignal.timeout(60000) // Phase 34A: longer timeout for attachment processing
      })

      if (response.status === 429) {
        setError('Rate limit reached. Wait a moment and try again.')
        return
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error || 'Something went wrong.')
        return
      }

      const data = await response.json()

      const savedReply = await saveMessage({ role: 'assistant', content: data.reply })
      if (!savedReply) {
        const fallback: Message = {
          role: 'assistant',
          content: data.reply + '\n\n[Note: this message could not be saved to memory.]',
          created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, fallback])
        setError('Response received but could not be saved. It will be lost on refresh.')
      }

      // Phase 17: Update continuity state
      setContinuityActive(true)
      if (data.continuityUsed && savedReply?.id) {
        setContinuityMessageIds(prev => new Set([...prev, savedReply.id!]))
      }

      // Phase 19: Track emotional continuity (only when regular continuity also fired)
      if (data.continuityUsed && data.emotionalContinuityUsed && savedReply?.id) {
        setEmotionalContinuityMessageIds(prev => new Set([...prev, savedReply.id!]))
      }

      // Phase 33G + 33L: Track Library search usage and references
      if (data.librarySearchUsed && savedReply?.id) {
        setLibrarySearchMessageIds(prev => new Set([...prev, savedReply.id!]))
        if (Array.isArray(data.libraryReferences) && data.libraryReferences.length > 0) {
          setLibraryReferenceMap(prev => {
            const next = new Map(prev)
            next.set(savedReply.id!, data.libraryReferences as LibraryReference[])
            return next
          })
        }
      }

      // Phase 34A: Track chat attachment references
      if (Array.isArray(data.chatAttachmentReferences) && data.chatAttachmentReferences.length > 0 && savedReply?.id) {
        setChatAttachmentRefMap(prev => {
          const next = new Map(prev)
          next.set(savedReply.id!, data.chatAttachmentReferences as ChatAttachmentReference[])
          return next
        })
      }

      // Phase 28A + 28B + 28D: Track recall entries, event ID, match quality, and mode per message
      if (data.recallUsed && savedReply?.id && Array.isArray(data.recallEntries)) {
        const msgId = savedReply.id!
        setRecallMessageMap(prev => {
          const next = new Map(prev)
          next.set(msgId, data.recallEntries as RecallEntry[])
          return next
        })
        if (data.recallEventId) {
          setRecallEventIdMap(prev => {
            const next = new Map(prev)
            next.set(msgId, data.recallEventId as string)
            return next
          })
        }
        if (data.matchQuality) {
          setRecallMatchQualityMap(prev => {
            const next = new Map(prev)
            next.set(msgId, data.matchQuality as MatchQuality)
            return next
          })
        }
        if (data.recallMode) {
          setRecallModeMap(prev => {
            const next = new Map(prev)
            next.set(msgId, data.recallMode as RecallMode)
            return next
          })
        }
      }
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        setError('Response timed out. Try again.')
      } else {
        setError('Connection issue. Check your network and try again.')
      }
    } finally {
      setSending(false)
      submittingRef.current = false
    }
  }

  // --- Enter key: plain Enter = newline, Ctrl/Cmd+Enter = send ---

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
    // plain Enter: default textarea behavior (newline)
    // Shift+Enter: also newline (no special handling needed)
  }

  async function handleClear() {
    const confirmed = window.confirm(
      'Clear all messages in this room? This cannot be undone.'
    )
    if (!confirmed) return
    stopAllTTS()
    await clearMessages()
    setError(null)
    setContinuityActive(false)
    setContinuityMessageIds(new Set())
    setEmotionalContinuityMessageIds(new Set())
    setRecallMessageMap(new Map())
    setRecallEventIdMap(new Map())
    setRecallMatchQualityMap(new Map())
    setRecallModeMap(new Map())
  }

  async function handleFreshThread() {
    await fetch(`/api/clear-continuity?room=${presenceId}`, { method: 'POST' })
    stopAllTTS()
    setContinuityActive(false)
    setContinuityMessageIds(new Set())
    setEmotionalContinuityMessageIds(new Set())
    setRecallMessageMap(new Map())
    setRecallEventIdMap(new Map())
    setRecallMatchQualityMap(new Map())
    setRecallModeMap(new Map())
  }

  if (loading) {
    return (
      <div className="max-w-2xl flex-1 min-h-0 border border-house-border bg-house-surface flex items-center justify-center">
        <div className="text-center">
          <div className="flex gap-1 justify-center mb-3">
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
          </div>
          <p className="font-body text-xs text-text-muted">Loading conversation...</p>
        </div>
      </div>
    )
  }

  const stillExtractingAny = pendingAttachments.some(pa => pa.extracting)
  const canSend = (!!input.trim() || selectedImages.length > 0 || pendingAttachments.length > 0) && !sending && !stillExtractingAny

  // Determine which image URLs to show for a message (multi-image aware)
  function getMessageImageUrls(msg: Message): string[] {
    if (msg.image_urls?.length) return msg.image_urls
    if (msg.image_url) return [msg.image_url]
    return []
  }

  return (
    <div className="max-w-2xl w-full flex flex-col h-full">
      {/* Phase 17: Continuity status bar */}
      <div className="flex items-center justify-between border border-b-0 border-house-border bg-house-bg px-3 py-1.5 md:px-4">
        <span className="font-body text-xs text-text-muted">
          {continuityActive ? 'Continuity active' : 'Fresh thread'}
        </span>
        {continuityActive && (
          <button
            onClick={handleFreshThread}
            className="font-body text-xs text-text-muted hover:text-text-secondary transition-colors duration-200"
          >
            Fresh thread
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 border border-house-border bg-house-surface overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-xs">
              <span className={`text-4xl block mb-4 ${accentClass}`}>
                {iconSymbol}
              </span>
              <p className="font-display text-lg text-text-secondary font-light italic mb-2">
                {presenceName} is here.
              </p>
              <p className="font-body text-xs text-text-muted">
                Say something to begin.
              </p>
            </div>
          </div>
        )}

        {messages.map((message, i) => {
          const msgImageUrls = getMessageImageUrls(message)
          return (
            <div
              key={message.id || i}
              className={`flex gap-3 animate-fade-in ${
                message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className={`flex-shrink-0 w-7 h-7 flex items-center justify-center text-sm ${
                message.role === 'assistant' ? accentClass : 'text-text-muted'
              }`}>
                {message.role === 'assistant' ? iconSymbol : '◌'}
              </div>

              <div className={`max-w-[75%] md:max-w-xs lg:max-w-md px-3 py-2.5 md:px-4 md:py-3 ${
                message.role === 'user'
                  ? 'bg-house-muted text-text-primary'
                  : 'bg-house-bg border border-house-border text-text-primary'
              }`}>
                {/* Images in message — grid when multiple */}
                {msgImageUrls.length > 0 && (
                  <div className={`mb-2 ${msgImageUrls.length > 1 ? 'grid grid-cols-2 gap-1' : ''}`}>
                    {msgImageUrls.map((url, idx) => (
                      <button
                        key={idx}
                        onClick={() => setLightboxUrl(url)}
                        className="block w-full cursor-pointer"
                      >
                        <img
                          src={url}
                          alt=""
                          className="max-w-full max-h-48 object-contain border border-house-border"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {/* Text content */}
                {message.content ? (
                  <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                ) : msgImageUrls.length === 0 ? (
                  <p className="font-body text-sm leading-relaxed whitespace-pre-wrap text-text-muted italic">
                    (empty)
                  </p>
                ) : null}

                {/* Phase 17: Continuity cue */}
                {message.role === 'assistant' && message.id && continuityMessageIds.has(message.id) && (
                  <p className="font-body text-xs text-text-muted mt-2 italic">
                    continued from prior turn
                  </p>
                )}

                {/* Phase 19: Emotional continuity cue */}
                {message.role === 'assistant' && message.id && emotionalContinuityMessageIds.has(message.id) && (
                  <p className="font-body text-xs text-text-muted mt-1 italic">
                    held prior atmosphere
                  </p>
                )}

                {/* Phase 28A + 28B + 28D: Recall indicator with feedback */}
                {message.role === 'assistant' && message.id && recallMessageMap.has(message.id) && (
                  <RecallIndicator
                    entries={recallMessageMap.get(message.id)!}
                    accentClass={accentClass}
                    recallEventId={recallEventIdMap.get(message.id) ?? null}
                    matchQuality={recallMatchQualityMap.get(message.id)}
                    mode={recallModeMap.get(message.id)}
                  />
                )}

                {/* Phase 33L: Library reference indicator */}
                {message.role === 'assistant' && message.id && librarySearchMessageIds.has(message.id) && (
                  <LibraryReferenceIndicator
                    references={libraryReferenceMap.get(message.id) ?? []}
                  />
                )}

                {/* Phase 34A: Chat attachment reference indicator */}
                {message.role === 'assistant' && message.id && chatAttachmentRefMap.has(message.id) && (
                  <ChatAttachmentReferenceIndicator
                    references={chatAttachmentRefMap.get(message.id)!}
                  />
                )}

                {/* Phase 20: Voice button (presence messages only) */}
                <div className="flex items-center gap-2 mt-2">
                  {message.created_at && (
                    <span className="font-body text-xs text-text-muted">
                      {new Date(message.created_at).toLocaleTimeString('en-AU', {
                        timeZone: 'Australia/Melbourne',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  )}
                  {message.role === 'assistant' && message.content && (
                    <VoiceButton
                      text={message.content}
                      presenceId={presenceId}
                      accentClass={accentClass}
                      buttonClass="min-w-[44px] min-h-[44px] -m-2"
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex gap-3 animate-fade-in">
            <div className={`w-7 h-7 flex items-center justify-center text-sm ${accentClass}`}>
              {iconSymbol}
            </div>
            <div className="bg-house-bg border border-house-border px-4 py-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="shrink-0 border border-red-900 border-t-0 bg-red-950/20 px-4 py-2">
          <p className="font-body text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Multi-image previews strip */}
      {selectedImages.length > 0 && (
        <div className="shrink-0 border border-house-border border-t-0 bg-house-bg px-3 py-2 md:px-4 flex gap-2 overflow-x-auto">
          {selectedImages.map((file, index) => (
            <div key={index} className="relative shrink-0">
              <img
                src={imagePreviewUrls[index]}
                alt={file.name}
                className="w-16 h-16 object-cover border border-house-border"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-house-bg border border-house-border text-text-muted hover:text-red-400 text-xs flex items-center justify-center transition-colors"
                title={`Remove ${file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
          {selectedImages.length < MAX_IMAGES && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-16 h-16 border border-dashed border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted flex items-center justify-center text-xl transition-colors"
              title="Add another image"
            >
              +
            </button>
          )}
        </div>
      )}

      {/* Phase 34A: Document attachment chips */}
      {pendingAttachments.length > 0 && (
        <div className="shrink-0 border border-house-border border-t-0 bg-house-bg px-3 py-2 md:px-4 flex flex-wrap gap-2">
          {pendingAttachments.map((pa, index) => (
            <div
              key={index}
              className={`flex items-center gap-1.5 px-2 py-1 border text-xs font-body ${
                pa.extracting
                  ? 'border-amber-400/30 text-amber-400/80'
                  : pa.context?.extractionStatus === 'extracted'
                  ? 'border-house-border text-text-secondary'
                  : pa.context?.extractionStatus === 'unsupported' || pa.context?.extractionStatus === 'too_large'
                  ? 'border-red-400/30 text-red-400/80'
                  : pa.error || pa.context?.extractionStatus === 'failed'
                  ? 'border-red-400/30 text-red-400/80'
                  : 'border-house-border text-text-muted'
              }`}
            >
              <span className="truncate max-w-[140px]">{pa.file.name}</span>
              <span className="text-[10px] text-text-muted" title={pa.error || pa.context?.error || undefined}>
                {pa.extracting
                  ? 'extracting...'
                  : pa.context?.extractionStatus === 'extracted'
                  ? `${pa.context.charCount?.toLocaleString() ?? '?'} chars`
                  : pa.context?.extractionStatus === 'unsupported'
                  ? 'unsupported type'
                  : pa.context?.extractionStatus === 'too_large'
                  ? 'too large'
                  : pa.error
                  ? pa.error.length > 30 ? 'failed' : pa.error
                  : ''}
              </span>
              <button
                onClick={() => removeAttachment(index)}
                className="text-text-muted hover:text-red-400 transition-colors ml-0.5"
                title={`Remove ${pa.file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border border-house-border border-t-0 bg-house-surface p-2.5 md:p-4 flex gap-2 md:gap-3 items-end">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        <input
          ref={docInputRef}
          type="file"
          accept={DOC_ACCEPT}
          multiple
          onChange={handleDocSelect}
          className="hidden"
        />

        {/* Document attach button */}
        <button
          onClick={() => docInputRef.current?.click()}
          disabled={sending || pendingAttachments.length >= CHAT_ATTACHMENT_MAX_FILES}
          className={`
            shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
            border transition-all duration-200 text-base
            ${sending || pendingAttachments.length >= CHAT_ATTACHMENT_MAX_FILES
              ? 'text-text-muted border-house-border cursor-not-allowed opacity-50'
              : pendingAttachments.length > 0
              ? 'text-amber-400 border-amber-400/50'
              : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
            }
          `}
          title={
            pendingAttachments.length >= CHAT_ATTACHMENT_MAX_FILES
              ? `Max ${CHAT_ATTACHMENT_MAX_FILES} attachments per message`
              : pendingAttachments.length > 0
              ? `${pendingAttachments.length} attachment${pendingAttachments.length > 1 ? 's' : ''}`
              : 'Attach document'
          }
        >
          +
        </button>

        {/* Image attach button — accent when images queued */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || selectedImages.length >= MAX_IMAGES}
          className={`
            shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
            border transition-all duration-200 text-lg
            ${sending || selectedImages.length >= MAX_IMAGES
              ? 'text-text-muted border-house-border cursor-not-allowed opacity-50'
              : selectedImages.length > 0
              ? `${accentClass} border-current`
              : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
            }
          `}
          title={
            selectedImages.length >= MAX_IMAGES
              ? `Max ${MAX_IMAGES} images per message`
              : selectedImages.length > 0
              ? `${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''} selected`
              : 'Attach image'
          }
        >
          📷
        </button>

        <EmojiPicker onSelect={handleEmojiSelect} />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedImages.length > 0
              ? 'Add a message (optional)… Ctrl+Enter to send'
              : `Say something to ${presenceName}… Ctrl+Enter to send`
          }
          rows={1}
          className="
            flex-1 bg-house-bg border border-house-border
            px-3 py-2.5 md:px-4 md:py-3 font-body text-sm text-text-primary
            placeholder:text-text-muted resize-none outline-none
            focus:border-current transition-colors duration-200
          "
          style={{ minHeight: '44px', maxHeight: '120px' }}
          onInput={e => {
            const target = e.target as HTMLTextAreaElement
            target.style.height = 'auto'
            target.style.height = `${Math.min(target.scrollHeight, 120)}px`
          }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`
            px-3 py-2.5 md:px-4 md:py-3 font-body text-xs tracking-widest uppercase
            border transition-all duration-200 min-h-[44px] self-end
            ${canSend
              ? `${accentClass} border-current hover:bg-house-bg`
              : 'text-text-muted border-house-border cursor-not-allowed'
            }
          `}
        >
          Send
        </button>
      </div>

      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  )
}
