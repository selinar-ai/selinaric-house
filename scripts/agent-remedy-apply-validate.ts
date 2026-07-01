/**
 * Phase 42.3.4c — CLI validate apply readiness (preflight). READ-ONLY.
 *
 *   npx tsx scripts/agent-remedy-apply-validate.ts --plan-id <uuid>
 *
 * Runs the apply-time revalidation checks via the read-only `agent_remedy_apply_validate` RPC
 * and prints the result. Writes NOTHING — no apply event, no library_items update, no
 * house_source_write, reserves/queues/authorises nothing. Used as the first-real-apply
 * preflight. One explicit plan id only.
 */

import { createClient } from '@supabase/supabase-js'
import { APPLY_VALIDATE_RPC } from '../src/lib/agents/maintenance/contract'

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
  if (!planId) {
    console.error('Refusing: requires --plan-id <uuid>.')
    process.exit(1)
    return
  }

  const sb = createClient(url, key)
  const { data, error } = await sb.rpc(APPLY_VALIDATE_RPC, { p_remedy_plan_id: planId })
  if (error) {
    console.error(`validate failed: ${error.message}`)
    process.exit(1)
    return
  }
  console.log('validation:', JSON.stringify(Array.isArray(data) ? data[0] : data))
}

main().catch((err) => {
  console.error('validate failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
