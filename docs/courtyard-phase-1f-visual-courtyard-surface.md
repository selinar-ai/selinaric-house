# Courtyard — Phase 1F — Visual Courtyard Surface

> A warmer, inhabited Courtyard: the **approved Courtyard art is the stage**, with
> small 2D presence tokens for Tara, Ari, and Eli moving across it. Builds on the
> Phase 1E token prototype but is cleaner, more visual, and **drops the
> "dollhouse" framing** — this is the **Courtyard scene**.
> Prototype-only: no DB, no memory, no model/LLM calls, no approval/authority,
> no background work. Speech is mock session scratch, never real presence voice.

## Route
- **`/courtyard`** — the new main visual Courtyard surface (under `(house)`, House auth applies).
- Unchanged / intact: **`/courtyard/3d-preview`** and its APIs.
- The Phase 1E `/courtyard/dollhouse` route + dollhouse-named files were **renamed** into the Courtyard scene (see below); "dollhouse" is gone from the experience and from new naming.

## What the Courtyard now does
- Shows **`courtyard-reference-01.png`** (the approved art) as the stage, **used as-is** — not redrawn, no baked labels added.
- Tara / Ari / Eli appear as **small circular 2D tokens** at meaningful starting places.
- **Wake the Courtyard → Let them drift / Hold / Nudge once / Settle**, plus **Persona Rooms**.
- **Click a presence, then a place** to move them; presences also **drift on their own** during autoplay.
- Soft **place hotspots** glow on the art; **hover reveals an elegant chip** (place name + one-line blurb) — no permanent giant labels.
- Little **speech bubbles** near tokens, mirrored into a light **Session scratch** log.
- **Persona Rooms** opens a modal doorway to `/room/ari`, `/room/eli`, and a "Tara's space — coming next" stub.
- A soft **room-state pill** reads `Resting` / `Awake · step N` / `Drifting · step N`.

## How movement works
Each presence holds a current zone id; tokens render at that zone's `%` anchor over the image and **ease between anchors** (CSS transition, ~950ms). No pathfinding, no walking animation — readable, gentle movement only. Co-located tokens fan out so they don't fully overlap.

## How place overlays work
`COURTYARD_ZONES` lists each place with an `(x, y)` percentage placed over the matching feature in the art. Hotspots are small glowing rings; hover/focus shows the name+blurb chip and a brighter glow; clicking moves the selected presence there (or opens Persona Rooms for that zone). Doors/rooms use a warmer gold ring.

## How Persona Rooms works
A lightweight modal (not a deep build): real links into the existing `/room/ari` and `/room/eli`, plus a Tara stub. It reads as a real doorway to a next layer, not a dead label.

## Reuse of Living-Room / 1E logic
The **behavioural spine** (drift weighting by affinity, `chance`/`pick` helpers, bubbles, session scratch, click-to-move) was carried over and renamed; the **surface was redesigned** around the image stage (cleaner, warmer, less control-heavy) rather than transplanting the spike/1E UI.

## Files
- `src/app/(house)/courtyard/page.tsx` — the `/courtyard` surface.
- `src/components/courtyard/scene/CourtyardScene.tsx` — the scene (stage, hotspots, tokens, controls, scratch, persona modal).
- `src/lib/courtyard/scene/{types,zones,cast}.ts` — Courtyard-named registries (renamed from the 1E `dollhouse` lib).
- `src/app/api/courtyard/scene-image/[name]/route.ts` — auth'd streaming of the approved stage background.
- `src/app/api/courtyard/token-image/[character]/route.ts` — auth'd streaming of the token source PNGs (from 1E).
- Renamed away: the 1E `dollhouse` page/component/lib files (removed).

## Asset handling
- **Stage background:** `gaming-assets/docs/courtyard-visual-references/courtyard-reference-01.png`, streamed via `/api/courtyard/scene-image/courtyard`. Used as-is.
- **Tokens:** `gaming-assets/docs/courtyard-2d-tokenssource-images/{Ari,eli,tara}-2d-source-run1-01.png`, streamed via `/api/courtyard/token-image/<id>`, displayed as CSS-cropped circular tokens (top-focused). No background-removal workflow built (per brief).
- The secondary reference `courtyard-living-room-reference-01.png` was used as **UI-composition inspiration only** (not rendered).
- **No images/binaries are committed** — all served locally via auth'd routes, kept out of `public/`. `.gitignore` untouched.

## Still rough / placeholder
- Token backgrounds aren't removed (circular crops of full-body art — faces read; full silhouettes don't).
- Hotspot `(x,y)` anchors are hand-placed estimates over the art; may need nudging per exact feature.
- Movement is a direct eased tween; autoplay uses simple `Math.random` weighting (not seeded).
- Tara is deliberately central/quiet; the mock line pool repeats.
- Token/background images 404 in production (local-only, uncommitted) — by design.

## Next steps (suggested)
- Fine-tune hotspot anchors against the exact art.
- Optional real background-removed token PNGs for cleaner standees.
- Decide Tara's level of presence; consider folding the richer want/scoring spine behind this surface.
- Decide whether `/courtyard` becomes the canonical entry (and whether to add a Sidebar link).

## Governance / boundaries honoured
Prototype + client-only. No GLBs touched/committed; no images/binaries committed; `.gitignore` untouched; no DB/migration/API-write; no LLM/model calls; no Memory/Library/Archive/approval/asset-authority; no background scheduler (timers stop with the page). Not approved, not canon, not identity authority.
