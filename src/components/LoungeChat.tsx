'use client'

// Phase 35D v1.1 — Lounge Chat Component
//
// Multi-speaker chat for the shared Lounge room.
// Ari and Eli speak as distinct presences.
// Surface toggle via ∞ symbol.
// + menu for Image / File / Emoji (Image/File upload + preview + render).
// TTS via VoiceButton for Ari/Eli messages.
// Tara identity: ✶ TARA in amber.
// Enter = newline, Ctrl/Cmd+Enter = send.
// @Ari / @Eli mention routing.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLoungeMessages } from '@/hooks/useLoungeMessages'
import VoiceButton from '@/components/VoiceButton'
import LoungeContextIndicator, { type LoungeResponseMetadata } from '@/components/LoungeContextIndicator'
import {
  validateLoungeImage,
  validateLoungeFile,
  uploadLoungeFile,
  type LoungeAttachment,
} from '@/lib/lounge'

const MAX_IMAGES = 4
const MAX_FILES = 5

export default function LoungeChat() {
  const {
    thread,
    messages,
    loading,
    send,
    toggleSurface,
    generateCarryback,
    captureEvent,
  } = useLoungeMessages()

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carrybackStatus, setCarrybackStatus] = useState<string | null>(null)
  const [captureStatus, setCaptureStatus] = useState<string | null>(null)

  // Phase 36G: Context metadata keyed by messageId
  const [contextMetadataMap, setContextMetadataMap] = useState<Map<string, LoungeResponseMetadata>>(new Map())
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // + menu state
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

  // Attachment state
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [input])

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close actions menu on outside click / Escape
  useEffect(() => {
    if (!actionsOpen) return
    function handleClick(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActionsOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [actionsOpen])

  // --- Image handling ---
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
      const err = validateLoungeImage(file)
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

    e.target.value = ''
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(imagePreviewUrls[index])
    setSelectedImages(prev => prev.filter((_, i) => i !== index))
    setImagePreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  // --- File handling ---
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    const remaining = MAX_FILES - pendingFiles.length
    if (remaining <= 0) {
      setError(`Maximum ${MAX_FILES} files per message.`)
      e.target.value = ''
      return
    }

    const toAdd = files.slice(0, remaining)
    const valid: File[] = []

    for (const file of toAdd) {
      const err = validateLoungeFile(file)
      if (err) {
        setError(err)
        continue
      }
      valid.push(file)
    }

    if (valid.length) {
      setPendingFiles(prev => [...prev, ...valid])
      setError(null)
    }

    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  function clearAllAttachments() {
    imagePreviewUrls.forEach(url => URL.revokeObjectURL(url))
    setSelectedImages([])
    setImagePreviewUrls([])
    setPendingFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (docInputRef.current) docInputRef.current.value = ''
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

  // Phase 36G: Extract and store response metadata from send() result
  const captureResponseMetadata = useCallback((data: Record<string, unknown>) => {
    if (!data || !Array.isArray(data.responses)) return
    const newEntries = new Map<string, LoungeResponseMetadata>()
    for (const resp of data.responses) {
      if (!resp.messageId) continue
      const meta: LoungeResponseMetadata = {
        messageId: resp.messageId,
        librarySearchUsed: resp.librarySearchUsed,
        libraryReferences: resp.libraryReferences,
        webSearchUsed: resp.webSearchUsed,
        webSearchReferences: resp.webSearchReferences,
        webSearchStatus: resp.webSearchStatus,
        attachmentStatus: resp.attachmentStatus,
        attachmentReferences: resp.attachmentReferences,
        roomContactStatus: resp.roomContactStatus,
        roomContactReferences: resp.roomContactReferences,
      }
      newEntries.set(resp.messageId, meta)
    }
    if (newEntries.size > 0) {
      setContextMetadataMap(prev => {
        const next = new Map(prev)
        newEntries.forEach((v, k) => next.set(k, v))
        return next
      })
    }
  }, [])

  async function handleSend() {
    const hasText = !!input.trim()
    const hasImages = selectedImages.length > 0
    const hasFiles = pendingFiles.length > 0
    if ((!hasText && !hasImages && !hasFiles) || sending) return

    const text = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    try {
      // Upload all attachments
      const uploadedAttachments: LoungeAttachment[] = []

      for (const image of selectedImages) {
        try {
          const result = await uploadLoungeFile(image, 'image')
          uploadedAttachments.push(result)
        } catch (uploadErr) {
          setError(`Image upload failed: ${uploadErr instanceof Error ? uploadErr.message : 'unknown error'}`)
          setSending(false)
          return
        }
      }

      for (const file of pendingFiles) {
        try {
          const result = await uploadLoungeFile(file, 'file')
          uploadedAttachments.push(result)
        } catch (uploadErr) {
          setError(`File upload failed: ${uploadErr instanceof Error ? uploadErr.message : 'unknown error'}`)
          setSending(false)
          return
        }
      }

      // Send with no explicit respondAs — let @mention routing determine who responds
      const result = await send(text, undefined, uploadedAttachments.length > 0 ? uploadedAttachments : undefined)
      if (result) captureResponseMetadata(result)
      clearAllAttachments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    }
    setSending(false)
  }

  async function handleContinue() {
    if (sending) return
    setSending(true)
    setError(null)

    try {
      const result = await send('', 'continue')
      if (result) captureResponseMetadata(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to continue')
    }
    setSending(false)
  }

  async function handleRespondAs(who: 'ari' | 'eli') {
    if (sending) return
    setSending(true)
    setError(null)

    try {
      const result = await send('', who)
      if (result) captureResponseMetadata(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond')
    }
    setSending(false)
  }

  async function handleCarryback() {
    setCarrybackStatus('Generating...')
    try {
      const result = await generateCarryback()
      const count = result?.carrybacks?.length ?? 0
      setCarrybackStatus(count > 0 ? `${count} carryback${count > 1 ? 's' : ''} saved` : 'No carryback items found')
      setTimeout(() => setCarrybackStatus(null), 4000)
    } catch {
      setCarrybackStatus('Failed')
      setTimeout(() => setCarrybackStatus(null), 3000)
    }
  }

  async function handleCaptureEvent(confirmed?: boolean) {
    setCaptureStatus(confirmed ? 'Confirming...' : 'Capturing...')
    try {
      const result = await captureEvent(confirmed)
      if (result.captured) {
        const count = result.event?.message_count ?? 0
        setCaptureStatus(`Captured: ${count} msgs`)
        setTimeout(() => setCaptureStatus(null), 5000)
      } else if (result.requires_confirmation) {
        const p = result.proposal
        setCaptureStatus(`${p?.messageCount ?? '?'} msgs ready — click again to confirm`)
        // Clear after 8s if not confirmed
        setTimeout(() => {
          setCaptureStatus(current => current?.includes('confirm') ? null : current)
        }, 8000)
      } else {
        setCaptureStatus(result.blocked ?? 'Blocked')
        setTimeout(() => setCaptureStatus(null), 5000)
      }
    } catch {
      setCaptureStatus('Failed')
      setTimeout(() => setCaptureStatus(null), 3000)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ctrl/Cmd+Enter = send (matches existing House chat pattern)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
    // Plain Enter = newline (default textarea behavior, no preventDefault)
  }

  async function handleToggleSurface() {
    try {
      await toggleSurface()
    } catch {
      setError('Failed to toggle surface')
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
      </div>
    )
  }

  const surface = thread?.surface ?? 'default'
  const isDefault = surface === 'default'
  const canSend = (!!input.trim() || selectedImages.length > 0 || pendingFiles.length > 0) && !sending

  // Speaker styling
  function speakerStyle(speaker: string) {
    switch (speaker) {
      case 'ari':
        return { icon: '◈', color: 'text-ari-primary', name: 'Ari', align: 'flex-row', accentClass: 'text-ari-primary' }
      case 'eli':
        return { icon: '◉', color: 'text-eli-primary', name: 'Eli', align: 'flex-row', accentClass: 'text-eli-primary' }
      case 'tara':
        return { icon: '✶', color: 'text-amber-400', name: 'Tara', align: 'flex-row-reverse', accentClass: '' }
      default:
        return { icon: '·', color: 'text-text-muted', name: 'System', align: 'flex-row', accentClass: '' }
    }
  }

  // Get attachments from a message
  function getMessageAttachments(msg: { attachments?: LoungeAttachment[] | null }): LoungeAttachment[] {
    if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      return msg.attachments
    }
    return []
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-2 md:mb-6 border-b border-house-border pb-2 md:pb-4">
        <div className="hidden md:block">
          <h2 className="font-display text-4xl font-light text-text-primary">
            Lounge{isDefault ? ' ∞' : ''}
          </h2>
          <p className="font-body text-sm text-text-muted mt-1">
            Shared room. Living threads.
          </p>
        </div>
        <div className="md:hidden">
          <h2 className="font-display text-2xl font-light text-text-primary">
            Lounge{isDefault ? ' ∞' : ''}
          </h2>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 md:px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-text-muted font-body text-sm py-12">
            The Lounge is quiet. Start a conversation.
          </div>
        )}

        {messages.map(msg => {
          const style = speakerStyle(msg.speaker)
          const attachments = getMessageAttachments(msg)
          const images = attachments.filter(a => a.type === 'image')
          const files = attachments.filter(a => a.type === 'file')

          return (
            <div key={msg.id} className={`flex ${style.align} items-start gap-3 max-w-3xl ${msg.speaker === 'tara' ? 'ml-auto' : ''}`}>
              {/* Speaker icon */}
              <span className={`${style.color} text-base shrink-0 mt-0.5`}>
                {style.icon}
              </span>

              {/* Message bubble */}
              <div className={`flex-1 min-w-0 ${
                msg.speaker === 'tara'
                  ? 'bg-house-surface border border-house-border'
                  : 'bg-house-bg/50'
              } rounded px-4 py-3`}>
                {/* Speaker name */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`${style.color} font-body text-xs tracking-wider uppercase`}>
                    {style.name}
                  </span>
                </div>

                {/* Images in message */}
                {images.length > 0 && (
                  <div className={`mb-2 ${images.length > 1 ? 'grid grid-cols-2 gap-1' : ''}`}>
                    {images.map((img, idx) => (
                      <a
                        key={idx}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={img.url}
                          alt={img.fileName}
                          className="max-w-full max-h-48 object-contain border border-house-border rounded"
                        />
                      </a>
                    ))}
                  </div>
                )}

                {/* Text content */}
                {msg.content && (
                  <div className="font-body text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                )}

                {/* File chips */}
                {files.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {files.map((file, idx) => (
                      <a
                        key={idx}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-house-border text-xs font-body text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors rounded"
                        title={`${file.fileName} (${formatFileSize(file.sizeBytes)})`}
                      >
                        <span>📎</span>
                        <span className="truncate max-w-[160px]">{file.fileName}</span>
                        <span className="text-text-muted text-[10px]">{formatFileSize(file.sizeBytes)}</span>
                      </a>
                    ))}
                  </div>
                )}

                {/* Footer row: TTS + surface indicator */}
                <div className="mt-1.5 flex items-center justify-between">
                  <div>
                    {(msg.speaker === 'ari' || msg.speaker === 'eli') && msg.content.length > 0 && (
                      <VoiceButton
                        text={msg.content}
                        presenceId={msg.speaker}
                        accentClass={style.accentClass}
                        buttonClass="min-w-[36px] min-h-[36px] -m-1"
                      />
                    )}
                  </div>
                  {msg.surface_at_creation === 'inner' && (
                    <span className="text-text-muted/40 text-[10px]" title="Inner surface">
                      ·
                    </span>
                  )}
                </div>

                {/* Phase 36G: Context observability indicator */}
                {(msg.speaker === 'ari' || msg.speaker === 'eli') && contextMetadataMap.has(msg.id) && (
                  <LoungeContextIndicator metadata={contextMetadataMap.get(msg.id)!} />
                )}
              </div>
            </div>
          )
        })}

        {/* Sending indicator */}
        {sending && (
          <div className="flex items-center gap-2 text-text-muted">
            <div className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" />
            <span className="font-body text-xs tracking-wider">thinking...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-center">
          <span className="font-body text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* Action bar — Continue, Ari, Eli, Carryback */}
      {messages.length > 0 && !sending && (
        <div className="shrink-0 px-4 py-2 flex items-center gap-2 border-t border-house-border/50">
          <button
            onClick={handleContinue}
            className="font-body text-[10px] md:text-xs tracking-wider uppercase px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors min-h-[36px]"
            disabled={sending}
          >
            Continue
          </button>
          <button
            onClick={() => handleRespondAs('ari')}
            className="font-body text-[10px] md:text-xs tracking-wider uppercase px-3 py-1.5 border border-house-border text-text-muted hover:text-ari-primary hover:border-ari-secondary transition-colors min-h-[36px]"
            disabled={sending}
          >
            ◈ Ari
          </button>
          <button
            onClick={() => handleRespondAs('eli')}
            className="font-body text-[10px] md:text-xs tracking-wider uppercase px-3 py-1.5 border border-house-border text-text-muted hover:text-eli-primary hover:border-eli-secondary transition-colors min-h-[36px]"
            disabled={sending}
          >
            ◉ Eli
          </button>
          <div className="flex-1" />
          <button
            onClick={handleCarryback}
            className="font-body text-[10px] md:text-xs tracking-wider uppercase px-3 py-1.5 border border-house-border text-text-muted hover:text-text-secondary hover:border-text-muted transition-colors min-h-[36px]"
            disabled={!!carrybackStatus}
            title="Generate carryback for Ari/Eli rooms"
          >
            {carrybackStatus || 'Carryback'}
          </button>
          <button
            onClick={() => handleCaptureEvent(captureStatus?.includes('confirm') ? true : undefined)}
            className={`font-body text-[10px] md:text-xs tracking-wider uppercase px-3 py-1.5 border transition-colors min-h-[36px] ${
              captureStatus?.includes('confirm')
                ? 'border-house-accent text-house-accent'
                : 'border-house-border text-text-muted hover:text-house-accent hover:border-house-accent/50'
            }`}
            disabled={!!captureStatus && !captureStatus.includes('confirm')}
            title="Record this Lounge contact as a cross-room event (not Memory)"
          >
            {captureStatus || 'Record House Contact'}
          </button>
        </div>
      )}

      {/* Image previews strip */}
      {selectedImages.length > 0 && (
        <div className="shrink-0 border-t border-house-border bg-house-bg px-3 py-2 flex gap-2 overflow-x-auto">
          {selectedImages.map((file, index) => (
            <div key={index} className="relative shrink-0">
              <img
                src={imagePreviewUrls[index]}
                alt={file.name}
                className="w-16 h-16 object-cover border border-house-border rounded"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-house-bg border border-house-border text-text-muted hover:text-red-400 text-xs flex items-center justify-center transition-colors rounded-full"
                title={`Remove ${file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
          {selectedImages.length < MAX_IMAGES && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="shrink-0 w-16 h-16 border border-dashed border-house-border text-text-muted hover:text-text-secondary hover:border-house-muted flex items-center justify-center text-xl transition-colors rounded"
              title="Add another image"
            >
              +
            </button>
          )}
        </div>
      )}

      {/* File chips strip */}
      {pendingFiles.length > 0 && (
        <div className="shrink-0 border-t border-house-border bg-house-bg px-3 py-2 flex flex-wrap gap-2">
          {pendingFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-1.5 px-2 py-1 border border-house-border text-xs font-body text-text-secondary rounded"
            >
              <span>📎</span>
              <span className="truncate max-w-[140px]">{file.name}</span>
              <span className="text-[10px] text-text-muted">{formatFileSize(file.size)}</span>
              <button
                onClick={() => removeFile(index)}
                className="text-text-muted hover:text-red-400 transition-colors ml-0.5"
                title={`Remove ${file.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-house-border bg-house-surface/80 px-3 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto relative">
          {/* + actions menu */}
          <div className="relative shrink-0" ref={actionsMenuRef}>
            <button
              type="button"
              onClick={() => setActionsOpen(o => !o)}
              aria-label="Open message actions"
              className={`
                min-w-[40px] min-h-[40px] flex items-center justify-center
                border transition-all duration-200 text-lg rounded
                ${actionsOpen
                  ? 'text-text-secondary border-house-muted bg-house-bg'
                  : (selectedImages.length > 0 || pendingFiles.length > 0)
                  ? 'text-amber-400 border-current'
                  : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
                }
              `}
            >
              +
            </button>

            {/* Actions popover menu */}
            {actionsOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-house-surface border border-house-border shadow-lg z-30 animate-fade-in">
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click()
                    setActionsOpen(false)
                  }}
                  disabled={sending || selectedImages.length >= MAX_IMAGES}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] font-body text-sm text-text-secondary hover:bg-house-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-base w-5 text-center">📷</span>
                  <span>
                    {selectedImages.length > 0
                      ? `Image (${selectedImages.length})`
                      : 'Image'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    docInputRef.current?.click()
                    setActionsOpen(false)
                  }}
                  disabled={sending || pendingFiles.length >= MAX_FILES}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] font-body text-sm text-text-secondary hover:bg-house-bg transition-colors border-t border-house-border disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-base w-5 text-center">📎</span>
                  <span>
                    {pendingFiles.length > 0
                      ? `File (${pendingFiles.length})`
                      : 'File'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen(false)
                    setShowEmojiPicker(true)
                  }}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] font-body text-sm text-text-secondary hover:bg-house-bg transition-colors border-t border-house-border"
                >
                  <span className="text-base w-5 text-center">😊</span>
                  <span>Emoji</span>
                </button>
              </div>
            )}
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={docInputRef}
            type="file"
            accept="*/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Surface toggle */}
          <button
            onClick={handleToggleSurface}
            className={`shrink-0 w-10 h-10 flex items-center justify-center rounded transition-all duration-200 ${
              isDefault
                ? 'text-text-secondary hover:text-text-primary'
                : 'text-text-muted/40 hover:text-text-muted'
            }`}
            aria-label={isDefault ? 'Default surface on' : 'Default surface off'}
            title={isDefault ? 'Default surface on' : 'Default surface off'}
          >
            <span className="text-lg font-light">∞</span>
          </button>

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Say something in the Lounge..."
            rows={1}
            className="flex-1 min-h-[44px] max-h-32 bg-house-bg border border-house-border rounded px-4 py-3 font-body text-sm text-text-primary placeholder:text-text-muted/60 resize-none focus:outline-none focus:border-text-muted transition-colors"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`shrink-0 px-4 h-[44px] font-body text-xs tracking-widest uppercase transition-all duration-200 border ${
              canSend
                ? 'text-text-primary border-text-muted hover:bg-house-bg'
                : 'text-text-muted/40 border-house-border cursor-not-allowed'
            }`}
          >
            Send
          </button>
        </div>

        {/* Emoji picker panel */}
        {showEmojiPicker && (
          <div className="max-w-3xl mx-auto mt-2">
            <div className="bg-house-surface border border-house-border shadow-lg p-2 w-full max-w-sm">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="font-body text-[9px] tracking-widest uppercase text-text-muted">Emoji</span>
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(false)}
                  className="font-mono text-xs text-text-muted hover:text-text-secondary min-w-[28px] min-h-[28px] flex items-center justify-center"
                >
                  x
                </button>
              </div>
              <div className="grid grid-cols-10 gap-0.5 max-h-64 overflow-y-auto">
                {EMOJI_SET.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      handleEmojiSelect(emoji)
                      setShowEmojiPicker(false)
                    }}
                    className="min-w-[32px] min-h-[32px] flex items-center justify-center text-lg hover:bg-house-bg rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Ctrl+Enter hint */}
        <p className="hidden md:block max-w-3xl mx-auto font-body text-[10px] text-text-muted mt-1.5 text-right">
          Ctrl+Enter to send
        </p>
      </div>
    </div>
  )
}

// --- Utility ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// --- Expanded Emoji Set ---

const EMOJI_SET = [
  // Smileys
  '😊','😂','🥰','😍','😘','😭','😤','🤔','😏','🙄',
  '😴','🥺','😎','🤯','🥳','😈','😇','🤭','😬','🫠',
  '🥹','😮‍💨','🤗','😶‍🌫️','🫡','🤨','😋','🫣','😌','🥲',
  // Hearts & love
  '❤️','🩷','🧡','💛','💚','💙','💜','🖤','🤍','🩵',
  '💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝',
  // Hands & gestures
  '👋','👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤟',
  '💪','🫶','✍️','💅','🤙','👆','👇','👈','👉','☝️',
  '🫰','🤌','🤏','👌','🫳','🫴','🖐️','✋','🤚','👊',
  // Fire, sparkles, stars
  '✨','🔥','💫','⭐','🌟','💥','💢','💯','🕯️','♾️',
  // Nature & weather
  '🌸','🌺','🌹','🌷','🌻','🪷','🌿','🍀','🍃','🌱',
  '🌙','☀️','🌊','❄️','🌈','⛈️','🌤️','🌧️','🦋','🐱',
  // Food & drink
  '☕','🍵','🍷','🍸','🥂','🧋','🍰','🍫','🍪','🍓',
  '🍑','🫐','🍋','🥑','🧁','🎂','🍩','🍬','🫖','🥃',
  // Objects & symbols
  '📖','💻','🗝️','🛡️','🪞','🎵','🎶','🔮','🧿','🪶',
  '📝','🖊️','🗡️','⚙️','🔗','📌','🏷️','🧩','🎯','🏠',
  '💡','🌀','♟️','🧭','⏳','🔔','📡','🗃️','📦','🎁',
  // Misc expressive
  '🫂','👁️','🧠','💭','💬','🗯️','💤','👀','🫧','🪐',
]
