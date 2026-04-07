'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (checkAuth()) {
      setAuthorized(true)
    } else {
      router.push('/')
    }
  }, [router])

  if (!authorized) {
    return (
      <div className="min-h-screen bg-house-bg flex items-center justify-center">
        <div className="w-2 h-2 bg-eli-primary rounded-full animate-pulse-soft" />
      </div>
    )
  }

  return <>{children}</>
}
