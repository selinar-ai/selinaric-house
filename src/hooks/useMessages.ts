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
}

export function useMessages(roomSlug: 'ari' | 'eli') {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMessages() {
      const { data, error } = await supabase
        .from('room_messages')
        .select('id, room_slug, role, content, created_at, message_type, image_url, image_path')
        .eq('room_slug', roomSlug)
        .order('created_at', { ascending: false })
        .limit(100)

      // Reverse to chronological order (we fetched newest-first to get the latest 100)
      if (data) data.reverse()

      if (error) {
        console.error('Failed to load messages:', error)
        setMessages([])
      } else if (data) {
        setMessages(data)
      }
      setLoading(false)
    }

    loadMessages()
  }, [roomSlug])

  const saveMessage = useCallback(
    async (message: Omit<Message, 'id' | 'created_at'>) => {
      const row: Record<string, unknown> = {
        room_slug: roomSlug,
        role: message.role,
        content: message.content,
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
        setMessages(prev => [...prev, data])
        return data
      }

      return null
    },
    [roomSlug]
  )

  const clearMessages = useCallback(async () => {
    await supabase.from('room_messages').delete().eq('room_slug', roomSlug)
    setMessages([])
  }, [roomSlug])

  return { messages, loading, saveMessage, clearMessages, setMessages }
}
