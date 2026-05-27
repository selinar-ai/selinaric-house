'use client'

// Phase 37D — Relational Map
//
// Read-only graph canvas from approved graph proposals.
// Not Memory. Not Archive authority. Not prompt truth.
//
// The graph may reveal relationship.
// The graph does not crown truth.

import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import RelationalMapGovernanceBanner from '@/components/graph/RelationalMapGovernanceBanner'
import RelationalMapToolbar, {
  type ViewMode,
  type MapFilterState,
  BLANK_MAP_FILTERS,
} from '@/components/graph/RelationalMapToolbar'
import RelationalMapInspector, {
  type InspectorSelection,
} from '@/components/graph/RelationalMapInspector'
import RelationalMapLegend from '@/components/graph/RelationalMapLegend'
import RelationalMapEmptyState from '@/components/graph/RelationalMapEmptyState'
import RelationalMapTableView from '@/components/graph/RelationalMapTableView'
import type { RelationalMapResponse, GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'
import type { RelationalMapCanvasHandle } from '@/components/graph/RelationalMapCanvas'

// Dynamic import for @xyflow/react — isolate bundle impact to this page
const RelationalMapCanvas = lazy(() => import('@/components/graph/RelationalMapCanvas'))

// ─── Component ─────────────────────────────────────────────────────────────

export default function RelationalMapPage() {
  const [data, setData] = useState<RelationalMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [filters, setFilters] = useState<MapFilterState>(BLANK_MAP_FILTERS)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [lastLoaded, setLastLoaded] = useState<string | null>(null)
  const canvasRef = useRef<RelationalMapCanvasHandle>(null)

  // ─── Fetch data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.nodeType) params.set('node_type', filters.nodeType)
      if (filters.edgeType) params.set('edge_type', filters.edgeType)
      if (filters.presenceScope) params.set('presence_scope', filters.presenceScope)
      if (filters.authorityStatus) params.set('authority_status', filters.authorityStatus)
      if (filters.sourceType) params.set('source_type', filters.sourceType)
      if (filters.search) params.set('search', filters.search)
      params.set('limit', '500')

      const resp = await fetch(`/api/relational-map?${params.toString()}`)
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${resp.status}`)
      }

      const result: RelationalMapResponse = await resp.json()
      setData(result)
      setLastLoaded(
        new Date().toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
        }) + ', ' + new Date().toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit',
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load relational map')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ─── Client-side search filter ───────────────────────────────────────────
  // Server already filters by search, but for instant feedback we also filter
  // nodes/edges client-side if search is active

  const filteredNodes = useMemo(() => {
    if (!data) return []
    if (!filters.search) return data.nodes
    const term = filters.search.toLowerCase()
    return data.nodes.filter(n =>
      n.label.toLowerCase().includes(term) ||
      n.nodeType.toLowerCase().includes(term) ||
      n.presenceScope.toLowerCase().includes(term)
    )
  }, [data, filters.search])

  const filteredEdges = useMemo(() => {
    if (!data) return []
    const nodeIds = new Set(filteredNodes.map(n => n.id))
    // Only show edges whose both endpoints are visible
    return data.edges.filter(e =>
      nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
    )
  }, [data, filteredNodes])

  // ─── Inspector selection ─────────────────────────────────────────────────

  const inspectorSelection: InspectorSelection = useMemo(() => {
    if (selectedNodeId) {
      const node = filteredNodes.find(n => n.id === selectedNodeId)
      if (node) return { type: 'node', node }
    }
    if (selectedEdgeId) {
      const edge = filteredEdges.find(e => e.id === selectedEdgeId)
      if (edge) return { type: 'edge', edge }
    }
    return null
  }, [selectedNodeId, selectedEdgeId, filteredNodes, filteredEdges])

  // ─── Scope count ─────────────────────────────────────────────────────────

  const scopeCount = useMemo(() => {
    if (!data) return 0
    const scopes = new Set(data.nodes.map(n => n.presenceScope))
    return scopes.size
  }, [data])

  const sourceCount = useMemo(() => {
    if (!data) return 0
    const sourceIds = new Set(data.sources.map(s => s.sourceId))
    return sourceIds.size
  }, [data])

  // ─── Export ──────────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!data) return

    const exportData = {
      exported_at: new Date().toISOString(),
      filters,
      nodes: filteredNodes,
      edges: filteredEdges,
      proposals: data.proposals,
      sources: data.sources,
      diagnostics: data.diagnostics,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relational-map-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, filters, filteredNodes, filteredEdges])

  // ─── Selection handlers ──────────────────────────────────────────────────

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    if (nodeId) setSelectedEdgeId(null)
  }, [])

  const handleSelectEdge = useCallback((edgeId: string | null) => {
    setSelectedEdgeId(edgeId)
    if (edgeId) setSelectedNodeId(null)
  }, [])

  const handleCloseInspector = useCallback(() => {
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [])

  // Table view selection helpers
  const handleTableSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }, [])

  const handleTableSelectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────

  const isEmpty = !loading && data && data.nodes.length === 0 && data.edges.length === 0
  const hasData = !loading && data && (data.nodes.length > 0 || data.edges.length > 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-text-primary text-xl font-display">Relational Map</h1>
          <p className="text-text-muted text-xs font-body mt-1">
            Phase 37D — v1
          </p>
        </div>
        <RelationalMapGovernanceBanner />
        <RelationalMapToolbar
          filters={filters}
          onFiltersChange={setFilters}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onExport={handleExport}
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onFitView={() => canvasRef.current?.fitView()}
          hasData={!!hasData}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-xs font-body animate-pulse">Loading graph…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <button
              onClick={fetchData}
              className="text-text-muted text-xs hover:text-text-secondary transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <RelationalMapEmptyState />}

      {/* Main content */}
      {hasData && (
        <div className="flex-1 flex overflow-hidden">
          {/* Graph or Table */}
          {viewMode === 'graph' ? (
            <div className="flex-1 relative">
              <Suspense fallback={
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-text-muted text-xs font-body animate-pulse">Loading canvas…</p>
                </div>
              }>
                <RelationalMapCanvas
                  ref={canvasRef}
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  selectedNodeId={selectedNodeId}
                  selectedEdgeId={selectedEdgeId}
                  onSelectNode={handleSelectNode}
                  onSelectEdge={handleSelectEdge}
                />
              </Suspense>
              <RelationalMapLegend
                nodeCount={filteredNodes.length}
                edgeCount={filteredEdges.length}
                scopeCount={scopeCount}
                sourceCount={sourceCount}
                lastLoaded={lastLoaded}
              />
            </div>
          ) : (
            <RelationalMapTableView
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={handleTableSelectNode}
              onSelectEdge={handleTableSelectEdge}
            />
          )}

          {/* Inspector */}
          <RelationalMapInspector
            selection={inspectorSelection}
            proposals={data?.proposals ?? []}
            sources={data?.sources ?? []}
            auditEvents={data?.auditEvents ?? []}
            allNodes={filteredNodes}
            onClose={handleCloseInspector}
          />
        </div>
      )}

      {/* Diagnostics warnings */}
      {data && data.diagnostics.warnings.length > 0 && (
        <div className="shrink-0 px-6 py-2 border-t border-house-border/30">
          <details className="text-[10px]">
            <summary className="text-text-muted cursor-pointer hover:text-text-secondary">
              {data.diagnostics.warnings.length} diagnostic warning(s)
              {data.diagnostics.skippedProposals > 0 && `, ${data.diagnostics.skippedProposals} skipped`}
            </summary>
            <ul className="mt-1 space-y-0.5 text-text-muted">
              {data.diagnostics.warnings.map((w, i) => (
                <li key={i} className="font-mono">{w}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  )
}
