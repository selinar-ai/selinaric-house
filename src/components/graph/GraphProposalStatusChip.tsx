'use client'

// Phase 37C — Status chip for graph proposal review status

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pending_review: {
    label: 'Pending Review',
    bg: 'bg-amber-900/30',
    text: 'text-amber-300',
    border: 'border-amber-700/40',
  },
  approved_graph: {
    label: 'Approved',
    bg: 'bg-emerald-900/30',
    text: 'text-emerald-300',
    border: 'border-emerald-700/40',
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-900/30',
    text: 'text-red-300',
    border: 'border-red-700/40',
  },
  needs_more_evidence: {
    label: 'Needs Evidence',
    bg: 'bg-blue-900/30',
    text: 'text-blue-300',
    border: 'border-blue-700/40',
  },
  workspace_only: {
    label: 'Workspace Only',
    bg: 'bg-slate-800/50',
    text: 'text-slate-300',
    border: 'border-slate-600/40',
  },
  superseded: {
    label: 'Superseded',
    bg: 'bg-purple-900/30',
    text: 'text-purple-300',
    border: 'border-purple-700/40',
  },
}

export default function GraphProposalStatusChip({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    bg: 'bg-house-muted/30',
    text: 'text-text-muted',
    border: 'border-house-muted/40',
  }

  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono
      border ${config.bg} ${config.text} ${config.border}
    `}>
      {config.label}
    </span>
  )
}
