# Courtyard — Phase 1H.1 — Profile Cards and Interior Links

> UI / navigation polish on `/courtyard`. Builds on `main` @ `e65aad6`.
> Swaps the profile/card art to the newer longer portraits and adds "Interior"
> entry links. Presentation + Level-1 navigation only — no behaviour-system changes.

## What changed
- **New card art (card-02):** the right-side Ari/Eli profile panels and the bottom
  Tara/Ari/Eli cards now use the longer portraits
  `gaming-assets/docs/courtyard-2d-tokenssource-images/{ari,eli,tara}-game-card-02.png`.
  Route keys stayed **stable** (`/api/courtyard/token-image/{ari,eli,tara}-card`) —
  the allowlist values were repointed from `*-game-card-01.png` to `*-game-card-02.png`,
  so every consumer (`cardImagePath`) picks up the new art with no client change.
- **Taller bottom cards:** the card strip changed from 3:4 to **2:3** (and a touch
  wider) for a more portrait/full-figure feel closer to the reference. `object-cover`
  + `object-position: top center` keep faces framed; images are not distorted.
- **Interior links:** each profile panel gains an **"Enter Ari's Interior →"** /
  **"Enter Eli's Interior →"** button, routed through the existing guarded
  `safeNavigate` (Level-1 allowlist) to `/room/ari` and `/room/eli`.
- **Tara's Space stub:** a graceful, **disabled** "Tara's Space — coming later"
  panel (with her card-02 thumbnail) is shown in the right column. No Tara route is
  created in this phase.

## Runtime asset handling
- The 3 `*-game-card-02.png` files are committed (force-added; the dir isn't
  git-ignored) and added to `next.config.ts` `outputFileTracingIncludes` for the
  `token-image` route, so Vercel bundles them (verified in the route `.nft.json`).
- The old `*-game-card-01.png` files are **left tracked** (no longer referenced in
  code, but not removed) and dropped from the tracing include list.

## Behaviour preserved
Stage image, tokens, hotspots, action menus, drift/nudge/settle/wake, Persona
Rooms, Level 1 navigation, Level 2 generated responses (Ask Ari for a thought /
Ask Eli what he feels), and session scratch are all unchanged. Footer still reads
"session scratch only · not memory, not canon."

## Not touched
No DB/schema/migrations; no Memory/Library/Archive/Noticeboard/Journal/Desk/
Workshop/Pulse/helper/approval/autonomy; no model-call/generated-response logic
changes; no GLBs; no "dollhouse" terminology; `.gitignore` untouched.
