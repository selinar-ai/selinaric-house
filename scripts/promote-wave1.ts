/**
 * Phase 43 Wave 1 — "Continuity & Impermanence" midlevel promotion (CLI, preview-first).
 *
 *   npx tsx scripts/promote-wave1.ts                   — PREVIEW (read-only, default)
 *   npx tsx scripts/promote-wave1.ts --confirm-promote — create 8 node + 8 edge graph_proposals(pending_review)
 *
 * Preview writes nothing. The confirmed run creates the wave as pending_review (node-first, then edges),
 * for Ontology Lab approval. It NEVER approves. Refuses beyond the 8/8 cap.
 */

import ws from 'ws'
if (!globalThis.WebSocket) globalThis.WebSocket = ws as unknown as typeof globalThis.WebSocket

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
  const { promoteWave1 } = await import('../src/lib/graph/archiveWavePromotion')
  const res = await promoteWave1({ confirm })

  if (res.mode === 'refused') { console.error(`REFUSED: ${res.reason}`); process.exit(1) }

  if (res.mode === 'preview') {
    console.log(`PREVIEW — Wave 1 "Continuity & Impermanence" (writes nothing):`)
    console.log(`\n  ${res.nodes.length} NODE(s) [midlevel]:`)
    for (const n of res.nodes) console.log(`    ${n.label}  [${n.nodeType} / scope ${n.scope}]  (archive_graph_node ${n.id.slice(0, 8)})`)
    console.log(`\n  ${res.edges.length} EDGE(s):`)
    for (const e of res.edges) console.log(`    ${e.from.label} — ${e.edgeType} → ${e.to.label}  [scope ${e.edgeScope}]  (archive_graph_edge ${e.edgeId.slice(0, 8)}, ${e.sourceItemIds.length} src)`)
    console.log('\nRun with --confirm-promote to create these as graph_proposals(pending_review) for Ontology Lab approval.')
    process.exit(0)
  }

  // promoted
  const nOk = res.nodes.filter((r) => r.result.ok).length
  const eOk = res.edges.filter((r) => r.result.ok).length
  console.log(`PROMOTED — ${nOk}/${res.nodes.length} nodes, ${eOk}/${res.edges.length} edges created (pending_review):`)
  for (const { node, result } of res.nodes) console.log(`  ${result.ok ? '✓' : '✗'} NODE ${node.label}  ${result.ok ? '→ ' + result.proposalId : '→ ' + result.code + ': ' + result.error}`)
  for (const { edge, result } of res.edges) console.log(`  ${result.ok ? '✓' : '✗'} EDGE ${edge.from.label} — ${edge.edgeType} → ${edge.to.label}  ${result.ok ? '→ ' + result.proposalId : '→ ' + result.code + ': ' + result.error}`)
  console.log(`\nApprove them in the Ontology Lab (nodes first, then edges) to grow the map's midlevel layer.`)
  process.exit(nOk === res.nodes.length && eOk === res.edges.length ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
