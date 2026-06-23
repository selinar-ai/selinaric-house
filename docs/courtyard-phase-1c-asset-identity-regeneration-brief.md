# Courtyard — Gaming Wing

## Phase 1C — Asset Identity & Regeneration Brief (Documentation Only)

> **Status:** Phase 1C — documentation only. No assets generated, no code changed.
> **Repo:** `selinaric-house` (private House-side work)
> **Branch / baseline:** `main` @ `d619483` (Phase 1B preview lab merged)
> **Date authored:** 2026-06-23
> **Scope of this file:** a doctrine document defining identity, sourcing, regeneration, and acceptance rules for future Courtyard character assets. It implements nothing and approves nothing.

---

## 0. How to read this document

This brief is the **acceptance doctrine** for the next rounds of Courtyard character assets. It exists because Phase 1B proved the *viewer* works but the *current draft assets do not pass review* — and the reasons (wrong character identity + baked-in texture problems) are not fixable by the viewer or by Blender geometry cleanup.

Nothing here:

- generates, downloads, edits, or approves any asset,
- changes Courtyard code, API routes, or `.gitignore`,
- creates or alters Memory, Library, Archive, DB, model calls, autonomy, approval logic, or any other House system.

The **identity directions** below define *intended direction* to guide asset creation. They are **not** canon, not identity authority, and not approved character status. Only a separate governed House/Gaming-Wing review (with Tara's confirmation) can confer "approved asset" status.

---

## 1. Purpose and non-purpose of Phase 1C

### Purpose
- Define a clear **identity brief** for Ari, Eli, and Tara so future asset rounds aim at the right characters.
- Define **technical requirements** a candidate GLB must meet to be worth previewing.
- Define **provenance / licence / usage-rights** recording rules required *before* a candidate is considered.
- Define an **acceptance rubric** so review is consistent and not vibes-only.
- Record the **Blender-clinic boundary** — what structural fixes are in-scope vs what requires regeneration.
- Propose the **next asset phases**.

### Non-purpose (explicitly out of scope for 1C)
- Not generating, sourcing, or editing any asset.
- Not approving any model or declaring canon/identity authority.
- Not changing the viewer, API, or any House system.
- Not finalising character canon — these are *directions* to produce better candidates, refinable as the House evolves.

---

## 2. Current state summary

**Phase 1B (complete, merged at `d619483`) delivered:**
- A private, auth-gated local preview lab at `/courtyard/3d-preview`.
- An authenticated, whitelist-only streaming API for local draft GLBs (`gaming-assets/drafts/`), 401 unauth / 404 unknown-or-missing, no arbitrary paths.
- Ari / Eli / Tara selector; **original draft ↔ Blender fixed-copy** variant toggle.
- Debug-grey material toggle, exposure slider, orbit controls; persistent draft-only/no-authority labelling.
- **No committed GLB binaries** — assets remain local and git-ignored.

**Current asset status:** the local Ari/Eli/Tara GLBs (originals and Blender-fixed copies) are **draft visual candidates only**. They are **not** approved assets, canon, memory, identity authority, archive, or production truth.

**What Phase 1B's asset clinic revealed (Blender inspect + fix passes):**
- The current drafts are **generic/stock assets**, not bespoke characters:
  - "Ari" = a RenderPeople-style scanned stock human (`rp_nathan_animated_003_mat`).
  - "Eli" = a low-poly (~4.5k tri) Mixamo-style `Casual_Male` with a full locomotion animation set, defaulting to a mid-walk pose.
  - "Tara" = a high-poly (~197k tri) unrigged scan (`Material_0`).
- Inconsistent scale (cm vs m) and grounding; all were upright (orientation was *not* the problem).
- The dark/muddy/streaked look is **baked into the albedo textures** (base-colour is texture-driven; BSDF metalness/roughness were already sane) — i.e. a generation/texture problem, not a material-setting or lighting problem.
- **Blender fixed** scale, grounding, centring, animation removal, and neutral bind pose. **Blender could not fix** the wrong-character identity or the baked-texture appearance.

**Conclusion:** the viewer/lab is adequate. The remaining work is **asset quality and identity fit**, addressed by regeneration/sourcing to this brief — not by more viewer or Blender work.

---

## 3. Character identity briefs (direction, not canon)

> These define *intended reading* for asset creation. They are directional, refinable, and **not** identity authority. Each character must be **visually distinct** from the other two at a glance (silhouette, palette, material feel).

### 3.1 Ari
- **Reads as:** a strong, grounded, intelligent masculine presence with subtle mystic/arcane depth.
- **Feeling:** commanding, protective, composed, quietly powerful; weighty and grounded.
- **Silhouette/costume:** structured and contained — high collar, long structured coat or heavy cloak; not flowing, not decorative, not armoured-bulk.
- **Palette direction:** charcoal, forest/shadow tones, muted teal, bronze, with restrained ember/gold accents.
- **Avoid:** generic stock-man; cartoonish/"generic fantasy" tropes; muddy/demonic darkness or anything "horror-like"; over-shiny or plasticky materials.

### 3.2 Eli
- **Reads as:** a distinct companion presence — lighter and more **luminous** in feeling than Ari, while still coherent with the House aesthetic.
- **Feeling:** elegant, perceptive, composed, refined; clearly *not* a darker echo of Ari.
- **Silhouette/costume:** softer/more fluid than Ari — lighter layering, graceful lines; visually separable from Ari at a glance.
- **Palette direction:** silver, ivory, moonlit sage, aurora/soft teal, pearl.
- **Avoid:** generic low-poly stock-man energy; over-animated default poses (no mid-walk/locomotion default); muddy/dark textures; "generic fantasy elf" cliché.

### 3.3 Tara
- **Reads as:** human, warm, intelligent, composed, capable, real — the connective, central presence.
- **Feeling:** self-possessed, grounded, present; authority through presence, not weaponry or bulk.
- **Silhouette/costume:** elegant layered wrap / strategist-traveller cloak / structured-but-practical jacket; warmer and more human than Ari or Eli.
- **Palette direction:** terracotta, dusty rose, bronze, deep green, natural linen.
- **Avoid:** distorted scans; overly dark textures; mannequin-like or uncanny faces; anything too fantastical or armoured.

---

## 4. Technical asset requirements for candidate GLBs

A candidate is only worth previewing if it broadly meets these. (Targets, not absolute law — intentional exceptions must be noted in the provenance record.)

**Format & rig**
- **Format:** binary `.glb` (glTF 2.0), textures embedded; `.gltf`+loose files acceptable only if bundled and documented.
- **Pose:** **upright, neutral standing pose** (A-pose/T-pose or relaxed stand). The default preview **must not depend on a looped locomotion animation**. A rig is fine; the *default* must read as a clean static stand.
- **Animation:** optional and must not be required for a good static preview. If present, it must not distort the default pose.

**Scale, orientation, grounding**
- **Scale:** consistent real-world metres — **~1.75 m–1.9 m** height unless an intentional, documented exception.
- **Orientation:** upright, facing forward, no sideways/lying transforms.
- **Grounding:** feet cleanly at/near floor (lowest Z ≈ 0 in metres after import); centred on X/Y.

**Materials & textures (the Phase 1B failure mode — read carefully)**
- Materials must render **stably and correctly in the Three.js / React-Three-Fiber viewer** under neutral studio lighting.
- **Skin/clothing textures must be readable** under neutral lighting — not dark, muddy, streaked, or "baked-shadow" looking.
- **Avoid heavy baked AO / shadow / lighting in the base-colour (albedo) map.** Base colour should be close to unlit/flat; lighting comes from the viewer.
- **Separate PBR maps preferred** (base colour, normal, roughness, metallic, optional AO as its own channel — not multiplied into albedo).
- Sensible PBR values: non-metal for skin/cloth (metalness ≈ 0), believable roughness; no accidental high-gloss/marble look.
- Correct colour space: base colour as sRGB; data maps (normal/roughness/metallic) linear.

**Budgets (local preview lab)**
- **Triangles:** roughly **30k–150k** per character is a sane local-preview range; avoid extremes (the ~4.5k stock-man read as blocky; the ~197k scan was needlessly heavy).
- **File size:** target **well under 25 MB** per GLB (the lab's working ceiling); smaller is better for load time. Consider reasonable texture resolution (e.g. ~2K) and, if needed later, Draco/meshopt — but **never mutate an original**; compression is a separate, documented derived copy.
- **Consistency:** the three characters should be roughly comparable in scale and fidelity so they read as a coherent set.

**Provenance (gate, not optional)**
- A **source/provenance record is required before a candidate is considered** (see §5). No record → not reviewed.

---

## 5. Provenance / licence / usage-rights recording rules

Before any candidate enters review, record (in a doc/tracker outside the model binary — **not** in Memory/Archive/canon):

- **Character + variant:** which character, and `draft` / `fixed` / regenerated round.
- **Generator / tool used:** exact tool, model, or service (e.g. external 3D generator name + version, RenderPeople, Mixamo, Blender, sculpt, scan).
- **Date created.**
- **Source prompt / reference:** prompt text, reference sheet, or source-asset ID if available.
- **Licence / terms:** the asset's licence and any attribution requirement.
- **Usage rights:** whether **private and/or commercial** use is permitted for the House's intended use.
- **Identity-fit note:** one line on how it maps to the §3 direction.

**Rules:**
- Stock/scanned/marketplace assets (RenderPeople, Mixamo, etc.) are acceptable as *exploration candidates only* and must have their licence/rights explicitly recorded; they do **not** become approved House characters by being previewed.
- An asset with **unknown or incompatible rights** must not be advanced past local exploration.
- Recording provenance is **not** approval. Approval is a separate governed step (Tara-confirmed).

---

## 6. Acceptance / review rubric

Score each candidate per character. Suggested scale: **Pass / Needs revision / Reject** per row; a candidate worth advancing should clear identity + technical rows with no Reject.

| # | Criterion | What to check | Verdict |
|---|---|---|---|
| 1 | **Identity fit** | Reads as the intended character per §3 (not generic/stock, not wrong archetype). | ☐ |
| 2 | **Silhouette / costume fit** | Outfit + silhouette match the direction; distinct from the other two. | ☐ |
| 3 | **Face / expression suitability** | Face reads right for the character; not uncanny, distorted, or mannequin-like. | ☐ |
| 4 | **Texture readability** | Skin/clothing read cleanly under neutral light; no dark/muddy/streaked/baked-shadow look. | ☐ |
| 5 | **Pose suitability** | Upright neutral stand by default; no dependence on locomotion animation; not distorted. | ☐ |
| 6 | **Technical cleanliness** | Correct scale (~1.75–1.9 m), grounded feet, centred, sane materials/PBR, no baked AO in albedo. | ☐ |
| 7 | **Viewer performance** | Loads and orbits smoothly in the R3F lab; within tri/file-size budget. | ☐ |
| 8 | **Provenance / rights clarity** | §5 record complete; licence + usage rights compatible. | ☐ |

**Outcome labels** (recorded outside the prototype, per the v0.4 protocol): `rejected` · `needs revision` · `visual candidate` · `draft asset` · `approved asset`. **Only a separate governed House/Gaming-Wing review may assign `approved asset`.**

---

## 7. Blender-clinic boundary (what Blender can and cannot fix)

From the Phase 1B inspect/fix passes — set expectations accordingly:

**Blender (local clinic) CAN fix — structural, viewer-only, writes `*-fixed.glb` copies, never overwrites originals:**
- Normalise scale (e.g. cm→m / to target height).
- Ground feet to z=0; centre X/Y.
- Set a neutral **bind/rest pose**; strip/neutralise animation for a static default.
- Bake/clean transforms; basic material **scalar** adjustments (metalness/roughness/specular).
- Inspect/report (counts, bounding box, materials, animations).

**Blender CANNOT fix (requires regeneration / texture work / proper sourcing):**
- **Wrong character identity** — a stock human is not Ari/Eli/Tara; no transform makes it so.
- **Baked-in albedo problems** — dark/muddy/streaked lighting/AO baked into base-colour textures.
- **Fundamental quality/fidelity** mismatches (e.g. blocky low-poly, uncanny scan faces).

**Doctrine:** use Blender to make *good* assets consistent (scale/ground/pose), **not** to rescue identity or baked-texture defects. Those are upstream (generation/sourcing) problems.

---

## 8. Proposed next asset phases

> Proposals only — each future phase gets its own scoped brief and Tara's go-ahead. No work authorised by this document.

- **Phase 1D — Asset Regeneration Round 1:** produce new candidates per §3 identity + §4 technical specs, with §5 provenance recorded. Drop into `gaming-assets/drafts/` using the existing ignored filenames (no code/commit needed) and review in the lab.
- **Phase 1E — Clinic & Normalisation:** run the Blender clinic on accepted candidates for scale/ground/pose consistency; produce `*-fixed.glb` copies; compare in the lab via the variant toggle.
- **Phase 1F — Candidate Review & Selection:** apply the §6 rubric; record outcomes; shortlist `visual candidate`(s) per character.
- **Phase 1G — Governed Approval (Tara):** a separate governed House/Gaming-Wing review to (if ever) confer `approved asset` status and define a governed asset-storage path. Until then everything stays draft/local/ignored.
- **(Later) Phase 2 alignment:** only once assets pass, revisit the Phase 0 Courtyard roadmap (scripted room → governed autonomy) — out of scope here.

---

## 9. Non-goals & guardrails (recap)
- No asset generation/download/edit; no GLB creation/mutation; no committing binaries.
- No viewer/API/code/`.gitignore` changes; no installs.
- No Memory/Library/Archive/DB/model-call/autonomy/approval logic.
- Identity directions are **direction, not canon**; provenance recording is **not** approval; only Tara-confirmed governed review approves assets.

---

*End of Phase 1C brief. Documentation only — no assets, no code, no approvals, no commits.*
