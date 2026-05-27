'use client'

// Phase 37D — Read-only graph canvas for the Relational Map.
// Uses @xyflow/react. No editing. No dragging as semantic mutation.
// Pan and zoom only. Node selection for inspector.

import { useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react'
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  MarkerType,
  Handle,
  Position,
  BaseEdge,
  getStraightPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'
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
}

function HouseNode({ data }: { data: HouseNodeData }) {
  const { graphNode, selected } = data
  const colours = getNodeColours(graphNode.nodeType)
  const sizeMultiplier = getNodeSizeMultiplier(graphNode.salience)
  const baseSize = 60
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
          boxShadow: selected ? `0 0 12px ${colours.border}40` : 'none',
        }}
      >
        <div
          className="text-[10px] font-display leading-tight text-center px-1 truncate max-w-[90px]"
          style={{ color: colours.text }}
          title={graphNode.label}
        >
          {graphNode.label.length > 16 ? graphNode.label.slice(0, 14) + '…' : graphNode.label}
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

// ─── Layout ────────────────────────────────────────────────────────────────

/**
 * Simple deterministic layout: arrange nodes in a circle.
 * For small graphs this produces a clear, legible result.
 * Future phases may add force-directed or grouped layouts.
 */
function computeLayout(
  nodes: GraphMapNode[],
  edges: GraphMapEdge[]
): { x: number; y: number; id: string }[] {
  if (nodes.length === 0) return []

  if (nodes.length === 1) {
    return [{ id: nodes[0].id, x: 400, y: 300 }]
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

  const centerX = 400
  const centerY = 350
  const positions: { id: string; x: number; y: number }[] = []

  // Place the most connected node in center
  positions.push({ id: sorted[0].id, x: centerX, y: centerY })

  // Place remaining nodes in concentric rings
  const remaining = sorted.slice(1)
  const ringCapacities = [6, 12, 18, 24] // nodes per ring
  const ringRadii = [160, 280, 400, 520]
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
}

const nodeTypes: NodeTypes = {
  houseNode: HouseNode as unknown as NodeTypes['houseNode'],
}

const edgeTypes: EdgeTypes = {
  houseEdge: HouseEdge as unknown as EdgeTypes['houseEdge'],
}

const RelationalMapCanvas = forwardRef<RelationalMapCanvasHandle, CanvasProps>(
  function RelationalMapCanvas(
    { nodes, edges, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge },
    ref
  ) {
    const rfInstance = useRef<ReactFlowInstance | null>(null)

    useImperativeHandle(ref, () => ({
      zoomIn: () => rfInstance.current?.zoomIn(),
      zoomOut: () => rfInstance.current?.zoomOut(),
      fitView: () => rfInstance.current?.fitView({ padding: 0.2 }),
    }))

    // Convert to XYFlow format
    const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges])

    const flowNodes: Node[] = useMemo(() => {
      return nodes.map(n => {
        const pos = positions.find(p => p.id === n.id) ?? { x: 0, y: 0 }
        return {
          id: n.id,
          type: 'houseNode',
          position: { x: pos.x, y: pos.y },
          data: { graphNode: n, selected: n.id === selectedNodeId },
          selectable: true,
          draggable: false,
          connectable: false,
        }
      })
    }, [nodes, positions, selectedNodeId])

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

    const onSelectionChange = useCallback(({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      if (selNodes.length > 0) {
        onSelectNode(selNodes[0].id)
        onSelectEdge(null)
      } else if (selEdges.length > 0) {
        onSelectEdge(selEdges[0].id)
        onSelectNode(null)
      }
    }, [onSelectNode, onSelectEdge])

    const onInit = useCallback((instance: ReactFlowInstance) => {
      rfInstance.current = instance
      // Fit view on initial load
      setTimeout(() => instance.fitView({ padding: 0.2 }), 100)
    }, [])

    return (
      <div className="flex-1 relative" style={{ minHeight: 400 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onSelectionChange={onSelectionChange}
          onInit={onInit}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          panOnDrag={true}
          zoomOnScroll={true}
          fitView={true}
          minZoom={0.1}
          maxZoom={3}
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

        {/* Read-only mode indicator */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-house-surface/80 border border-house-border/50 rounded px-2.5 py-1 backdrop-blur-sm">
          <span className="text-[10px] text-text-muted">🔒</span>
          <span className="text-[10px] text-text-muted font-body">Read-only mode</span>
        </div>
      </div>
    )
  }
)

export default RelationalMapCanvas
