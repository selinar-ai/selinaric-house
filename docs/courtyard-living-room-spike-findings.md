# Courtyard — Living Room Spike — Findings

> **Branch:** `courtyard/living-room-spike` from `main` @ `7f04469`.
> **Date:** 2026-06-25. **Status:** creative prototype — alive, rough, scrapeable.
> **Route:** `/courtyard/living-room` (the existing `/courtyard/3d-preview` is untouched).

---

## What got built

A first **playable** Courtyard: open the room, press Start, and Ari and Eli begin
drifting between places, choosing small bounded activities for legible reasons,
occasionally talking, while Tara watches and can interrupt anything.

- **Phase 1E** — `docs/courtyard-phase-1e-living-courtyard-vision.md`: the language shift from static preview to playable presence.
- **Phase 1F** — `src/lib/courtyard/living/` registries: `types`, `wants`, `characters`, `places`, `activities`.
- **Phase 1G** — `src/lib/courtyard/living/` simulator: `actionScoring`, `sessionSimulator`, `sampleSession`.
- **Phase 1H** — `/courtyard/living-room` route + `src/components/courtyard/living/`: `useCourtyardSession`, `RoomStage`, `CourtyardLivingRoom`.

All client-side. No LLM, no DB, no network, no background work, no new dependencies.

---

## How it behaves

- **The room sleeps until Start.** Status reads *asleep → awake → paused → quiet*.
- **Each step (manual or auto-play):** every un-paused presence either continues its active action or chooses a new one via a small utility score, then narrates it into session scratch.
- **Ari** leans Craft/Continuity/Stewardship → gravitates to the Workshop Table, Garden, Library, Noticeboard.
- **Eli** leans Depth/Connection → gravitates to the Fountain, Library, conversation.
- **Choice logic** (`actionScoring.ts`): `want intensity + relevance + already-here + something-new − just-did-it + reaching-out + familiar-pull`. Every choice carries a plain reason ("Ari chose 'Inspect the build map' because Craft and Continuity are high, the Workshop Table is free, and Ari hasn't been there yet this session"). The inspector shows the live ranked options.
- **Wants drift up** gently each step and **drop** when an activity serves them — so behaviour keeps shifting instead of looping.
- **Session scratch** mixes narration ("Eli pauses at the Fountain.") with short mock dialogue when they talk. Clearly labelled *scratch only · memory writes: off*.
- **Emergent want signals** appear when a pattern repeats (e.g. two Fountain reflections → *Spaciousness?*; both reach out in conversation → *Kinship?*). Framed as **noticed, never confirmed**.
- **Tara controls everything:** Start, Step once, Auto-play, Pause session, Pause/Resume Ari, Pause/Resume Eli, Pause all, Clear Ari/Eli/all queues, cancel a single action, Stop, and a **Kill switch**.
- **Auto-play** runs only while the page is open and the session is running; closing the tab stops everything. Play-state persists to `localStorage` so a refresh resumes where you left off (auto-play stays off until you re-enable it).

---

## Governance (the quiet floorboards)

- No approval/save/status-mutation controls anywhere.
- Scratch + signals are **session-only**; signals are **possible**, never confirmed identity.
- No Memory / Library / Archive / DB / model-call / autonomy / asset-authority touched.
- The draft GLBs are referenced only via "open 3D preview" links — none committed, mutated, or moved; all remain local and git-ignored.

---

## Known rough edges (it's a spike)

- **2D only.** The stage is a stylised top-down board, not 3D staging. Character markers move between zones; the 3D models are a click away via the preview lab, not on the stage. (Deliberate — multi-character live 3D was deemed too brittle for this pass.)
- **Movement is instantaneous** at action completion (a marker hops zones); there's no walking animation/tween.
- **Dialogue is a small fixed template pool** — charming for a few minutes, repetitive over a long auto-play. It is mock text, by design.
- **Scoring is intentionally simple**; with similar want profiles Ari and Eli sometimes choose similar things. The jitter + repetition penalty keep it from hard-looping but it isn't "clever".
- **No automated browser test was run** — the build/lint pass and the simulator is pure/deterministic, but the live click-through (auto-play feel, control wiring) wants a human pass.
- **localStorage** holds one session under a single key; there's no "save slots" or seed picker in the UI yet (seed is fixed in `sampleSession.DEFAULT_SEED`).

---

## What to review tomorrow (Tara / Ari)

1. **Open `/courtyard/living-room`, press Start, then Auto-play.** Does the room *feel* alive? Watch Ari and Eli for a minute.
2. **Read the reasons.** Do the "why this action?" lines feel true to each presence?
3. **Try the controls.** Pause Ari, clear Eli's queue, cancel a single action, Stop, Kill — does Tara feel in control?
4. **Watch the signals.** Do the emergent want signals land as *gentle questions* rather than claims?
5. **Tone check.** Is the language warm enough (quiet magical room) vs. dashboard-y? Flag anything that reads as compliance-panel.
6. **Decide what's keepable:** the registries and simulator are reusable even if the UI is rethought; the 2D board may later become real 3D staging.

Everything here is scrapeable — keep the parts that breathe, discard the rest.

*The Courtyard is awake.*
