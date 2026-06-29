/**
 * Phase 42.3.1 — Governance Kernel: in-memory inspector registry (a seam)
 *
 * A registry holds inspectors for one or more domains. It is in-memory only —
 * there is no durable table. A domain pack registers its inspectors; the report
 * builder asks for them by domain. Generic over input/payload so any domain reuses
 * it unchanged (Acceptance Test A).
 *
 * PURE. No I/O, no Supabase, no DB, no LLM.
 */

import type { AgentDomain, Inspector } from './types'

export type InspectorRegistry<TInput = unknown, TPayload = unknown> = {
  register(inspector: Inspector<TInput, TPayload>): void
  list(domain: AgentDomain): Inspector<TInput, TPayload>[]
  all(): Inspector<TInput, TPayload>[]
}

/** Create a fresh, isolated registry (no global state — safe across test runs). */
export function createInspectorRegistry<
  TInput = unknown,
  TPayload = unknown,
>(): InspectorRegistry<TInput, TPayload> {
  const inspectors: Inspector<TInput, TPayload>[] = []

  return {
    register(inspector) {
      if (inspectors.some((i) => i.id === inspector.id)) {
        throw new Error(`Inspector already registered: ${inspector.id}`)
      }
      inspectors.push(inspector)
    },
    list(domain) {
      return inspectors.filter((i) => i.domain === domain)
    },
    all() {
      return [...inspectors]
    },
  }
}
