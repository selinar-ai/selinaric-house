# Courtyard — Phase 1G.1 — Level 1 Navigation Routing

> Sanctions and hardens **only the Level 1 (navigation/doorway) actions** from the
> Phase 1G alignment (`docs/courtyard-phase-1g-real-action-routing-alignment.md`).
> Builds on `main` @ `4b8c04f`. Client-only; no model calls, no writes.

## What changed
- Added a single sanctioned route allowlist + guarded navigation helper:
  - `COURTYARD_NAV_ROUTES = { lounge: '/lounge', ariRoom: '/room/ari', eliRoom: '/room/eli' }` and `COURTYARD_AVAILABLE_ROUTES` (a `Set`) in `src/lib/courtyard/scene/actions.ts`.
  - `safeNavigate(path, label)` in `CourtyardScene.tsx`: navigates **only** if the path is in the allowlist; otherwise it shows a graceful **"not wired yet"** modal instead of a broken navigation. All navigation (action `navigate`, the Lounge confirm button, the Persona Rooms selector) now flows through this one guard.
- **Lounge Door:** `Enter Lounge` / `Go to Lounge` → confirm modal → `safeNavigate('/lounge')`. Copy clarifies the Courtyard session **stays as scratch — no context is carried over yet**. `Call Ari/Eli to Lounge` and `Gather for conversation` remain Level 0 (token moves only).
- **Ari's / Eli's Room:** `Enter Ari's Room` / `Enter Eli's Room` (and the Persona selector buttons) → `safeNavigate('/room/ari' | '/room/eli')`. Both routes confirmed to exist. No Ari/Eli state, memory, or identity change.
- **Persona Rooms selector:** the modal is now a clear **doorway selector** (buttons for Ari's Room, Eli's Room, a "Tara's space — coming next" stub, and Return to the Courtyard). Explicitly *not* an authority surface.
- **Arcade Door:** `Enter Arcade` stays a **stub** modal — "the doorway is present, but the Arcade room is not wired yet." No Arcade build, no Gaming Wing import, no gameplay state.
- **Return to Courtyard:** closes the menu/modal and returns to the scene; never navigates (already on `/courtyard`).

## Sanctioned levels (unchanged policy)
- **Level 1 (navigation) — SANCTIONED here:** Lounge, Ari's Room, Eli's Room, Persona Rooms selector, Arcade stub, Return to Courtyard.
- **Level 2 (session-only generated responses) — DEFERRED:** "Talk with Ari/Eli", "Ask Ari for a thought", "Ask Eli what he feels", etc. still produce mock session-scratch only; **no real generation wired.** → future Phase 1G.2.
- **Level 3 (persistent / system-writing) — BLOCKED:** "Leave a note", "Pin a thought", "Place a tiny reminder", "Bring a reference back", "Prepare a tiny concept", "Carry thread to Lounge". Still session-scratch only; **no real persistence wired.** → future 1G.3/1G.4.
- **Arcade** remains a stub. **Lounge carry-context is not implemented** (no session scratch crosses into the Lounge).

## Graceful fallback
Navigation never hard-fails: `safeNavigate` checks the allowlist and, for any unknown/unbuilt target, shows a "not wired yet" modal rather than pushing a broken route. The three real routes (`/lounge`, `/room/ari`, `/room/eli`) are allowlisted and confirmed present.

## Boundaries honoured
No model calls; no DB/migrations; no Memory/Library/Archive/Noticeboard/Journal/Desk/Workshop/Pulse/helper/approval/autonomy writes; no session-scratch carry; no Level 2/3 wiring; no GLBs; no committed images/binaries; `.gitignore` untouched; local reference assets untouched.
