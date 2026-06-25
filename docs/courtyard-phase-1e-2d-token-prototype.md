# Courtyard — Phase 1E — 2D Token Prototype

> A playful, prototype-only dollhouse view of the Courtyard with small 2D tokens
> for Tara, Ari, and Eli. Built to test visual presence, click-to-move, soft
> autoplay drift, and little speech moments — **not** the final Courtyard.
> Prototype-only: no DB, no memory, no model/LLM calls, no approval/authority,
> no background work. Speech is mock session scratch, never real presence voice.

## What was built
- **Route:** `/courtyard/dollhouse` (under `(house)`, so House auth applies). Does **not** replace `/courtyard/3d-preview`.
- **Dollhouse scene:** a faux-isometric, warm plum/bronze room (CSS/SVG, *inspired by* the saved reference — the reference image itself is not rendered) with the ten named zones: Tara's Chair, Workshop Table, Library corner, Persona Rooms, Fountain, Garden patch, Bench, Noticeboard / Deposit Table, Arcade Door, Lounge Door.
- **2D tokens:** Tara / Ari / Eli as small circular framed tokens, placed at zone anchors, recognisable at small size.
- **Click-to-move:** click a presence (token or presence card) to select, then click a place to send them there (eased tween between zone anchors).
- **Autoplay drift:** "Let them drift" gently moves Ari and Eli (and, rarely, Tara) toward their affinity zones; "Nudge once" steps a single beat; "Hold" pauses; "Settle" stops and sends everyone home.
- **Speech bubbles:** little in-world bubbles appear on move/click/drift and fade after a few seconds; mirrored into the **Session scratch** side log.
- **Persona Rooms doorway:** clicking the Persona Rooms zone opens a modal with real doorways to `/room/ari` and `/room/eli`, plus a "Tara's space — coming next" stub.

## Files added
- `src/app/(house)/courtyard/dollhouse/page.tsx` — route page.
- `src/components/courtyard/dollhouse/CourtyardDollhouse.tsx` — the prototype (stage, tokens, controls, bubbles, persona modal, scratch).
- `src/lib/courtyard/dollhouse/types.ts` — shapes.
- `src/lib/courtyard/dollhouse/zones.ts` — zone registry + anchors.
- `src/lib/courtyard/dollhouse/cast.ts` — characters (accents, affinities, mock lines) + token path helper.
- `src/app/api/courtyard/token-image/[character]/route.ts` — auth'd PNG streaming of the local token source images.
- `docs/courtyard-phase-1e-2d-token-prototype.md` — this note.

## Token asset locations / handling
- **Source images (local, NOT committed):** `gaming-assets/docs/courtyard-2d-tokenssource-images/` — `Ari-2d-source-run1-01.png`, `eli-2d-source-run1-01.png`, `tara-2d-source-run1-01.png`.
- **Serving:** streamed via the auth'd route `/api/courtyard/token-image/<id>` (mirrors the GLB pattern) — kept local + git-ignored-by-convention, never copied into `public/`, never committed.
- **Processed tokens:** **not created.** Background removal / cleanup needs image tooling this environment doesn't have, and the brief says not to get stuck on it — so the source images are used directly with CSS framing (rounded token, `object-fit: cover`, top-focused). The `courtyard-2d-token-processed/` folder was **not** created.
- **Visual references** in `gaming-assets/docs/courtyard-visual-references/` were used as *style/layout guidance only* (not rendered into the UI).

## What's still rough / placeholder
- The room is **CSS/SVG faux-iso**, not the painted dollhouse in the reference — readable but stylised, not final art.
- Token backgrounds are not removed, so tokens are circular crops of full-body art (faces read; full silhouettes don't).
- Movement is a **direct eased tween** between anchors (no pathfinding, no obstacle awareness) — by design.
- Autoplay uses simple `Math.random` weighting (not seeded/deterministic); charming but not clever.
- Tara is deliberately central/grounded; she has little autonomous behaviour.
- Speech lines are a small fixed mock pool — they will repeat.

## What should come next (suggestions)
- Decide whether to evolve the scene toward the painted dollhouse look (illustrated background) or keep stylised CSS.
- Optional: real background-removed token PNGs (a `courtyard-2d-token-processed/` folder) for cleaner standees.
- Decide Tara's presence (quiet watcher vs. more active).
- If this direction is kept, consider folding in the richer want/scoring spine from the `courtyard/living-room-spike` branch behind this friendlier visual surface.

## Governance / boundaries honoured
Prototype + client-only. No GLBs touched/committed; no PNGs committed; no `.gitignore` change; no DB/migration/API-write; no LLM/model calls; no Memory/Library/Archive/approval/asset-authority; no background scheduler (all timers stop with the page). Not approved, not canon, not identity authority.
