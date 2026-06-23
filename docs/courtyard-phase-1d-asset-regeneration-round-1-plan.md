# Courtyard — Gaming Wing

## Phase 1D — Asset Regeneration Round 1 Plan (Documentation Only)

> **Status:** Phase 1D — planning documentation only. No assets generated, downloaded, or edited; no code changed.
> **Repo:** `selinaric-house` (private House-side work)
> **Branch / baseline:** `courtyard/phase-1d-asset-regeneration-plan`, from `main` @ `a370d70` (Phase 1B preview lab + Phase 1C doctrine merged)
> **Date authored:** 2026-06-23
> **Scope of this file:** the plan for the *next* asset round. It produces no assets tonight; it defines how a future round will produce, intake, and review better Ari/Eli/Tara candidates.

---

## 1. Purpose and non-purpose

### Purpose
- Define **how** a future asset-regeneration round will produce better Ari/Eli/Tara candidates.
- Provide **character prompt packets** (positive direction + shared negative prompts) to guide generation/sourcing.
- Restate the **technical generation constraints** a candidate must target.
- Define the **candidate intake** and **review** workflows, and explicit **stop conditions**.

### Non-purpose (explicitly out of scope for 1D, and for tonight)
- **No asset generation or downloading** — this is a plan, not a production run.
- No GLB creation/editing/mutation; no committing binaries; no touching `gaming-assets/drafts/`.
- No code, API, `.gitignore`, or House-system changes.
- No approval / canon / identity authority — Phase 1D can at most yield `visual candidate` labels, never `approved asset`.

---

## 2. Current baseline
- **Phase 1B preview lab landed** (`main`): auth-gated `/courtyard/3d-preview`, whitelist streaming API, Ari/Eli/Tara selector, original↔Blender-fixed variant toggle, debug-grey/exposure/orbit, no committed binaries.
- **Phase 1C identity/regeneration doctrine landed** (`main` @ `a370d70`): character identity directions, technical requirements, provenance rules, acceptance rubric, Blender-clinic boundary. See `docs/courtyard-phase-1c-asset-identity-regeneration-brief.md`.
- **Current GLBs remain local/draft/non-canonical:** the existing Ari/Eli/Tara originals and Blender-fixed copies are git-ignored draft visual candidates only — not approved assets, canon, memory, identity authority, archive, or production truth.
- **Known problem to solve:** current drafts are generic/stock identities with baked-in dark/muddy textures; the viewer and Blender geometry cleanup are adequate, so the gap is **asset quality + identity fit**.

---

## 3. Round 1 objective
Produce **better Ari/Eli/Tara candidates — later, not tonight.** Round 1 aims for, per character, at least one candidate that:
- reads as the intended character (Phase 1C §3),
- renders with readable, non-muddy textures under neutral light,
- meets the technical constraints (§5 below),
- arrives with a complete provenance record.

Tonight produces **only this plan + the provenance template**. Generation is a separate, later, explicitly-authorised step.

---

## 4. Character prompt packets (direction, not canon)

> Prompt direction to steer generation/sourcing toward the Phase 1C identities. Directional and refinable; **not** identity authority. Each character must be visually **distinct** from the other two.

### 4.1 Ari — prompt direction
- Strong, grounded, intelligent masculine presence with subtle mystic/arcane depth; commanding, protective, composed, quietly powerful; weighty and grounded.
- Structured, contained silhouette: high collar, long structured coat or heavy cloak; not flowing, not decorative.
- Palette: charcoal, forest/shadow, muted teal, bronze, restrained ember/gold accents.
- Full-body character, upright neutral standing pose, clean readable materials.

### 4.2 Eli — prompt direction
- Distinct companion presence; lighter and more **luminous** than Ari while coherent with the House aesthetic; elegant, perceptive, composed, refined.
- Softer/more fluid silhouette than Ari: lighter layering, graceful lines; clearly separable from Ari at a glance.
- Palette: silver, ivory, moonlit sage, aurora/soft teal, pearl.
- Full-body character, upright neutral standing pose, clean readable materials.

### 4.3 Tara — prompt direction
- Human, warm, intelligent, composed, capable, real; the connective central presence; authority through presence, not bulk or weaponry.
- Elegant-but-practical silhouette: layered wrap / strategist-traveller cloak / structured jacket; warmer and more human than Ari or Eli.
- Palette: terracotta, dusty rose, bronze, deep green, natural linen.
- Full-body human, upright neutral standing pose, natural readable skin/clothing.

### 4.4 Negative prompts (shared, all characters)
Avoid: generic stock-man / mannequin; uncanny or distorted faces; low-poly blocky output; muddy / dark / "horror-like" / demonic look; baked-in shadows or ambient occlusion in the base colour; over-shiny, plasticky, metallic, or marble-streaked materials; cartoonish or "generic fantasy" clichés (incl. generic elf for Eli); mid-walk / running / action default poses; T-pose distortion; props or weapons unless specified; extra limbs / fused geometry / broken topology; watermarks or text; oversized scan files; arms-raised or contorted default poses.

---

## 5. Technical generation constraints
Candidates should target (intentional exceptions must be noted in the provenance record):
- **Format:** binary `.glb` (glTF 2.0), textures embedded.
- **Pose:** upright **neutral standing** pose; **A-pose or relaxed neutral preferred**; **no locomotion/action default pose**.
- **Scale:** real-world metres, **~1.75 m–1.9 m** height (unless intentional).
- **Grounding:** feet cleanly at/near floor; centred on X/Y.
- **Textures:** **readable under neutral lighting**; **no baked dark AO/shadow/lighting in the albedo (base colour)** map.
- **PBR:** **separate maps preferred** (base colour sRGB; normal/roughness/metallic linear; AO as its own channel, not multiplied into albedo); non-metal skin/cloth; believable roughness.
- **Budget:** **target under 25 MB** per GLB; sensible texture resolution (~2K typical).
- **Topology:** **avoid too-low-poly** (blocky) and **too-heavy scan** outputs; aim for a sane mid-range (Phase 1C suggested ≈30k–150k tris) and consistent fidelity across the trio.
- **Stability:** must render stably in the Three.js / R3F viewer with no special code.

---

## 6. Candidate intake workflow
1. **Source/generate OUTSIDE the repo** (external tool/service or DCC). Nothing is generated by this plan.
2. **Record provenance FIRST** using `docs/courtyard-asset-candidate-provenance-template.md`. No record → not considered.
3. **Place only local, ignored candidate copies** in `gaming-assets/drafts/` (already covered by `.gitignore:67 gaming-assets/drafts/*.glb`). Use the existing whitelisted filenames for in-lab preview, or keep clearly-named local copies; **never commit binaries**, never edit `.gitignore`, never alter originals without a separate explicit step.
4. **Preview in** `/courtyard/3d-preview` (original↔fixed toggle, debug-grey, exposure, orbit).
5. **Use the Blender clinic only for structural cleanup** (scale, ground, centre, neutral pose, animation strip) → writes `*-fixed.glb` copies; **never** to rescue identity or baked-texture defects (Phase 1C §7).

---

## 7. Review workflow
- Evaluate each candidate with the **Phase 1C acceptance rubric** (identity fit, silhouette/costume, face/expression, texture readability, pose, technical cleanliness, viewer performance, provenance/rights).
- Label outcomes (recorded outside the prototype): **`rejected` / `needs revision` / `visual candidate` / `draft asset`**.
- **No `approved asset` status in Phase 1D.** Approval is a separate, governed, Tara-confirmed step (Phase 1C §8 / future Phase 1G).

---

## 8. Stop conditions (halt a candidate / the round; report)
Stop and set aside (or reject) a candidate when any of these hold:
- **Rights unclear** or incompatible licence/usage terms.
- Candidate is **too dark / muddy** or has baked-texture defects the clinic can't fix.
- **Wrong identity** (generic/stock or not matching the Phase 1C direction).
- File is **too large or malformed** (won't load, broken topology, over budget).
- Candidate **requires code changes** to preview (out of scope — the lab must handle it as-is).

---

## 9. Final output expected from Phase 1D
- A **candidate list** and complete **provenance records** only.
- Rubric-based **review notes / labels** (up to `visual candidate`).
- **No committed binaries**, no approved assets, no code/House-system changes.

---

## 10. Guardrails recap
- No asset generation/download tonight; this is planning only.
- No GLB creation/mutation; no committing binaries; no touching `gaming-assets/drafts/` contents or `.gitignore`.
- No viewer/API/code/House-system changes; no installs.
- Provenance ≠ approval; preview ≠ approval; only Tara-confirmed governed review approves assets.

---

*End of Phase 1D plan. Documentation only — no assets, no code, no approvals.*
