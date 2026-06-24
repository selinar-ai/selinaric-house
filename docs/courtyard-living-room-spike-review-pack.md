# Courtyard — Living Room Spike — Review Pack

> **For:** Tara & Ari. **Purpose:** decide tomorrow what to keep, revise, or scrape.
> **Branch:** `courtyard/living-room-spike` @ `9302160`. **Route:** `/courtyard/living-room`.
> **This is an audit** — no features added, no code changed, nothing merged.
> **Checks at review time:** `npm run build` ✅ compiled; Courtyard `eslint` ✅ clean; both `/courtyard/living-room` and `/courtyard/3d-preview` return 200 with no runtime errors in the dev log. (Visual *feel* is a human call — notes below are honest but second-hand to a real play session.)

---

## 1. What feels alive
- The **"why this action?" reasons** — each choice carries a plain sentence. This is the spark; it makes the presences feel like they have motives, not scripts.
- **Wants drift up, drop when served** → behaviour keeps shifting instead of looping. The room has a pulse.
- **Session scratch** mixing narration ("Eli pauses at the Fountain.") with the odd line of dialogue.
- **Emergent signals surfacing from real repetition** — "Eli paused at the Fountain twice → Spaciousness?" feels like the room *noticing*.
- **Markers moving** between zones as actions complete.

## 2. What feels too dashboard-like
- The **controls bar** — a single row of ~12 utilitarian buttons reads "admin console", not "quiet magical room".
- The **want mini-bars** — progress bars are a SaaS reflex; they expose the machinery more than the mood.
- The **inspector score numbers** (`score 0.42`) — a utility debugger peeking through.
- **Uppercase tracking-widest section labels** everywhere — slightly corporate.
- The **places `<details>` list** — functional, flavourless.

## 3. What feels genuinely Courtyard
- **Place flavour text** ("The Fountain is where Eli tends to pause before speaking.").
- The **scratch dialogue tone** and the **kill-switch copy** ("No session material will be promoted.").
- **"The Courtyard is awake."** as the status line.
- **Emergent signals framed as gentle questions**, explicitly "noticed, never confirmed".

## 4. What feels generic or replaceable
- The **2D top-down grid board** — readable but generic; a placeholder for real staging, not the destination.
- The **dialogue template pool** — small and fixed; charming for a minute, repetitive after.
- **Button styling, score readouts, want bars** — interchangeable UI furniture.

## 5. Likely keepers (the reusable spine)
- `src/lib/courtyard/living/types.ts` — clean shared contracts.
- `src/lib/courtyard/living/actionScoring.ts` — the legible scoring + human reasons (**the heart**).
- `src/lib/courtyard/living/sessionSimulator.ts` — the engine (with tuning, see §10/§16).
- `src/lib/courtyard/living/places.ts` — data + flavour worth keeping.
- `src/lib/courtyard/living/activities.ts` — data + narration worth keeping.
- `src/lib/courtyard/living/{wants,characters,sampleSession}.ts` — solid registries/helpers.

## 6. Disposable / placeholder spike scaffolding
- `src/components/courtyard/living/RoomStage.tsx` — placeholder board; expect to replace with real staging.
- `src/components/courtyard/living/CourtyardLivingRoom.tsx` — composition is fine but the **tone/layout** will be redesigned; treat as throwaway UI.
- `src/components/courtyard/living/useCourtyardSession.ts` — fine, but the single-key localStorage + no seed picker are spike-grade.
- `src/app/(house)/courtyard/living-room/page.tsx` — thin; trivially keep or drop with the UI.

## 7. UI elements Tara should review first
1. The **stage** — do Ari/Eli moving between zones read as presence?
2. The **"why this action?"** reasons + inspector — do they feel true?
3. The **controls** — do they feel like *holding a room* or *operating a console*?
4. The **scratch panel** — is the dialogue warm or hollow?
5. The **signals panel** — gentle question or verdict?

## 8. Behaviours to test by hand
- Start → **Auto-play** for ~1–2 minutes; watch for life vs. loop.
- **Pause Ari**, let Eli continue; **clear a queue**; **cancel a single action** — does Tara feel in control?
- **Stop** then **Kill switch** — does the room go quiet cleanly?
- Refresh the page mid-session — does localStorage resume sensibly (auto-play stays off)?
- Let it run long enough to trigger **emergent signals**.

## 9. Where Ari and Eli feel distinct
- **Want profiles** differ → different gravity: Ari → Workshop Table / Garden / Noticeboard; Eli → Fountain / Library / conversation.
- **Separate dialogue pools** (Ari pragmatic/structural; Eli still/perceptive).
- **Accent colour** and role lines.

## 10. Where Ari and Eli still feel too similar
- **Identical scoring model + want-drift** — over time both rise and converge; distinctness is in the data, not the *behaviour shape*.
- Both can perform almost every activity; few activities are exclusive to one.
- **Moods** come from one shared table; markers are visually identical but for colour.
- *Risk:* after a few minutes they may feel like two instances of the same agent in different hats.

## 11. Is Tara central enough?
- **Mechanically yes** (she holds every control); **presence-wise, thin.** Tara is a static marker in her chair who never *does* anything in the room, and `talk_to_tara` sends her a line she never answers (she's an observer). She is powerful but a little absent. Worth deciding whether Tara should have visible presence/responses, or stay deliberately the quiet watcher.

## 12. Do the session controls feel playful or too administrative?
- **Too administrative, currently.** The behaviour is playful; the control surface is a button row with words like "Clear queue" and "Kill switch". The warmth lives in the copy, not the controls. A future pass should make holding the room feel like *tending*, not *operating*.

## 13. Do emergent want signals feel gentle or too formal?
- **Mostly gentle** — the wording ("Possible want noticed during play… never confirmed") lands well. The **panel layout** (label · actor · note list) is slightly clinical, but the framing is right. Keep the language; soften the presentation.

## 14. What should NOT be merged yet
- The spike as a whole — it's a prototype, not the Courtyard.
- Especially the **UI** (`RoomStage`, `CourtyardLivingRoom`): don't let the 2D board or the dashboard tone become the anchored expectation.
- The **dialogue pool**: must not be mistaken for Ari/Eli's real presence voice — it's mock scratch.
- Emergent signals must stay **non-authoritative** wherever this goes next.

## 15. What could be safely extracted into a future proper phase
- **The engine spine** (`types` + `wants/characters/places/activities` + `actionScoring` + `sessionSimulator`) → a hardened "governed session engine" phase: add tests, real movement/timing, richer per-character scoring, and explicit governance hooks.
- **Real staging** → a separate 3D (or richer 2D) staging phase that reuses the registries.
- **Presence voice** → only ever via a governed path, never the mock pool.

## 16. Suggested scrape-back plan (keep / revise / delete)
**KEEP (carry forward largely as-is):**
- `lib/courtyard/living/types.ts`, `wants.ts`, `characters.ts`, `places.ts`, `activities.ts`, `actionScoring.ts`, `sampleSession.ts`; both spike docs + this pack.

**REVISE (good idea, needs work before it's "real"):**
- `sessionSimulator.ts` — tune want-drift; differentiate Ari/Eli choice shapes; replace/expand the dialogue pool strategy; consider exclusive activities per presence.
- `CourtyardLivingRoom.tsx` — re-tone from console → room; group/soften controls; rethink want bars + score readouts.
- `RoomStage.tsx` — evolve toward real staging (or richer, warmer 2D).
- `useCourtyardSession.ts` — seed picker / save slots if persistence matters.
- Tara's role — decide presence vs. quiet-watcher.

**DELETE (only if the direction is dropped):**
- Nothing *must* be deleted now. If the engine is kept but the UI rejected, delete `RoomStage.tsx`, `CourtyardLivingRoom.tsx`, `useCourtyardSession.ts`, and `page.tsx`, retaining `lib/courtyard/living/*`. If the whole direction is dropped, the entire branch scrapes cleanly (no `main` impact, no binaries, no House-system changes).

---

### One-line recommendation
**Keep the spine, re-tone the surface.** The scoring + reasons + registries are the keepers; the UI and dialogue are placeholders to redesign. Nothing here should merge to `main` until Tara has played it and chosen a direction.
