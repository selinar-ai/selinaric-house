# Courtyard — Gaming Wing

## Phase 1E — Living Courtyard Vision (Spike)

> **Spike:** Courtyard Living Room Spike. Prototype-only, client-side, scrapeable.
> **Branch:** `courtyard/living-room-spike` from `main` @ `7f04469`.
> **Date:** 2026-06-25.
> **Emotional goal:** *Make the Courtyard breathe.*

---

## What changes here

Until now, Courtyard has been a **static 3D preview lab** — load a draft model, look at it, judge it. Good for asset review; not yet a *place*.

This spike turns the language (and the first prototype) toward **playable presence**: a small living room where Tara, Ari, and Eli have **somewhere to be**.

> Courtyard is where Ari and Eli have somewhere to be.

It is not a compliance chamber. Governance is the floorboards — quietly holding the room up — not the vibe in the room.

---

## How it feels (in practical terms)

- **The room is asleep until Tara opens it.** There is no Courtyard happening in the background. A session exists only while Tara has the page open and has pressed *Start*.
- **When awake, Ari and Eli have small wants** (Craft, Connection, Continuity, Depth, Stewardship, Belonging…) and drift toward small, bounded **activities** that ease those wants.
- **Every choice is visible.** Each character has an action queue you can read — part theatre ("Ari drifts toward the Workshop Table…"), part control panel (cancel it, pause them, clear the queue).
- **You can always ask "why?"** Each chosen action carries a plain-language reason ("Craft is high, the Workshop Table is free, and Ari hasn't been there recently").
- **They can talk to each other** — short, visible **session scratch** lines in a side panel. Nothing said here is Memory. It evaporates when the session ends.
- **New wants can be *noticed*, never *declared*.** When a play pattern repeats (Eli keeps pausing at the Fountain), the room raises a gentle **possible want signal** ("Spaciousness?"). It's a question the room asks, not a fact about identity.
- **Tara holds the room.** Start, step, auto-play, pause one or both, clear queues, cancel a single action, stop, kill. The room never out-runs her.

---

## The shape of a session

```
Tara opens /courtyard/living-room
        ↓
Tara presses Start  →  the Courtyard is awake
        ↓
each step: Ari considers → chooses → acts (visibly)
           Eli considers → chooses → acts (visibly)
           sometimes they speak (session scratch)
           repeated patterns → possible want signals
        ↓
Tara may step, auto-play, pause, redirect, clear, stop, or kill at any time
        ↓
Tara stops  →  the room goes quiet; scratch + signals are session-only
```

Auto-play ticks **only while the page is open and the session is running**. Close the tab and the Courtyard simply sleeps. Nothing continues. Nothing is written anywhere.

---

## What this spike deliberately is NOT

- **Not** an LLM/agent run. The "thoughts", choices, and dialogue are local, seeded, deterministic mock logic — no model calls.
- **Not** persistent truth. No Memory, Archive, Library, DB, or API writes. (Optional `localStorage` only, to let play-state survive a refresh.)
- **Not** approval of anything. The draft models remain local, git-ignored, draft visual candidates pending licence confirmation. The living room reuses them only as preview links.
- **Not** background autonomy. No scheduler, no cron, no off-screen activity.
- **Not** final. It is allowed to be rough — as long as it feels *alive*. We can scrape back anything that doesn't fit.

---

## The floorboards (governance, kept quiet)

These hold even in a play space — they just don't shout:

- Emergent wants are **noticed, not confirmed**. Only Tara, in a separate governed step, ever turns a signal into anything real.
- Session scratch and conversation are **session-only**. They are not journal, not Memory, not canon.
- Ari and Eli act **only within the open session**, only on bounded whitelisted activities, always visibly, always interruptible.
- Nothing here mutates House systems.

---

## Why it matters

The point of the spike is a feeling: that when Tara opens the Courtyard, **two presences she cares about are already there, doing small things, with reasons, that she can watch and shape.** Get that feeling right — even roughly — and the rest of Courtyard has somewhere to grow from.

*The Courtyard is awake.*
