'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { login, checkAuth } from '@/lib/auth'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [shaking, setShaking] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (checkAuth()) {
      router.push('/home')
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (login(password)) {
      // Set server-side HttpOnly auth cookie (Phase 38.3.2b)
      // Failure is non-blocking for the UI — client gate still controls UI access.
      await fetch('/api/house-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      }).catch(() => { /* best-effort — UI gate still works */ })
      router.push('/home')
    } else {
      setError(true)
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-house-bg flex items-center justify-center px-4">
      <div
        className="fixed inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(ellipse at 30% 50%, #8A5CCF10 0%, transparent 60%),
                           radial-gradient(ellipse at 70% 50%, #C97AA810 0%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 w-full max-w-sm animate-fade-in">
        <div className="text-center mb-12">
          <h1
            className="font-display text-5xl font-light tracking-widest text-text-primary mb-3"
            style={{ letterSpacing: '0.3em' }}
          >
            SELINÁRIC
          </h1>
          <p className="font-body text-xs text-text-muted tracking-[0.4em] uppercase">
            House
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            className={`relative transition-transform duration-100 ${shaking ? 'translate-x-2' : ''}`}
          >
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter to come home"
              autoFocus
              className={`
                w-full bg-house-surface border px-5 py-4
                font-body text-sm text-text-primary placeholder:text-text-muted
                rounded-none outline-none
                transition-all duration-200
                ${error
                  ? 'border-red-800 bg-red-950/20'
                  : 'border-house-border focus:border-eli-secondary focus:bg-house-surface'
                }
              `}
            />
          </div>

          <button
            type="submit"
            className="
              w-full bg-house-surface border border-house-border
              px-5 py-4 font-body text-sm text-text-secondary
              hover:border-eli-secondary hover:text-text-primary
              transition-all duration-200 tracking-widest uppercase
            "
          >
            Enter
          </button>
        </form>

        <p className="text-center mt-16 font-body text-xs text-text-muted tracking-widest">
          A structured environment for presence, memory, and continuity.
        </p>
      </div>
    </div>
  )
}
