'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMessages, type Message } from '@/hooks/useMessages'
import { validateImage, uploadImage } from '@/lib/uploads'
import ImageLightbox from '@/components/ImageLightbox'
import EmojiPicker from '@/components/EmojiPicker'
import VoiceButton from '@/components/VoiceButton'
import RecallIndicator from '@/components/RecallIndicator'
import { stopAllTTS } from '@/lib/tts'
import type { RecallEntry, MatchQuality, RecallMode } from '@/lib/archive-recall'

const MAX_IMAGES = 4

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

  // Phase 33G: Library search state
  const [librarySearchMessageIds, setLibrarySearchMessageIds] = useState<Set<string>>(new Set())

  // Phase 25A: Multi-image upload state
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // --- Send ---

  async function handleSend() {
    const hasText = !!input.trim()
    const hasImages = selectedImages.length > 0

    if ((!hasText && !hasImages) || sending || submittingRef.current) return
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

      const recentHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      const liveStateKey = `selinric_live_state_${presenceId}`
      const liveStateRaw = localStorage.getItem(liveStateKey)
      const liveState = liveStateRaw ? JSON.parse(liveStateRaw) : null

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
        }),
        signal: AbortSignal.timeout(30000)
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

      // Phase 33G: Track Library search usage
      if (data.librarySearchUsed && savedReply?.id) {
        setLibrarySearchMessageIds(prev => new Set([...prev, savedReply.id!]))
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

  const canSend = (!!input.trim() || selectedImages.length > 0) && !sending

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

                {/* Phase 33G: Library context used cue */}
                {message.role === 'assistant' && message.id && librarySearchMessageIds.has(message.id) && (
                  <p className="font-body text-xs text-blue-400 mt-1 italic">
                    library context used
                  </p>
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
