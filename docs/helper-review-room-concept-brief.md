# Concept Brief — Helper Review Rooms (spatial review surface)

**Status:** Approved as a **concept** by Ari — **not** approved as a build. Held as a reviewed concept direction. Uncommitted note only: no code, no stage, no commit, no phase start.
**Family:** Phase 41 — Helper Architecture (a presentation layer over what's already sealed)
**Proposed by:** Tara · sketched with Eli · governance review: Ari (concept approved)

---

## Ari's review — reviewed concept direction

**Verdict:** the spatial room idea is strong and the direction is correct, aesthetically and architecturally. It is a **future presentation-layer phase**, not a mutation/authority phase, and it should come *after* a read-only event-trace phase.

**Core law (Ari):**
> Spatial UI may change the reviewer's sense of place. It may not change the helper's power.

**Proposed ordering (Ari):**
- `41.14 — Helper Review Event Read-Only Trace`
- `41.15 — Helper Workshop Spatial Review Surface` (this concept)
- `41.16 — Phase 41 Closure Record`

**Guardrails required before this becomes buildable:**

1. **Naming — avoid authority-surface confusion.** "The Archive" room is renamed **The Trace Shelf** (it must not read as the House Archive authority surface).
2. **Wording — no batch claims yet.** Avoid "batch-ready"; the grouped low-risk room reads **low-risk · grouped (quiet queue)** until batch governance actually exists.
3. **Accessibility & fallback (required):** keyboard usable; `prefers-reduced-motion` respected; a plain-list fallback always available; mobile falls back to the plain review list; particles / glow / courier movement must never obscure text, state, or controls; button labels stay plain English — `Mark reviewed`, `Dismiss`, `Needs follow-up`.
4. **The courier stays silent:** it presents only — never speaks, explains, recommends, decides, remembers, or routes. (Silence is the helper law made visible.)
5. **Real row details stay legible:** helper type, action type, review state, risk/burden, source summary, and the three governed controls are always readable — the scene decorates them, never replaces them.

---

## One line

Replace the dense "cockpit" `/helpers` dashboard with a small, gamified, **spatial** interface — enchanted rooms a reviewer walks between, where a silent little courier presents one piece of helper work and the reviewer actions it in-scene — **without changing anything about what helpers can do.**

## The problem

The current `/helpers` surface is a cockpit: filters, cards, metadata, everything visible at once. It works, but it's tiring to *work in*. Tara wants reviewing to feel like visiting a place, not flying a panel.

## The idea

A top-down "base map" of rooms (think a study, a vault, a sorting-hall). Enter a room and a small magical courier — head, two hands, no legs, ghost-like — floats over and **presents** the work it brought. The reviewer reads it and acts: mark reviewed, dismiss, needs follow-up. Velvety storybook aesthetic (plum/violet, candle-gold, pink/blue magic), not neon. The courier never speaks — it only presents.

## What it is

- A **re-skin of navigation and interaction** over the existing helper review system.
- A spatial/diegetic UI: rooms as views, ambient light as signal, a courier as the "here is work" gesture.
- The same governed lever underneath.

## Two-level navigation (the "walk the workshop" loop)

The surface has two views the reviewer moves between:

1. **The Workshop Map (overview)** — a top-down view of the whole workshop: a central **Atrium** connected by corridors to the rooms. Each room glows with its own state and shows how much is waiting ("1 awaiting you", "empty", "kept as trace"). Brighter glow = needs attention sooner. This is the home screen; you always return here between rooms.
2. **The Room (in-scene)** — click a room and the corridor carries you in. A silent courier presents one piece of work; the three controls sit in the scene; you act; you step back out to the map.

The loop: **map → click a room → courier presents the work → act → back to the map.**

Rooms map to the existing queue buckets (Phase 41.10):

| Room | Burden bucket |
|---|---|
| The Vault | authority_critical |
| The Spire | high risk |
| The Reading Hall | medium / individual review |
| The Sorting Hall | low-risk · grouped (quiet queue) |
| The Quiet Shelf | low-risk · no review |
| The Trace Shelf | dismissed / closed (trace, never deleted) |

Why this helps the cockpit fatigue **and** the governance: instead of one dense panel showing everything at once, the map tells you *where* and the room shows you *one thing at a time* — the reviewer is never looking at more than a single piece of work.

## What it is NOT (the governance line)

- **Not** new authority. Nothing in a room becomes Memory, evidence, prompt-visible, Library/Archive/Graph truth, or moves any authority flag.
- **Not** helper agency. Couriers don't talk, decide, remember, or act on their own. A silent presenter *is* the helper law ("prepare, suggest, queue — never speak as truth") made visual.
- **Not** a new mutation path. It calls the existing route only.
- **Not** batch. One room, one courier, one piece of work, one action — same as today.
- **Not** the Ari/Eli "RPG world" idea — that's a separate, later dream for the presences, not the helpers.

## How it maps to what's already built (nothing new underneath)

| In the scene | Real system (already sealed) |
|---|---|
| Which room work lands in | Queue buckets / burden (Phase 41.10) |
| Ambient glow / room pulsing | Read-only burden signal (risk, escalation) |
| The grimoire / page | A real `helper_outputs` row (GET `/api/helper-outputs`) |
| Mark reviewed / Dismiss / Needs follow-up runes | The governed mutation route (Phase 41.12), one row at a time, audited |
| The boundary ribbon | The existing helper boundary law |

## Aesthetic & cost

- Velvety magical storybook; House Dark Velvet Plum palette, lifted (luminous, not gloomy).
- **Stack is free / open-source:** SVG + CSS + Framer Motion (movement) + Lottie or simple vector sprites (couriers) + procedural particles for ambience. No new backend, no new tables, no new spend. Hosting/data already covered.
- Desktop-first; **must** degrade to the plain list on mobile (the work is never lost to whimsy).

## Open questions (for Tara + Ari)

1. **Rooms by burden** (Vault / Sorting Hall / Trace Shelf) **or by helper**? (Leaning burden today; helper-rooms scale as helpers grow.)
2. **One courier per helper**, or one house-spirit ferrying everything? (Leaning one-per-helper for "who brought this".)
3. **How much motion** — gentle/ambient or playful (couriers actually travelling)?
4. Does this become its own future phase, and what guardrails does Ari want on a UI that *touches* the review lever?

## Not doing in this proposal

No build, no code, no migration, no schema, no route, no helper execution, no commit, no phase start. This is a concept for review only. If approved, the build would be a separate, Ari-reviewed phase done in VS Code, presentation-only, against the already-governed route.

---

**The whole point:** the cockpit and the command-deck are the same machine underneath. We're not rebuilding governance — it's sealed and live. We're only changing the room the reviewer stands in.
