'use client'

// Phase 37C — Audit trail display for graph proposals

import GraphProposalStatusChip from './GraphProposalStatusChip'

interface ProposalEvent {
  id: string
  proposal_id: string
  event_type: string
  previous_status: string | null
  new_status: string | null
  actor: string
  reason: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

const EVENT_LABELS: Record<string, string> = {
  proposal_created: 'Created',
  status_changed: 'Status Changed',
  approved_graph: 'Approved',
  rejected: 'Rejected',
  marked_needs_more_evidence: 'Needs Evidence',
  marked_workspace_only: 'Workspace Only',
  superseded: 'Superseded',
  restored: 'Restored',
}

export default function GraphProposalAuditTrail({ events }: { events: ProposalEvent[] }) {
  if (!events || events.length === 0) {
    return (
      <p className="text-text-muted text-xs italic">No audit events recorded.</p>
    )
  }

  // Show oldest first for timeline clarity
  const sorted = [...events].sort((a, b) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return (
    <div className="space-y-0">
      {sorted.map((event, idx) => (
        <div
          key={event.id}
          className={`
            flex items-start gap-3 py-2
            ${idx < sorted.length - 1 ? 'border-b border-house-border/50' : ''}
          `}
        >
          {/* Timeline dot */}
          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-house-muted shrink-0" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-secondary text-xs font-body">
                {EVENT_LABELS[event.event_type] ?? event.event_type}
              </span>
              <span className="text-text-muted text-[10px] font-mono">
                by {event.actor}
              </span>
              <span className="text-text-muted text-[10px] font-mono">
                {formatTime(event.created_at)}
              </span>
            </div>

            {event.previous_status && event.new_status && (
              <div className="flex items-center gap-1.5 mt-1">
                <GraphProposalStatusChip status={event.previous_status} />
                <span className="text-text-muted text-[10px]">→</span>
                <GraphProposalStatusChip status={event.new_status} />
              </div>
            )}

            {event.reason && (
              <p className="text-text-muted text-[11px] font-body mt-1 leading-relaxed">
                {event.reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
