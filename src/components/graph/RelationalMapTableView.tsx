'use client'

// Phase 37D — Table fallback view for the Relational Map.
// Read-only. No mutation actions.

import { getNodeTypeLabel, getEdgeTypeLabel } from '@/lib/graph/graphDisplayUtils'
import type { GraphMapNode, GraphMapEdge } from '@/lib/graph/relationalMapTypes'

interface TableViewProps {
  nodes: GraphMapNode[]
  edges: GraphMapEdge[]
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onSelectNode: (nodeId: string) => void
  onSelectEdge: (edgeId: string) => void
}

export default function RelationalMapTableView({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
}: TableViewProps) {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-6">
      {/* Nodes table */}
      <div>
        <h3 className="text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
          Nodes ({nodes.length})
        </h3>
        <div className="border border-house-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-house-surface border-b border-house-border">
                <th className="text-left text-text-muted font-mono px-3 py-2">Label</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Type</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Scope</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Authority</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Confidence</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Derived</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Proposals</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(node => (
                <tr
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className={`
                    border-b border-house-border/30 cursor-pointer transition-colors
                    ${selectedNodeId === node.id
                      ? 'bg-house-muted/30'
                      : 'hover:bg-house-surface/50'
                    }
                  `}
                >
                  <td className="px-3 py-2 text-text-secondary">{node.label}</td>
                  <td className="px-3 py-2 text-text-muted">{getNodeTypeLabel(node.nodeType)}</td>
                  <td className="px-3 py-2 text-text-muted">{node.presenceScope}</td>
                  <td className="px-3 py-2 text-text-muted">{node.authorityStatus.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 text-text-muted">{node.confidence?.toFixed(2) ?? '—'}</td>
                  <td className="px-3 py-2 text-text-muted">{node.derivedFromEdge ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 text-text-muted">{node.proposalIds.length}</td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-text-muted text-center">
                    No nodes
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edges table */}
      <div>
        <h3 className="text-text-secondary text-xs font-mono uppercase tracking-wider mb-2">
          Edges ({edges.length})
        </h3>
        <div className="border border-house-border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-house-surface border-b border-house-border">
                <th className="text-left text-text-muted font-mono px-3 py-2">Label</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Edge Type</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Scope</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Authority</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Confidence</th>
                <th className="text-left text-text-muted font-mono px-3 py-2">Proposal</th>
              </tr>
            </thead>
            <tbody>
              {edges.map(edge => (
                <tr
                  key={edge.id}
                  onClick={() => onSelectEdge(edge.id)}
                  className={`
                    border-b border-house-border/30 cursor-pointer transition-colors
                    ${selectedEdgeId === edge.id
                      ? 'bg-house-muted/30'
                      : 'hover:bg-house-surface/50'
                    }
                  `}
                >
                  <td className="px-3 py-2 text-text-secondary">{edge.label}</td>
                  <td className="px-3 py-2 text-text-muted">{getEdgeTypeLabel(edge.edgeType)}</td>
                  <td className="px-3 py-2 text-text-muted">{edge.presenceScope}</td>
                  <td className="px-3 py-2 text-text-muted">{edge.authorityStatus.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2 text-text-muted">{edge.confidence?.toFixed(2) ?? '—'}</td>
                  <td className="px-3 py-2 text-text-muted font-mono text-[10px] truncate max-w-[120px]">{edge.proposalId}</td>
                </tr>
              ))}
              {edges.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-text-muted text-center">
                    No edges
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
