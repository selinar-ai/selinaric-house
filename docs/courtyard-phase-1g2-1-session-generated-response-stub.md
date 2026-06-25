# Courtyard — Phase 1G.2.1 — Session-only Generated Response Stub

> First real Ari/Eli generated responses from the Courtyard. Wires **exactly two**
> Level 2 actions to a session-only path. Builds on `main` @ `a0d0a57`.
> Contract: `docs/courtyard-phase-1g2-session-generated-response-alignment.md`.

## What is wired (and only this)
Two actions now call a real, session-only generation path:
1. **Ask Ari for a thought** (Tara's Chair → Ari)
2. **Ask Eli what he feels** (Tara's Chair → Eli, and Fountain → Eli — same labelled action)

Each produces **one short, in-character line** shown as the actor's speech bubble and appended to **Session Scratch** (`Ari says: "…"` / `Eli says: "…"`). Nothing else.

## How it works
- **Action data** (`src/lib/courtyard/scene/actions.ts`): the two action labels carry a new optional `generate: { actionId, promptKind }` field. The mock canned `say:` lines were removed for these (the bubble now comes from generation); the `scratch:` is just the invitation lead ("Tara asks Ari for a thought.").
- **Client** (`CourtyardScene.tsx`): when a `generate` action is clicked, `runGenerated()` shows a soft `…` waiting bubble (and a gentle token pulse), POSTs to the route, then renders the returned text as the bubble + one scratch line. A `generatingRef` guard prevents overlapping calls. On any failure it shows a soft fallback and keeps the session usable.
- **Route** (`src/app/api/courtyard/generated-response/route.ts`, `POST`): House-auth gated; strict allowlist; calls Claude (`claude-sonnet-4-6`, `max_tokens` 120) with a short in-character system prompt built from the read-only persona voice (`loadPresenceForRoom`); returns a session-only response object. **No DB / no writes anywhere.**

## Strict allowlist
The route accepts **only** these exact triples; everything else returns `400 action not allowed`:
| actionId | actorId | promptKind |
|---|---|---|
| `ask_ari_for_thought` | `ari` | `thought` |
| `ask_eli_what_he_feels` | `eli` | `feeling` |

The client never sends raw prompt text; `sessionOnly: true` / `persistence: 'none'` are **server-enforced literals**, not taken from the client. Future expansion **must explicitly extend this allowlist** (and the action data).

## Response shape
```ts
{ actionId, actorId, text, tone, sessionOnly: true, persistence: 'none' }
```

## Guarantees
- **Only two actions are wired.** All other Level 2 actions remain mock/session-scratch only.
- **All output is session-only.** Bubble + scratch live in React state; they clear on refresh/settle. Session Scratch is in-memory (not localStorage) and stays that way.
- **No persistence exists** — no DB, Memory, identity update, Noticeboard/Deposit, Library/RAG, Archive, Journal, Desk, Workshop, Pulse, helper outputs, approvals, or autonomy. Not prompt-eligible. Not carried to Lounge.
- **No Level 3 actions are wired.**
- **No drift/autoplay generation** — generation runs only after Tara manually clicks one of the two wired actions; the autoplay loop never calls it.
- **Soft failure** — generation errors show a fallback bubble ("A thought does not arrive yet." / "The feeling stays quiet for now.") and a scratch note; the menu/session keep working.

## Security
The route requires the existing House API auth, is POST-only, validates against the allowlist, returns clear errors for disallowed input, does not log generated content to persistent logs, does not expose provider keys, and accepts no client-supplied prompt text.
