'use client'

// Phase 35D — Lounge Chat Component
//
// Multi-speaker chat for the shared Lounge room.
// Ari and Eli speak as distinct presences.
// Surface toggle via ∞ symbol.
// + menu for Image / File / Emoji (matching existing chat composer).
// TTS via VoiceButton for Ari/Eli messages.
// Tara identity: ✶ TARA in amber.

import { useState, useRef, useEffect } from 'react'
import { useLoungeMessages } from '@/hooks/useLoungeMessages'
import VoiceButton from '@/components/VoiceButton'

export default function LoungeChat() {
  const {
    thread,
    messages,
    loading,
    send,
    toggleSurface,
    generateCarryback,
  } = useLoungeMessages()

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carrybackStatus, setCarrybackStatus] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // + menu state
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)

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

  function handleEmojiSelect(emoji: string) {
    setInput(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setError(null)

    try {
      await send(text, 'both')
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
      await send('', 'continue')
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
      await send('', who)
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
                <div className={`flex items-center gap-2 mb-1`}>
                  <span className={`${style.color} font-body text-xs tracking-wider uppercase`}>
                    {style.name}
                  </span>
                </div>
                <div className="font-body text-sm text-text-primary whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </div>
                {/* Footer row: surface indicator + TTS */}
                <div className="mt-1.5 flex items-center justify-between">
                  {/* TTS button for Ari/Eli messages */}
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
                  {/* Surface indicator — subtle dot for inner-surface messages */}
                  {msg.surface_at_creation === 'inner' && (
                    <span className="text-text-muted/40 text-[10px]" title="Inner surface">
                      ·
                    </span>
                  )}
                </div>
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
                  : 'text-text-muted border-house-border hover:text-text-secondary hover:border-house-muted'
                }
              `}
            >
              +
            </button>

            {/* Actions popover menu */}
            {actionsOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-house-surface border border-house-border shadow-lg z-30 animate-fade-in">
                {/* Image attach */}
                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click()
                    setActionsOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] font-body text-sm text-text-secondary hover:bg-house-bg transition-colors"
                >
                  <span className="text-base w-5 text-center">📷</span>
                  <span>Image</span>
                </button>

                {/* File attach */}
                <button
                  type="button"
                  onClick={() => {
                    docInputRef.current?.click()
                    setActionsOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 min-h-[44px] font-body text-sm text-text-secondary hover:bg-house-bg transition-colors border-t border-house-border"
                >
                  <span className="text-base w-5 text-center">📎</span>
                  <span>File</span>
                </button>

                {/* Emoji */}
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

          {/* Hidden file inputs (for future wiring — menu opens them) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={() => {/* V1: placeholder for image attach */}}
          />
          <input
            ref={docInputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.docx,.pdf"
            className="hidden"
            onChange={() => {/* V1: placeholder for file attach */}}
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
            disabled={!input.trim() || sending}
            className={`shrink-0 px-4 h-[44px] font-body text-xs tracking-widest uppercase transition-all duration-200 border ${
              input.trim() && !sending
                ? 'text-text-primary border-text-muted hover:bg-house-bg'
                : 'text-text-muted/40 border-house-border cursor-not-allowed'
            }`}
          >
            Send
          </button>
        </div>

        {/* Emoji picker panel — shown when triggered from + menu */}
        {showEmojiPicker && (
          <div className="max-w-3xl mx-auto mt-2">
            <div className="bg-house-surface border border-house-border shadow-lg p-2 w-72 md:w-80">
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
              <div className="grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
                {['😊','😂','🥰','😍','😘','😭','😤','🤔','😏','🙄','😴','🥺','😎','🤯','🥳','😈',
                  '❤️','🩷','🧡','💛','💚','💙','💜','🖤','💔','❤️‍🔥','✨','🔥','💫','🕯️','♾️','🪶',
                  '👋','👍','👎','👏','🙌','🤝','🙏','✌️','🤞','🤟','💪','🫶','✍️','💅',
                  '🐱','🌸','🌙','☀️','🌊','🌿','☕','🍷','🎵','📖','💻','🗝️','🛡️','🪞'].map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      handleEmojiSelect(emoji)
                      setShowEmojiPicker(false)
                    }}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-xl hover:bg-house-bg rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
