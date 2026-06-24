# Courtyard — Gaming Wing

## Phase 1D — Asset Regeneration Run 1 — Run Log

> **Status:** Run 1 intake **active**. **1 candidate:** `ari-run1-candidate-01` (Meshy, manual by Tara) — inspected, provenance recorded, preview mapping added, **Tara-reviewed 2026-06-24 → visual candidate, pending licence confirmation and optimisation**. See "Intake entries" below.
> **Repo:** `selinaric-house` (private House-side work)
> **Branch:** `courtyard/phase-1d-run1-candidate-intake`, from `main` @ `6a2fd11`
> **Date:** 2026-06-24
> **Governance:** This run approves nothing. Any future candidate is a **draft visual candidate only** — not canon, memory, identity authority, approved asset status, Library, Archive, or production truth.

---

### 1. Purpose of this run
Open a controlled Round-1 candidate intake for Ari/Eli/Tara per the landed doctrine (`docs/courtyard-phase-1c-asset-identity-regeneration-brief.md`) and plan (`docs/courtyard-phase-1d-asset-regeneration-round-1-plan.md`): source/generate candidates → record provenance → place local ignored draft copies → preview in the lab → review against the rubric → honest report. Cap: ≤3 per character, ≤9 total.

### 2. Start state
- `main` / `origin/main` @ `6a2fd11` (Phase 0/1B/1C/1D docs all merged).
- `gaming-assets/drafts/` contained only the existing baseline + Blender-fixed copies:
  - `Ari-draft.glb` (19,993,904 B), `Ari-draft-fixed.glb` (19,623,376 B)
  - `Eli-draft.glb` (16,657,624 B), `Eli-draft-fixed.glb` (13,806,732 B)
  - `Tara-draft.glb` (24,479,988 B), `Tara-draft-fixed.glb` (21,977,872 B)
- No `*-run1-candidate-*` files present. Working tree clean (only pre-existing unrelated untracked files).

### 3. Branch name
`courtyard/phase-1d-run1-candidate-intake` (docs-only; not merged to `main`).

### 4. Scope
Establish the Run-1 intake framework (this log, the candidate register, the provenance folder + naming scheme) and preview/review **any candidates that exist locally**. No asset approval. No code change unless strictly required for safe preview (none was needed — none attempted).

### 5. Sourcing / generation method used
**None performed by the agent — and this is a capability limit, recorded honestly.** The assistant (Claude Code) **cannot generate or download 3D character assets**: no 3D-generation capability; cannot browse/operate asset marketplaces, create accounts, or accept licences; and will not blind-download arbitrary binaries (rights-unclear → must be treated as *blocked* per the run's own rule). Asset sourcing/generation is a **human (Tara) step performed outside the repo**, exactly as it has been for the existing drafts (placed manually).

Consequently this run sourced **0 new candidates**. The framework below is ready for candidates to be dropped in, after which the assistant can do intake (provenance check), local preview, Blender structural clinic, and rubric review.

### 6. List of attempted candidates
None — see §5. No candidates were fabricated or pretended. (Honest zero.)

### 7. Preview / test actions performed
None on new candidates (there were none). The existing `/courtyard/3d-preview` lab remains intact and was last verified working in the Phase 1B.1 browser smoke test (original↔fixed toggle, all three characters loading, exposure/orbit/debug-grey, auth-gated streaming). It is ready to preview Round-1 candidates as soon as they exist locally.

### 8. Blockers
- **Primary blocker:** asset sourcing/generation is outside the assistant's capabilities (§5). This is a handoff, not a code/repo problem.
- No technical/repo blockers: branch created, scaffolding written, nothing staged improperly, no `.glb` touched.

### 9. Outcome summary
- ✅ Run branch created; run log + candidate register + provenance folder/naming scheme established.
- ⏳ **0 candidates sourced this run** (manual sourcing pending).
- ➡️ **Handoff to Tara:** generate/source candidate GLBs outside the repo, then place local copies in `gaming-assets/drafts/` using the naming scheme below and fill a provenance record per candidate. Then the assistant resumes intake → preview → clinic (structural only) → rubric review.

---

---

### Intake entries

**ari-run1-candidate-01** — 2026-06-24
- **Sourced:** Tara, Meshy.ai (AI-generated 2026-06-23), downloaded locally to `gaming-assets/drafts/Ari-run1-candidate-01.glb` (git-ignored).
- **Provenance:** recorded at `docs/courtyard-candidate-provenance/ari-run1-candidate-01.md`. **Licence/usage rights pending Tara confirmation** (Meshy subscription terms) — gap to resolve before any advance.
- **Blender inspect (read-only):** 1 mesh, 0 armatures, 0 animations; 540,908 tris; dims 0.68 × 0.48 × 1.8 m; lowest Z = 0.0 (grounded); centred; upright; neutral static pose; material non-metallic (roughness 0.8), texture-driven base colour.
- **Assessment:** structurally the cleanest Ari asset so far (already upright/grounded/centred/neutral/~1.8 m — no clinic needed for structure). **Over budget:** 28.75 MB (>25 MB) and ~541k tris (>> ~30–150k suggested) → likely decimation needed later (not done; requires approval). **Texture quality unverified** — needs visual preview.
- **Status:** `pending preview` (+ licence confirmation). Not previewed: the lab cannot stream this filename without a tightly-scoped preview-only code change (see "Preview path" below). Not marked `visual candidate` — no preview has occurred.

### Preview path — IMPLEMENTED (tightly scoped, preview-only)
A per-character candidate mapping was added (2026-06-24, Tara-approved):
- `draftModels.ts`: each model may carry optional `candidates[]`; Ari has one — `run1-candidate-01` → `Ari-run1-candidate-01.glb`. Eli/Tara have none.
- API route: variant resolves via the whitelist to `draft` / `fixed` / a character's own candidate id; **any other variant → 404**. Auth unchanged; no arbitrary filenames/paths; default variant remains `draft`.
- Viewer: the Variant selector now lists a character's candidates (Ari shows "Ari Run 1 Candidate 01 — local preview only"; Eli/Tara do not). Switching character resets the variant to `draft`.

Status: **preview mapping live; pending local visual preview** (and licence confirmation). Not marked `visual candidate` — that requires Tara's browser review.

### Visual review — ari-run1-candidate-01 (2026-06-24, Tara)
**Outcome: PASS as a visual candidate.** Observed in the lab: model loads; current file `Ari-run1-candidate-01.glb`; upright and grounded; face readable; robe-coat silhouette fits Ari; textures readable in the House viewer (not crushed-black/muddy); orbit/exposure/debug-grey available; no approval/save/memory controls.

**New status:** `visual candidate — pending licence confirmation and optimisation`. **Not approved, not canon, not an approved asset.**

**Remaining concerns before carry-forward:**
- File size: **~28.75 MB**, above the ~25 MB target.
- Triangle count: **~541k**, too heavy.
- Needs a **Blender decimation/optimisation copy** before carry-forward use (a `*-fixed`/decimated local copy; originals untouched). **Not performed in this task** — requires explicit approval.
- **Licence/usage rights remain pending Tara confirmation** (Meshy terms). Candidate must not advance beyond local exploration until confirmed.

**Next recommended step:** an **approved Blender decimation pass** to bring tris/size within budget (local `*-decimated`/`*-fixed` copy only, no mutation of the original, no commit of binaries), then re-preview.

---

### Candidate handoff — how to add a Round-1 candidate (for the manual sourcing step)
1. Create/obtain the GLB **outside the repo** (your tool/service or DCC). Verify licence + usage rights.
2. Copy it into `gaming-assets/drafts/` (already git-ignored via `.gitignore:67 gaming-assets/drafts/*.glb`) using a **non-destructive** name that preserves the baseline:
   - `Ari-run1-candidate-01.glb`, `Eli-run1-candidate-01.glb`, `Tara-run1-candidate-01.glb` (…`-02`, `-03` up to 3 per character).
   - **Do not overwrite** the existing `*-draft.glb` / `*-draft-fixed.glb`.
3. Fill a provenance record (copy `docs/courtyard-asset-candidate-provenance-template.md`) into `docs/courtyard-candidate-provenance/` named e.g. `ari-run1-candidate-01.md`.
4. Tell the assistant; it will preview each in the lab (a tightly-scoped, preview-only mapping change may be proposed — and only made with your approval — to point the lab at candidate filenames without overwriting baselines), apply the Blender structural clinic if needed, and score against the Phase 1C rubric.

> Reminder: recording provenance is **not** approval; previewing is **not** approval. Only a separate governed, Tara-confirmed review may ever assign `approved asset`.

---

*End of Run 1 log. Documentation only — no assets generated/downloaded, no binaries committed, no approvals.*
