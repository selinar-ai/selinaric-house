'use client'

// Phase 28D / Phase 31 — Auto-Recall Settings Panel
// Shown on the Recall Review page. Lets Tara toggle auto-recall on/off per presence.
// Loads via GET /api/archive-recall/auto-settings, updates via PATCH.
// Defaults: both presences off. Mode is 'off' | 'trial'.
// maxEntries: 1 or 2 only. minMatchQuality always 'strong' (not user-settable).
// Phase 31: exclude_elevated_sensitivity toggle (default true).

import { useState, useEffect, useCallback } from 'react'
import type { AutoRecallSettings } from '@/lib/archive-recall'

interface SettingsMap {
  ari: AutoRecallSettings | null
  eli: AutoRecallSettings | null
}

const PRESENCE_LABEL: Record<string, string> = { ari: 'Ari', eli: 'Eli' }

export default function AutoRecallSettingsPanel() {
  const [settings, setSettings] = useState<SettingsMap>({ ari: null, eli: null })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<Record<string, boolean>>({})
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/archive-recall/auto-settings')
      if (!res.ok) throw new Error('Failed to load settings')
      const data = await res.json()
      const map: SettingsMap = { ari: null, eli: null }
      for (const row of (data.settings ?? []) as AutoRecallSettings[]) {
        if (row.presence_id === 'ari') map.ari = row
        if (row.presence_id === 'eli') map.eli = row
      }
      setSettings(map)
    } catch {
      setError('Could not load auto-recall settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function patch(presenceId: 'ari' | 'eli', updates: Record<string, unknown>) {
    setSaving(prev => ({ ...prev, [presenceId]: true }))
    try {
      const res = await fetch('/api/archive-recall/auto-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presenceId, ...updates }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? 'Update failed')
      }
      const data = await res.json()
      const updated = data.settings as AutoRecallSettings
      setSettings(prev => ({ ...prev, [presenceId]: updated }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setSaving(prev => ({ ...prev, [presenceId]: false }))
    }
  }

  function toggleMode(presenceId: 'ari' | 'eli', current: 'off' | 'trial') {
    patch(presenceId, { mode: current === 'trial' ? 'off' : 'trial' })
  }

  function setMaxEntries(presenceId: 'ari' | 'eli', value: 1 | 2) {
    patch(presenceId, { maxEntries: value })
  }

  function toggleExcludeElevated(presenceId: 'ari' | 'eli', current: boolean) {
    patch(presenceId, { excludeElevatedSensitivity: !current })
  }

  if (loading) {
    return (
      <div className="flex gap-1.5 py-2">
        {[0, 0.15, 0.3].map((d, i) => (
          <div key={i} className="w-1.5 h-1.5 bg-text-muted rounded-full animate-pulse-soft" style={{ animationDelay: `${d}s` }} />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="font-body text-xs text-red-400">{error}</p>
      )}

      <div className="flex flex-wrap gap-4">
        {(['ari', 'eli'] as const).map(pid => {
          const s = settings[pid]
          const isSaving = !!saving[pid]
          const mode = s?.mode ?? 'off'
          const maxEntries = s?.max_entries ?? 1
          const excludeElevated = s?.exclude_elevated_sensitivity ?? true
          const isOn = mode === 'trial'

          return (
            <div key={pid} className="border border-house-border bg-house-bg px-3 py-3 min-w-[200px]">
              {/* Header: presence + mode toggle */}
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="font-body text-xs text-text-primary font-medium">
                  {PRESENCE_LABEL[pid]}
                </span>
                <button
                  onClick={() => toggleMode(pid, mode)}
                  disabled={isSaving || loading}
                  className={`
                    h-6 px-2.5 font-body text-[10px] uppercase tracking-widest border transition-colors
                    ${isOn
                      ? 'text-green-400 border-green-400/40 bg-green-400/10 hover:bg-green-400/20'
                      : 'text-text-muted border-house-border bg-house-surface hover:text-text-secondary hover:border-house-muted'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {isSaving ? '…' : (isOn ? 'Enabled' : 'Off')}
                </button>
              </div>

              {/* Max entries — only editable when on */}
              {isOn && (
                <>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-body text-[10px] text-text-muted">Max entries</span>
                    <div className="flex gap-1">
                      {([1, 2] as const).map(n => (
                        <button
                          key={n}
                          onClick={() => setMaxEntries(pid, n)}
                          disabled={isSaving}
                          className={`
                            w-7 h-6 font-mono text-xs border transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${maxEntries === n
                              ? 'text-text-primary border-house-muted bg-house-border'
                              : 'text-text-muted border-house-border bg-house-bg hover:text-text-secondary hover:border-house-muted'
                            }
                          `}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sensitivity gate toggle (Phase 31) */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="font-body text-[10px] text-text-muted">Exclude elevated sensitivity</span>
                    <button
                      onClick={() => toggleExcludeElevated(pid, excludeElevated)}
                      disabled={isSaving}
                      className={`
                        h-5 px-2 font-body text-[9px] uppercase tracking-wider border transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${excludeElevated
                          ? 'text-amber-400 border-amber-400/40 bg-amber-400/10 hover:bg-amber-400/20'
                          : 'text-text-muted border-house-border bg-house-surface hover:text-text-secondary hover:border-house-muted'
                        }
                      `}
                    >
                      {excludeElevated ? 'Yes' : 'No'}
                    </button>
                  </div>
                  {!excludeElevated && (
                    <p className="font-body text-[9px] text-amber-400/80 mt-1">
                      ⚠ Sacred, sensitive, and technical items may appear in auto-recall.
                    </p>
                  )}
                </>
              )}

              {/* Fixed info: min quality */}
              <p className="font-body text-[9px] text-text-muted mt-2 opacity-70">
                Min quality: strong · Canonical only
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
