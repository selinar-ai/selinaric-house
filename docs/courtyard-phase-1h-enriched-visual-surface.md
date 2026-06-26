# Courtyard — Phase 1H — Enriched Visual Surface

> A **presentation-only** layout pass on `/courtyard`. Builds on `main` @ `97416f8`.
> Recomposes the page toward `courtyard-living-room-reference-01.png` while keeping
> all existing Courtyard behaviour intact. No new systems, persistence, or model work.

## What changed (visual / layout only)
- **Stage stays central and dominant** — same stage image, hotspots, tokens, speech bubbles, click interactions, and the calibrated 4/3 framing (so hotspot alignment is unchanged). Capped width so it reads as a hero panel.
- **Richer right-side presence profiles** — Ari and Eli now have fuller profile panels (larger "game card" portrait art, name, role, current location, current line/state, and an honest session-only "wander" cue derived from their existing `drift` value). Selecting a panel still toggles the existing `selected` state.
- **Bottom character-card strip** — Tara / Ari / Eli portrait cards using the game-card art; clicking a card selects that presence (same `selected` state) and shows their current location.
- **Conversation / session-scratch panel relocated** to a wider framed panel in the lower strip (next to the cards), with a line count. Same session-scratch content and semantics; still clearly labelled "session scratch only · not memory, not canon."
- Page now flows/scrolls within the (house) `main` (which is `overflow-y-auto`) instead of compressing into one viewport.

## Behaviour preserved (unchanged)
Route `/courtyard`; stage image; token positioning/movement; place hotspots; action menus; Level 1 navigation routing; Level 2 generated responses (Ask Ari for a thought / Ask Eli what he feels); autoplay/drift/nudge/settle/wake; persona-rooms + room-state pill; session-scratch behaviour. No action model, persistence, or systems changes.

## Assets / serving
- New runtime assets committed: `gaming-assets/docs/courtyard-2d-tokenssource-images/{ari,eli,tara}-game-card-01.png`.
- Served via the **existing auth-gated** `token-image` route — new allowlist keys `ari-card` / `eli-card` / `tara-card` → the game-card files; client helper `cardImagePath(id)`.
- Added to `outputFileTracingIncludes` so Vercel bundles them into the function (verified in the route `.nft.json`). Kept in `gaming-assets/` (not `public/`) so they remain auth-gated, like the other Courtyard images.

## Not touched
No DB/schema/migrations; no Memory/Library/Archive/Noticeboard/Journal/Desk/Workshop/Pulse/helper/approval/autonomy; no model-call behaviour; no GLBs; no "dollhouse" terminology. Presentation only.
