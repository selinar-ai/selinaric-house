# Workshop Visual Pass — Ari Review Packet (pre-commit)

**Status:** Built, **uncommitted, unpushed** — awaiting Ari's check before any commit.
**Companion doc:** `docs/workshop-visual-pass-brief.md` (the brief Ari already approved). Ari approved Slices 0–4; **Slice 5 is new and needs his nod.**
**origin/main:** `c12e7ee` (Phase 41.16 closure) — unchanged.

---

## What it is

A presentation / motion layer over the **closed** Helper Floor. **No** data, route, migration, schema, or DB-posture change. The lever underneath is still the governed 41.12 review route and the 41.14 read-only trace.

## Built, by slice

| Slice | Delivered | In brief? |
|---|---|---|
| 0 | Verified `motion` (current package) over legacy `framer-motion` per Ari's Slice-0 ask; installed; `useReducedMotion` seam | Yes |
| 1 | Courier drifts in → idle bob → gentle exit on every 200 → re-enter if another item (keyed by item id + review state) | Yes |
| 2 | Map↔room corridor-zoom; prev/next cross-fade; transform/opacity only | Yes |
| 3 | Per-tile glow pulse tied to the existing review-state visual; Atrium motes; hover/tap micro-interactions | Yes |
| 5 | **NEW** — swapped the abstract sprite for the **Storybook Spirit** character (still silent / aria-hidden); added a faint state-tinted **radial wash** behind each tile | **No — needs Ari's nod** |

## Guardrails to stress-test

- **Silent courier** — `aria-hidden`, no text, non-interactive (live smoke: courier text empty).
- **No authority** — glow / wash = review state only; one POST to the **41.12** route, body unchanged; **41.14** trace path untouched; no candidate read or bridge.
- **One animation dependency** — `motion` only; no legacy `framer-motion`.
- **Reduced motion** — every animation gated by `useReducedMotion` (courier → still sprite, motes → none, transitions → plain switch, pulse off). Verified by tests (preview can't emulate it live).
- **Legibility-first** — washes ≤ 0.14 alpha (tested); motion never obscures text, controls, trace, or captions.
- **Mobile / keyboard / List** — map collapses to a single column at 375px; controls are focusable buttons; List fallback intact.

## Evidence

- Helper suite **15/15 files, 1628 assertions, 0 failures**; typecheck clean; build green.
- Governed smokes confirmed: courier exit / re-enter on action; prev/next slide (2-row); glow pulse + wash on The Vault; mobile single-column; keyboard focus; protected fields unchanged; **global active helper outputs returned to 0** each time.

## Honest deltas (for Ari)

This is a **v1** of the concept frames — same soul (velvet, silent spirit, glowing rooms, drifting motes) but lighter. The **full spatial Atrium-with-corridors map** was deliberately deferred: it is the biggest lift, and the current responsive grid is what degrades cleanly on mobile / keyboard. Surfacing it would be a separate, carefully-scoped slice.

## Files touched (all uncommitted)

- Modified: `src/app/(house)/helpers/page.tsx`, `src/lib/helpers/__tests__/helperWorkshop.test.ts`, `package.json`, `package-lock.json`
- New: `src/lib/helpers/workshopMotion.ts`

## Open for Ari

1. Bless **Slice 5** as within scope, or adjust the character / wash.
2. Any cap on the courier's exit-on-every-200, or on the wash intensity?
3. Confirm OK to commit (and whether the brief + this packet should be committed as docs or kept uncommitted).

## Suggested commit message (on approval)

`Workshop visual pass: animate courier, room transitions, ambient glow`
