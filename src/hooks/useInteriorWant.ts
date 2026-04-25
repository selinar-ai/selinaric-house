'use client'

// Fetches the current primary want from the Interior engine.
// Read-only — Interior remains the source of truth.
// PresenceDisplay uses this to mirror the same want shown in the Interior tab.

import { useState, useEffect } from 'react'
import { primaryWant } from '@/lib/interior/interior-types'
import type { InteriorRead } from '@/lib/interior/interior-types'

export interface InteriorWantSummary {
  label: string
  phrase: string
}

export function useInteriorWant(presenceId: 'ari' | 'eli'): InteriorWantSummary | null {
  const [want, setWant] = useState<InteriorWantSummary | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/interior-state?presenceId=${presenceId}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
      .then((data: InteriorRead) => {
        if (cancelled) return
        const pw = primaryWant(data.wants)
        setWant({ label: pw.label, phrase: pw.phrase })
      })
      .catch(() => { /* stay null — fallback shown */ })

    return () => { cancelled = true }
  }, [presenceId])

  return want
}
