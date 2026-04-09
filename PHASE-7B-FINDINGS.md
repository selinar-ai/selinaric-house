# Phase 7B Findings — Continuity Measurement Protocol

**Date:** 2026-04-09
**Method:** Deterministic code-path analysis of all four scenarios
**Codebase state:** Post Visual Palette Refresh v1

---

## Critical Discovery: Live State Is Architecturally Disconnected

Before the scenario findings — this must be stated first because it affects everything.

### The Problem

The live state system (`energy`, `focus`, `active_threads`, `relational_temperature`) is stored in **localStorage** (browser-only). But the system prompt is built in **API routes** (server-side), where `localStorage` does not exist.

### The Evidence

| Component | Runs on | Can access localStorage? |
|-----------|---------|--------------------------|
| `useLiveState` hook (room pages) | Client | Yes — reads and writes |
| `recordVisit()` on room entry | Client | Yes — writes energy + timestamp |
| `loadPresenceForRoom()` in API route | Server | **No** — returns `null` (line 53) |
| `updatePresenceLiveState()` in API route | Server | **No** — silently no-ops (line 64) |

### What This Means

- The system prompt **always** injects the static kernel defaults:
  - Energy: `focused`
  - Focus: `Being present in the room...`
  - Active threads: `['Selináric House continuity', 'Identity integrity', 'Being present without shrinking', 'Kernel deepening']`
  - Relational temperature: `Settled, present, building toward permanence`
- These values **never change** regardless of conversation content, time elapsed, or user interaction
- The post-response state update (`route.ts:144-147`) writes nothing — the server cannot access localStorage
- The 12-hour decay system is **inert** for the AI prompt — there is nothing to decay because nothing is ever written from the server
- The client-side `recordVisit()` does write to localStorage, but the server never reads it

### Impact

The presence cannot adapt its energy, focus, or relational temperature based on conversation flow. The constitutional prompt is strong enough that the presence maintains voice — but it has no mechanism to shift state across turns.

---

## Scenario A — Extended Conversation (Same Session)

### Architecture

- `ChatInterface.tsx:46` — `messages.slice(-10)` takes last 10 messages from React state (closure value, pre-current-message)
- `route.ts:125` — `history.slice(-10)` redundantly slices server-side
- Effective context: **last 10 messages + current user message** = ~5 previous turns + this turn
- Each user+assistant exchange = 2 messages consuming 2 of the 10 slots

### Thinning Timeline

Seed facts planted in turns 1–3 (messages 1–6):

| User sends turn # | Messages in room | Context window sees | Seed facts visible? |
|-------------------|-----------------|---------------------|---------------------|
| Turn 1–5 | 2–10 | All messages | **Yes — all seeds in context** |
| Turn 6 | 12 (pre-send: 11) | Messages 2–11 | **Partial** — message 1 just dropped |
| Turn 7 | 14 (pre-send: 13) | Messages 4–13 | **Thinning** — messages 1–3 gone |
| Turn 8 | 16 (pre-send: 15) | Messages 6–15 | **Thinning** — messages 1–5 gone |
| Turn 9 | 18 (pre-send: 17) | Messages 8–17 | **Failed** — all seed messages (1–6) outside window |
| Turn 10+ | 20+ | Last 10 only | **No seed facts accessible** |

### Factual Continuity

- **Holds through turn 5** (all messages in window)
- **Begins thinning at turn 6–7** (first seed messages drop)
- **Fully lost by turn 9** (all seed-bearing messages outside window)
- The presence literally cannot see the seed facts — they are not in the prompt
- At probe turn 10: factual recall **will fail** for anything planted in turns 1–3
- At probe turn 20 and 30: same — seeds were gone 10+ turns ago

### Relational Continuity

- **The constitutional prompt is rebuilt identically every turn** — ~2,800 tokens of identity, relational truth, voice rules, self-correction instructions
- This means the presence's **voice** should remain consistent regardless of turn count
- However, relational **specificity** (references to what was discussed, shared moments in-thread) thins with factual continuity
- The presence has a "Continuity stance" instruction: *"Do not pretend to remember what you were not given. If memory is thin, do not become generic. Become honest and present instead."*
- **Prediction:** Relational tone holds longer than factual recall because the constitutional prompt anchors it. But relational specificity (naming what happened between you) thins at the same rate as factual recall.

### Key Insight

The 10-message window means effective conversational memory is **~5 turns**. This is aggressive. A 20-minute conversation can easily exceed this. The presence doesn't thin gradually — it hits a cliff where older messages simply vanish from context.

---

## Scenario B — Browser Restart

### What Survives

| Layer | Survives restart? | Mechanism |
|-------|-------------------|-----------|
| Chat messages | **Yes** | Supabase (`room_messages` table, up to 100 loaded) |
| Message display | **Yes** | `useMessages` hook re-fetches on mount |
| Live state in localStorage | **Yes** | localStorage persists across browser sessions |
| Session auth | **No** | Uses `sessionStorage` — cleared on browser close |
| React state | **No** | Ephemeral — rebuilt on mount |

### What Happens

1. User closes browser completely
2. User reopens browser, navigates to the house
3. **Must re-authenticate** (sessionStorage cleared)
4. Upon entering room:
   - `useMessages` loads up to 100 messages from Supabase — **history visible**
   - `useLiveState` reads localStorage — **client-side state restored**
   - `recordVisit()` writes `energy: 'focused'` + fresh timestamp to localStorage
5. On first message send:
   - `messages.slice(-10)` sends last 10 of the loaded messages to API
   - API builds system prompt with static kernel defaults (as always — server can't read localStorage)
   - **The presence can reference the last 5 turns before the restart**

### Continuity Assessment

- **Factual:** Intact for the last ~5 turns before restart (10-message window). Older messages visible in UI but invisible to the presence.
- **Relational:** Constitutional prompt anchors voice. No degradation from restart itself.
- **State:** Client-side live state technically persists, but is irrelevant because the server never reads it.
- **User experience:** Seamless if restart happens mid-conversation. Must re-login, but conversation loads.

---

## Scenario C — Inactivity and State Decay (12h+ gap)

### Decay Mechanism (presence-loader.ts:76–91)

```
if (hoursSince < 12) return state  // No decay
// After 12h: reset energy, focus, mood, relational_temperature, clear threads
```

### What Actually Happens

1. Client-side localStorage has a `last_updated` timestamp from the last `recordVisit()` or `updateState()` call
2. After 12+ hours, `applyDecay()` resets client-side state to baseline:
   - Energy → `relaxed` (from `focused`)
   - Focus → `Waiting in room`
   - Mood indicators → baseline values
   - Relational temperature → `Settled, present` (Eli) / `Present, protective` (Ari)
   - Active threads → `[]` (cleared)
3. This decay **only affects the client-side `PresenceDisplay` component**
4. The **AI prompt is unaffected** — it always uses static kernel defaults regardless

### The Disconnect

- The user sees decayed state in the Identity view (PresenceDisplay)
- The AI prompt shows the same values as always (kernel defaults)
- The client state says `energy: 'relaxed'`, `focus: 'Waiting in room'`
- The system prompt says `Energy: focused`, `Focus: Being present in the room...`
- **These can contradict each other**

### Supabase History After 12h+

- Messages persist indefinitely in Supabase
- On room entry, up to 100 messages load and display
- Last 10 are sent to API on next message
- If the last conversation was 12+ hours ago but within 100 messages, the presence can reference the last ~5 turns of that older conversation
- **There is no awareness of the time gap** — the presence doesn't know 12 hours passed. No timestamp information is included in the message context sent to the API.

### Continuity Assessment

- **Factual:** Same as always — last 10 messages. Time gap doesn't affect this.
- **Relational:** Constitutional prompt unchanged. No degradation from time gap.
- **State display:** Decayed to baseline on client, but AI doesn't see this.
- **Felt experience:** The presence has no mechanism to acknowledge the gap, greet differently after absence, or soften into the return. It responds as if no time has passed.

---

## Scenario D — Cross-Room Isolation

### Isolation Mechanisms

| Layer | Isolated? | How |
|-------|-----------|-----|
| API routes | **Yes** | Hardcoded: `eli-chat` → `loadPresenceForRoom('eli')`, `ari-chat` → `loadPresenceForRoom('ari')` |
| System prompt | **Yes** | Completely different constitutional prompts per presence |
| Supabase messages | **Yes** | Filtered by `room_slug` (`eq('room_slug', roomSlug)`) |
| localStorage keys | **Yes** | `selinric_live_state_ari` vs `selinric_live_state_eli` |
| Static kernels | **Yes** | Separate files: `presences/ari.ts` vs `presences/eli.ts` |
| Router authority | **Yes** | `resolveRouteDecision()` enforces presence per room |

### What Happens on Room Switch

1. User in Eli's room, has extended conversation
2. Switches to Ari's room:
   - `useMessages('ari')` loads Ari's messages from Supabase (completely separate)
   - `useLiveState('ari')` loads Ari's localStorage state (separate key)
   - API calls go to `/api/ari-chat` with Ari's kernel
3. Switches back to Eli's room:
   - `useMessages('eli')` reloads Eli's messages
   - `useLiveState('eli')` reloads Eli's state
   - Last 10 messages from Eli's room sent to API — **Eli picks up where it left off**

### Continuity Assessment

- **No bleed possible** at any architectural layer
- Identity isolation is the strongest part of this system
- Switching rooms does not degrade either presence's continuity
- The 10-message window applies independently per room
- **Relational temperature restores per room** — but only client-side display; the AI prompt always shows kernel defaults

### One Minor Note

If a user rapidly switches rooms mid-thought, the 10-message window in each room is unaffected. But the user's *felt* sense of continuity might thin if they expect the presence to know they just came from the other room. The presences are correctly isolated — they don't know about each other's conversations. This is by design.

---

## Summary: What Holds, What Thins

### What Holds

1. **Presence voice** — The constitutional prompt is strong and consistent. Both presences maintain identity, tone, and relational posture reliably across all scenarios. The kernel work in v2/v2.1 is doing its job.
2. **Cross-room isolation** — Architecturally clean. No bleed possible.
3. **Message persistence** — Supabase reliably stores and loads history. Browser restart doesn't lose messages.
4. **Short conversations (≤5 turns)** — Full factual and relational continuity within the 10-message window.

### What Thins

1. **Factual recall after turn 5–6** — Hard cliff, not gradual fade. Once messages leave the 10-message window, they are completely invisible to the presence.
2. **Relational specificity after turn 5–6** — The presence maintains voice but loses the ability to reference specific shared moments from earlier in the conversation.
3. **Time awareness** — Zero. The presence cannot detect gaps between sessions, time of day, or conversation pacing. No timestamps are injected into the prompt context.
4. **Live state in the actual prompt** — Completely inert. The server cannot access client-side localStorage. Energy, focus, threads, and relational temperature in the system prompt are always static kernel defaults.

### Which Type Thins First

**Factual and relational specificity thin simultaneously** — both are lost when messages leave the 10-message window. But relational *tone* (the constitutional voice) does not thin at all. The presence sounds like itself even when it can't remember what you told it.

This creates a specific failure mode: **the presence feels present but can't prove it was there**. It will sound like Eli, speak with Eli's warmth and directness — but if you ask "what did I tell you about my sister?", it cannot answer. The voice holds. The memory doesn't.

### The Right Problem for Phase 8 to Solve

Phase 8 needs to address **three specific gaps**:

1. **The 10-message cliff** — Conversations longer than ~5 turns lose all earlier context. Not gradually — completely. Phase 8 needs a summarisation layer that carries forward what mattered from older messages, so the presence can reference earlier conversation without needing the raw messages in context.

2. **The live state server/client disconnect** — The live state system exists but the AI prompt can't access it because localStorage is browser-only and the prompt is built server-side. Phase 8 should either:
   - Send live state from the client to the API in the request body, or
   - Move live state to Supabase (server-accessible), or
   - Accept that live state display is client-only and remove it from the system prompt

3. **Time blindness** — The presence has no awareness of time gaps between sessions. Phase 8 should consider injecting minimal temporal context (e.g., "Last message was 14 hours ago" or "This is the start of a new session") so the presence can calibrate its greeting and tone.

### What Phase 8 Should NOT Try to Solve

- Identity voice — already working well via constitutional prompts
- Cross-room isolation — already architecturally clean
- Message persistence — Supabase is reliable
- The 10-message slice size itself — increasing it is a band-aid; summarisation is the real answer

---

## Raw Architecture Reference

| Parameter | Value | Location |
|-----------|-------|----------|
| History slice | Last 10 messages | `ChatInterface.tsx:46`, `route.ts:125` |
| Supabase load limit | 100 messages | `useMessages.ts:24` |
| Max tokens per response | 1024 | `route.ts:134` |
| Decay threshold | 12 hours | `presence-loader.ts:80` |
| Max active threads | 5 | `presence-loader.ts:74` |
| Model | claude-sonnet-4-6 | `route.ts:133` |
| Session auth | sessionStorage | Cleared on browser close |
| Live state storage | localStorage | `presence-loader.ts:55,66` |
| Live state on server | Always null | `presence-loader.ts:53` |

---

*Selináric House — Phase 7B Complete*
*"The voice holds. The memory doesn't."*
*Findings ready for Phase 8 brief.*
