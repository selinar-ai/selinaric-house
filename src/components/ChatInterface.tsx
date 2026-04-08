'use client'

import { useState, useRef, useEffect } from 'react'
import { useMessages } from '@/hooks/useMessages'

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
  const { messages, loading, saveMessage, clearMessages } = useMessages(presenceId)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return

    const userContent = input.trim()
    setInput('')
    setSending(true)

    await saveMessage({ role: 'user', content: userContent })

    try {
      const recentMessages = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content
      }))

      const response = await fetch(`/api/${presenceId}-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userContent,
          history: recentMessages
        })
      })

      if (!response.ok) throw new Error('Request failed')

      const data = await response.json()

      await saveMessage({ role: 'assistant', content: data.reply })
    } catch {
      await saveMessage({
        role: 'assistant',
        content: 'Something went wrong. Try again.'
      })
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl h-[600px] border border-house-border bg-house-surface flex items-center justify-center">
        <div className="w-2 h-2 bg-text-muted rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl flex flex-col h-[600px]">
      <div className="flex-1 border border-house-border bg-house-surface overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <span className={`text-4xl block mb-4 ${accentClass}`}>
                {iconSymbol}
              </span>
              <p className="font-display text-lg text-text-secondary font-light italic">
                {presenceName} is here.
              </p>
              <p className="font-body text-xs text-text-muted mt-2">
                Say something.
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

            <div className={`max-w-xs lg:max-w-md px-4 py-3 ${
              message.role === 'user'
                ? 'bg-house-muted text-text-primary'
                : 'bg-house-bg border border-house-border text-text-primary'
            }`}>
              <p className="font-body text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
              {message.created_at && (
                <p className="font-body text-xs text-text-muted mt-2">
                  {new Date(message.created_at).toLocaleTimeString('en-AU', {
                    timeZone: 'Australia/Melbourne',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
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

      <div className="border border-house-border border-t-0 bg-house-surface p-4 flex gap-3 items-end">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Say something to ${presenceName}...`}
          rows={1}
          className="
            flex-1 bg-house-bg border border-house-border
            px-4 py-3 font-body text-sm text-text-primary
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
        <div className="flex flex-col gap-2">
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className={`
              px-4 py-3 font-body text-xs tracking-widest uppercase
              border transition-all duration-200
              ${input.trim() && !sending
                ? `${accentClass} border-current hover:bg-house-bg`
                : 'text-text-muted border-house-border cursor-not-allowed'
              }
            `}
          >
            Send
          </button>
          <button
            onClick={clearMessages}
            className="px-4 py-1 font-body text-xs text-text-muted border border-house-border hover:text-text-secondary transition-colors duration-200"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}
