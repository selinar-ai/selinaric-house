// Execute migration 071 via Supabase Management API
// Tries service role key first, then falls back to instructions.

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

const sql = readFileSync(resolve(__dirname, '../supabase-migrations/071_llm_reasoning_feedback_events.sql'), 'utf-8')

console.log(`Project ref: ${projectRef}`)
console.log('Attempting migration via Management API...\n')

// Try Supabase Management API
const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

if (mgmtRes.ok) {
  console.log('✓ Migration executed successfully via Management API')
  process.exit(0)
}

const mgmtBody = await mgmtRes.text()
console.log(`Management API response: ${mgmtRes.status} — ${mgmtBody.slice(0, 200)}`)

// Try direct RPC if available
console.log('\nTrying exec_sql RPC...')
const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

if (rpcRes.ok) {
  console.log('✓ Migration executed via exec_sql RPC')
  process.exit(0)
}

const rpcBody = await rpcRes.text()
console.log(`exec_sql RPC: ${rpcRes.status} — ${rpcBody.slice(0, 200)}`)

console.log('\n⚠ Programmatic execution not available.')
console.log('Please paste the SQL from supabase-migrations/071_llm_reasoning_feedback_events.sql')
console.log('into the Supabase SQL Editor and click Run.')
process.exit(1)
