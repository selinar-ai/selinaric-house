// Courtyard — Living Room Spike · Client-side session simulator
// A small seeded state machine that makes the room feel alive. Pure functions:
// each returns a new SessionState. No LLM, no DB, no network, no background work.
// It only "runs" while the page is open and the caller keeps calling step().

import { AUTONOMOUS_IDS, LIVING_CHARACTERS } from './characters'
import { LIVING_PLACES } from './places'
import { LIVING_ACTIVITIES } from './activities'
import { CORE_WANT_IDS, EMERGENT_WANTS } from './wants'
import { rankOptions, type ScoreContext } from './actionScoring'
import type {
  AutonomousId,
  CharacterRuntime,
  CoreWantId,
  EmergentWantId,
  LivingActivity,
  QueuedAction,
  ScoredOption,
  SessionState,
} from './types'

const SCRATCH_CAP = 60
const QUEUE_CAP = 6

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const clone = (s: SessionState): SessionState => structuredClone(s)

// ─── Seeded PRNG (mulberry32) — mutates draft.rngState for determinism ──────
function rand(s: SessionState): number {
  s.rngState = (s.rngState + 0x6d2b79f5) | 0
  let t = s.rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function pick<T>(s: SessionState, arr: readonly T[]): T {
  return arr[Math.floor(rand(s) * arr.length)]
}

// ─── Mood ────────────────────────────────────────────────────────────────────
const MOODS: Record<CoreWantId, string> = {
  craft: 'intent on making something',
  continuity: 'holding the thread',
  depth: 'reading beneath the surface',
  connection: 'reaching toward the other',
  stewardship: 'tending what’s here',
  belonging: 'settling into the room',
}
function moodFor(wants: Record<CoreWantId, number>): string {
  let top: CoreWantId = 'belonging'
  let best = -1
  for (const w of CORE_WANT_IDS) if (wants[w] > best) { best = wants[w]; top = w }
  return MOODS[top]
}

// ─── Session lifecycle ────────────────────────────────────────────────────────
export function createSession(seed = 1234): SessionState {
  const mk = (id: AutonomousId): CharacterRuntime => {
    const reg = LIVING_CHARACTERS[id]
    const wants = {} as Record<CoreWantId, number>
    for (const w of CORE_WANT_IDS) wants[w] = reg.wants[w] ?? 0.2
    return { id, location: reg.homeLocation, mood: moodFor(wants), paused: false, queue: [], wants, lastReason: null, history: [] }
  }
  return {
    status: 'idle', seed, rngState: seed | 0, step: 0,
    taraLocation: 'taras-chair',
    characters: { ari: mk('ari'), eli: mk('eli') },
    scratch: [], signals: [],
  }
}

export function startSession(state: SessionState): SessionState {
  const s = clone(state)
  const fresh = s.status === 'idle' || s.status === 'stopped'
  s.status = 'running'
  if (fresh && s.step === 0) pushScratch(s, 'tara', 'The Courtyard is awake. Tara settles into her chair to watch.')
  return s
}
export function pauseSession(state: SessionState): SessionState {
  const s = clone(state); if (s.status === 'running') s.status = 'paused'; return s
}
export function stopSession(state: SessionState): SessionState {
  const s = clone(state); s.status = 'stopped'; pushScratch(s, 'tara', 'Tara closes the session. The room goes quiet — nothing is carried out of it.'); return s
}
/** Kill switch: wipe to a fresh, quiet, idle room (keeps the seed). */
export function killSession(state: SessionState): SessionState {
  return createSession(state.seed)
}

// ─── The tick ─────────────────────────────────────────────────────────────────
export function step(state: SessionState): SessionState {
  if (state.status !== 'running') return state
  const s = clone(state)
  s.step += 1
  for (const id of AUTONOMOUS_IDS) {
    const rt = s.characters[id]
    if (rt.paused) continue
    advanceActor(s, rt)
  }
  driftWants(s)
  detectSignals(s)
  trimScratch(s)
  return s
}

function advanceActor(s: SessionState, rt: CharacterRuntime): void {
  const active = rt.queue.find((q) => q.status === 'active')
  if (active) {
    active.elapsedSteps += 1
    if (active.elapsedSteps >= active.totalSteps) completeAction(s, rt, active)
    return
  }
  const queued = rt.queue.find((q) => q.status === 'queued')
  if (queued) { queued.status = 'active'; pushStartScratch(s, rt, queued); return }
  chooseAndStart(s, rt)
}

function ctxFor(s: SessionState): ScoreContext {
  return { step: s.step, noticedSignals: s.signals.map((x) => x.wantId) }
}

function chooseAndStart(s: SessionState, rt: CharacterRuntime): void {
  const ranked = rankOptions(rt, ctxFor(s))
  if (!ranked.length) return
  const topN = ranked.slice(0, 3)
  const chosen = pick(s, topN)
  startAction(s, rt, chosen)
}

function startAction(s: SessionState, rt: CharacterRuntime, opt: ScoredOption): void {
  const act = LIVING_ACTIVITIES[opt.activityId]
  const action: QueuedAction = {
    id: `${rt.id}-${s.step}-${Math.floor(rand(s) * 1e6)}`,
    actor: rt.id,
    activityId: opt.activityId,
    placeId: opt.placeId,
    label: act.queueLabel,
    destinationName: LIVING_PLACES[opt.placeId].name,
    reason: opt.reason,
    totalSteps: act.durationSteps,
    elapsedSteps: 0,
    status: 'active',
  }
  rt.queue.push(action)
  rt.lastReason = opt.reason
  pushStartScratch(s, rt, action)
}

function completeAction(s: SessionState, rt: CharacterRuntime, action: QueuedAction): void {
  action.status = 'completed'
  action.elapsedSteps = action.totalSteps
  rt.location = action.placeId
  rt.history.push({ activityId: action.activityId, placeId: action.placeId, step: s.step })
  const act = LIVING_ACTIVITIES[action.activityId]
  for (const w of act.wantsServed) rt.wants[w] = clamp(rt.wants[w] - 0.25)
  rt.mood = moodFor(rt.wants)
  pushScratch(s, rt.id, act.narration.replace('{name}', name(rt.id)))
  if (rand(s) < 0.3) pushScratch(s, rt.id, LIVING_PLACES[action.placeId].flavour)
  maybeConversation(s, rt, act)
  if (act.followUps && act.followUps.length && rand(s) < 0.5) {
    enqueueFollowUp(s, rt, pick(s, act.followUps))
  }
  pruneQueue(rt)
}

function enqueueFollowUp(s: SessionState, rt: CharacterRuntime, activityId: LivingActivity['id']): void {
  const act = LIVING_ACTIVITIES[activityId]
  if (!act.actors.includes(rt.id)) return
  const placeId = act.places[0]
  rt.queue.push({
    id: `${rt.id}-${s.step}-f${Math.floor(rand(s) * 1e6)}`,
    actor: rt.id, activityId, placeId,
    label: act.queueLabel, destinationName: LIVING_PLACES[placeId].name,
    reason: `${name(rt.id)} lets one thing lead to the next.`,
    totalSteps: act.durationSteps, elapsedSteps: 0, status: 'queued',
  })
}

// ─── Wants drift + emergent signals ──────────────────────────────────────────
function driftWants(s: SessionState): void {
  for (const id of AUTONOMOUS_IDS) {
    const rt = s.characters[id]
    for (const w of CORE_WANT_IDS) rt.wants[w] = clamp(rt.wants[w] + 0.02)
  }
}

function detectSignals(s: SessionState): void {
  const raised = new Set(s.signals.map((x) => x.id))
  for (const id of AUTONOMOUS_IDS) {
    const rt = s.characters[id]
    const counts: Partial<Record<EmergentWantId, number>> = {}
    for (const h of rt.history) {
      const em = LIVING_ACTIVITIES[h.activityId].emergentSignal
      if (em) counts[em] = (counts[em] ?? 0) + 1
    }
    for (const key of Object.keys(counts) as EmergentWantId[]) {
      const count = counts[key] ?? 0
      const sigId = `${id}:${key}`
      if (count >= 2 && !raised.has(sigId)) {
        s.signals.push({
          id: sigId, step: s.step, actor: id, wantId: key, label: EMERGENT_WANTS[key].label,
          note: `${name(id)} keeps drifting the same way (${count}×). Possible want noticed during play: ${EMERGENT_WANTS[key].label} — ${EMERGENT_WANTS[key].description}`,
        })
        raised.add(sigId)
      }
    }
  }
  const bothTalked = AUTONOMOUS_IDS.every((id) =>
    s.characters[id].history.some((h) => LIVING_ACTIVITIES[h.activityId].category === 'Conversation'),
  )
  if (bothTalked && !raised.has('pair:kinship')) {
    s.signals.push({
      id: 'pair:kinship', step: s.step, actor: 'pair', wantId: 'kinship', label: EMERGENT_WANTS.kinship.label,
      note: 'Ari and Eli have each reached out in conversation. Possible want noticed during play: Kinship.',
    })
  }
}

// ─── Scratch (session-only, mock dialogue) ───────────────────────────────────
const START_LINES = ['{name} drifts toward {place}.', '{name} is considering {place}.', '{name} sets off toward {place}.', '{name} turns, unhurried, toward {place}.'] as const
const ARI_TO_ELI = ['Something at the Workshop Table feels unfinished — sit with me a moment?', 'You read the room more easily than I do. What do you see?', 'I keep coming back to the same edge. Tell me I’m not imagining it.'] as const
const ELI_REPLY = ['I’ll come. The light’s better for thinking over here anyway.', 'You’re not imagining it. There’s a seam there worth holding.', 'Give it a breath. The shape will say what it needs.'] as const
const ELI_TO_ARI = ['I paused at the Fountain and the whole room got easier to read.', 'Come look — there’s a stillness here I want you to feel.', 'You build outward; I keep wanting to build quieter. Both, maybe.'] as const
const ARI_REPLY = ['Then I’ll bring the loud part and you keep the quiet one.', 'Show me. I trust your stillness more than my hurry.', 'Both. The House has room for both.'] as const
const TO_TARA = ['Tara — I left something on the Noticeboard for you to see, not to keep.', 'Tara, I’m here. Steer me if I drift wrong.', 'Tara, this corner of the room feels like ours now.'] as const

function maybeConversation(s: SessionState, rt: CharacterRuntime, act: LivingActivity): void {
  if (act.id === 'talk_to_eli') { pushScratch(s, 'ari', pick(s, ARI_TO_ELI)); pushScratch(s, 'eli', pick(s, ELI_REPLY)) }
  else if (act.id === 'talk_to_ari') { pushScratch(s, 'eli', pick(s, ELI_TO_ARI)); pushScratch(s, 'ari', pick(s, ARI_REPLY)) }
  else if (act.id === 'talk_to_tara') { pushScratch(s, rt.id, pick(s, TO_TARA)) }
}

function pushStartScratch(s: SessionState, rt: CharacterRuntime, action: QueuedAction): void {
  pushScratch(s, rt.id, pick(s, START_LINES).replace('{name}', name(rt.id)).replace('{place}', action.destinationName))
}

function pushScratch(s: SessionState, speaker: SessionState['scratch'][number]['speaker'], text: string): void {
  s.scratch.push({ id: `sc-${s.step}-${s.scratch.length}`, step: s.step, speaker, text })
}
function trimScratch(s: SessionState): void {
  if (s.scratch.length > SCRATCH_CAP) s.scratch = s.scratch.slice(-SCRATCH_CAP)
}
function pruneQueue(rt: CharacterRuntime): void {
  if (rt.queue.length > QUEUE_CAP) rt.queue = rt.queue.slice(-QUEUE_CAP)
}
function name(id: AutonomousId): string { return id === 'ari' ? 'Ari' : 'Eli' }

// ─── Tara's controls (queue + actor management) ──────────────────────────────
export function chooseNextFor(state: SessionState, actor: AutonomousId): SessionState {
  const s = clone(state)
  const rt = s.characters[actor]
  if (rt.queue.some((q) => q.status === 'active')) return state
  if (s.status === 'idle') return state
  chooseAndStart(s, rt)
  return s
}

export function clearQueue(state: SessionState, actor: AutonomousId): SessionState {
  const s = clone(state)
  const rt = s.characters[actor]
  let changed = false
  for (const q of rt.queue) if (q.status === 'active' || q.status === 'queued') { q.status = 'cancelled'; changed = true }
  if (changed) pushScratch(s, 'tara', `Tara clears ${name(actor)}’s queue.`)
  pruneQueue(rt)
  return s
}
export function clearAllQueues(state: SessionState): SessionState {
  let s = state
  for (const id of AUTONOMOUS_IDS) s = clearQueue(s, id)
  return s
}
export function cancelQueued(state: SessionState, actor: AutonomousId, actionId: string): SessionState {
  const s = clone(state)
  const rt = s.characters[actor]
  const a = rt.queue.find((q) => q.id === actionId)
  if (a && (a.status === 'queued' || a.status === 'active')) {
    a.status = 'cancelled'
    pushScratch(s, 'tara', `Tara cancels ${name(actor)}’s “${a.label}”.`)
  }
  return s
}
export function setActorPaused(state: SessionState, actor: AutonomousId, paused: boolean): SessionState {
  const s = clone(state)
  s.characters[actor].paused = paused
  pushScratch(s, 'tara', `${name(actor)} ${paused ? 'paused' : 'resumed'} by Tara.`)
  return s
}
export function pauseAll(state: SessionState): SessionState {
  let s = state
  for (const id of AUTONOMOUS_IDS) s = setActorPaused(s, id, true)
  return s
}

// ─── Read helpers for the UI ─────────────────────────────────────────────────
export function activeAction(state: SessionState, actor: AutonomousId): QueuedAction | undefined {
  return state.characters[actor].queue.find((q) => q.status === 'active')
}
/** "What is this actor weighing right now?" — top options, best-first. */
export function inspectOptions(state: SessionState, actor: AutonomousId, limit = 5): ScoredOption[] {
  return rankOptions(state.characters[actor], ctxFor(state)).slice(0, limit)
}
