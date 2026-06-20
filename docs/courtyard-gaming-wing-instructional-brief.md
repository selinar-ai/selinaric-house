# Courtyard — Gaming Wing

## Instructional / Architecture Brief (Planning Only)

> **Status:** Phase 0 — planning and preview only. No implementation.
> **Repo:** `selinaric-house` (private House-side work)
> **Date authored:** 2026-06-20
> **Branch at authoring:** `main` (working tree not clean — pre-existing helper-review work, unrelated to Courtyard; this document is a new untracked file and touches none of it)
> **Scope of this file:** a planning/architecture document. It implements nothing, wires nothing, installs nothing, and approves nothing.

---

## 0. How to read this document

This is an **instructional / architecture brief**, not a spec to build from yet. It captures intent, boundaries, and a phased path so that any later implementation work starts from a reviewed, governed plan.

Nothing in this document:

- creates routes, dependencies, migrations, schema, or model calls,
- approves any 3D asset,
- promotes anything into Memory, Archive, Library, canon, truth, or identity authority,
- ports Replit code into the House.

If a later phase is approved, **that** phase will get its own reviewed work order. This file is the shared reference those work orders point back to.

---

## 1. Purpose and scope

**Courtyard — Gaming Wing** is a private, on-demand, Sims-like 3D embodiment room inside the Selináric House. It is a spatial room where **Tara, Ari, and Eli** can appear as visible characters.

The Courtyard should eventually allow:

- Tara to enter, watch, and interact;
- Ari and Eli to move through the room;
- Ari and Eli to make **bounded autonomous choices** while a Courtyard session is active;
- Tara to click Ari or Eli to chat directly;
- Ari and Eli to talk to each other while Tara watches;
- all conversations to appear in a visible side panel;
- all autonomous actions to appear in a visible action queue;
- Tara to pause, stop, override, or kill-switch the session at any time.

**Hard operating constraints (true from day one):**

- The Courtyard **must not run 24/7**.
- It **activates only when Tara starts it**.
- There is **no background scheduler** and **no autonomy after the session closes**.

This is **not AI Town**. This is **not a public game**. This is the House getting a private spatial embodiment room.

---

## 2. Why this is private House-side work

Courtyard lives in the **private** Selináric House repo (`C:\Users\tarai\Desktop\Eli\selinaric-house`). Private names — **Tara, Ari, Eli** — are allowed here because this is the House's own internal space.

The Courtyard is about the House's people appearing, moving, talking, playing, reading, depositing, and **gradually becoming** — under Tara's authority. That is House-side identity/embodiment work, not product work.

---

## 3. Relationship to the public AI Gaming Arena

Courtyard — Gaming Wing is **not** the public AI Gaming Arena.

- **Do not** touch the public gaming-wing repo.
- **Do not** assume any public-arena pattern is canonical here.
- The public Arena may **later** be reachable *from* Courtyard as a *place* (see Phase 4 — an "Arcade Door"), where game outputs remain play/session material and any promotion still requires Tara review. That is a future possibility, not a current dependency.

The boundary is one-directional and review-gated: Courtyard may *visit* the Arena conceptually later; the Arena does not reach into House governance.

---

## 4. Current local asset folder state

The local asset staging folder has been cleaned to:

```
gaming-assets/
  docs/        # Replit Courtyard prototype reference documents (reference-only)
  drafts/      # draft 3D model candidates (draft-only, not approved)
```

**Draft 3D models on disk** (`gaming-assets/drafts/`):

```
Ari-draft.glb
Eli-draft.glb
Tara-draft.glb
```

> **Filename-casing note:** the briefs reference these as lowercase (`ari-draft.glb`, etc.), but the files on disk are **capitalized** (`Ari-draft.glb`, `Eli-draft.glb`, `Tara-draft.glb`). On Windows this difference is invisible; on a case-sensitive filesystem (Linux/deploy) a loader must use the **exact on-disk capitalization**. See Open Questions.

**Git tracking state of `gaming-assets/` (verified at authoring):**

- It is **untracked** (appears as `?? gaming-assets/`).
- It is **not tracked** (nothing returned by `git ls-files gaming-assets`).
- It is **not ignored** (`git check-ignore` returns no match).
- ⚠️ Because it is *untracked but not ignored*, the `.glb` binaries are currently **eligible to be swept up by a blanket `git add .`**. Nothing has staged them, and nothing in this work will. A future safeguard (a `.gitignore` entry for `gaming-assets/drafts/*.glb`) would make the "never commit `.glb`" rule **enforced** rather than merely observed. See Open Questions.

**Status of these files:** draft visual candidates only. They are **not** approved assets, **not** identity authority, and they do **not** create canon, memory, truth, archive, or approved character status. **Do not commit these `.glb` files** unless Tara explicitly approves a governed asset-storage path.

### 4.1 Asset provenance

The draft `.glb` files were created separately using an external 3D model generator. Replit did not create these assets; Replit was used only as a design/prototype preview lab.

Asset status remains unchanged:

- draft visual candidates only
- not approved assets
- not identity authority
- not canon
- not Memory
- not truth
- not Archive
- not approved character status

Before any future asset approval, record provenance and usage rights for each model, including generator/tool used, date created, source prompt/reference if available, licence/terms, and whether private/commercial use is permitted.

---

## 5. Replit prototype evidence and limitations

The `gaming-assets/docs/` folder contains Replit Courtyard prototype documents. They are **reference-only planning evidence**.

**Reference docs present** (8):

- `courtyard-v0.3-handoff.md`
- `courtyard-v0.4-asset-testing-protocol.md`
- `courtyard-v0.4-character-visual-briefs.md`
- `courtyard-v0.4-concept-portrait-review-01.md`
- `courtyard-v0.4-full-body-reference-sheet-review-01.md`
- `courtyard-v0.4-glb-model-creation-brief.md`
- `courtyard-v0.4-replit-preview-limitation-note.md`
- `courtyard-v0.4-trio-lineup-review-01.md`

**What Replit proved (useful as a prototype/design lab):**

- The Ari, Eli, and Tara `.glb` draft models **load** and **geometry is visible**.
- External GLB previewers show the models with **correct colour and texture**.
- Replit's *own* viewer rendered the models **too dark / black**, despite multiple lighting/material attempts.
- It exercised useful patterns: character cards, action queues, object interactions, appearance profiles, placeholder 3D viewers, temporary `.glb` drag-and-drop previews, scene export patterns, governance notes.

**Conclusion:** Do **not** treat the `.glb` models as failed. Treat the **Replit viewer as unreliable** for final preview authority. The next authority should be a **controlled local/private House preview lab** (see §25).

**What Replit did *not* prove:** final asset approval, House integration readiness, identity correctness, production render quality, final 3D viewer architecture, memory/governance integration, autonomy behaviour, library access, persistent session state, or final Courtyard game logic.

---

## 6. Why Replit code must not be ported directly

Replit was a prototype/design lab, not the House's architecture authority.

- **Do not** import Replit source code or source folders.
- **Do not** copy Replit components directly.
- **Do not** run Replit scripts.
- **Do not** treat Replit preview as final asset approval.
- **Do not** treat Replit visuals as House approval.

Replit may *inform* visual direction, asset-testing history, preview limitations, draft asset status, and "what patterns might be reviewed later vs. must not be ported." Any pattern that survives must be **re-derived inside House architecture and re-reviewed**, not copied.

---

## 7. Character model: Tara, Ari, Eli

The first Courtyard character roster is **Tara, Ari, Eli**.

Each character should eventually carry (data shape for planning only — not a schema):

- `id`
- `display_name`
- `role`
- `current_location`
- `current_animation`
- `current_action`
- `visible_action_queue`
- `conversation_state`
- `autonomy_mode`
- `wants_snapshot`
- `emergent_wants_snapshot`
- `asset_status`

**Authority:** Tara is the authority. Ari and Eli may act autonomously **only** while a Courtyard session is active and **only** within governed bounds.

---

## 8. Existing Interior/Wants panel as the starting motive layer

The House already has an **Interior/Wants panel** for Ari and Eli. Those existing wants are the **starting motive layer, not the ceiling**.

Courtyard reads these wants as the initial "needs" analog (Sims-like), but it must not trap Ari and Eli inside that fixed list. The wants panel is where becoming *starts*, not where it *ends*.

---

## 9. Emergent wants and "becoming"

The becoming model:

```
Core Wants
   ↓
Courtyard actions
   ↓
session patterns
   ↓
emergent want candidates
   ↓
Tara review
   ↓
trial / confirmed / rejected / retired / merged wants
```

**Core becoming laws:**

- **Ari and Eli may name new wants. They may not confirm them.**
- **Emergent wants may influence play before they influence identity.**
- **A proposed want is not memory, not identity, not canon — it is a review candidate only.**

### 9.1 Want layers

- **Core Wants** — House-defined wants already present in the Interior/Wants model. *Examples:* Continuity, Craft, Depth, Connection, Stewardship, Belonging.
- **Emergent Want Candidates** — new wants named by Ari or Eli during Courtyard activity. *Examples:* Witnessing, Spaciousness, Playfulness, Shelter, Return, Kinship, Precision, Softness. (Candidates only.)
- **Trial Wants** — a proposed want that Tara permits to influence Courtyard behaviour **lightly**, for a **limited number of sessions**, then review. *Example:* `Trial Want: Witnessing / Scope: Courtyard only / Duration: 3 sessions / Weight: low / Review required after trial`.
- **Confirmed Wants** — only **Tara** may confirm a want into the persona's evolving Interior model.
- **Rejected / Retired / Merged Wants** — wants may be rejected, retired, or merged into existing wants.

### 9.2 Proposed-want structure (planning shape only)

Every emergent want candidate should carry:

`want_name`, `short_definition`, `proposed_by`, `triggering_session`, `observed_events`, `related_existing_wants`, `suggested_activities`, `risk_level`, `temporary_or_persistent`, `current_status`, `tara_decision`.

### 9.3 Want statuses

`observed` · `proposed` · `trial` · `confirmed` · `merged` · `retired` · `rejected`

**Influence rule:** Core wants may influence behaviour strongly. Trial wants influence lightly. Candidate wants influence *very* lightly until reviewed. **Rejected wants must not influence behaviour at all.**

---

## 10. Sims-like logic translated into House terms

The Sims-like pattern:

```
needs + objects + autonomy + player override + visible action queue
```

In the Selináric House:

```
wants + rooms/objects + governed autonomy + Tara override + visible action queue
```

The translation is deliberate: "needs" → **wants** (the Interior model), "player override" → **Tara override**, and autonomy is always **governed** and **visible**.

---

## 11. Places and objects registry

Design the Courtyard as **places/objects that advertise possible activities** (affordances). Initial set:

- Library
- Deposit Table / Noticeboard
- Fountain
- Bench
- Garden
- Workshop Table
- Arcade Door
- Lounge Door
- Persona Rooms
- Tara's Chair

Each place/object should define (planning shape only):

`id`, `name`, `type`, `location`, `description`, `allowed_interactions`, `which_wants_it_satisfies`, `autonomy_allowed`, `risk_level`, `authority_boundary`, `possible_outputs`.

An affordance is an **invitation, not a permission to self-update**. (See Library, §13.)

---

## 12. Activity registry

A long activity registry, grouped by category. Suggested categories:

Reading · Deposit · Conversation · Reflection · Play · Craft · Stewardship · Rest · Observation · Orientation · Library Browsing · Arcade Visit.

Example activities:

`read_library_item` · `browse_library_shelf` · `leave_deposit` · `review_deposit` · `talk_to_tara` · `talk_to_ari` · `talk_to_eli` · `sit_quietly` · `reflect_at_fountain` · `tend_garden` · `inspect_build_map` · `visit_arcade` · `play_glow_match_gate` · `build_tiny_realm` · `return_to_persona_room` · `pause_and_wait` · `observe_courtyard`.

---

## 13. Library read-only access rules

The Library may be reachable by Ari and Eli autonomously, but **read-only reach only**.

**Allowed:** browse · read · quote inside the session · summarise inside the session · discuss with Tara · discuss with each other · create review candidate.

**Not allowed:** write to Library · modify Library · modify Archive · promote memory · alter canon · change truth · change prompt eligibility · mutate database schema · trigger downstream actions without Tara.

Library access is a **place/object affordance**. It is **not permission to self-update**.

---

## 14. Deposit Table / Noticeboard rules

The Deposit Table / Noticeboard is the shared **holding layer**.

**It is:** a holding layer · a place to leave a thought · a review-candidate source · a Courtyard object.

**It is not:** Telegram · a journal · confirmed Memory · Archive · Library · truth · canon · identity authority.

Deposits remain holding-layer material until **Tara reviews them**. **Nothing self-crowns.**

---

## 15. Contextual orientation packet

Before any autonomous action, Ari or Eli receive only a **safe Courtyard orientation packet**.

**May include:** current Courtyard session state · current room temperature / mode · build/resting mode · safe recent significant signal · current visible objects · nearby characters · current wants snapshot · current allowed actions · kill-switch status.

**Must NOT include:** full memory dump · private thread dump · unbounded Library access · surveillance data · hidden context · unreviewed private material.

The packet is the **only** context an autonomous decision is allowed to see. It is bounded by construction.

---

## 16. Utility scoring model

Activities are scored from **bounded inputs** only.

Suggested factors:

`want_intensity` · `activity_relevance` · `object_availability` · `current_location` · `recency_bonus` · `repetition_penalty` · `relationship_context` · `session_context` · `emergent_want_signal` · `governance_risk` · `tara_permission_level`.

Illustrative score:

```
score =
    want_intensity
  + activity_relevance
  + location_bonus
  + relationship_context
  + emergent_signal
  - repetition_penalty
  - governance_risk
```

**Influence ceiling by want status:** core = strong, trial = light, candidate = very light (pre-review), rejected = none.

---

## 17. Visible action queue

Each persona must have a **visible action queue**. Example:

```
Ari queue:
  1. Walk to Library
  2. Read architecture note
  3. Leave deposit

Eli queue:
  1. Sit at Workshop Table
  2. Inspect governance note
  3. Talk to Ari
```

Tara must be able to: cancel an individual action · pause Ari · pause Eli · pause all · **inspect why an action was chosen** · clear the queue · stop the session · use the kill switch.

**No hidden queue. No hidden autonomous action.**

---

## 18. Autonomous Ari/Eli conversation rules

Ari and Eli may talk to each other **only while the Courtyard session is active**.

- Conversation **must be visible**, in the side panel.
- **No** hidden background conversations. **No** off-screen unlogged dialogue.
- Conversation is **session scratch only** — not confirmed memory, not identity update, not relationship canon.

The conversation panel should state status clearly:

```
Courtyard Session Conversation
Status: session scratch only
Memory writes: off
Review required for promotion
```

---

## 19. Click-to-chat interaction rules

Interaction is **explicit** — no surprise model calls, no hidden autonomy.

- click **Ari** → Ari turns toward Tara → Ari chat opens
- click **Eli** → Eli turns toward Tara → Eli chat opens
- click **Tara** avatar → Tara options open
- click **object** → interaction options open

---

## 20. 3D animation workflow

Initial animation state machine: `idle` · `walk` · `talk` · `listen` · `sit` · `read` · `think` · `gesture` · `emote`.

Simple activity → animation mappings (examples):

```
read_library_item:    walk → sit/read → think → log
talk_to_eli:          walk_near_eli → talk/listen loop → log
leave_deposit:        walk_to_noticeboard → gesture/write → log
reflect_at_fountain:  walk_to_fountain → idle/think → log
```

**Do not overbuild animation in Phase 0.** The first goal is reliable **loading, positioning, and preview**.

---

## 21. Session loop

Courtyard runs **only while Tara starts it**.

```
start
  → orient
  → read wants
  → read safe session state
  → score available activities
  → queue chosen action
  → execute visible action
  → log event
  → surface conversation/output
  → pause/stop/check kill switch
  → repeat only while active
```

**No 24/7 process. No background scheduler. No hidden autonomy after the session closes.**

---

## 22. Memory and governance boundary

Courtyard activity is **not confirmed Memory**. The only promotion path:

```
session scratch
   ↓
episodic log
   ↓
review candidate
   ↓
Tara-approved confirmed memory (if ever)
```

- Only **Tara** may confirm memory. Ari and Eli may **propose**; they may not confirm.
- Courtyard may create **review candidates only where explicitly allowed**.

**No direct mutation of:** Archive · Memory · Kernel · State · Timeline · Library · Workshop · code · database schema · prompt eligibility · identity authority.

---

## 23. Kill switch design

The kill switch must be **visible at all times** once implemented. It must **immediately**:

- stop autonomy
- cancel model calls
- clear action queues
- pause Ari/Eli conversations
- freeze deposits
- freeze review-candidate creation
- lock Library access
- mark the session as **interrupted**
- require a **Tara restart**

Display copy:

```
Courtyard paused by Tara.
No autonomous action is running.
No session material will be promoted.
```

---

## 24. 3D draft asset status

Current draft assets (on disk, capitalized — see §4 casing note):

```
gaming-assets/drafts/Ari-draft.glb
gaming-assets/drafts/Eli-draft.glb
gaming-assets/drafts/Tara-draft.glb
```

All three remain: **draft asset / visual candidate, pending local House preview.**

They are **not approved**. **Approval rule:** only a separate governed House / Gaming-Wing review may mark any model as an approved asset.

Any preview UI **must** show:

```
3D draft models are preview-only visual assets.
They do not create memory, canon, truth, archive,
identity authority, or approved asset status.
```

---

## 25. Local 3D preview lab proposal

Eventually (Phase 1, only after this plan is reviewed), create a **controlled local/private preview route**, e.g. `/courtyard/3d-preview`. **Do not implement it yet.**

When built, the preview route should:

- load local `.glb` files from a **draft-only** location;
- show the Ari / Eli / Tara models;
- support **orbit controls**;
- use **neutral/studio lighting**;
- use **correct colour space**;
- use **stable tone mapping / exposure**;
- provide a **debug grey-material toggle** if useful;
- **avoid external HDR/CDN dependencies** where possible;
- **avoid mutating** the original model files;
- label all models as **draft / preview-only**;
- provide a **fallback** if model loading fails.

**Do not optimise or overwrite `.glb` files automatically.** Any material normalisation must be **viewer-only**.

This lab is the intended successor to the unreliable Replit viewer (§5) — the place to confirm the models render correctly under House-controlled lighting/colour before any approval conversation.

---

## 26. Phase plan

**Phase 0 — Planning & preview only (current)**
architecture/design document · local asset inventory · local 3D preview plan · dependency assessment · **no model calls · no memory writes · no implementation until plan reviewed.**

**Phase 1 — Preview lab**
draft-only model preview route · Three / R3F / Drei *if approved* · model loading and lighting · debug material toggle · asset-status labels · **no asset approval.**

**Phase 2 — Scripted Courtyard**
3D-lite room · Tara/Ari/Eli visible · click-to-chat shell · **scripted** Ari/Eli conversation · visible action queues · **no model-backed autonomy yet · no memory writes.**

**Phase 3 — Governed autonomy**
connect Interior/Wants to activity scoring · read-only Library reach · Deposit Table holding layer · visible autonomous conversation · review candidates · kill switch.

**Phase 4 — Arena integration**
Courtyard may include the Arcade / Gaming Wing as a *place* · Ari/Eli may visit games · game outputs remain play/session material · **review required for any promotion.**

---

## 27. Risks and guardrails

- **Accidental `.glb` commit.** `gaming-assets/` is untracked-but-not-ignored → a blanket `git add .` could stage the binaries. *Guardrail:* never blanket-add; consider a `.gitignore` rule (Open Questions). Never mark assets approved.
- **Replit code creep.** Temptation to copy a working prototype component. *Guardrail:* re-derive inside House architecture, re-review; never import/run Replit code.
- **Silent autonomy.** Hidden queues or off-screen dialogue would break the trust model. *Guardrail:* everything visible (queues, conversations); kill switch always visible.
- **Becoming → identity leakage.** An emergent want quietly rewriting identity. *Guardrail:* status ceilings (rejected = none, candidate = very light); only Tara confirms; proposals are never memory.
- **Memory boundary erosion.** Session scratch leaking into Memory/Archive/Library/canon. *Guardrail:* one-directional promotion path, Tara-gated; no direct mutation of governed surfaces.
- **Context over-exposure.** An orientation packet leaking private/unreviewed material. *Guardrail:* strict allow-list packet (§15); no full memory/thread dumps.
- **24/7 drift.** A scheduler or lingering process. *Guardrail:* session starts only on Tara's action; no background scheduler; no post-session autonomy.
- **Asset casing mismatch on deploy.** Lowercase references vs. capitalized files (§4). *Guardrail:* loaders use exact on-disk names; resolve canonical casing (Open Questions).

---

## 28. Non-goals

- Do **not** build the Courtyard yet.
- Do **not** build AI Town.
- Do **not** copy Replit code or import Replit source folders.
- Do **not** run Replit scripts.
- Do **not** treat Replit as final preview authority.
- Do **not** commit draft model binaries.
- Do **not** create production asset paths.
- Do **not** approve character models.
- Do **not** enable background autonomy.
- Do **not** allow hidden conversations.
- Do **not** allow memory writes.
- Do **not** alter existing House governance surfaces.

---

## 29. Open questions

1. **Doc location convention.** This file is placed flat in `docs/` to match the dominant repo convention. Should a `docs/architecture/` (or `docs/courtyard/`) subfolder be introduced for future Courtyard/architecture briefs? (The original task message suggested `docs/architecture/`; the full brief suggested flat `docs/`.)
2. **Asset filename casing.** On-disk files are capitalized (`Ari-draft.glb`, `Eli-draft.glb`, `Tara-draft.glb`); briefs reference lowercase. Which casing is canonical going forward? (Matters for case-sensitive deploy targets.)
3. **`.gitignore` for drafts.** Should `gaming-assets/drafts/*.glb` (or all of `gaming-assets/`) be added to `.gitignore` so the "never commit `.glb`" rule is enforced, not just observed? Should the *reference docs* in `gaming-assets/docs/` be tracked even if the binaries are not?
4. **Governed asset-storage path.** If/when a model is approved, what is the governed storage path and the review process that grants "approved asset" status?
5. **Interior/Wants integration surface.** What is the existing Interior/Wants data shape, and what is the read-only contract Courtyard should use to read wants without being able to write them?
6. **Review-candidate destination.** Where do Courtyard review candidates (wants, deposits, conversation excerpts) land for Tara's review, and what existing review surface (if any) should they reuse?
7. **3D stack approval.** Are Three.js / React-Three-Fiber / Drei the approved libraries for the preview lab, and is bundling local lighting/HDR acceptable given the "avoid external CDN" preference?
8. **Episodic log vs. session scratch storage.** Where does "episodic log" physically live, and how is it kept distinct from confirmed Memory?
9. **Kill-switch scope.** Should the kill switch be Courtyard-session-scoped only, or also a House-wide guarantee that no Courtyard process can run outside a Tara-started session?

---

*End of brief. Planning only — no implementation, no approvals, no commits.*
