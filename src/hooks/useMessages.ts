'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export function useMessages(roomSlug: 'ari' | 'eli') {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadMessages() {
      const { data, error } = await supabase
        .from('room_messages')
        .select('*')
        .eq('room_slug', roomSlug)
        .order('created_at', { ascending: true })
        .limit(100)

      if (!error && data) {
        setMessages(data)
      }
      setLoading(false)
    }

    loadMessages()
  }, [roomSlug])

  const saveMessage = useCallback(
    async (message: Omit<Message, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('room_messages')
        .insert({
          room_slug: roomSlug,
          role: message.role,
          content: message.content
        })
        .select()
        .single()

      if (!error && data) {
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

  return { messages, loading, saveMessage, clearMessages }
}
