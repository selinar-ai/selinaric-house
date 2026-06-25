# Courtyard — Phase 1G.2.2 — Runtime Asset Availability Fix

> Makes the Courtyard's required runtime PNGs available on Vercel. Builds on
> `main` @ `167e962`. No behaviour/model/system changes.

## Problem
On Vercel, `/courtyard` rendered (UI, hotspots, menus, token positions) but the
background and token images were broken. The auth-gated image routes stream PNGs
from `gaming-assets/` on the filesystem, and those PNGs were untracked (kept local
for earlier review). Vercel can't serve uncommitted files → the routes 404'd.

A second, subtler cause: the routes read the files via a **dynamic**
`readFile(join(process.cwd(), 'gaming-assets', 'docs', …))`. Next.js output-file-
tracing can't follow dynamically-built paths, so even once committed the PNGs were
not bundled into the serverless functions. Committing alone would not have fixed it.

## Fix (two parts)
1. **Commit only the exact runtime PNGs** the image routes whitelist:
   - `gaming-assets/docs/courtyard-visual-references/courtyard-reference-01.png` (scene-image key `courtyard`)
   - `gaming-assets/docs/courtyard-2d-tokenssource-images/Ari-2d-source-run1-01.png` (token `ari`)
   - `gaming-assets/docs/courtyard-2d-tokenssource-images/eli-2d-source-run1-01.png` (token `eli`)
   - `gaming-assets/docs/courtyard-2d-tokenssource-images/tara-2d-source-run1-01.png` (token `tara`)

   Force-added (the dir isn't broadly git-ignored, but `-f` made staging explicit). **No** other PNGs, **no** drafts, **no** GLBs, **no** `*-dollhouse-reference-01.png`, living-room/lounge references, or other design refs were committed.

2. **`outputFileTracingIncludes`** in `next.config.ts` — lists those exact files for the two image route globs so Vercel bundles them into the functions. Verified: the route `.nft.json` traces now contain the PNG paths.

## Why not `public/`
These images are intentionally **auth-gated** (House cookie). Moving them to
`public/` would expose them without auth. They stay in `gaming-assets/` and are
served only through the existing authenticated routes.

## Route hardening (minimal)
Each image route now logs a clear server message (path only, not bytes) if a
whitelisted asset is missing on the deployment. No route names, allowlists, auth,
or API keys changed; `/courtyard/3d-preview` is not exposed.

## Verified
- `npm run build` clean; route NFT traces include the 4 PNGs.
- Local authed smoke: `/api/courtyard/scene-image/courtyard` and
  `/api/courtyard/token-image/{ari,eli,tara}` → 200 `image/png`; unauth → 401.
- Expected Vercel impact: `/courtyard` background + tokens load on the deployment.
