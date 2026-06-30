/**
 * Phase 42.3.2 — archive_graph pack: registration + report assembly
 *
 * Registers the archive_graph inspectors on the (unchanged) kernel registry and
 * builds the ephemeral archive_graph Health Report over an already-fetched,
 * read-only input bundle.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM. (Data fetching lives in the
 *     separate read-only data layer, imported only by the manual runner.)
 *   * EPHEMERAL. Produces a report object; stores nothing. The kernel is reused
 *     verbatim — this pack adds NO kernel change (the generalisation proof).
 */

import { buildReport } from '../../kernel/report'
import { createInspectorRegistry, type InspectorRegistry } from '../../kernel/registry'
import type { AgentReport, AgentReportScope } from '../../kernel/types'
import { archiveGraphInspectors } from './inspectors'
import {
  ARCHIVE_GRAPH_DOMAIN,
  type ArchiveGraphFindingPayload,
  type ArchiveGraphScopeInput,
} from './payloads'

/** A fresh registry with the archive_graph inspectors registered. */
export function createArchiveGraphRegistry(): InspectorRegistry<
  ArchiveGraphScopeInput,
  ArchiveGraphFindingPayload
> {
  const registry = createInspectorRegistry<ArchiveGraphScopeInput, ArchiveGraphFindingPayload>()
  for (const inspector of archiveGraphInspectors) {
    registry.register(inspector)
  }
  return registry
}

/** Build the ephemeral archive_graph Health Report over a read-only input bundle. Pure. */
export function buildArchiveGraphHealthReport(args: {
  input: ArchiveGraphScopeInput
  scope: AgentReportScope
  generatedAt: string
}): AgentReport<ArchiveGraphFindingPayload> {
  return buildReport<ArchiveGraphScopeInput, ArchiveGraphFindingPayload>({
    domain: ARCHIVE_GRAPH_DOMAIN,
    scope: args.scope,
    generatedAt: args.generatedAt,
    inspectors: archiveGraphInspectors,
    input: args.input,
  })
}

export { archiveGraphInspectors } from './inspectors'
export {
  ARCHIVE_GRAPH_DOMAIN,
  MAX_NODES_PER_REPORT,
  MAX_EDGES_SCANNED,
  type ArchiveGraphScopeDescriptor,
  type ArchiveGraphScopeInput,
  type ArchiveGraphFindingPayload,
} from './payloads'
