'use client'

// Phase 39.3 — Recall Packet Debug Panel
//
// Read-only inspector for the Context Authority Packet (Recall Packet).
// Receives a typed RecallPacket prop — does not call buildRecallPacket().
// Does not retrieve, persist, mutate, or inject anything.
// No useEffect. No fetch. No live integration. Pure display.
//
// Laws:
//   Visible first, silent later.
//   The panel makes the ground visible before the House speaks from it.
//   It does not make excluded sources active.
//   It does not change prompts or chat behaviour.

import type {
  RecallPacket,
  ClassifiedSource,
  SourceConflict,
} from '@/lib/recall/recallPacketTypes'

// ─────────────────────────────────────────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────────────────────────────────────────

export interface RecallPacketDebugPanelProps {
  packet: RecallPacket
  title?: string
  compact?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPLAY HELPERS
// Pure functions — no state, no side effects.
// ─────────────────────────────────────────────────────────────────────────────

function fmtLabel(s: string): string {
  return s.replace(/_/g, ' ')
}

function instructionColor(instruction: string): string {
  if (instruction === 'answer_confidently_from_confirmed_memory')
    return 'text-emerald-300/80'
  if (instruction === 'surface_source_conflict')
    return 'text-amber-400/80'
  if (instruction === 'ask_clarifying_question')
    return 'text-amber-300/70'
  if (instruction === 'say_not_enough_grounded_recall' || instruction === 'do_not_inject')
    return 'text-red-300/60'
  return 'text-text-secondary/80'
}

function exclusionLabel(reason?: string): string {
  switch (reason) {
    case 'trace_only':             return 'Excluded — trace only, not evidence'
    case 'raw_source':             return 'Excluded — not recallable'
    case 'draft_source':           return 'Excluded — not recallable'
    case 'scope_prohibited':       return 'Excluded — scope boundary'
    case 'tara_only':              return 'Excluded — Tara-only scope'
    case 'not_in_runtime_builder': return 'Excluded — deferred (v1)'
    case 'expired':                return 'Excluded — expired'
    case 'relevance_too_weak':     return 'Excluded — relevance too weak'
    case 'topic_shift':            return 'Excluded — topic shift'
    case 'not_prompt_eligible':    return 'Excluded — not prompt eligible'
    case 'insufficient_ground':    return 'Excluded — insufficient ground'
    default:
      return reason ? `Excluded — ${fmtLabel(reason)}` : 'Excluded'
  }
}

function exclusionLabelColor(reason?: string): string {
  if (reason === 'trace_only')   return 'text-red-300/50'
  if (reason === 'scope_prohibited') return 'text-amber-300/50'
  if (reason === 'raw_source' || reason === 'draft_source') return 'text-red-300/40'
  return 'text-text-muted/40'
}

function tierBadgeStyle(tier: string): string {
  switch (tier) {
    case 'Memory':            return 'text-emerald-300/70 bg-emerald-300/5 border border-emerald-300/10'
    case 'Continuity':        return 'text-text-secondary/60 bg-house-bg/30 border border-house-border/10'
    case 'PresenceState':     return 'text-text-secondary/50 bg-house-bg/20 border border-house-border/10'
    case 'InnerContinuity':   return 'text-text-secondary/50 bg-house-bg/20 border border-house-border/10'
    case 'IdentityContinuity':return 'text-text-secondary/50 bg-house-bg/20 border border-house-border/10'
    case 'Reference':         return 'text-text-muted/50 bg-house-bg/20 border border-house-border/10'
    case 'Graph':             return 'text-text-muted/40 bg-house-bg/10 border border-house-border/5'
    case 'MemoryAdjacent':    return 'text-text-muted/40 bg-house-bg/10 border border-house-border/5'
    case 'Trace':             return 'text-red-300/40 bg-red-300/5 border border-red-300/10'
    case 'GroundFailure':     return 'text-red-300/40 bg-red-300/5 border border-red-300/10'
    default:                  return 'text-text-muted/40 bg-house-bg/10 border border-house-border/5'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE ROW COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ActiveSourceRow({ source }: { source: ClassifiedSource }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-house-border/10 last:border-0">
      <div className="w-5 text-right shrink-0 pt-px">
        <span className="font-mono text-[8px] text-text-muted/30">{source.authority_rank}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="font-mono text-[9px] text-text-secondary/80 break-all">
            {fmtLabel(source.surface)}
          </span>
          <span className={`text-[7px] px-1 rounded shrink-0 ${tierBadgeStyle(source.authority_tier)}`}>
            {source.authority_tier}
          </span>
          {source.is_memory && (
            <span className="text-[7px] px-1 rounded shrink-0 text-emerald-300/60 bg-emerald-300/5 border border-emerald-300/10">
              Memory
            </span>
          )}
          {source.is_continuity && !source.is_memory && (
            <span className="text-[7px] px-1 rounded shrink-0 text-text-muted/40 bg-house-bg/10 border border-house-border/5">
              continuity
            </span>
          )}
          {source.is_reference_only && (
            <span className="text-[7px] px-1 rounded shrink-0 text-text-muted/40 bg-house-bg/10 border border-house-border/5">
              reference
            </span>
          )}
        </div>
        <div className="font-mono text-[7px] text-text-muted/40 mt-0.5">
          {fmtLabel(source.authority_label)}
        </div>
        <div className={`font-mono text-[8px] mt-0.5 ${instructionColor(source.response_instruction)}`}>
          {fmtLabel(source.response_instruction)}
        </div>
      </div>
    </div>
  )
}

function ExcludedSourceRow({ source }: { source: ClassifiedSource }) {
  return (
    <div className="flex items-start gap-2 py-0.5 border-b border-house-border/5 last:border-0">
      <div className="w-5 text-right shrink-0 pt-px">
        <span className="font-mono text-[8px] text-text-muted/25">{source.authority_rank}</span>
      </div>
      <div className="flex-1 min-w-0 opacity-55">
        <div className="flex items-start gap-1.5 flex-wrap">
          <span className="font-mono text-[8px] text-text-muted/55 break-all">
            {fmtLabel(source.surface)}
          </span>
          <span className={`text-[7px] px-1 rounded shrink-0 ${exclusionLabelColor(source.exclusion_reason)}`}>
            {exclusionLabel(source.exclusion_reason)}
          </span>
        </div>
        <div className="font-mono text-[7px] text-text-muted/35 mt-0.5">
          {fmtLabel(source.authority_label)}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFLICT ROW
// ─────────────────────────────────────────────────────────────────────────────

function ConflictRow({ conflict }: { conflict: SourceConflict }) {
  const needsTaraReview = conflict.requires_tara_review
  return (
    <div className={`px-2 py-1.5 rounded border ${
      needsTaraReview
        ? 'border-amber-300/20 bg-amber-300/5'
        : 'border-house-border/15 bg-house-bg/15'
    }`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-[8px] text-text-muted/60">
          {fmtLabel(conflict.conflict_type)}
        </span>
        {needsTaraReview && (
          <span className="text-[7px] px-1 rounded text-amber-300/60 bg-amber-300/10 border border-amber-300/15">
            Requires Tara review
          </span>
        )}
      </div>
      <div className={`font-mono text-[8px] mt-0.5 ${instructionColor(conflict.resolution_instruction)}`}>
        {fmtLabel(conflict.resolution_instruction)}
      </div>
      {conflict.involved_sources.length > 0 && (
        <div className="text-[7px] text-text-muted/35 mt-0.5 leading-relaxed">
          Source conflict: {conflict.involved_sources.map(s => fmtLabel(s)).join(', ')}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PANEL
// ─────────────────────────────────────────────────────────────────────────────

export default function RecallPacketDebugPanel({
  packet,
  title,
  compact = false,
}: RecallPacketDebugPanelProps) {
  const { summary, primary_response_instruction, has_sufficient_ground, has_conflict } = packet

  return (
    <div className="border border-house-border/30 rounded bg-house-bg/20 text-[10px] font-body w-full">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-b border-house-border/20">

        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-3 bg-text-muted/30 rounded-full shrink-0" />
          <span className="font-display text-xs font-light tracking-[0.15em] text-text-primary/80 uppercase">
            {title ?? 'Recall Packet'}
          </span>
          <span className="font-mono text-[8px] text-text-muted/35 italic">
            Context Authority Packet
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5">
          <div className="font-mono text-[8px] text-text-muted/50">
            <span className="text-text-muted/25">presence </span>
            <span className="text-text-secondary/60">{packet.presence}</span>
          </div>
          <div className="font-mono text-[8px] text-text-muted/50">
            <span className="text-text-muted/25">room </span>
            <span className="text-text-secondary/60">{packet.room}</span>
          </div>
          <div className="font-mono text-[7px] text-text-muted/35 col-span-2">
            <span className="text-text-muted/25">computed </span>
            {packet.computed_at}
          </div>
        </div>

        {/* Primary response instruction + ground status */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-text-muted/30 font-mono shrink-0">
              Primary response instruction
            </span>
            <span className={`font-mono text-[9px] ${instructionColor(primary_response_instruction)}`}>
              {fmtLabel(primary_response_instruction)}
            </span>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className={`text-[7px] px-1.5 py-0.5 rounded font-mono border ${
            has_sufficient_ground
              ? 'text-emerald-300/60 bg-emerald-300/5 border-emerald-300/10'
              : 'text-red-300/55 bg-red-300/5 border-red-300/10'
          }`}>
            {has_sufficient_ground ? 'sufficient ground' : 'insufficient ground'}
          </span>
          {has_conflict && (
            <span className="text-[7px] px-1.5 py-0.5 rounded font-mono border text-amber-300/55 bg-amber-300/5 border-amber-300/10">
              source tension
            </span>
          )}
        </div>
      </div>

      {/* ── Summary counts ───────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-house-border/15">
        <div className="text-[8px] text-text-muted/30 font-mono uppercase tracking-wider mb-1.5">
          Summary
        </div>
        <div className="flex gap-3 flex-wrap">
          {[
            { label: 'considered', value: summary.total_surfaces_considered },
            { label: 'active',     value: summary.active_count },
            { label: 'excluded',   value: summary.excluded_count },
            { label: 'memory',     value: summary.memory_count },
            { label: 'continuity', value: summary.continuity_count },
            { label: 'reference',  value: summary.reference_count },
            { label: 'trace',      value: summary.trace_count },
            { label: 'conflicts',  value: summary.conflict_count },
          ].map(({ label, value }) => (
            <div key={label} className="text-center min-w-[36px]">
              <div className="font-mono text-[11px] text-text-primary/70">{value}</div>
              <div className="font-mono text-[7px] text-text-muted/35 mt-px">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active sources ───────────────────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-house-border/15">
        <div className="text-[8px] text-text-muted/30 font-mono uppercase tracking-wider mb-1.5">
          Active Sources ({packet.active_sources.length})
        </div>
        {packet.active_sources.length === 0 ? (
          <div className="text-[9px] text-red-300/45 italic py-1">
            No active sources — not enough grounded recall.
          </div>
        ) : (
          <div>
            {packet.active_sources.map((source, i) => (
              <ActiveSourceRow key={`active-${source.surface}-${i}`} source={source} />
            ))}
          </div>
        )}
      </div>

      {/* ── Excluded sources ─────────────────────────────────────────────── */}
      {!compact && (
        <div className="px-3 py-2 border-b border-house-border/15">
          <div className="text-[8px] text-text-muted/30 font-mono uppercase tracking-wider mb-1.5">
            Excluded Sources ({packet.excluded_sources.length})
          </div>
          {packet.excluded_sources.length === 0 ? (
            <div className="text-[8px] text-text-muted/35 italic py-0.5">None.</div>
          ) : (
            <div>
              {packet.excluded_sources.map((source, i) => (
                <ExcludedSourceRow key={`excl-${source.surface}-${i}`} source={source} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Conflicts ────────────────────────────────────────────────────── */}
      {!compact && (
        <div className="px-3 py-2 border-b border-house-border/15">
          <div className="text-[8px] text-text-muted/30 font-mono uppercase tracking-wider mb-1.5">
            Conflicts ({packet.conflicts.length})
          </div>
          {packet.conflicts.length === 0 ? (
            <div className="text-[8px] text-text-muted/35 italic py-0.5">
              No source conflicts detected.
            </div>
          ) : (
            <div className="space-y-1">
              {packet.conflicts.map((conflict, i) => (
                <ConflictRow key={`conflict-${conflict.conflict_type}-${i}`} conflict={conflict} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Response instructions ─────────────────────────────────────────── */}
      {!compact && packet.response_instructions.length > 0 && (
        <div className="px-3 py-2 border-b border-house-border/15">
          <div className="text-[8px] text-text-muted/30 font-mono uppercase tracking-wider mb-1.5">
            Response Instructions
          </div>
          <div className="space-y-0.5">
            {packet.response_instructions.map((ri, i) => (
              <div key={`ri-${ri.source_surface}-${i}`} className="flex items-center gap-2">
                <span className="font-mono text-[8px] text-text-muted/25 w-3 shrink-0">
                  {i === 0 ? '●' : '·'}
                </span>
                <span className={`font-mono text-[8px] ${
                  i === 0 ? instructionColor(ri.instruction) : 'text-text-muted/45'
                }`}>
                  {fmtLabel(ri.instruction)}
                </span>
                <span className="font-mono text-[7px] text-text-muted/25 shrink-0">
                  rank {ri.authority_rank}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Governance footer ─────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 bg-house-bg/10">
        <div className="text-[8px] text-text-muted/35 italic leading-relaxed space-y-0.5">
          <p>
            Recall Packet classifies context authority. It does not create Memory, move authority,
            or change prompt eligibility.
          </p>
          <p>Excluded sources are not response grounding.</p>
          <p>Trace sources are not evidence.</p>
        </div>
      </div>

    </div>
  )
}
