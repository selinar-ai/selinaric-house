// Phase 43 5B — Pin-aware "Arrange Visible" layout.
//
// Layout is not graph meaning.
// Position is not relationship.
// Distance is not importance.
// Cluster is not truth.
//
// This is a PURE, deterministic layout function. It performs NO I/O, no DB,
// no fetch, no React, no Supabase, no scheduler, no LLM. It reads a set of
// currently-visible nodes/edges plus the current client layout (for pins) and
// returns new {x,y} positions for the UNPINNED VISIBLE nodes only.
//
// It never mutates graph_proposals, approved_graph, archive_graph, Memory,
// provenance, proposal status, or prompt eligibility. It returns coordinates —
// nothing else. Same visible set + same pins ⇒ byte-identical positions
// (no Math.random, no simulation, stable ordering by node key).

import type { GraphMapNode, GraphMapEdge } from './relationalMapTypes'
import type { RelationalMapLayoutData } from './relationalMapWorkspaceTypes'

// ─── Output shape ───────────────────────────────────────────────────────────

/** A computed position. Coordinates only — never a graph/proposal/status field. */
export type ArrangedPosition = { x: number; y: number }

/** Map of node key → computed position, for the unpinned visible nodes only. */
export type ArrangeVisibleResult = Record<string, ArrangedPosition>

// ─── Tunables (deterministic; no physics) ────────────────────────────────────

const CENTER_X = 600
const CENTER_Y = 400

// Overview ring
const OVERVIEW_BASE_RADIUS = 320
const OVERVIEW_GROWTH_PER_NODE = 18 // ring grows gently past 6 nodes
const OVERVIEW_GROWTH_THRESHOLD = 6

// Midlevel satellites around a coarse anchor
const MIDLEVEL_RING_CAPACITY = 8
const MIDLEVEL_BASE_RADIUS = 170
const MIDLEVEL_RING_GAP = 80

// Detail satellites around a midlevel/coarse anchor (tighter)
const DETAIL_RING_CAPACITY = 8
const DETAIL_BASE_RADIUS = 110
const DETAIL_RING_GAP = 60

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Deterministic point on a ring around a base position. */
function ringPoint(
  baseX: number,
  baseY: number,
  radius: number,
  angleIndex: number,
  angleCount: number
): ArrangedPosition {
  // angleCount is always >= 1; a lone member sits straight above its anchor.
  const angle = (2 * Math.PI * angleIndex) / angleCount - Math.PI / 2
  return {
    x: Math.round(baseX + radius * Math.cos(angle)),
    y: Math.round(baseY + radius * Math.sin(angle)),
  }
}

/**
 * Place `members` (already sorted deterministically) as concentric sub-rings
 * around a base position: `capacity` per ring, radius growing per ring.
 */
function placeSatellites(
  members: GraphMapNode[],
  baseX: number,
  baseY: number,
  capacity: number,
  baseRadius: number,
  ringGap: number,
  out: ArrangeVisibleResult
): void {
  const total = members.length
  for (let i = 0; i < total; i++) {
    const ring = Math.floor(i / capacity)
    const angleIndex = i % capacity
    // How many members share this ring (the last ring may be partial).
    const angleCount = Math.min(capacity, total - ring * capacity)
    const radius = baseRadius + ring * ringGap
    out[members[i].id] = ringPoint(baseX, baseY, radius, angleIndex, angleCount)
  }
}

// ─── Arrange Visible ────────────────────────────────────────────────────────

/**
 * Deterministic anchor-clustered radial layout over the currently-visible nodes.
 *
 * Contract:
 *  - Operates ONLY on the passed visible nodes/edges.
 *  - SKIPS pinned nodes entirely (never in the output; their saved position is
 *    left untouched by the caller) — but pinned nodes still act as FIXED
 *    ANCHORS that unpinned nodes cluster around.
 *  - Overview nodes stay readable & central (a ring around canvas centre).
 *  - Midlevel nodes cluster around their nearest coarse (overview) anchor.
 *  - Detail nodes cluster around their nearest midlevel anchor, else coarse.
 *  - Pure & deterministic: no Math.random, no simulation, stable ordering by
 *    node key. Returns {x,y} numbers only.
 *
 * @param visibleNodes  the nodes currently shown (already filtered/grain-toggled)
 * @param visibleEdges  the edges among the visible nodes
 * @param currentLayout the client layout — read ONLY for pin flags
 * @returns positions for the unpinned visible nodes (node key → {x,y})
 */
export function arrangeVisible(
  visibleNodes: GraphMapNode[],
  visibleEdges: GraphMapEdge[],
  currentLayout: RelationalMapLayoutData | null | undefined
): ArrangeVisibleResult {
  const out: ArrangeVisibleResult = {}
  if (visibleNodes.length === 0) return out

  const visibleIds = new Set(visibleNodes.map((n) => n.id))
  const grainById = new Map<string, string>()
  const nodeById = new Map<string, GraphMapNode>()
  for (const n of visibleNodes) {
    grainById.set(n.id, n.grainLevel)
    nodeById.set(n.id, n)
  }

  // Pin flags (only for nodes that are actually visible).
  const pinnedIds = new Set<string>()
  const layoutNodes = currentLayout?.nodes ?? {}
  for (const [id, entry] of Object.entries(layoutNodes)) {
    if (entry?.pinned && visibleIds.has(id)) pinnedIds.add(id)
  }

  // Degree + adjacency over visible edges only.
  const degree = new Map<string, number>()
  const neighbours = new Map<string, Set<string>>()
  for (const id of visibleIds) {
    degree.set(id, 0)
    neighbours.set(id, new Set())
  }
  for (const e of visibleEdges) {
    if (!visibleIds.has(e.fromNodeId) || !visibleIds.has(e.toNodeId)) continue
    if (e.fromNodeId === e.toNodeId) continue
    degree.set(e.fromNodeId, (degree.get(e.fromNodeId) ?? 0) + 1)
    degree.set(e.toNodeId, (degree.get(e.toNodeId) ?? 0) + 1)
    neighbours.get(e.fromNodeId)!.add(e.toNodeId)
    neighbours.get(e.toNodeId)!.add(e.fromNodeId)
  }

  // Deterministic "pick the most-connected, tie-break by node key" over an id list.
  const byDegreeThenKey = (a: string, b: string): number => {
    const da = degree.get(a) ?? 0
    const db = degree.get(b) ?? 0
    if (da !== db) return db - da
    return a < b ? -1 : a > b ? 1 : 0
  }

  // Partition VISIBLE nodes by grain. Anchors may be pinned or unpinned (they
  // just need a resolvable position); placement sets exclude pinned nodes.
  const allOverviewIds: string[] = []
  const overviewToPlace: GraphMapNode[] = []
  const midlevelToPlace: GraphMapNode[] = []
  const detailToPlace: GraphMapNode[] = []
  for (const n of visibleNodes) {
    if (n.grainLevel === 'overview') allOverviewIds.push(n.id)
    if (pinnedIds.has(n.id)) continue // pinned nodes are never repositioned
    if (n.grainLevel === 'overview') overviewToPlace.push(n)
    else if (n.grainLevel === 'midlevel') midlevelToPlace.push(n)
    else detailToPlace.push(n) // detail | evidence
  }

  const byKey = (a: GraphMapNode, b: GraphMapNode): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  overviewToPlace.sort(byKey)
  midlevelToPlace.sort(byKey)
  detailToPlace.sort(byKey)

  // Resolve a position for an anchor id: pinned anchors use their locked
  // saved position; freshly-placed anchors use the position we just computed.
  const anchorPosition = (id: string): ArrangedPosition | null => {
    if (pinnedIds.has(id)) {
      const saved = layoutNodes[id]
      if (saved) return { x: saved.x, y: saved.y }
    }
    return out[id] ?? null
  }

  // ── Coarse (overview) anchor for a midlevel/detail node ──────────────────
  const coarseAnchorId = (node: GraphMapNode): string | null => {
    // 1. Edge-nearest overview neighbour (highest degree, tie-break key).
    const overviewNbrs = [...(neighbours.get(node.id) ?? [])].filter(
      (nb) => grainById.get(nb) === 'overview'
    )
    if (overviewNbrs.length > 0) return overviewNbrs.sort(byDegreeThenKey)[0]

    // 2. Presence-scope coarse: highest-degree visible overview node sharing
    //    this node's presence scope. (Presence scope already encodes archive
    //    origin — velvet→ari, violet→eli — so this subsumes a source-archive
    //    tier without inventing a signal the render nodes don't carry.)
    const scopePool = allOverviewIds.filter(
      (id) => nodeById.get(id)?.presenceScope === node.presenceScope
    )
    if (scopePool.length > 0) return scopePool.sort(byDegreeThenKey)[0]

    // 3. Global coarse: highest-degree visible overview node overall.
    if (allOverviewIds.length > 0) return [...allOverviewIds].sort(byDegreeThenKey)[0]

    // 4. No coarse anchor exists in the visible set.
    return null
  }

  // ── OVERVIEW: readable ring around canvas centre ─────────────────────────
  if (overviewToPlace.length === 1) {
    out[overviewToPlace[0].id] = { x: CENTER_X, y: CENTER_Y }
  } else if (overviewToPlace.length > 1) {
    const n = overviewToPlace.length
    const radius =
      OVERVIEW_BASE_RADIUS +
      Math.max(0, n - OVERVIEW_GROWTH_THRESHOLD) * OVERVIEW_GROWTH_PER_NODE
    for (let i = 0; i < n; i++) {
      out[overviewToPlace[i].id] = ringPoint(CENTER_X, CENTER_Y, radius, i, n)
    }
  }

  // ── MIDLEVEL: satellites around nearest coarse anchor ────────────────────
  const midGroups = new Map<string, GraphMapNode[]>()
  for (const node of midlevelToPlace) {
    const key = coarseAnchorId(node) ?? '__center__'
    if (!midGroups.has(key)) midGroups.set(key, [])
    midGroups.get(key)!.push(node)
  }
  for (const anchorId of [...midGroups.keys()].sort()) {
    const members = midGroups.get(anchorId)! // already node-key sorted (source order)
    const base = anchorId === '__center__' ? null : anchorPosition(anchorId)
    const baseX = base?.x ?? CENTER_X
    const baseY = base?.y ?? CENTER_Y
    placeSatellites(
      members,
      baseX,
      baseY,
      MIDLEVEL_RING_CAPACITY,
      MIDLEVEL_BASE_RADIUS,
      MIDLEVEL_RING_GAP,
      out
    )
  }

  // ── DETAIL: satellites around nearest midlevel anchor, else coarse ───────
  const detailAnchorId = (node: GraphMapNode): string | null => {
    const midNbrs = [...(neighbours.get(node.id) ?? [])].filter(
      (nb) => grainById.get(nb) === 'midlevel'
    )
    if (midNbrs.length > 0) return midNbrs.sort(byDegreeThenKey)[0]
    return coarseAnchorId(node)
  }
  const detailGroups = new Map<string, GraphMapNode[]>()
  for (const node of detailToPlace) {
    const key = detailAnchorId(node) ?? '__center__'
    if (!detailGroups.has(key)) detailGroups.set(key, [])
    detailGroups.get(key)!.push(node)
  }
  for (const anchorId of [...detailGroups.keys()].sort()) {
    const members = detailGroups.get(anchorId)!
    const base = anchorId === '__center__' ? null : anchorPosition(anchorId)
    const baseX = base?.x ?? CENTER_X
    const baseY = base?.y ?? CENTER_Y
    placeSatellites(
      members,
      baseX,
      baseY,
      DETAIL_RING_CAPACITY,
      DETAIL_BASE_RADIUS,
      DETAIL_RING_GAP,
      out
    )
  }

  return out
}
