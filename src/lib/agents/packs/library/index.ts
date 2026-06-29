/**
 * Phase 42.3.1 — Library pack: registration + report assembly
 *
 * Registers the Library inspectors on a kernel registry and builds the ephemeral
 * Library Health Report over an already-fetched, read-only input bundle.
 *
 * ── Boundaries (hard) ────────────────────────────────────────────────────────
 *   * PURE. No I/O, no Supabase, no DB, no LLM. (Data fetching lives in the
 *     separate read-only data layer, imported only by the manual runner.)
 *   * EPHEMERAL. Produces a report object; stores nothing.
 */

import { buildReport } from '../../kernel/report'
import { createInspectorRegistry, type InspectorRegistry } from '../../kernel/registry'
import type { AgentReport, AgentReportScope } from '../../kernel/types'
import { libraryInspectors } from './inspectors'
import {
  LIBRARY_DOMAIN,
  type LibraryFindingPayload,
  type LibraryScopeInput,
} from './payloads'

/** A fresh registry with the Library inspectors registered. */
export function createLibraryRegistry(): InspectorRegistry<
  LibraryScopeInput,
  LibraryFindingPayload
> {
  const registry = createInspectorRegistry<LibraryScopeInput, LibraryFindingPayload>()
  for (const inspector of libraryInspectors) {
    registry.register(inspector)
  }
  return registry
}

/** Build the ephemeral Library Health Report over a read-only input bundle. Pure. */
export function buildLibraryHealthReport(args: {
  input: LibraryScopeInput
  scope: AgentReportScope
  generatedAt: string
}): AgentReport<LibraryFindingPayload> {
  return buildReport<LibraryScopeInput, LibraryFindingPayload>({
    domain: LIBRARY_DOMAIN,
    scope: args.scope,
    generatedAt: args.generatedAt,
    inspectors: libraryInspectors,
    input: args.input,
  })
}

export { libraryInspectors } from './inspectors'
export {
  LIBRARY_DOMAIN,
  MAX_ITEMS_PER_REPORT,
  MAX_FILES_SCANNED,
  type LibraryScopeDescriptor,
  type LibraryScopeInput,
  type LibraryFindingPayload,
} from './payloads'
