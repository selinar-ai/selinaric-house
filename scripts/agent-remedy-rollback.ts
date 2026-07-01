/**
 * Phase 42.3.4c — CLI rollback (THE HAND, inverse). Deliberate, Tara-run only.
 *
 *   npx tsx scripts/agent-remedy-rollback.ts --plan-id <uuid> --confirm-plan-id <same uuid>
 *
 * Restores the exact prior `library_items.title` for a currently-applied plan via the governed
 * `agent_remedy_rollback` RPC (refuses unless the current title still equals the applied
 * after_value — never clobbers a later manual edit). One explicit plan id only — NO batch,
 * NO rollback-all, NO default, NO route, NO scheduler. Double plan-id confirmation guard.
 */

import { createClient } from '@supabase/supabase-js'
import { ROLLBACK_RPC } from '../src/lib/agents/maintenance/contract'

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
  const { data, error } = await sb.rpc(ROLLBACK_RPC, { p_remedy_plan_id: planId })
  if (error) {
    console.error(`rollback failed: ${error.message}`)
    process.exit(1)
    return
  }
  console.log('rolled_back:', JSON.stringify(Array.isArray(data) ? data[0] : data))
}

main().catch((err) => {
  console.error('rollback failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
