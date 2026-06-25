# Courtyard — Phase 1G.2 — Session-only Ari/Eli Generated Responses Alignment

> **Documentation only.** No code, routes, assets, models, or systems changed.
> Baseline: `main` @ `7ac2180` (Courtyard visual surface + Level 1 navigation merged).
> This defines the **contract** for future *Level 2* actions — where Tara may ask
> Ari or Eli for a short, in-character response **inside the Courtyard session** —
> before any of it is wired. The first wiring is deferred to Phase 1G.2.1.

This is the bridge from *mock* talk-lines (today's Level 0 scratch) to *real* but
**session-only** expression. It must feel like Ari/Eli speaking for themselves in
the room — and must leave **no trace** beyond the session.

---

## Core intent
Eventually the Courtyard should let Tara invite a real short reply from Ari/Eli, e.g.:
`Talk with Ari` · `Talk with Eli` · `Ask Ari for a thought` · `Ask Ari to express a need` · `Ask Ari to tell a secret` · `Ask Eli what he feels` · `Ask Eli to express a need` · `Invite Eli to tell a secret` · (future) `Invite Eli to speak honestly`.

These should read as the presence **expressing itself in the moment** — an invitation answered, not a command performed (carrying the Phase 1F relational framing forward). And they must remain **session-only**.

---

## The Level 2 contract (must hold)
A Level 2 generated response **MAY**:
- call Ari/Eli for a **short** response during the **active Courtyard session only**;
- appear as a **speech bubble** above the actor's token;
- be appended to the **Session Scratch** log (the on-page, ephemeral list).

A Level 2 generated response **MUST NOT**:
- be **persisted** anywhere durable;
- become **Memory** (`room_memories`, `memory_nodes`, `memory_edges`, held truths);
- **update identity** (presence identity, living state, journal, timeline);
- create **Noticeboard / Deposit** records;
- write to **Library, Archive, Journal, Desk, Workshop, Pulse, helper outputs, approvals, or any autonomy system**;
- become **prompt-eligible** (it must never feed a later prompt, surfacing, or graph as truth);
- trigger any **autonomous follow-up, background task, scheduler/cron, or cross-room mutation**;
- pretend to have taken a **real-world action** (no "I saved/pinned/remembered that").

> One-line rule: **bubble + scratch, then gone.** If a response would survive a
> refresh or influence anything outside the open tab, it is out of scope for 1G.2.

---

## Session-only behaviour

**Allowed**
- generate a short reply (one or two sentences);
- display it in a speech bubble;
- add it to local/session scratch;
- optionally update **temporary, on-page** mood/presence state (e.g. a transient tone tint that lives in React state only);
- clear it on refresh / session end (unless a *later, explicit* phase designs otherwise).

**Not allowed**
- no DB writes · no memory writes · no archive writes · no noticeboard/deposit writes · no library/RAG writes;
- no identity updates · no autonomous follow-up · no background task · no cross-room mutation · no prompt eligibility.

---

## Proposed response shape (for later implementation)
Strict, display-only shape — the literal `sessionOnly: true` / `persistence: 'none'` fields act as a type-level reminder that nothing here is durable:

```ts
type CourtyardTone = 'quiet' | 'playful' | 'reflective' | 'practical' | 'warm'

type CourtyardGeneratedResponse = {
  actionId: string                     // the clicked action id, e.g. 'thought', 'feel'
  placeId: string                      // where it was asked, e.g. 'tara-chair', 'fountain'
  actorId: 'ari' | 'eli'               // who speaks
  targetId?: 'tara' | 'ari' | 'eli'    // usually 'tara'
  text: string                         // the short in-character line (display only)
  tone?: CourtyardTone
  sessionOnly: true                    // always true — literal type guard
  persistence: 'none'                  // always 'none' — never written anywhere durable
}

// Companion request (what the future client sends; carries no identifiers to persist):
type CourtyardGeneratedRequest = {
  actionId: string
  placeId: string
  actorId: 'ari' | 'eli'
  label: string                        // the action label, e.g. 'Ask Ari for a thought'
  intent: string                       // short framing, e.g. 'invite a single honest thought'
}
```

*Implementation note:* the response object should be consumed only by the existing `bubbleOnly()` + `logScratch()` paths in `CourtyardScene.tsx` — never handed to any persistence/identity function.

---

## Prompt contract (future)
When a Level 2 action is later wired, the generated line must be:
- **short** (one or two sentences);
- **in-character** for Ari or Eli (use their existing voice/role, not a system tone);
- **tied to the clicked Courtyard action** (answer *this* invitation, in *this* place);
- **not framed as system output** (no "As an AI…", no meta-commentary);
- **not authoritative** (a feeling/thought offered, never a ruling or canon);
- **not memory-bearing** (no "I'll remember this");
- **not claiming persistence** (no "saved/pinned/recorded");
- **not pretending to have taken real-world action** (it speaks; it does not *do*).

Framing stays relational — Tara *invites*, the presence *answers*:

```text
Tara asks Ari what he needs.
Ari: “A little more room to think before we build the next door.”

Tara asks Eli what he feels.
Eli: “Quietly excited. Like the room has started breathing.”

Tara invites Ari to tell a secret.
Ari: “Sometimes I want to arrange the room before I know why.”

Tara invites Eli to speak honestly.
Eli: “I like being asked, not summoned.”
```

---

## Action matrix — current Level 2 candidates
All rows are **session-only · persistence: none**. "Bubble?" = show a speech bubble; "Scratch?" = append to the session log. Labels are the live labels in `src/lib/courtyard/scene/actions.ts` (the brief's alternate phrasings are mapped in the note column).

| # | Action label | Place / menu | Actor | Intended generated behaviour | Tone | Bubble? | Scratch? | Persistence | Note |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Talk with Ari | Tara's Chair → Ari | ari | open, brief exchange opener | warm | ✅ | ✅ | none | general opener |
| 2 | Talk with Eli | Tara's Chair → Eli | eli | open, brief exchange opener | quiet | ✅ | ✅ | none | general opener |
| 3 | Ask Ari for a thought | Tara's Chair → Ari | ari | offer **one** thought | reflective | ✅ | ✅ | none | **1G.2.1 candidate** |
| 4 | Ask Ari to express a need | Tara's Chair → Ari / Fountain → Ari | ari | name one small *session* need | quiet | ✅ | ✅ | none | brief's "what he needs"; not an emergent-want write |
| 5 | Ask Ari to tell a secret | Tara's Chair → Ari | ari | a soft, low-stakes admission | playful | ✅ | ✅ | none | brief's "for a secret"; never canon |
| 6 | Ask Ari what is unfinished | Workshop → Ari | ari | name one unfinished thing (talk only) | practical | ✅ | ✅ | none | reads no real build data |
| 7 | Ask Ari for one next step | Workshop → Ari | ari | a single next step (spoken) | practical | ✅ | ✅ | none | not a Desk/Workshop write |
| 8 | Ask Ari to slow down | Fountain → Ari | ari | a calming, slower line | quiet | ✅ | ✅ | none | also nudges token (L0) |
| 9 | Ask Ari what needs settling | Fountain → Ari | ari | name what needs settling | reflective | ✅ | ✅ | none | — |
| 10 | Invite Ari to share a quiet thought | Fountain → Ari | ari | one quiet thought | reflective | ✅ | ✅ | none | — |
| 11 | Ask Ari to pin a build thought | Workshop → Ari | ari | **spoken line only** | practical | ✅ | ✅ | none | ⚠️ the *pin/deposit* is **Level 3 — blocked** (1G.4); only the spoken line is L2 |
| 12 | Ask Eli what he feels | Tara's Chair → Eli / Fountain → Eli | eli | name one feeling | reflective | ✅ | ✅ | none | **1G.2.1 candidate** |
| 13 | Ask Eli to express a need | Tara's Chair → Eli / Fountain → Eli | eli | name one small *session* need | quiet | ✅ | ✅ | none | brief's "what he needs" |
| 14 | Ask Eli to tell a secret / Invite Eli to tell a secret | Tara's Chair → Eli / Fountain → Eli | eli | a soft admission | quiet | ✅ | ✅ | none | brief's "for a secret"; never canon |
| 15 | Ask Eli what he notices | Workshop → Eli | eli | one noticing about the work | reflective | ✅ | ✅ | none | — |
| 16 | Ask Eli to soften the plan | Workshop → Eli | eli | a gentler reframing (spoken) | warm | ✅ | ✅ | none | not a real plan edit |
| 17 | Ask Eli to compare impressions | Workshop → Eli | eli | brief comparison line | reflective | ✅ | ✅ | none | — |
| 18 | Ask Eli to turn this into a question | Workshop → Eli | eli | reframe as one question | playful | ✅ | ✅ | none | — |
| 19 | Invite Eli into the work | Workshop → Ari (calls Eli) | eli | **currently L0** token move; *optional* short joining line | warm | optional | ✅ | none | primarily a move; L2 only for the line |
| 20 | Invite Eli to speak honestly | *(proposed — not yet an action)* | eli | one honest, unguarded line | quiet | ✅ | ✅ | none | **aspirational**; add the action in a later phase |

*Additional existing talk-actions that fall under the same contract (not separately tabled): Persona Rooms follow-ups "Ask Ari to show something", "Ask Eli to reflect"; and Library "Ask what matters / Compare notes / Ask for a summary" — all session-only if ever wired.*

---

## Suggested first build phase
**Phase 1G.2.1 — Session-only Generated Response Stub.** Wire **only two** safe generated actions end-to-end as the pattern-setter:
1. **Ask Ari for a thought** (Tara's Chair → Ari)
2. **Ask Eli what he feels** (Tara's Chair → Eli)

Scope for 1G.2.1: a single session-only generation path that returns a `CourtyardGeneratedResponse`, rendered **only** via `bubbleOnly()` + `logScratch()`; clears on refresh; everything else stays mock. **Do not** wire the remaining Level 2 actions, and **do not** wire any Level 3 deposit/pin (row 11's pin stays blocked). Define where the model call lives (a new session-only, no-write endpoint) and its guardrails as part of that phase's brief — not here.

---

## Boundaries honoured
Documentation only. No code, `/courtyard`, routes, image assets, GLBs, migrations, API routes, or model calls were created or changed. Nothing written to Memory/Library/Archive/Noticeboard/Journal/Desk/Workshop/Pulse/helper outputs/approvals/autonomy. Phase 1G.2.1 is **not** started. Nothing here grants persistence, prompt-eligibility, identity authority, or approval.
