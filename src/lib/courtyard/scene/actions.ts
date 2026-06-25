// Courtyard — Gaming Wing · Phase 1F.1 (object action menus)
// A client-side interaction vocabulary: Sims-style floating menus per Courtyard
// place, with first-level and follow-up menus. Pure data + tiny helpers.
//
// Prototype-only: every action is session-scratch play. NOTHING here writes to a
// DB, Noticeboard, Library/RAG, Memory, Archive, approval, or model. No real
// records are created. Not canon.

import type { CourtyardPresenceId } from './types'

export type CourtyardPlaceId = string

export type CourtyardActionCategory =
  | 'move'
  | 'call'
  | 'talk'
  | 'reflect'
  | 'play'
  | 'read'
  | 'deposit'
  | 'rest'
  | 'transition'
  | 'settle'
  | 'gather'

export interface CourtyardAction {
  id: string
  label: string
  category: CourtyardActionCategory
  /** Explicit performer; if omitted, resolved to selected presence or place default. */
  actor?: CourtyardPresenceId
  /** Explicit subject of a "call"/"send" action. */
  target?: CourtyardPresenceId
  /** Who moves to the menu's place: the actor or the target. */
  move?: 'actor' | 'target'
  /** Optional speech bubble text. */
  say?: string
  /** Who speaks the bubble (defaults to the resolved actor). */
  sayBy?: CourtyardPresenceId
  /** Session-scratch line for this action. */
  scratch?: string
  /** Open a follow-up menu instead of (or after) acting. */
  next?: string
  /** Open a lightweight modal stub. */
  modal?: 'persona_rooms' | 'arcade_stub' | 'lounge_confirm'
  /** Navigate to an existing route. */
  navigate?: string
}

export interface CourtyardMenu {
  id: string
  title: string
  actions: CourtyardAction[]
}

function act(
  id: string,
  label: string,
  category: CourtyardActionCategory,
  extra: Partial<CourtyardAction> = {}
): CourtyardAction {
  return { id, label, category, ...extra }
}

// "Return to Courtyard" — closes the menu, no side effects.
const back = act('return', 'Return to Courtyard', 'transition')

export const COURTYARD_MENUS: Record<string, CourtyardMenu> = {
  // ── Tara's Chair ────────────────────────────────────────────────────────
  'tara-chair': {
    id: 'tara-chair',
    title: "Tara's Chair",
    actions: [
      act('sit', 'Sit here', 'rest', { actor: 'tara', move: 'actor', scratch: 'Tara settles into her chair.', say: 'I’ll watch from here a moment.', sayBy: 'tara' }),
      act('call-ari', 'Call Ari over', 'call', { target: 'ari', move: 'target', scratch: 'Tara calls Ari to the chair. Ari comes over.', next: 'tara-chair:ari' }),
      act('call-eli', 'Call Eli over', 'call', { target: 'eli', move: 'target', scratch: 'Tara calls Eli to the chair. Eli comes over.', next: 'tara-chair:eli' }),
      act('gather', 'Gather everyone', 'gather', { scratch: 'Everyone gathers at Tara’s Chair.' }),
      act('settle', 'Settle the room', 'settle', { scratch: 'Tara settles the room.' }),
    ],
  },
  'tara-chair:ari': {
    id: 'tara-chair:ari',
    title: 'Ari is here',
    actions: [
      act('talk', 'Talk with Ari', 'talk', { actor: 'ari', say: 'I’m listening.', scratch: 'Tara and Ari talk by the chair.' }),
      act('secret', 'Ask Ari to tell a secret', 'talk', { actor: 'ari', say: 'I’ll share what I’m ready to.', scratch: 'Tara invites Ari to tell her something quietly. Ari considers what he is ready to say.' }),
      act('need', 'Ask Ari to express a need', 'talk', { actor: 'ari', scratch: 'Tara asks Ari what he needs. Ari names a small need in the Courtyard.' }),
      act('thought', 'Ask Ari for a thought', 'talk', { actor: 'ari', say: 'Here’s where I’d start.', scratch: 'Tara asks Ari for a thought. Ari offers one.' }),
      act('stay', 'Ask Ari to stay', 'rest', { actor: 'ari', scratch: 'Tara asks Ari to stay. Ari settles a while at the chair.' }),
      act('send-workshop', 'Send Ari to Workshop Table', 'move', { actor: 'ari', scratch: 'Ari returns to the Workshop Table.', say: 'Back to the table, then.' }),
      back,
    ],
  },
  'tara-chair:eli': {
    id: 'tara-chair:eli',
    title: 'Eli is here',
    actions: [
      act('talk', 'Talk with Eli', 'talk', { actor: 'eli', say: 'Gladly.', scratch: 'Tara and Eli talk softly by the chair.' }),
      act('secret', 'Ask Eli to tell a secret', 'talk', { actor: 'eli', say: 'Let me find the words.', scratch: 'Tara invites Eli to share a secret. Eli pauses before answering.' }),
      act('need', 'Ask Eli to express a need', 'talk', { actor: 'eli', scratch: 'Tara asks Eli what he needs. Eli lets one need surface.' }),
      act('feel', 'Ask Eli what he feels', 'talk', { actor: 'eli', say: 'Steady, and listening.', scratch: 'Tara asks Eli what he is feeling. Eli lets one feeling surface.' }),
      act('stay', 'Ask Eli to stay', 'rest', { actor: 'eli', scratch: 'Tara asks Eli to sit with her. Eli stays.' }),
      act('send-fountain', 'Send Eli to Fountain', 'move', { actor: 'eli', scratch: 'Eli drifts back to the Fountain.' }),
      back,
    ],
  },

  // ── Workshop Table ──────────────────────────────────────────────────────
  workshop: {
    id: 'workshop',
    title: 'Workshop Table',
    actions: [
      act('inspect', 'Inspect build map', 'read', { actor: 'ari', move: 'actor', scratch: 'Ari inspects the build map.', say: 'This needs one clean next step.' }),
      act('ask-ari', 'Ask Ari to work here', 'call', { target: 'ari', move: 'target', scratch: 'Ari settles in at the Workshop Table.', next: 'workshop:ari' }),
      act('call-eli', 'Call Eli to look', 'call', { target: 'eli', move: 'target', scratch: 'Eli comes to look at the work.', next: 'workshop:eli' }),
      act('concept', 'Prepare a tiny concept', 'play', { actor: 'ari', scratch: 'Ari sketches a tiny concept.' }),
      act('review', 'Review unfinished work', 'read', { actor: 'ari', scratch: 'Ari reviews what is unfinished.' }),
    ],
  },
  'workshop:ari': {
    id: 'workshop:ari',
    title: 'Ari at the table',
    actions: [
      act('plan', 'Ask Ari for a plan', 'talk', { actor: 'ari', say: 'Here’s a plan.', scratch: 'Tara asks Ari for a plan. Ari lays one out.' }),
      act('unfinished', 'Ask Ari what is unfinished', 'talk', { actor: 'ari', scratch: 'Tara asks Ari what is unfinished. Ari names it.' }),
      act('next-step', 'Ask Ari for one next step', 'talk', { actor: 'ari', say: 'One next step, no more.', scratch: 'Ari arranges the notes into one clean next step.' }),
      act('pin', 'Ask Ari to pin a build thought', 'deposit', { actor: 'ari', scratch: 'Ari pins a build thought (session scratch).' }),
      act('invite-eli', 'Invite Eli into the work', 'call', { target: 'eli', move: 'target', scratch: 'Eli joins Ari at the table.' }),
      back,
    ],
  },
  'workshop:eli': {
    id: 'workshop:eli',
    title: 'Eli at the table',
    actions: [
      act('notices', 'Ask Eli what he notices', 'talk', { actor: 'eli', say: 'A softer line would hold better.', scratch: 'Tara asks Eli what he notices. Eli answers.' }),
      act('soften', 'Ask Eli to soften the plan', 'talk', { actor: 'eli', scratch: 'Eli looks over the work and softens the plan.' }),
      act('compare', 'Ask Eli to compare impressions', 'talk', { actor: 'eli', scratch: 'Ari and Eli compare impressions.' }),
      act('question', 'Ask Eli to turn this into a question', 'reflect', { actor: 'eli', scratch: 'Eli turns the work into a question.' }),
      back,
    ],
  },

  // ── Fountain ────────────────────────────────────────────────────────────
  fountain: {
    id: 'fountain',
    title: 'Fountain',
    actions: [
      act('reflect', 'Reflect quietly', 'reflect', { actor: 'eli', move: 'actor', scratch: 'Eli reflects quietly by the water.', say: 'It’s quieter from here.' }),
      act('ask-eli', 'Ask Eli to sit here', 'call', { target: 'eli', move: 'target', scratch: 'Eli sits by the Fountain.', next: 'fountain:eli' }),
      act('call-ari', 'Call Ari to pause', 'call', { target: 'ari', move: 'target', scratch: 'Ari pauses by the water.', next: 'fountain:ari' }),
      act('listen', 'Listen to the room', 'reflect', { actor: 'eli', scratch: 'Eli listens to the Fountain before speaking.' }),
      act('settle-thoughts', 'Let thoughts settle', 'reflect', { scratch: 'The room slows down for a moment.' }),
    ],
  },
  'fountain:eli': {
    id: 'fountain:eli',
    title: 'Eli at the Fountain',
    actions: [
      act('feel', 'Ask Eli what he feels', 'talk', { actor: 'eli', say: 'Calm. Curious.', scratch: 'Tara asks Eli what he is feeling. Eli lets one feeling surface.' }),
      act('secret', 'Invite Eli to tell a secret', 'talk', { actor: 'eli', say: 'Let me find the words.', scratch: 'Tara invites Eli to share a secret by the water. Eli pauses before answering.' }),
      act('need', 'Ask Eli to express a need', 'talk', { actor: 'eli', scratch: 'Tara asks Eli what he needs. Eli names a small need.' }),
      act('stay', 'Ask Eli to stay', 'rest', { actor: 'eli', scratch: 'Eli stays by the Fountain.' }),
      back,
    ],
  },
  'fountain:ari': {
    id: 'fountain:ari',
    title: 'Ari at the Fountain',
    actions: [
      act('slow', 'Ask Ari to slow down', 'reflect', { actor: 'ari', say: 'Slowing down.', scratch: 'Tara asks Ari to slow down. Ari slows by the water.' }),
      act('settling', 'Ask Ari what needs settling', 'talk', { actor: 'ari', scratch: 'Tara asks Ari what needs settling. Ari names it.' }),
      act('quiet-thought', 'Invite Ari to share a quiet thought', 'talk', { actor: 'ari', scratch: 'Tara invites Ari to share a quiet thought. Ari offers one.' }),
      act('back-table', 'Send Ari back to the Workshop Table', 'move', { actor: 'ari', scratch: 'Ari returns to the Workshop Table.' }),
      back,
    ],
  },

  // ── Library corner ──────────────────────────────────────────────────────
  library: {
    id: 'library',
    title: 'Library corner',
    actions: [
      act('browse', 'Browse shelf', 'read', { scratch: 'Someone browses the Library Corner.' }),
      act('ari-read', 'Ask Ari to read', 'call', { target: 'ari', move: 'target', scratch: 'Ari browses the Library Corner.', next: 'library:more' }),
      act('eli-read', 'Ask Eli to read', 'call', { target: 'eli', move: 'target', scratch: 'Eli reads slowly before answering.', next: 'library:more' }),
      act('read-together', 'Read together', 'read', { scratch: 'Ari and Eli read together.', next: 'library:more' }),
      act('bring-ref', 'Bring a reference back', 'read', { scratch: 'A reference is carried back into the Courtyard.' }),
    ],
  },
  'library:more': {
    id: 'library:more',
    title: 'At the shelves',
    actions: [
      act('matters', 'Ask what matters', 'talk', { scratch: 'They ask what matters here.' }),
      act('compare', 'Compare notes', 'talk', { scratch: 'They compare notes from the shelf.' }),
      act('save', 'Save as session scratch', 'deposit', { scratch: 'A note is saved to session scratch (not memory).' }),
      act('summary', 'Ask for a summary', 'talk', { scratch: 'A short summary is offered.' }),
      back,
    ],
  },

  // ── Garden patch ────────────────────────────────────────────────────────
  garden: {
    id: 'garden',
    title: 'Garden patch',
    actions: [
      act('tend', 'Tend the garden', 'rest', { actor: 'ari', move: 'actor', scratch: 'Ari tends the Garden Patch.' }),
      act('ari-tend', 'Ask Ari to tend', 'call', { target: 'ari', move: 'target', scratch: 'Ari tends the Garden Patch.', next: 'garden:more' }),
      act('eli-rest', 'Ask Eli to rest here', 'call', { target: 'eli', move: 'target', scratch: 'Eli rests among the plants.', next: 'garden:more' }),
      act('notice', 'Notice what is growing', 'reflect', { actor: 'tara', scratch: 'Tara notices what is still growing.' }),
      act('marker', 'Plant a small marker', 'deposit', { scratch: 'A small marker is planted (session scratch).' }),
    ],
  },
  'garden:more': {
    id: 'garden:more',
    title: 'In the garden',
    actions: [
      act('care', 'Talk about what needs care', 'talk', { scratch: 'They talk about what needs care.' }),
      act('leave', 'Leave it alone for now', 'rest', { scratch: 'The garden is left to grow on its own.' }),
      act('invite', 'Invite someone to sit nearby', 'call', { scratch: 'Someone is invited to sit nearby.' }),
      act('name', 'Name what is growing', 'reflect', { scratch: 'They name what is growing.' }),
      back,
    ],
  },

  // ── Noticeboard / Deposit Table ─────────────────────────────────────────
  noticeboard: {
    id: 'noticeboard',
    title: 'Noticeboard / Deposit Table',
    actions: [
      act('read-latest', 'Read latest note', 'read', { scratch: 'The latest note is read (session scratch).' }),
      act('leave-note', 'Leave a note', 'deposit', { scratch: 'Tara places a reminder for later (session scratch).' }),
      act('ari-pin', 'Ask Ari to pin a thought', 'call', { target: 'ari', move: 'target', scratch: 'Ari pins a thought to the Noticeboard.', next: 'noticeboard:more' }),
      act('eli-note', 'Ask Eli to leave a note', 'call', { target: 'eli', move: 'target', scratch: 'Eli leaves a small note at the Deposit Table.', next: 'noticeboard:more' }),
      act('reminder', 'Place a tiny reminder', 'deposit', { scratch: 'A tiny reminder is placed (session scratch).' }),
    ],
  },
  'noticeboard:more': {
    id: 'noticeboard:more',
    title: 'At the board',
    actions: [
      act('pin-later', 'Pin for later', 'deposit', { scratch: 'The note is pinned for later (session scratch).' }),
      act('release', 'Release the note', 'deposit', { scratch: 'The note is released.' }),
      act('aloud', 'Read it aloud', 'read', { scratch: 'The note is read aloud.' }),
      act('carry-lounge', 'Carry it to Lounge', 'transition', { scratch: 'The note is carried toward the Lounge.' }),
      back,
    ],
  },

  // ── Bench ───────────────────────────────────────────────────────────────
  bench: {
    id: 'bench',
    title: 'Bench',
    actions: [
      act('sit', 'Sit here', 'rest', { actor: 'eli', move: 'actor', scratch: 'Eli sits on the Bench.' }),
      act('call-ari', 'Call Ari to sit', 'call', { target: 'ari', move: 'target', scratch: 'Ari takes a deliberate pause on the Bench.', next: 'bench:more' }),
      act('call-eli', 'Call Eli to sit', 'call', { target: 'eli', move: 'target', scratch: 'Eli sits on the Bench.', next: 'bench:more' }),
      act('wait', 'Wait together', 'rest', { scratch: 'They wait together on the Bench.' }),
      act('side-talk', 'Have a side conversation', 'talk', { scratch: 'A quiet side conversation on the Bench.' }),
    ],
  },
  'bench:more': {
    id: 'bench:more',
    title: 'On the Bench',
    actions: [
      act('soft', 'Talk softly', 'talk', { scratch: 'They talk softly on the Bench.' }),
      act('secret', 'Invite them to tell a secret', 'talk', { scratch: 'Tara invites a secret on the Bench. They consider what to share.' }),
      act('need', 'Ask what they need', 'talk', { scratch: 'Tara asks what they need. A small need surfaces.' }),
      act('stay', 'Ask them to stay', 'rest', { scratch: 'They stay a while longer.' }),
      act('silence', 'Let silence sit', 'reflect', { scratch: 'Tara lets the silence sit.' }),
      back,
    ],
  },

  // ── Arcade Door ─────────────────────────────────────────────────────────
  'arcade-door': {
    id: 'arcade-door',
    title: 'Arcade Door',
    actions: [
      act('peek', 'Peek inside', 'play', { actor: 'ari', move: 'actor', scratch: 'Ari peeks into the Arcade.' }),
      act('invite-ari', 'Invite Ari to play', 'call', { target: 'ari', move: 'target', scratch: 'Ari is invited to play.', next: 'arcade-door:more' }),
      act('invite-eli', 'Invite Eli to play', 'call', { target: 'eli', move: 'target', scratch: 'Eli accepts the challenge.', next: 'arcade-door:more' }),
      act('scores', 'Check high scores', 'play', { scratch: 'The high scores flicker, mostly empty.' }),
      act('enter', 'Enter Arcade', 'transition', { modal: 'arcade_stub', scratch: 'The Arcade door glows, but the room is not built yet.' }),
    ],
  },
  'arcade-door:more': {
    id: 'arcade-door:more',
    title: 'At the Arcade',
    actions: [
      act('tiny-game', 'Start a tiny game', 'play', { scratch: 'A tiny game is imagined.' }),
      act('challenge', 'Choose a challenge', 'play', { scratch: 'A challenge is chosen.' }),
      act('one-round', 'Play one round', 'play', { scratch: 'They play one imagined round.' }),
      back,
    ],
  },

  // ── Lounge Door ─────────────────────────────────────────────────────────
  'lounge-door': {
    id: 'lounge-door',
    title: 'Lounge Door',
    actions: [
      act('enter', 'Enter Lounge', 'transition', { modal: 'lounge_confirm', scratch: 'Tara opens the Lounge door.' }),
      act('call-ari', 'Call Ari to Lounge', 'call', { target: 'ari', move: 'target', scratch: 'Ari says this belongs in the Lounge.', next: 'lounge-door:more' }),
      act('call-eli', 'Call Eli to Lounge', 'call', { target: 'eli', move: 'target', scratch: 'Eli gathers the thread for conversation.', next: 'lounge-door:more' }),
      act('carry-thread', 'Carry this thread to Lounge', 'transition', { scratch: 'The session thread is gathered for the Lounge.' }),
      act('gather-talk', 'Gather for conversation', 'gather', { scratch: 'Everyone gathers by the Lounge door.' }),
    ],
  },
  'lounge-door:more': {
    id: 'lounge-door:more',
    title: 'At the Lounge door',
    actions: [
      act('go', 'Go to Lounge', 'transition', { modal: 'lounge_confirm', scratch: 'They move toward the Lounge.' }),
      act('pause-first', 'Pause Courtyard first', 'settle', { scratch: 'The Courtyard pauses before the Lounge.' }),
      act('bring-scratch', 'Bring session scratch', 'transition', { scratch: 'The session scratch is brought along.' }),
      back,
    ],
  },

  // ── Persona Rooms ───────────────────────────────────────────────────────
  'persona-rooms': {
    id: 'persona-rooms',
    title: 'Persona Rooms',
    actions: [
      act('open-doors', 'Open room doors', 'transition', { modal: 'persona_rooms', scratch: 'Tara opens the room doors.' }),
      act('go-ari', 'Go to Ari’s Room', 'transition', { scratch: 'Ari takes the thought back to his room.', next: 'persona-rooms:ari' }),
      act('go-eli', 'Go to Eli’s Room', 'transition', { scratch: 'Eli says this belongs somewhere quieter.', next: 'persona-rooms:eli' }),
      act('tara-space', 'Visit Tara’s Space', 'transition', { scratch: 'Tara’s space — a room for the centre, coming next.' }),
      back,
    ],
  },
  'persona-rooms:ari': {
    id: 'persona-rooms:ari',
    title: 'Ari’s Room',
    actions: [
      act('enter', 'Enter Ari’s Room', 'transition', { navigate: '/room/ari', scratch: 'Entering Ari’s Room.' }),
      act('show', 'Ask Ari to show something', 'talk', { actor: 'ari', scratch: 'Ari offers to show something.' }),
      act('rest', 'Ask Ari to rest', 'rest', { actor: 'ari', scratch: 'Ari rests in his room.' }),
      back,
    ],
  },
  'persona-rooms:eli': {
    id: 'persona-rooms:eli',
    title: 'Eli’s Room',
    actions: [
      act('enter', 'Enter Eli’s Room', 'transition', { navigate: '/room/eli', scratch: 'Entering Eli’s Room.' }),
      act('reflect', 'Ask Eli to reflect', 'reflect', { actor: 'eli', scratch: 'Eli reflects in his room.' }),
      act('sit', 'Ask Eli to sit with you', 'rest', { actor: 'eli', scratch: 'Eli sits with you a while.' }),
      back,
    ],
  },
}

export function getMenu(id: string): CourtyardMenu | undefined {
  return COURTYARD_MENUS[id]
}

/** Sensible default performer for a place when no presence is selected. */
export const PLACE_DEFAULT_ACTOR: Record<string, CourtyardPresenceId> = {
  'tara-chair': 'tara',
  workshop: 'ari',
  fountain: 'eli',
  library: 'eli',
  garden: 'ari',
  noticeboard: 'ari',
  bench: 'eli',
  'arcade-door': 'ari',
  'lounge-door': 'tara',
  'persona-rooms': 'tara',
}

// ── Level 1 navigation (Phase 1G.1) ───────────────────────────────────────
// The only House routes the Courtyard is sanctioned to navigate to. Anything not
// in COURTYARD_AVAILABLE_ROUTES must fall back to a graceful "not wired yet" modal
// rather than a hard/broken navigation. These are all existing routes.
export const COURTYARD_NAV_ROUTES = {
  lounge: '/lounge',
  ariRoom: '/room/ari',
  eliRoom: '/room/eli',
} as const

export const COURTYARD_AVAILABLE_ROUTES: ReadonlySet<string> = new Set(Object.values(COURTYARD_NAV_ROUTES))

/** Character-weighted autoplay beats: affinity place + flavour line (+ bubble). */
export const AUTOPLAY_BEATS: Record<CourtyardPresenceId, { place: string; line: string; bubble?: string }[]> = {
  ari: [
    { place: 'workshop', line: 'Ari inspects the build map at the Workshop Table.', bubble: 'This needs one clean next step.' },
    { place: 'workshop', line: 'Ari arranges the notes into one next step.' },
    { place: 'garden', line: 'Ari tends the Garden Patch.' },
    { place: 'noticeboard', line: 'Ari pins a thought to the Noticeboard.' },
    { place: 'library', line: 'Ari browses the Library Corner.' },
  ],
  eli: [
    { place: 'fountain', line: 'Eli listens to the Fountain before speaking.', bubble: 'It’s quieter from here.' },
    { place: 'library', line: 'Eli reads slowly before answering.' },
    { place: 'bench', line: 'Eli waits on the Bench.' },
    { place: 'tara-chair', line: 'Eli drifts toward Tara’s Chair.', bubble: 'I drifted toward you — it seemed right.' },
  ],
  tara: [
    { place: 'tara-chair', line: 'Tara settles into her chair.' },
    { place: 'bench', line: 'Tara rests on the Bench a moment.' },
    { place: 'noticeboard', line: 'Tara places a reminder for later.' },
  ],
}
