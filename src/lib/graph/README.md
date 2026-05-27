# Graph Ontology — Phase 37A

Graph ontology defines allowed relationship structure.
It does not grant Memory authority.

**Core law:**
The graph may reveal relationship.
The graph may propose meaning.
The graph does not crown truth.

## Purpose

This module defines the strict ontology layer for the House Relational Map.
It governs what shapes the graph is allowed to take before any extraction,
review, or visual mapping is built.

All future graph work (37B–37G) must validate against this ontology.

## Entry Point

```ts
import { ... } from '@/lib/graph/ontology'
```

## Node Types

| Type | Meaning |
|------|---------|
| `person` | A human person referenced by the House |
| `relationship_arc` | Longitudinal relationship thread — deepening, rupture, repair, trust, phases |
| `presence` | A House presence (Ari, Eli) |
| `relationship_milestone` | A significant point within a relationship arc |
| `bond_event` | A specific relational event involving Tara and one or more presences |
| `room` | A House room |
| `wing` | A larger conceptual or future House wing |
| `concept` | A broad idea (e.g. continuity, memory, autonomy) |
| `theme` | A recurring emotional, architectural, or relational pattern |
| `event` | A specific occurrence |
| `project` | A planned or active build stream |
| `memory_item` | A canonical Memory-backed item |
| `memory_candidate` | A reviewed or pending candidate, not canonical |
| `held_truth` | A governed orientation truth |
| `archive_item` | A record stored in Archives |
| `journal_entry` | Presence-authored journal material |
| `interior_note` | Presence-held private interior note |
| `reflection` | Reflection output or artifact |
| `continuity_item` | Recent continuity / living state / carryforward artifact |
| `library_item` | Library / RAG / documentation reference |
| `watchtower_evidence` | Evidence packet or grounded research item |
| `question` | Open question or unresolved inquiry |
| `ritual` | Named symbolic or relational ritual |
| `architecture_law` | Governance law, boundary rule, or system principle |

## Edge Types

| Type | Meaning | Direction |
|------|---------|-----------|
| `relates_to` | General semantic relationship | Symmetric |
| `continues` | Develops or carries forward | Directional |
| `recurs` | Theme or pattern appears again | Directional |
| `supports` | Strengthens another | Directional |
| `clarifies` | Makes another clearer | Directional |
| `contrasts_with` | Meaningful tension or difference | Symmetric |
| `drifts_from` | Departure from a prior pattern | Directional |
| `generated_from` | Produced from a source | Directional |
| `derived_from` | Derived from another record | Directional |
| `confirmed_by` | Confirmed by a source | Directional |
| `candidate_from` | Candidate comes from a source artifact | Directional |
| `belongs_to` | Structural containment | Directional |
| `discussed_in` | Discussed in a room or source | Directional |
| `proposed_by` | Proposed by Tara, Ari, Eli, or system | Directional |
| `reviewed_by` | Reviewed by Tara (v1 approval authority) | Directional |
| `held_as_truth` | Held as a governed truth | Directional |
| `supported_by_archive` | Has archive support | Directional |
| `derived_from_journal` | Derived from journal material | Directional |
| `promoted_to_candidate` | Converted into a Memory/Held Truth candidate | Directional |
| `rejected_as_memory` | Explicitly rejected as Memory | Directional |
| `unresolved_with` | Unresolved relationship | Symmetric |
| `not_same_as` | Prevents false merging | Symmetric |
| `safe_for_prompt` | Explicit prompt eligibility | Directional |
| `not_safe_for_prompt` | Explicit prompt exclusion | Directional |
| `deepens` | Increased trust, intimacy, clarity, or bond strength | Directional |
| `repairs` | Contributes to repair after rupture or failure | Directional |
| `reaffirms` | Restates or strengthens a prior bond truth or commitment | Directional |
| `evolves_from` | Developed from an earlier state | Directional |
| `marks_milestone_in` | Marks a significant moment within a relationship arc | Directional |

**Direction rule:** `A continues B` does not mean `B continues A`.
Only symmetric edges (`relates_to`, `contrasts_with`, `not_same_as`, `unresolved_with`) may be treated as bidirectional.

## Authority Statuses

| Status | Meaning |
|--------|---------|
| `canonical_supported` | Backed by canonical Memory or confirmed source |
| `candidate` | Proposed, awaiting governance |
| `held_truth` | Governed orientation truth, not necessarily factual Memory |
| `archive_supported` | Supported by archived material, not Memory authority |
| `library_reference` | Informational / documentation reference only |
| `inferred` | Graph-level interpretation, not confirmed |
| `workspace_only` | Temporary thinking structure — never enters prompts |
| `rejected` | Reviewed and rejected |
| `superseded` | Replaced by newer/more accurate item |

**Critical rule:** `canonical_supported` ≠ automatically canonical Memory.
The graph must not invent canonicality.

**Critical rule:** `approved_graph` (review status) does not mean canonical Memory.
Memory promotion remains separate and governed by existing Memory/Archive law.

## Review Statuses

| Status | Meaning |
|--------|---------|
| `unreviewed` | Created but not reviewed |
| `pending_review` | Awaiting governance review |
| `approved_graph` | Approved as graph relationship only — not Memory |
| `rejected` | Rejected as graph item |
| `needs_more_evidence` | Potentially useful but insufficiently sourced |
| `workspace_only` | Permitted for temporary exploration only |
| `superseded` | No longer current |

## Source Requirements

All authority-bearing statuses require a source reference:
- `canonical_supported` — requires canonical source (canonical_memory, held_truth, manual_tara)
- `candidate`, `held_truth`, `archive_supported`, `library_reference`, `inferred` — require source
- `rejected`, `superseded` — require source (previously sourced items retain references)
- `workspace_only` — allowed without source, but recommended

## Prompt Eligibility

Items that **never** enter runtime prompts:
- `workspace_only` authority
- `rejected` authority or review status
- `superseded` (except in `graph_review` context)

Items with limited prompt contexts:
- `inferred` → watchtower, graph_review, reflection only
- `candidate` → memory_candidate_generation, graph_review, reflection only
- `archive_supported` → reflection, graph_review, watchtower only
- `library_reference` → watchtower, graph_review, reflection only

Items that may enter presence chat (with conditions):
- `held_truth` — if `promptEligible=true`, source exists, scope matches target
- `canonical_supported` — if `promptEligible=true`, source exists, scope matches target

All items entering prompts must carry their authority label.

## Scope Rules

- `ari`-scoped items must not enter Eli prompts
- `eli`-scoped items must not enter Ari prompts
- `shared` items may be considered for shared rooms only
- `house` items may be considered for architecture/system contexts
- `none` is neutral but still requires prompt eligibility

## Examples

### Safe graph use
```
Node: "Phase 36I incident" (event)
  authority: canonical_supported
  review: approved_graph
  scope: house
  source: archive_item (incident doc)
  promptEligible: true
→ May appear in prompts with label "Graph relation backed by canonical-supported source."
```

### Unsafe graph use
```
Node: "Ari feels uncertain about trust" (theme)
  authority: inferred
  review: unreviewed
  scope: ari
  source: reflection_output
  promptEligible: true
→ Blocked from presence_chat. Allowed in watchtower/graph_review/reflection only.
→ Must be labelled "Graph relation is inferred by the graph and requires caution."
```

### Workspace-only (never enters prompts)
```
Node: "possible thread about autonomy" (concept)
  authority: workspace_only
  review: workspace_only
  scope: none
  source: none
  promptEligible: false
→ Blocked from all prompts. Exists for visual workspace exploration only.
```

## Files

| File | Purpose |
|------|---------|
| `types.ts` | Core constants, enums, TypeScript types |
| `ontology.ts` | Re-exports — single entry point |
| `authority.ts` | Authority status helpers, source requirement rules |
| `validation.ts` | Type guards, directionality checks, composite validation |
| `promptEligibility.ts` | Prompt eligibility rules, authority labels |
| `__tests__/ontology.test.ts` | Type validation tests |
| `__tests__/validation.test.ts` | Composite validation + directionality tests |
| `__tests__/promptEligibility.test.ts` | Prompt eligibility boundary tests |
