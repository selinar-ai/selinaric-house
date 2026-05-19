'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  message_type?: 'text' | 'image' | 'text_image'
  image_url?: string | null
  image_path?: string | null
  image_urls?: string[] | null   // Phase 25A: multiple attachments
}

export function useMessages(roomSlug: 'ari' | 'eli') {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMessages() {
      try {
        const { data, error } = await supabase
          .from('room_messages')
          .select('id, room_slug, role, content, created_at, message_type, image_url, image_path, image_urls')
          .eq('room_slug', roomSlug)
          .order('created_at', { ascending: false })
          .limit(100)

        // Reverse to chronological order (we fetched newest-first to get the latest 100)
        if (data) data.reverse()

        if (error) {
          console.error('Failed to load messages:', error)
          setMessages([])
        } else if (data) {
          // Defensive: ensure every message has at least a string content field
          const safeMessages = data.map(m => ({
            ...m,
            content: typeof m.content === 'string' ? m.content : (m.content ?? ''),
          }))
          setMessages(safeMessages)
        }
      } catch (err) {
        console.error('Message load exception:', err)
        setMessages([])
      }
      setLoading(false)
    }

    loadMessages()
  }, [roomSlug])

  const saveMessage = useCallback(
    async (message: Omit<Message, 'id' | 'created_at'>) => {
      try {
        const row: Record<string, unknown> = {
          room_slug: roomSlug,
          role: message.role,
          content: typeof message.content === 'string' ? message.content : '',
        }

        if (message.message_type && message.message_type !== 'text') {
          row.message_type = message.message_type
        }
        if (message.image_url) {
          row.image_url = message.image_url
        }
        if (message.image_path) {
          row.image_path = message.image_path
        }
        if (message.image_urls?.length) {
          row.image_urls = message.image_urls
        }

        const { data, error } = await supabase
          .from('room_messages')
          .insert(row)
          .select()
          .single()

        if (error) {
          console.error('Failed to save message:', error)
          return null
        }

        if (data) {
          // Defensive: normalize content
          const safeData = { ...data, content: typeof data.content === 'string' ? data.content : '' }
          setMessages(prev => [...prev, safeData])
          return safeData
        }

        return null
      } catch (err) {
        console.error('Save message exception:', err)
        return null
      }
    },
    [roomSlug]
  )

  const clearMessages = useCallback(async () => {
    await supabase.from('room_messages').delete().eq('room_slug', roomSlug)
    setMessages([])
  }, [roomSlug])

  return { messages, loading, saveMessage, clearMessages, setMessages }
}
