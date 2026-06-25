# Courtyard — Phase 1G — Real Action Routing Alignment

> **Documentation only.** No code, routes, assets, or systems changed. This is the
> bridge plan: how Courtyard's Sims-style menu actions grow from *session play*
> into *real routed behaviour* — carefully, one safe layer at a time.
> **Baseline:** `main` @ `7896dae` (the visual Courtyard surface at `/courtyard`).
> Source of truth for the action list: `src/lib/courtyard/scene/actions.ts`.

Today, **every** Courtyard action is Level 0 (session play): it moves a token,
shows a bubble, and writes a session-scratch line. Nothing calls a model, writes
a record, or touches a House system. This document classifies each action by the
level it should *eventually* reach, and names the safe first step.

---

## The four action levels

### Level 0 — Visual / session-play action
Produces only: token movement, a speech bubble, a session-scratch line, temporary local UI state. **No** model calls, DB writes, notes, Library, Memory, or House-system effects.
*Examples:* Sit here · Wait together · Let silence sit · Reflect quietly · Notice what is growing · Peek inside.

### Level 1 — Navigation action
Routes Tara to an existing House room or known route. The **safest first "real" actions** — they reuse routes that already exist; no generation, no writes.
*Examples:* Go to Lounge · Enter Ari's Room (`/room/ari`) · Enter Eli's Room (`/room/eli`) · Open Persona Rooms · Enter Arcade (stub) · Return to Courtyard.

### Level 2 — Session-only generated action
May later call Ari/Eli to generate a **short, session-only** response (a real line, not mock). **No** Memory, Journal, Noticeboard, Library, Archive, or persistent identity change — the generated text lives only in session scratch and disappears with the session.
*Examples:* Talk with Ari/Eli · Ask Ari for a thought · Ask Ari what he needs · Ask Eli what he feels · Ask Eli to tell a secret · Invite Ari to share a quiet thought.

### Level 3 — Persistent / system-writing action
Might *eventually* write into a real House surface (Noticeboard/Deposit, Library reach, carry-context to Lounge, saved concept). **Must not be wired yet** — each needs its own governed write-path design first.
*Examples:* Leave a note · Pin a thought · Place a tiny reminder · Carry this thread to Lounge · Bring a reference back · Prepare a tiny concept · Save as session scratch (if ever persisted).

> **Governance through-line:** Levels 0–1 are safe to wire soon. Level 2 needs a session-only generation contract (no persistence). Level 3 is **blocked** until a governed write-path + Tara approval exists per surface. Nothing here grants Memory/canon/approval.

---

## Action routing matrix

Columns: **Action** · **Current behaviour** (all Level 0 today) · **Suggested target level** · **Future routed behaviour** · **Note / next phase**.

### Tara's Chair
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Sit here | move + bubble | **L0** | unchanged | pure play |
| Call Ari over | moves Ari token | **L0** | unchanged (token move) | play |
| Call Eli over | moves Eli token | **L0** | unchanged | play |
| Gather everyone | moves all tokens | **L0** | unchanged | play |
| Settle the room | stops session | **L0** | unchanged | play |
| Talk with Ari / Talk with Eli | mock bubble | **L2** | session-only generated reply | 1G.2; no persistence |
| Ask Ari for a thought | mock bubble | **L2** | generated short thought | 1G.2 |
| Ask Ari to tell a secret / Ask Eli to tell a secret | mock bubble | **L2** | generated, session-only | 1G.2; framing = invitation |
| Ask Ari to express a need / Ask Eli to express a need | mock bubble | **L2** | generated need (session only) | 1G.2; **not** an emergent-want write |
| Ask Eli what he feels | mock bubble | **L2** | generated feeling line | 1G.2 |
| Ask Ari to stay / Ask Eli to stay | rest + bubble | **L0** | unchanged | play |
| Send Ari to Workshop Table / Send Eli to Fountain | token move | **L0** | unchanged | play |

### Workshop Table
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Inspect build map | move + bubble | **L0** | unchanged (visual) | future read-only build view = later phase |
| Ask Ari to work here / Call Eli to look | token move | **L0** | unchanged | play |
| Prepare a tiny concept | scratch line | **L3** | maybe save a concept artefact | blocked; needs write design |
| Review unfinished work | scratch line | **L0** | unchanged (visual) | real build-data read = later |
| Ask Ari for a plan / what is unfinished / one next step | mock bubble | **L2** | generated, session-only | 1G.2 |
| Ask Ari to pin a build thought | scratch line | **L3** | real Noticeboard/build write | blocked; 1G.4 |
| Invite Eli into the work | token move | **L0** | unchanged | play |
| Ask Eli what he notices / soften the plan / compare impressions / turn into a question | mock bubble | **L2** | generated, session-only | 1G.2 |

### Fountain
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Reflect quietly · Listen to the room · Let thoughts settle | move + bubble | **L0** | unchanged | pure play |
| Ask Eli to sit here · Call Ari to pause | token move | **L0** | unchanged | play |
| Ask Eli what he feels / express a need · Invite Eli to tell a secret | mock bubble | **L2** | generated, session-only | 1G.2 |
| Ask Eli to stay | rest | **L0** | unchanged | play |
| Ask Ari to slow down / what needs settling · Invite Ari to share a quiet thought | mock bubble | **L2** | generated, session-only | 1G.2 |
| Send Ari back to the Workshop Table | token move | **L0** | unchanged | play |

### Library corner
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Browse shelf · Read together | move + scratch | **L0** | unchanged (visual) | **no real Library/RAG** in play |
| Ask Ari to read / Ask Eli to read | token move + scratch | **L0** (→L2 line) | move now; optional generated remark later | 1G.2 for the spoken line only |
| Ask what matters / Compare notes / Ask for a summary | mock bubble | **L2** | generated, session-only | 1G.2 |
| Save as session scratch | scratch line | **L3** | persist a scratch note somewhere real | blocked; 1G.4 |
| Bring a reference back | scratch line | **L3** | real Library reach (read-only) | **blocked**; Library is read-only + governed; later phase |

### Garden patch
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Tend the garden · Notice what is growing · Leave it alone · Name what is growing | move + bubble | **L0** | unchanged | pure play |
| Ask Ari to tend / Ask Eli to rest here / Invite someone to sit nearby | token move | **L0** | unchanged | play |
| Plant a small marker | scratch line | **L3** | maybe persist a marker | blocked; 1G.4 |
| Talk about what needs care | mock bubble | **L2** | generated, session-only | 1G.2 |

### Noticeboard / Deposit Table
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Read latest note · Read it aloud | scratch line | **L0** (→L3 read) | visual now; real read of deposits = later | 1G.4 (read side) |
| Leave a note · Place a tiny reminder · Pin for later · Release the note | scratch line | **L3** | real Noticeboard/Deposit write | **blocked**; 1G.4 — holding-layer only, Tara-gated |
| Ask Ari to pin a thought · Ask Eli to leave a note | token move + scratch | **L3** | real deposit write by presence | blocked; 1G.4 |
| Carry it to Lounge | scratch line | **L3** | carry-context to Lounge | blocked; 1G.3 |

### Bench
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Sit here · Wait together · Ask them to stay · Let silence sit | move + bubble | **L0** | unchanged | pure play |
| Call Ari to sit · Call Eli to sit | token move | **L0** | unchanged | play |
| Have a side conversation · Talk softly | mock bubble | **L2** | generated, session-only | 1G.2 |
| Invite them to tell a secret · Ask what they need | mock bubble | **L2** | generated, session-only | 1G.2 |

### Arcade Door
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Peek inside · Check high scores | move + bubble | **L0** | unchanged | play |
| Invite Ari to play · Invite Eli to play | token move | **L0** | unchanged | play |
| Start a tiny game · Choose a challenge · Play one round | scratch line | **L0** | unchanged until Arcade exists | 1G.5 |
| Enter Arcade | modal stub | **L1** | route to Arcade once built; stub for now | 1G.5 — **stub stays until Arcade exists** |

### Lounge Door
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Enter Lounge | confirm modal → `/lounge` | **L1** | navigate to existing Lounge | **1G.1 — safe first wire** |
| Go to Lounge (follow-up) | confirm modal → `/lounge` | **L1** | navigate to `/lounge` | 1G.1 |
| Call Ari to Lounge · Call Eli to Lounge | token move | **L0** | unchanged | play |
| Carry this thread to Lounge · Bring session scratch | scratch line | **L3** | carry Courtyard context into Lounge | **blocked**; 1G.3 (context-carry design) |
| Pause Courtyard first | settle-ish | **L0** | unchanged | play |
| Gather for conversation | moves all tokens | **L0** | unchanged | play |

### Persona Rooms
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Open room doors | opens modal | **L1** | persona-room selector modal | **1G.1** |
| Go to Ari's Room → Enter Ari's Room | follow-up → `/room/ari` link | **L1** | navigate to existing `/room/ari` | **1G.1 — safe first wire** |
| Go to Eli's Room → Enter Eli's Room | follow-up → `/room/eli` link | **L1** | navigate to existing `/room/eli` | **1G.1 — safe first wire** |
| Visit Tara's Space | stub | **L1** | route once Tara's space exists | 1G.6 — stub until built |
| Ask Ari to show something / rest · Ask Eli to reflect / sit with you | mock bubble | **L2** | generated, session-only | 1G.2 |

### Universal
| Action | Current | Target | Future routed behaviour | Note |
|---|---|---|---|---|
| Return to Courtyard | closes menu | **L1** | unchanged (in-page) | trivially safe |

---

## Recommended first real wiring (Level 1 only)
The safest first actual routed actions — all reuse routes that already exist, no generation, no writes:
1. **Go to Lounge** → `/lounge`
2. **Enter Ari's Room** → `/room/ari`
3. **Enter Eli's Room** → `/room/eli`
4. **Open Persona Rooms** → the modal/selector (already present; formalise as the room selector)
5. **Enter Arcade** → keep the **stub** modal (no Arcade route yet)

> Note: items 1–3 are *already* wired in the current prototype (the Lounge confirm navigates to `/lounge`; the Persona modal links `/room/ari` & `/room/eli`). Phase 1G.1 is therefore mostly **hardening + confirming** these as the sanctioned Level-1 set, ensuring graceful behaviour if a route is missing, and keeping everything else non-navigating.

**Do not** wire model calls (Level 2) or any real Noticeboard / Library / Archive / Memory / Journal / Desk / Workshop write (Level 3) in the first wiring.

---

## Explicitly deferred (blocked for now)
- **All Level 2 generated responses** — every "Talk with…", "Ask… for a thought / what he feels / needs", "Invite… to tell a secret / share a thought". Blocked until a **session-only generation contract** exists (no persistence, clearly labelled scratch). → Phase 1G.2.
- **All Level 3 writes** — Leave a note / Pin a thought / Place a reminder / Pin for later / Release / Save as session scratch / Carry thread to Lounge / Bring a reference back / Prepare a tiny concept. Blocked until per-surface governed write-paths exist. → 1G.3 / 1G.4.
- **Library "Bring a reference back"** — Library stays **read-only and governed**; no RAG/Library reach from play.
- **Arcade entry** beyond the stub — no Arcade route yet. → 1G.5.
- **Tara's Space** — not built. → 1G.6.

---

## Proposed future sequence
- **Phase 1G.1 — Level 1 Navigation Routing.** Sanction + harden the safe navigations (Lounge, Ari/Eli rooms, Persona selector, Arcade stub); graceful fallback if a route is absent. *(No model calls, no writes.)*
- **Phase 1G.2 — Session-only Ari/Eli Generated Responses.** Define a strict session-only generation contract (short reply → bubble + scratch only; no Memory/Journal/Noticeboard/Library/Archive; clearly labelled). Then wire Level-2 talk/ask actions.
- **Phase 1G.3 — Courtyard→Lounge Carry-Context Design.** Design how (if at all) session scratch is carried into a Lounge thread, governed and Tara-confirmed.
- **Phase 1G.4 — Noticeboard / Deposit Write Design.** Design the holding-layer write path for "leave a note / pin / reminder" (deposit ≠ Memory/canon; Tara reviews).
- **Phase 1G.5 — Arcade Entry Integration.** Real Arcade route + entry, replacing the stub.
- **Phase 1G.6 — Persona Rooms / Tara's Space Entry Prototype.** Formal room-entry experience, incl. building Tara's space.

*(Names are adjustable; the ordering — navigation → session generation → context-carry → writes → Arcade → rooms — is the safe escalation.)*

---

## Boundaries honoured
Documentation only. No code, `/courtyard`, routes, image assets, GLBs, migrations, model calls, or writes to Memory/Library/Archive/Noticeboard/Journal/Desk/Workshop/Pulse/autonomy were touched. Phase 1G.1 is **not** started. Nothing here grants approval, canon, or identity authority.
