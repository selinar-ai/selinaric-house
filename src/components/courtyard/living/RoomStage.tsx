'use client'

// Courtyard — Living Room Spike · Room stage
// A stylised top-down map of the Courtyard. Places sit on a 4×3 grid; Ari, Eli,
// and Tara appear as soft markers in whichever zone they're currently in.

import { LIVING_PLACES, PLACE_IDS } from '@/lib/courtyard/living/places'
import { activeAction } from '@/lib/courtyard/living/sessionSimulator'
import type { LivingCharacterId, SessionState } from '@/lib/courtyard/living/types'

const MARKER: Record<LivingCharacterId, string> = {
  tara: 'border-amber-400/60 text-amber-200 bg-amber-900/20',
  ari: 'border-ari-secondary text-ari-primary bg-ari-glow',
  eli: 'border-eli-secondary text-eli-primary bg-eli-glow',
}

export default function RoomStage({ state }: { state: SessionState }) {
  const occupants: Record<string, LivingCharacterId[]> = {}
  const add = (place: string, who: LivingCharacterId) => {
    occupants[place] = occupants[place] ?? []
    occupants[place].push(who)
  }
  add(state.taraLocation, 'tara')
  add(state.characters.ari.location, 'ari')
  add(state.characters.eli.location, 'eli')

  const ariActive = activeAction(state, 'ari')
  const eliActive = activeAction(state, 'eli')
  const busyPlaces = new Set([ariActive?.placeId, eliActive?.placeId].filter(Boolean) as string[])

  return (
    <div
      className="grid gap-2 p-3 rounded-lg bg-house-bg border border-house-border"
      style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, minmax(5.5rem, auto))' }}
    >
      {PLACE_IDS.map((id) => {
        const place = LIVING_PLACES[id]
        const here = occupants[id] ?? []
        const busy = busyPlaces.has(id)
        return (
          <div
            key={id}
            className={`relative flex flex-col rounded-md border p-2 transition-colors ${
              busy ? 'border-house-muted bg-house-surface' : 'border-house-border bg-house-surface/40'
            }`}
            style={{ gridColumn: place.zone.col, gridRow: place.zone.row }}
            title={place.flavour}
          >
            <div className="font-body text-[10px] uppercase tracking-wide text-text-muted">{place.type}</div>
            <div className="font-body text-xs text-text-secondary leading-tight">{place.name}</div>
            {here.length > 0 && (
              <div className="mt-auto flex flex-wrap gap-1 pt-2">
                {here.map((who) => (
                  <span
                    key={who}
                    className={`font-body text-[10px] px-1.5 py-0.5 rounded-full border ${MARKER[who]}`}
                  >
                    {who === 'tara' ? 'Tara' : who === 'ari' ? 'Ari' : 'Eli'}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
