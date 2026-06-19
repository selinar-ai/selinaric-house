# Workshop Visual Pass — Build Record & Authority Note

**Status:** **SHIPPED and production-verified.** Committed as `4c55b4c` and pushed to `origin/main`; the Vercel Production deployment of `4c55b4c` is verified. This document is the authority note / build record for the already-shipped Workshop Visual Pass. It began as the Ari-reviewed build brief; the historical brief content is retained below for the record, with the final shipped decisions recorded in **Shipped record** immediately following.
**Phase:** TBD (presentation-layer phase riding on the closed Helper Floor — Phase 41 is sealed at `c12e7ee`; numbering is Tara/Ari's to set)
**Phase family:** Helper Architecture — presentation
**Phase type:** Visual / motion polish over an already-governed surface
**Builder:** Claude Code · **Architect:** Ari · **Governed by:** Tara
**Proposed by:** Tara · sketched with Eli (`visualize` concepts: velvet courier + room map)

---

## Shipped record (final decisions)

- **Commit:** `4c55b4c` on `origin/main` (rides on the closed Helper Floor; Phase 41 sealed at `c12e7ee`). Production-verified on Vercel.
- **Animation dependency (final):** **`motion`** (the renamed Motion library), imported via **`motion/react`** — verified in Slice 0 to support React 19; the legacy `framer-motion` package was **not** used. One animation dependency only.
- **Reduced motion (final):** gated in JS via `useReducedMotion()` from `motion/react` (no CSS `motion-reduce:` class needed) — courier → still sprite, motes → none, transitions → plain switch, glow pulse off.
- **Slices shipped:** 0 (setup + dependency verification), 1 (courier enter / idle / exit-on-200 / re-enter), 2 (map↔room transitions + prev/next), 3 (per-tile glow pulse + Atrium motes + hover/tap), 4 (reduced-motion / mobile / keyboard verification), **5 (visual richness — Storybook Spirit courier + faint per-room radial wash)**.
- **Courier (final):** the **Storybook Spirit** character (head + face + two hands + page + halo), `aria-hidden`, text-empty, non-interactive. Ari cap — silent presenter only: no name, voice, personality, recommendation, emotional reaction, thinking/choosing/guiding.
- **Room glow/wash (final):** a faint, state-tinted radial wash behind each tile, capped at **≤ 0.14 alpha**. Ari cap — review state only: never urgency, truth, authority, evidence, Memory, or warning.
- **Deferred (not shipped):** the full spatial Atrium-with-corridors map — kept as a responsive tile grid so mobile / keyboard degrade cleanly. A future, separately-scoped slice if pursued.
- **Boundaries held:** presentation / motion only — no route, migration, schema, DB-posture change, candidate bridge / import, read of `graph_candidate_suggestions`, helper execution, batch, approve / apply / promote controls, Archive label, `batch-ready` wording, 3D / Three.js, gaming-wing assets, or Phase 42 work. Reuses the 41.12 route and 41.14 read-only trace; List fallback preserved.

---

_The sections below are the original Ari-reviewed brief, retained for the record. Where they describe the animation dependency, the final shipped choice is `motion` / `motion/react` (see Shipped record above) — not the legacy `framer-motion`._

## One-line brief

Bring the spatial Helper Workshop to life — a velvet storybook map of rooms, candle-glow tied to review state, and a silent courier that floats in, presents one helper output, and drifts away — **without touching the data, the route, the trace, or any authority.**

## North star

Phase 41.15 made review *spatial*. This pass makes it *feel alive*. Same lever underneath: the governed 41.12 review route and the 41.14 read-only trace. The interface becomes beautiful; the governance does not become softer.

## Core law

> Motion may change how the room feels. It may not change what a helper can do.
> Glow is review state, never authority. The courier presents; it never speaks.

## Current confirmed state

- `origin/main = c12e7ee` (Phase 41.16 closure), working tree clean, global active helper outputs = 0.
- Workshop is the default `/helpers` view; List is the fallback; Agent clarity layer + empty-state clarification are live.
- Review controls use the 41.12 route; trace uses the 41.14 read path. No route/migration/schema/DB posture change since.

## Purpose

Add a motion + illustration layer to the existing Workshop: animated courier, room enter/exit transitions, ambient candle-glow and motes, tile micro-interactions — driven by the data the surface already loads.

## Not purpose

No new data, no new route, no new mutation, no migration, no schema, no DB posture change, no helper execution, no candidate bridge/import, no batch, no approve/apply/promote, no gaming-wing/3D merge, no Phase 42 work.

## Stack (the one new dependency)

- **Motion** (one animation dependency only) — MIT, free, client-only, no telemetry, ~30–40 kb gz. The target motions (courier travel, enter-room zoom, `AnimatePresence` mount/exit, spring idle) are exactly its purpose; pure CSS would be fiddlier and less maintainable. **Slice-0 verification (Ari):** confirm the current official package/import path. **Shipped:** verified that `motion` supports React 19 and exposes `motion/react`; installed **`motion`** and imported from **`motion/react`** — the legacy `framer-motion` package was not used.
- **Bespoke inline SVG** — the courier and room art (as concepted), authored in-repo. No external art, no licensing, no model files.
- **CSS/SVG procedural** — motes + glow pulse.
- **`useReducedMotion()`** (from `motion/react`) — the shipped reduced-motion gate; motion fully disables.
- No backend, no Supabase/Vercel cost change.

## Build shape — slices (checkpointed; commit per slice on approval)

- **Slice 0 — Setup & guardrails.** **Verify the Motion package/import path first** (shipped: `motion` / `motion/react` chosen — verified React 19 support; legacy `framer-motion` not used) — one animation dependency only. Then install, wire `useReducedMotion`, confirm List + mobile fallbacks and all 41.12/41.14 paths untouched. No data/route change. **Stop and report after this slice** (it touches the dependency + motion architecture).
- **Slice 1 — The courier comes alive.** Drifts in carrying the page → settles → idle bob → drifts out on action. Silent, `aria-hidden`, no text.
- **Slice 2 — Room transitions.** Map→room corridor-zoom and back via `AnimatePresence`; gentle slide/cross-fade on prev/next.
- **Slice 3 — Map ambience.** Per-tile glow pulse bound to the existing review-state→visual mapping; Atrium motes; tile hover/focus micro-interactions.
- **Slice 4 — Polish & tests.** Reduced-motion / mobile / keyboard passes; tests; typecheck; build; screenshots for Tara.
- **Slice 5 — Visual richness (added after the original brief; Ari-approved with caps).** Swapped the abstract sprite for the **Storybook Spirit** courier (still silent / `aria-hidden`); added a faint per-room radial **wash** capped at ≤ 0.14 alpha, tied to review state only.

## Visual direction

Velvet plum, candle-gold, soft violet/pink/blue accents — luminous, not gloomy; storybook study/workshop, not neon, not cockpit. Top-down room map with central Atrium and connecting corridors (as concepted). Gentle motion only; legibility always wins over decoration.

## Behaviour spec

- **Courier states (Ari-resolved):** enter (carry-in) → present (idle bob) → gentle exit on **every** successful 200 review action → **re-enter if another item is present** in the room. Never speaks, recommends, decides, remembers, or routes.
- **Glow:** each room's intensity/colour is the existing `roomStateFor` output (needs attention / follow-up needed / reviewed-trace-visible / kept-as-trace / resting / empty). Driven by live data; no new computation, no authority meaning.
- **Counts + Agent labels:** unchanged (already shipped); motion must never obscure them.
- **Transitions:** purely visual; navigation state and the single-output-per-room rule are unchanged.

## Guardrails (Ari's five, restated + extended)

1. **Silent courier** — no text, no speech, no recommendation; `aria-hidden`; not interactive.
2. **No authority** — nothing becomes Memory / evidence / prompt / Archive / Graph / Library / Reasoning / Recall truth; glow ≠ urgency / truth.
3. **Legibility-first** — particles / glow / motion must never obscure helper text, state, source, controls, trace, or captions. If beauty fights legibility, legibility wins.
4. **Reduced-motion** — `prefers-reduced-motion` stills all animation; the surface stays fully usable.
5. **Mobile / List fallback** — the List view remains the safety surface; mobile degrades to it; the work is never lost to whimsy.

**Extended:** review controls still call the 41.12 route (one row, one action); trace still reads via the 41.14 path; no change to `helperWorkshop.ts` governance/data logic beyond adding presentation; `motion` is the only new dependency; a performance budget (no jank on the map; animate transform/opacity only — GPU-friendly).

## Hard No list

Migration · route · schema · DB posture · new helper type · helper execution · candidate bridge / import · reading `graph_candidate_suggestions` · widening `helper_outputs` · `source_refs` change · batch review · approve / apply / promote controls · Archive room label · `batch-ready` wording · courier speech · 3D / Three.js in the Workshop · gaming-wing asset merge · Phase 42 work.

## Data sources

Existing only: `GET /api/helper-outputs` (rows + 41.14 trace), the existing queue / burden / review-state read model. No new reads; nothing touches candidate or Memory-adjacent surfaces.

## Tests required

- Courier renders, is `aria-hidden`, has no text / recommendation, is non-interactive.
- Room controls still call the same review handler / route (one POST, body unchanged).
- Trace still reads via the 41.14 path; immediate-refresh behaviour intact.
- Reduced-motion disables animation (assert the gate).
- Mobile / small-viewport falls back; List view intact.
- Keyboard can enter / exit rooms and reach controls; visible focus.
- Glow derives from existing review state; no new data fetch; no candidate-data reads.
- Existing helper suite (controls, trace, workshop, queue, burden / state / action, store, library metadata) still passes; typecheck; build.

## Acceptance criteria

List intact · Workshop default · courier silent & animated · transitions smooth · glow from real review state · controls reuse 41.12 · trace reuses 41.14 · reduced-motion + mobile + keyboard fallbacks · only `motion` added · no route / migration / schema / DB change · tests / typecheck / build green · screenshots provided · nothing committed / pushed until Tara approves.

## Ari's resolutions (was: open questions)

1. **Animation dependency** — approved in principle; verified in Slice 0 → **shipped `motion` (`motion/react`)**, which supports React 19; the legacy `framer-motion` package was not used. One animation dependency only.
2. **Courier exit** — may gently exit on **every** successful 200 review action, then **re-enter if another item is present**.
3. **Ambient motes** — **subtle by default**, **fully disabled under reduced motion**, **no toggle in v1** unless visual testing shows it is too busy.

## Build cadence (Ari)

Work in checkpointed slices. **Stop and report after any major slice that touches the dependency, the motion architecture, accessibility, or the review-action path** (so: report after Slice 0 at minimum, and after Slices 1–2). Do not commit until Tara approves; do not push.

## Stop condition

Build only after Ari + Tara approve. Stop after the slices, tests, typecheck, build, screenshots, and report. Commit only on Tara's word (per-slice or whole); push only on a separate go. Do not start Phase 42 or any gaming-wing / 3D work.

## Suggested later commit message

`Workshop visual pass: animate courier, room transitions, ambient glow`

## Closure line

> The Workshop learns to breathe.
> The courier floats; the candles pulse; the rooms glow with review state.
> The lever stays governed. The trace stays read-only. The crown stays with Tara.
