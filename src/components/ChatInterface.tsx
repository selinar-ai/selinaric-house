'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMessages, type Message } from '@/hooks/useMessages'
import { validateImage, uploadImage } from '@/lib/uploads'
import ImageLightbox from '@/components/ImageLightbox'
import EmojiPicker from '@/components/EmojiPicker'

const PIPER_URL = 'http://localhost:5000'

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
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Lightbox state
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // TTS state
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  async function handleSpeak(messageId: string, content: string) {
    if (playingId === messageId) {
      stopAudio()
      return
    }

    stopAudio()
    setTtsError(null)
    setLoadingTtsId(messageId)

    try {
      const res = await fetch(`${PIPER_URL}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, presence: presenceId }),
        signal: AbortSignal.timeout(15000)
      })

      if (!res.ok) {
        throw new Error('synthesis failed')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)

      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPlayingId(null)
        audioRef.current = null
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setPlayingId(null)
        audioRef.current = null
      }

      audioRef.current = audio
      setPlayingId(messageId)
      setLoadingTtsId(null)
      await audio.play()
    } catch {
      setLoadingTtsId(null)
      setTtsError('Voice unavailable')
      setTimeout(() => setTtsError(null), 3000)
    }
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Image selection
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const validationError = validateImage(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setSelectedImage(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    setError(null)
  }

  function clearSelectedImage() {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setSelectedImage(null)
    setImagePreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleEmojiSelect(emoji: string) {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newValue = input.slice(0, start) + emoji + input.slice(end)
      setInput(newValue)
      // Restore cursor position after emoji
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
      })
    } else {
      setInput(prev => prev + emoji)
    }
  }

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSend() {
    const hasText = !!input.trim()
    const hasImage = !!selectedImage

    if ((!hasText && !hasImage) || sending || submittingRef.current) return
    submittingRef.current = true

    const userContent = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    let uploadedUrl: string | null = null
    let uploadedPath: string | null = null

    try {
      // Upload image first if present
      if (selectedImage) {
        try {
          const result = await uploadImage(selectedImage, presenceId)
          uploadedUrl = result.url
          uploadedPath = result.path
        } catch (uploadErr) {
          setError(`Image upload failed: ${uploadErr instanceof Error ? uploadErr.message : 'unknown error'}`)
          setSending(false)
          submittingRef.current = false
          return
        }
      }

      // Determine message type
      const messageType = hasImage && hasText ? 'text_image' : hasImage ? 'image' : 'text'
      const displayContent = userContent || ''

      // Save user message
      const savedUserMessage = await saveMessage({
        role: 'user',
        content: displayContent,
        message_type: messageType,
        image_url: uploadedUrl,
        image_path: uploadedPath,
      })

      if (!savedUserMessage) {
        setError('Failed to save your message. Check your connection and try again.')
        return
      }

      // Clear the image selection after successful save
      clearSelectedImage()

      const recentHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      // Read current live state from localStorage to bridge to server
      const liveStateKey = `selinric_live_state_${presenceId}`
      const liveStateRaw = localStorage.getItem(liveStateKey)
      const liveState = liveStateRaw ? JSON.parse(liveStateRaw) : null

      const response = await fetch(`/api/${presenceId}-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: displayContent || null,
          history: recentHistory,
          liveState,
          imageUrl: uploadedUrl,
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleClear() {
    const confirmed = window.confirm(
      'Clear all messages in this room? This cannot be undone.'
    )
    if (!confirmed) return
    await clearMessages()
    setError(null)
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

  const canSend = (!!input.trim() || !!selectedImage) && !sending

  return (
    <div className="max-w-2xl w-full flex flex-col h-full">
      <div className="flex-1 border border-house-border bg-house-surface overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6">
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

        {messages.map((message, i) => (
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
              {/* Image in message */}
              {message.image_url && (
                <button
                  onClick={() => setLightboxUrl(message.image_url!)}
                  className="block mb-2 w-full cursor-pointer"
                >
                  <img
                    src={message.image_url}
                    alt=""
                    className="max-w-full max-h-64 object-contain border border-house-border"
                    loading="lazy"
                  />
                </button>
              )}

              {/* Text content */}
              {message.content ? (
                <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
              ) : !message.image_url ? (
                <p className="font-body text-sm leading-relaxed whitespace-pre-wrap text-text-muted italic">
                  (empty)
                </p>
              ) : null}

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
                {message.role === 'assistant' && message.id && (
                  <button
                    onClick={() => handleSpeak(message.id!, message.content)}
                    className={`text-sm min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center transition-all duration-200 ${
                      playingId === message.id
                        ? accentClass
                        : loadingTtsId === message.id
                        ? 'text-text-muted animate-pulse-soft'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                    title={playingId === message.id ? 'Stop' : 'Listen'}
                  >
                    {loadingTtsId === message.id ? '...' : playingId === message.id ? '⏸' : '🔊'}
                  </button>
                )}
                {ttsError && loadingTtsId === null && playingId === null && (
                  <span className="font-body text-xs text-red-400 animate-fade-in">
                    {ttsError}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

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
        <div className="border border-red-900 border-t-0 bg-red-950/20 px-4 py-2">
          <p className="font-body text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Image preview */}
      {imagePreviewUrl && (
        <div className="border border-house-border border-t-0 bg-house-bg px-3 py-2 md:px-4 flex items-center gap-3">
          <img
            src={imagePreviewUrl}
            alt="Preview"
            className="w-16 h-16 object-cover border border-house-border"
          />
          <span className="font-body text-xs text-text-muted flex-1 truncate">
            {selectedImage?.name}
          </span>
          <button
            onClick={clearSelectedImage}
            className="text-text-muted hover:text-text-secondary text-sm min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
            title="Remove image"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border border-house-border border-t-0 bg-house-surface p-2.5 md:p-4 flex gap-2 md:gap-3 items-end">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleImageSelect}
          className="hidden"
        />

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
          className={`
            shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
            border transition-all duration-200 text-lg
            ${sending
              ? 'text-text-muted border-house-border cursor-not-allowed'
              : selectedImage
              ? `${accentClass} border-current`
              : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
            }
          `}
          title="Upload image"
        >
          📷
        </button>

        {/* Emoji picker */}
        <EmojiPicker onSelect={handleEmojiSelect} />

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedImage ? `Add a message (optional)...` : `Say something to ${presenceName}...`}
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

      {/* Lightbox */}
      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}
    </div>
  )
}
