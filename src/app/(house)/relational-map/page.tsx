'use client'

// Phase 37E — Relational Map with Workspace Support
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// The graph may reveal relationship.
// The graph does not crown truth.
//
// Workspace layout is visual metadata only.
// Only relational_map_workspaces is written.

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
import RelationalMapWorkspaceBar from '@/components/graph/RelationalMapWorkspaceBar'
import type { RelationalMapResponse, GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'
import type { RelationalMapCanvasHandle } from '@/components/graph/RelationalMapCanvas'
import type {
  RelationalMapWorkspace,
  RelationalMapWorkspaceScope,
  RelationalMapLayoutData,
  RelationalMapNodeLayout,
} from '@/lib/graph/relationalMapWorkspaceTypes'

// Dynamic import for @xyflow/react — isolate bundle impact to this page
const RelationalMapCanvas = lazy(() => import('@/components/graph/RelationalMapCanvas'))

// ─── Helpers ──────────────────────────────────────────────────────────────

const EMPTY_LAYOUT: RelationalMapLayoutData = { version: 1, nodes: {}, clusters: [] }

function deepCloneLayout(layout: RelationalMapLayoutData): RelationalMapLayoutData {
  return JSON.parse(JSON.stringify(layout))
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function RelationalMapPage() {
  // Graph data state
  const [data, setData] = useState<RelationalMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [filters, setFilters] = useState<MapFilterState>(BLANK_MAP_FILTERS)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [lastLoaded, setLastLoaded] = useState<string | null>(null)
  const canvasRef = useRef<RelationalMapCanvasHandle>(null)

  // Workspace state (37E)
  const [workspaces, setWorkspaces] = useState<RelationalMapWorkspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [arrangeMode, setArrangeMode] = useState(false)
  const [localLayout, setLocalLayout] = useState<RelationalMapLayoutData>(deepCloneLayout(EMPTY_LAYOUT))
  const [isDirty, setIsDirty] = useState(false)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

  // ─── Fetch graph data ────────────────────────────────────────────────────

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

  // ─── Fetch workspaces ────────────────────────────────────────────────────

  const fetchWorkspaces = useCallback(async () => {
    try {
      const resp = await fetch('/api/relational-map/workspaces?status=active')
      if (!resp.ok) return
      const result = await resp.json()
      setWorkspaces(result.workspaces ?? [])
    } catch {
      // Workspace fetch failure is non-critical — page still works with default layout
    }
  }, [])

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  // ─── Client-side search filter ───────────────────────────────────────────

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
    return data.edges.filter(e =>
      nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
    )
  }, [data, filteredNodes])

  // ─── Skipped node keys ──────────────────────────────────────────────────

  const skippedNodeKeys = useMemo(() => {
    if (!localLayout?.nodes) return []
    const visibleIds = new Set(filteredNodes.map(n => n.id))
    return Object.keys(localLayout.nodes).filter(k => !visibleIds.has(k))
  }, [localLayout, filteredNodes])

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

  // Node layout for inspector
  const inspectorNodeLayout: RelationalMapNodeLayout | null = useMemo(() => {
    if (!selectedNodeId) return null
    return localLayout?.nodes?.[selectedNodeId] ?? null
  }, [selectedNodeId, localLayout])

  // ─── Scope & source counts ──────────────────────────────────────────────

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

    const exportData: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      filters,
      nodes: filteredNodes,
      edges: filteredEdges,
      proposals: data.proposals,
      sources: data.sources,
      diagnostics: data.diagnostics,
    }

    // Optionally include workspace layout metadata
    if (activeWorkspaceId) {
      exportData.workspace_layout = {
        note: 'Includes visual workspace metadata only. Not graph authority.',
        layout: localLayout,
      }
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relational-map-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [data, filters, filteredNodes, filteredEdges, activeWorkspaceId, localLayout])

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

  const handleTableSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
  }, [])

  const handleTableSelectEdge = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
  }, [])

  // ─── Workspace handlers (37E) ───────────────────────────────────────────

  const handleSelectWorkspace = useCallback(async (id: string | null) => {
    if (isDirty && !window.confirm('You have unsaved layout changes. Discard them?')) {
      return
    }

    setActiveWorkspaceId(id)
    setIsDirty(false)

    if (!id) {
      // Reset to empty/default layout
      setLocalLayout(deepCloneLayout(EMPTY_LAYOUT))
      return
    }

    // Load workspace
    setWorkspaceLoading(true)
    try {
      const resp = await fetch(`/api/relational-map/workspaces/${id}`)
      if (!resp.ok) throw new Error('Failed to load workspace')
      const result = await resp.json()
      const ws = result.workspace as RelationalMapWorkspace
      setLocalLayout(ws.layoutData ?? deepCloneLayout(EMPTY_LAYOUT))

      // Apply saved filter preset if present
      if (ws.filterPreset && Object.keys(ws.filterPreset).length > 0) {
        setFilters({
          nodeType: ws.filterPreset.nodeType ?? '',
          edgeType: ws.filterPreset.edgeType ?? '',
          presenceScope: ws.filterPreset.presenceScope ?? '',
          authorityStatus: ws.filterPreset.authorityStatus ?? '',
          sourceType: ws.filterPreset.sourceType ?? '',
          search: ws.filterPreset.search ?? '',
        })
      }
    } catch {
      setLocalLayout(deepCloneLayout(EMPTY_LAYOUT))
    } finally {
      setWorkspaceLoading(false)
    }
  }, [isDirty])

  const handleToggleArrangeMode = useCallback(() => {
    if (arrangeMode && isDirty) {
      if (!window.confirm('You have unsaved layout changes. Leave Arrange Mode and discard?')) {
        return
      }
      // Reload current workspace layout
      if (activeWorkspaceId) {
        handleSelectWorkspace(activeWorkspaceId)
      } else {
        setLocalLayout(deepCloneLayout(EMPTY_LAYOUT))
        setIsDirty(false)
      }
    }
    setArrangeMode(prev => !prev)
  }, [arrangeMode, isDirty, activeWorkspaceId, handleSelectWorkspace])

  const handleNodeDragStop = useCallback((nodeId: string, x: number, y: number) => {
    setLocalLayout(prev => {
      const next = deepCloneLayout(prev)
      const existing = next.nodes[nodeId]
      next.nodes[nodeId] = {
        x,
        y,
        pinned: existing?.pinned ?? false,
      }
      return next
    })
    setIsDirty(true)
  }, [])

  const handleTogglePin = useCallback((nodeId: string) => {
    setLocalLayout(prev => {
      const next = deepCloneLayout(prev)
      const existing = next.nodes[nodeId]
      if (existing) {
        existing.pinned = !existing.pinned
      } else {
        // Node not yet in layout — can't pin without position
        return prev
      }
      return next
    })
    setIsDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!activeWorkspaceId) return
    setWorkspaceLoading(true)
    try {
      const currentFilters: Record<string, string> = {}
      if (filters.nodeType) currentFilters.nodeType = filters.nodeType
      if (filters.edgeType) currentFilters.edgeType = filters.edgeType
      if (filters.presenceScope) currentFilters.presenceScope = filters.presenceScope
      if (filters.authorityStatus) currentFilters.authorityStatus = filters.authorityStatus
      if (filters.sourceType) currentFilters.sourceType = filters.sourceType
      if (filters.search) currentFilters.search = filters.search

      const resp = await fetch(`/api/relational-map/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layoutData: localLayout,
          filterPreset: currentFilters,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save workspace')
      }
      setIsDirty(false)
      fetchWorkspaces() // Refresh workspace list
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save workspace')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [activeWorkspaceId, localLayout, filters, fetchWorkspaces])

  const handleSaveAs = useCallback(async (name: string, scope: RelationalMapWorkspaceScope) => {
    setWorkspaceLoading(true)
    try {
      const currentFilters: Record<string, string> = {}
      if (filters.nodeType) currentFilters.nodeType = filters.nodeType
      if (filters.edgeType) currentFilters.edgeType = filters.edgeType
      if (filters.presenceScope) currentFilters.presenceScope = filters.presenceScope
      if (filters.authorityStatus) currentFilters.authorityStatus = filters.authorityStatus
      if (filters.sourceType) currentFilters.sourceType = filters.sourceType
      if (filters.search) currentFilters.search = filters.search

      const resp = await fetch('/api/relational-map/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          workspaceScope: scope,
          layoutData: localLayout,
          filterPreset: currentFilters,
        }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to create workspace')
      }
      const result = await resp.json()
      const newWs = result.workspace as RelationalMapWorkspace
      setActiveWorkspaceId(newWs.id)
      setIsDirty(false)
      fetchWorkspaces() // Refresh workspace list
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to create workspace')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [localLayout, filters, fetchWorkspaces])

  const handleResetLayout = useCallback(() => {
    setLocalLayout(deepCloneLayout(EMPTY_LAYOUT))
    setIsDirty(true)
  }, [])

  const handleArchiveWorkspace = useCallback(async (id: string) => {
    if (!window.confirm('Archive this workspace? It will no longer appear in the selector.')) {
      return
    }
    setWorkspaceLoading(true)
    try {
      const resp = await fetch(`/api/relational-map/workspaces/${id}`, {
        method: 'DELETE',
      })
      if (!resp.ok) throw new Error('Failed to archive workspace')
      setActiveWorkspaceId(null)
      setLocalLayout(deepCloneLayout(EMPTY_LAYOUT))
      setIsDirty(false)
      fetchWorkspaces()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to archive workspace')
    } finally {
      setWorkspaceLoading(false)
    }
  }, [fetchWorkspaces])

  // ─── Render ──────────────────────────────────────────────────────────────

  const isEmpty = !loading && data && data.nodes.length === 0 && data.edges.length === 0
  const hasData = !loading && data && (data.nodes.length > 0 || data.edges.length > 0)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-text-primary text-xl font-display">Relational Map</h1>
          <p className="text-text-muted text-xs font-body mt-1">
            Phase 37E — v1
          </p>
        </div>
        <RelationalMapGovernanceBanner />

        {/* Workspace bar (37E) */}
        <RelationalMapWorkspaceBar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          arrangeMode={arrangeMode}
          isDirty={isDirty}
          onSelectWorkspace={handleSelectWorkspace}
          onToggleArrangeMode={handleToggleArrangeMode}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onResetLayout={handleResetLayout}
          onArchiveWorkspace={handleArchiveWorkspace}
          disabled={loading || workspaceLoading}
        />

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
                  arrangeMode={arrangeMode}
                  workspaceLayout={localLayout}
                  onNodeDragStop={handleNodeDragStop}
                  skippedNodeKeys={skippedNodeKeys}
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
            nodeLayout={inspectorNodeLayout}
            hasWorkspace={!!activeWorkspaceId}
            arrangeMode={arrangeMode}
            onTogglePin={handleTogglePin}
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
