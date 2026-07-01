/**
 * Phase 42.3.4c — CLI apply (THE HAND). Deliberate, Tara-run only.
 *
 *   npx tsx scripts/agent-remedy-apply.ts --plan-id <uuid> --confirm-plan-id <same uuid>
 *
 * Applies ONE approved, re-validated remedy plan to `library_items.title` via the governed
 * `agent_remedy_apply` RPC (the only House-write path). One explicit plan id only — NO batch,
 * NO apply-all, NO "latest" default, NO automatic target selection, NO route, NO scheduler.
 * The double plan-id confirmation guards against accidental invocation.
 *
 * NOTE: test-owned plans are refused by the RPC (`TEST_OWNED_NO_WRITE`) — apply never writes
 * for a test-owned plan. A real apply belongs to the first-real-apply micro-gate (export +
 * explicit per-run Tara approval), not to normal ship-it.
 */

import { createClient } from '@supabase/supabase-js'
import { APPLY_RPC } from '../src/lib/agents/maintenance/contract'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (RPC execute is service-role only).')
    process.exit(1)
    return
  }
  const planId = arg('plan-id')
  const confirm = arg('confirm-plan-id')
  if (!planId) {
    console.error('Refusing: requires --plan-id <uuid> — exactly one explicit plan; no bulk or default selection.')
    process.exit(1)
    return
  }
  if (confirm !== planId) {
    console.error('Refusing: --confirm-plan-id must exactly match --plan-id (accidental-invocation guard).')
    process.exit(1)
    return
  }

  const sb = createClient(url, key)
  const { data, error } = await sb.rpc(APPLY_RPC, { p_remedy_plan_id: planId })
  if (error) {
    console.error(`apply failed: ${error.message}`)
    process.exit(1)
    return
  }
  console.log('applied:', JSON.stringify(Array.isArray(data) ? data[0] : data))
}

main().catch((err) => {
  console.error('apply failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
