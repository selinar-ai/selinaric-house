'use client'

// Phase 37E — Graph canvas for the Relational Map.
// Uses @xyflow/react. Supports Arrange Mode for layout changes.
//
// Layout is not ontology.
// Position is not relationship.
// Distance is not strength.
// Cluster is not truth.
// Dragging does not mutate graph semantics.
//
// Dragging moves visual positions only. It does not create edges,
// change authority, modify Memory, or mutate prompt eligibility.

import { useCallback, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
  type OnNodeDrag,
  type ReactFlowInstance,
  MarkerType,
  Handle,
  Position,
  BaseEdge,
  getStraightPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'
import type { RelationalMapLayoutData, RelationalMapVisualCluster } from '@/lib/graph/relationalMapWorkspaceTypes'
import {
  getNodeColours,
  getNodeTypeLabel,
  getNodeSizeMultiplier,
  getEdgeStrokeWidth,
  getEdgeTypeLabel,
} from '@/lib/graph/graphDisplayUtils'

// ─── Custom Node ───────────────────────────────────────────────────────────

interface HouseNodeData {
  graphNode: GraphMapNode
  selected: boolean
  pinned: boolean
  arrangeMode: boolean
}

function HouseNode({ data }: { data: HouseNodeData }) {
  const { graphNode, selected, pinned, arrangeMode } = data
  const colours = getNodeColours(graphNode.nodeType)
  const sizeMultiplier = getNodeSizeMultiplier(graphNode.salience)
  const baseSize = 80
  const size = Math.round(baseSize * sizeMultiplier)

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-transparent !border-0 !w-0 !h-0" />
      <div
        className="flex flex-col items-center justify-center rounded-full transition-all duration-200"
        style={{
          width: size,
          height: size,
          backgroundColor: colours.bg,
          border: `2px solid ${selected ? '#9B7FD4' : colours.border}`,
          boxShadow: selected ? `0 0 16px ${colours.border}50` : `0 0 8px ${colours.border}15`,
          cursor: arrangeMode ? 'grab' : 'pointer',
        }}
      >
        <div
          className="text-[11px] font-display leading-tight text-center px-1.5 max-w-[120px]"
          style={{ color: colours.text }}
          title={graphNode.label}
        >
          {graphNode.label.length > 22 ? graphNode.label.slice(0, 20) + '…' : graphNode.label}
        </div>
        <div
          className="text-[8px] font-mono opacity-60 mt-0.5"
          style={{ color: colours.text }}
        >
          {getNodeTypeLabel(graphNode.nodeType)}
        </div>
        {graphNode.derivedFromEdge && (
          <div className="text-[7px] opacity-40 mt-0.5" style={{ color: colours.text }}>
            (derived)
          </div>
        )}
        {pinned && (
          <div className="text-[7px] opacity-50 mt-0.5" style={{ color: colours.text }}>
            📌
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-0 !w-0 !h-0" />
    </>
  )
}

// ─── Custom Edge ───────────────────────────────────────────────────────────

interface HouseEdgeData {
  graphEdge: GraphMapEdge
}

function HouseEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  data?: HouseEdgeData
  selected?: boolean
}) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX, sourceY, targetX, targetY,
  })

  const strokeWidth = data?.graphEdge ? getEdgeStrokeWidth(data.graphEdge.confidence) : 1
  const edgeLabel = data?.graphEdge ? getEdgeTypeLabel(data.graphEdge.edgeType) : ''

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#9B7FD4' : '#4A3958',
          strokeWidth: selected ? strokeWidth + 0.5 : strokeWidth,
          opacity: selected ? 1 : 0.6,
        }}
        markerEnd={`url(#arrow-${selected ? 'selected' : 'default'})`}
      />
      {edgeLabel && (
        <foreignObject
          x={labelX - 50}
          y={labelY - 10}
          width={100}
          height={20}
          className="pointer-events-none overflow-visible"
        >
          <div className="flex justify-center">
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{
                backgroundColor: 'rgba(20, 16, 25, 0.85)',
                color: selected ? '#B8A9D4' : '#6B5B8A',
                border: `1px solid ${selected ? '#6B5B8A' : '#3A2B4640'}`,
              }}
            >
              {edgeLabel}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  )
}

// ─── Visual Cluster Overlay ───────────────────────────────────────────────

function ClusterOverlays({ clusters }: { clusters: RelationalMapVisualCluster[] }) {
  if (clusters.length === 0) return null

  return (
    <>
      {clusters.map(cluster => (
        <div
          key={cluster.id}
          className="absolute pointer-events-none"
          style={{
            left: cluster.x,
            top: cluster.y,
            width: cluster.width,
            height: cluster.collapsed ? 36 : cluster.height,
            border: '1px dashed #4A395860',
            borderRadius: 8,
            backgroundColor: 'rgba(42, 31, 53, 0.15)',
          }}
        >
          <div
            className="absolute -top-4 left-2 text-[9px] font-body px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'rgba(20, 16, 25, 0.8)',
              color: '#6B5B8A',
              border: '1px solid #3A2B4630',
            }}
          >
            {cluster.label}
            <span className="text-[8px] opacity-50 ml-1">visual cluster</span>
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Default Layout ───────────────────────────────────────────────────────

/**
 * Simple deterministic layout: arrange nodes in a circle.
 * For small graphs this produces a clear, legible result.
 * Future phases may add force-directed or grouped layouts.
 */
export function computeDefaultLayout(
  nodes: GraphMapNode[],
  edges: GraphMapEdge[]
): { x: number; y: number; id: string }[] {
  if (nodes.length === 0) return []

  if (nodes.length === 1) {
    return [{ id: nodes[0].id, x: 600, y: 400 }]
  }

  // Find the most connected node — place it in the center
  const connectionCount = new Map<string, number>()
  for (const n of nodes) connectionCount.set(n.id, 0)
  for (const e of edges) {
    connectionCount.set(e.fromNodeId, (connectionCount.get(e.fromNodeId) ?? 0) + 1)
    connectionCount.set(e.toNodeId, (connectionCount.get(e.toNodeId) ?? 0) + 1)
  }

  const sorted = [...nodes].sort((a, b) =>
    (connectionCount.get(b.id) ?? 0) - (connectionCount.get(a.id) ?? 0)
  )

  const centerX = 600
  const centerY = 400
  const positions: { id: string; x: number; y: number }[] = []

  // Place the most connected node in center
  positions.push({ id: sorted[0].id, x: centerX, y: centerY })

  // Place remaining nodes in concentric rings — generous spacing for readability
  const remaining = sorted.slice(1)
  const ringCapacities = [6, 12, 18, 24] // nodes per ring
  const ringRadii = [250, 440, 630, 820]
  let nodeIndex = 0

  for (let ring = 0; ring < ringRadii.length && nodeIndex < remaining.length; ring++) {
    const radius = ringRadii[ring]
    const capacity = Math.min(ringCapacities[ring], remaining.length - nodeIndex)
    for (let i = 0; i < capacity && nodeIndex < remaining.length; i++) {
      const angle = (2 * Math.PI * i) / capacity - Math.PI / 2
      positions.push({
        id: remaining[nodeIndex].id,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      })
      nodeIndex++
    }
  }

  return positions
}

// ─── Ref Handle ────────────────────────────────────────────────────────────

export interface RelationalMapCanvasHandle {
  zoomIn: () => void
  zoomOut: () => void
  fitView: () => void
}

// ─── Main Component ────────────────────────────────────────────────────────

interface CanvasProps {
  nodes: GraphMapNode[]
  edges: GraphMapEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onSelectEdge: (edgeId: string | null) => void
  // 37E workspace props
  arrangeMode: boolean
  workspaceLayout: RelationalMapLayoutData | null
  onNodeDragStop: (nodeId: string, x: number, y: number) => void
  skippedNodeKeys: string[]
}

const nodeTypes: NodeTypes = {
  houseNode: HouseNode as unknown as NodeTypes['houseNode'],
}

const edgeTypes: EdgeTypes = {
  houseEdge: HouseEdge as unknown as EdgeTypes['houseEdge'],
}

const RelationalMapCanvas = forwardRef<RelationalMapCanvasHandle, CanvasProps>(
  function RelationalMapCanvas(
    {
      nodes, edges, selectedNodeId, selectedEdgeId,
      onSelectNode, onSelectEdge,
      arrangeMode, workspaceLayout, onNodeDragStop, skippedNodeKeys,
    },
    ref
  ) {
    const rfInstance = useRef<ReactFlowInstance | null>(null)

    const fitViewOptions = useMemo(() => ({ padding: 0.35, maxZoom: 1.5 }), [])

    useImperativeHandle(ref, () => ({
      zoomIn: () => rfInstance.current?.zoomIn(),
      zoomOut: () => rfInstance.current?.zoomOut(),
      fitView: () => rfInstance.current?.fitView(fitViewOptions),
    }))

    // Compute default positions
    const defaultPositions = useMemo(() => computeDefaultLayout(nodes, edges), [nodes, edges])

    // Convert to XYFlow format, applying workspace positions where available
    const flowNodes: Node[] = useMemo(() => {
      return nodes.map(n => {
        // Try workspace layout first, fall back to default
        const wsNode = workspaceLayout?.nodes?.[n.id]
        const defaultPos = defaultPositions.find(p => p.id === n.id) ?? { x: 0, y: 0 }
        const pos = wsNode ? { x: wsNode.x, y: wsNode.y } : { x: defaultPos.x, y: defaultPos.y }
        const pinned = wsNode?.pinned ?? false

        return {
          id: n.id,
          type: 'houseNode',
          position: pos,
          data: {
            graphNode: n,
            selected: n.id === selectedNodeId,
            pinned,
            arrangeMode,
          },
          selectable: true,
          draggable: arrangeMode,
          connectable: false,
        }
      })
    }, [nodes, defaultPositions, selectedNodeId, workspaceLayout, arrangeMode])

    const flowEdges: Edge[] = useMemo(() => {
      return edges.map(e => ({
        id: e.id,
        source: e.fromNodeId,
        target: e.toNodeId,
        type: 'houseEdge',
        data: { graphEdge: e },
        selectable: true,
        selected: e.id === selectedEdgeId,
      }))
    }, [edges, selectedEdgeId])

    // Visual clusters from workspace
    const clusters = useMemo(() => {
      return workspaceLayout?.clusters ?? []
    }, [workspaceLayout])

    const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      if (selNodes.length > 0) {
        onSelectNode(selNodes[0].id)
        onSelectEdge(null)
      } else if (selEdges.length > 0) {
        onSelectEdge(selEdges[0].id)
        onSelectNode(null)
      }
    }, [onSelectNode, onSelectEdge])

    const handleNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
      onNodeDragStop(node.id, node.position.x, node.position.y)
    }, [onNodeDragStop])

    const onInit = useCallback((instance: ReactFlowInstance) => {
      rfInstance.current = instance
    }, [])

    // Fit view after nodes are positioned — fires on data changes and initial load.
    // The 200ms delay ensures React Flow has finished its internal layout pass.
    const nodeCount = flowNodes.length
    useEffect(() => {
      if (nodeCount === 0 || !rfInstance.current) return
      const timer = setTimeout(() => {
        rfInstance.current?.fitView(fitViewOptions)
      }, 200)
      return () => clearTimeout(timer)
    }, [nodeCount, fitViewOptions])

    return (
      <div className="absolute inset-0">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onSelectionChange={onSelectionChange}
          onNodeDragStop={handleNodeDragStop}
          onInit={onInit}
          nodesDraggable={arrangeMode}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          fitView
          fitViewOptions={fitViewOptions}
          minZoom={0.1}
          maxZoom={2.5}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className="bg-house-bg"
        >
          <Background color="#2A1F35" gap={40} size={1} />

          {/* Custom arrow markers */}
          <svg>
            <defs>
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="#4A3958" />
              </marker>
              <marker
                id="arrow-selected"
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="#9B7FD4" />
              </marker>
            </defs>
          </svg>
        </ReactFlow>

        {/* Visual cluster overlays */}
        <ClusterOverlays clusters={clusters} />

        {/* Mode indicator */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-house-surface/80 border border-house-border/50 rounded px-2.5 py-1 backdrop-blur-sm">
          {arrangeMode ? (
            <>
              <span className="text-[10px] text-purple-400">✦</span>
              <span className="text-[10px] text-purple-300 font-body">Arrange mode</span>
              <span className="text-[9px] text-purple-400/50 ml-1">layout only</span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-text-muted">🔒</span>
              <span className="text-[10px] text-text-muted font-body">Inspect mode</span>
            </>
          )}
        </div>

        {/* Skipped node keys warning */}
        {skippedNodeKeys.length > 0 && (
          <div className="absolute top-3 right-3 z-10 bg-amber-900/30 border border-amber-700/30 rounded px-2.5 py-1.5 backdrop-blur-sm max-w-[240px]">
            <p className="text-[10px] text-amber-400/80">
              {skippedNodeKeys.length} saved position{skippedNodeKeys.length === 1 ? '' : 's'} skipped — graph nodes no longer visible.
            </p>
          </div>
        )}
      </div>
    )
  }
)

export default RelationalMapCanvas
