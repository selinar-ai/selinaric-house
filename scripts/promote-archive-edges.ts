/**
 * Phase 43 Option A — curated archive_graph → map edge promotion (CLI, preview-first).
 *
 *   npx tsx scripts/promote-archive-edges.ts                  — PREVIEW (read-only, default)
 *   npx tsx scripts/promote-archive-edges.ts --confirm-promote — create graph_proposals(pending_review)
 *
 * Preview writes nothing. The confirmed run creates one pending_review graph_proposal per curated
 * edge (edges only, prompt_eligible=false, provenance to the archive_graph_edge). It NEVER
 * approves — Tara approves in the Ontology Lab. Refuses if the curated set exceeds MAX_PROMOTE.
 */

import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local BEFORE importing the promotion module (its supabase client reads env at import).
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v.replace(/\r$/, '')
  }
}

async function main() {
  const confirm = process.argv.includes('--confirm-promote')
  const { promoteArchiveEdges } = await import('../src/lib/graph/archiveEdgePromotion')

  const res = await promoteArchiveEdges({ confirm })

  if (res.mode === 'refused') {
    console.error(`REFUSED: ${res.reason}`)
    process.exit(1)
  }
  if (res.mode === 'preview') {
    console.log(`PREVIEW — ${res.candidates.length} curated edge(s) promotable (writes nothing):`)
    for (const c of res.candidates) {
      console.log(`  ${c.from.label} — ${c.edgeType} → ${c.to.label}   [edge scope: ${c.edgeScope}]  provenance: archive_graph_edge ${c.edgeId.slice(0, 8)} (${c.sourceItemIds.length} source item(s))`)
    }
    console.log('\nRun with --confirm-promote to create these as graph_proposals(pending_review) for Ontology Lab approval.')
    process.exit(0)
  }
  // promoted
  console.log(`PROMOTED — created ${res.created.length} pending_review proposal(s):`)
  let ok = 0
  for (const { candidate, result } of res.created) {
    if (result.ok) { ok++; console.log(`  ✓ ${candidate.from.label} — ${candidate.edgeType} → ${candidate.to.label}  → proposal ${result.proposalId}`) }
    else console.log(`  ✗ ${candidate.from.label} — ${candidate.edgeType} → ${candidate.to.label}  → ${result.code}: ${result.error}`)
  }
  console.log(`\n${ok}/${res.created.length} created. Approve them in the Ontology Lab to grow the map.`)
  process.exit(ok === res.created.length ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
