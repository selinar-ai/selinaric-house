// Courtyard — Living Room Spike · Action scoring
// A small, readable utility model for "what would Ari/Eli drift toward next?".
// Deterministic given the runtime state; the simulator adds a little seeded
// jitter for tie-breaking so the room doesn't loop mechanically.
//
// No LLM, no randomness here — just legible factors and a plain-language reason.

import { activitiesFor } from './activities'
import { LIVING_PLACES } from './places'
import { CORE_WANTS } from './wants'
import type {
  CharacterRuntime,
  CoreWantId,
  LivingActivity,
  PlaceId,
  ScoreFactor,
  ScoredOption,
} from './types'

export interface ScoreContext {
  step: number
  /** Emergent-want ids the room has already noticed this session. */
  noticedSignals: string[]
}

const round = (n: number) => Math.round(n * 100) / 100

function strongWants(actor: CharacterRuntime, wants: CoreWantId[]): CoreWantId[] {
  return wants.filter((w) => (actor.wants[w] ?? 0) >= 0.4)
}

export function scoreOption(
  actor: CharacterRuntime,
  activity: LivingActivity,
  placeId: PlaceId,
  ctx: ScoreContext,
): ScoredOption {
  const factors: ScoreFactor[] = []

  // Want intensity — the core driver.
  let wantIntensity = 0
  for (const w of activity.wantsServed) wantIntensity += actor.wants[w] ?? 0
  factors.push({ key: 'want intensity', value: round(wantIntensity) })

  // A light nudge so wantless activities (pause/observe) aren't completely flat.
  const relevance = activity.wantsServed.length ? 0.1 : 0.03
  factors.push({ key: 'relevance', value: relevance })

  // Less travel if they're already here.
  const locationBonus = actor.location === placeId ? 0.18 : 0
  if (locationBonus) factors.push({ key: 'already here', value: locationBonus })

  // Recency / repetition, from this actor's recent history.
  const lastSame = [...actor.history].reverse().find((h) => h.activityId === activity.id)
  const stepsSince = lastSame ? ctx.step - lastSame.step : Number.POSITIVE_INFINITY
  const recencyBonus = stepsSince === Number.POSITIVE_INFINITY ? 0.15 : 0
  if (recencyBonus) factors.push({ key: 'something new', value: recencyBonus })
  const repetitionPenalty = stepsSince !== Number.POSITIVE_INFINITY && stepsSince <= 3 ? -0.3 : 0
  if (repetitionPenalty) factors.push({ key: 'just did it', value: repetitionPenalty })

  // Conversation is pulled by connection.
  let relationship = 0
  if (activity.category === 'Conversation') {
    relationship = round((actor.wants.connection ?? 0) * 0.25)
    factors.push({ key: 'reaching out', value: relationship })
  }

  // A theme already noticed this session keeps a gentle pull.
  let emergent = 0
  if (activity.emergentSignal && ctx.noticedSignals.includes(activity.emergentSignal)) {
    emergent = 0.08
    factors.push({ key: 'a familiar pull', value: emergent })
  }

  const score = round(
    wantIntensity + relevance + locationBonus + recencyBonus + repetitionPenalty + relationship + emergent,
  )

  return {
    activityId: activity.id,
    placeId,
    score,
    factors,
    reason: buildReason(actor, activity, placeId, { stepsSince, relationship, locationBonus }),
  }
}

function buildReason(
  actor: CharacterRuntime,
  activity: LivingActivity,
  placeId: PlaceId,
  meta: { stepsSince: number; relationship: number; locationBonus: number },
): string {
  const name = actor.id === 'ari' ? 'Ari' : 'Eli'
  const place = LIVING_PLACES[placeId].name
  const strong = strongWants(actor, activity.wantsServed).map((w) => CORE_WANTS[w].label)

  const bits: string[] = []
  if (strong.length === 1) bits.push(`${strong[0]} is high`)
  else if (strong.length > 1) bits.push(`${strong.slice(0, -1).join(', ')} and ${strong[strong.length - 1]} are high`)
  else if (activity.category === 'Conversation' && meta.relationship > 0) bits.push('the wish to connect is up')
  else bits.push('the room is quiet and it felt right')

  if (meta.locationBonus > 0) bits.push(`${name} is already near the ${place}`)
  else bits.push(`the ${place} is free`)

  if (meta.stepsSince === Number.POSITIVE_INFINITY) bits.push(`${name} hasn’t been there yet this session`)

  return `${name} chose “${activity.label}” because ${bits.join(', ')}.`
}

/** All options for an actor right now, ranked best-first. */
export function rankOptions(actor: CharacterRuntime, ctx: ScoreContext): ScoredOption[] {
  const options: ScoredOption[] = []
  for (const place of Object.values(LIVING_PLACES)) {
    const canChoose = actor.id === 'ari' ? place.ariCanChoose : place.eliCanChoose
    if (!canChoose) continue
    for (const activity of activitiesFor(actor.id, place.id)) {
      options.push(scoreOption(actor, activity, place.id, ctx))
    }
  }
  options.sort((a, b) => b.score - a.score)
  return options
}
