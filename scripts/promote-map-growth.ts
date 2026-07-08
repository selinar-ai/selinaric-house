/**
 * Phase 43 — Map Growth Queue CLI (generalized archive→map promotion; preview-first).
 *
 *   npx tsx scripts/promote-map-growth.ts --list                      list eligible clusters (read-only)
 *   npx tsx scripts/promote-map-growth.ts --cluster <id>              preview one cluster   (read-only)
 *   npx tsx scripts/promote-map-growth.ts --cluster <id> --confirm    promote → pending_review (governed write)
 *
 * --list and preview write nothing. The confirmed run creates a cluster's node+edge proposals as
 * pending_review (node-first) for Ontology Lab approval — it NEVER approves. Refuses over WAVE_MAX.
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

function arg(name: string): string | undefined { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined }
function has(name: string): boolean { return process.argv.includes(`--${name}`) }

async function main() {
  const mod = await import('../src/lib/graph/mapGrowthPromotion')
  const clusterId = arg('cluster')
  const confirm = has('confirm')

  if (has('list') || (!clusterId)) {
    const clusters = await mod.discoverEligibleClusters()
    const multi = clusters.filter((c) => c.nodes.length >= 2)
    console.log(`ELIGIBLE CLUSTERS: ${clusters.length} total, ${multi.length} with ≥2 nodes (singletons not recommended). Cap ${mod.WAVE_MAX}/wave.\n`)
    for (const c of clusters) {
      const flags = [c.overCap ? 'OVER-CAP(refused)' : '', c.heldEdgeTypes.length ? `HELD:${c.heldEdgeTypes.join(',')}` : '', c.nodes.length === 1 ? 'singleton' : ''].filter(Boolean).join(' ')
      console.log(`  ${c.id}  [${c.nodes.length}n/${c.edges.length}e ${c.archives.join('/')}] ${flags}`)
      console.log(`       ${c.sampleLabels.join(' · ')}${c.nodes.length > 6 ? ' …' : ''}   edges:{${c.edgeTypes.join(',')}}`)
    }
    console.log(`\nPreview a cluster:  --cluster <id>     Promote it:  --cluster <id> --confirm`)
    process.exit(0)
  }

  const res = await mod.promoteCluster(clusterId!, { confirm })
  if (res.mode === 'not_found') { console.error(`NOT FOUND: no eligible cluster with id ${clusterId} (it may have been promoted/approved already — re-run --list).`); process.exit(1) }
  if (res.mode === 'refused') { console.error(`REFUSED: ${res.reason}`); process.exit(1) }

  const c = res.cluster
  if (res.mode === 'preview') {
    console.log(`PREVIEW cluster ${c.id} [${c.nodes.length} nodes / ${c.edges.length} edges, ${c.archives.join('/')}] (writes nothing):`)
    if (c.heldEdgeTypes.length) console.log(`  HELD edge types (unadmitted, not promoted): ${c.heldEdgeTypes.join(', ')}`)
    console.log('  NODES [midlevel]:')
    for (const n of c.nodes) console.log(`    ${n.label}  [${n.nodeType} / scope ${n.scope}]  (${n.id.slice(0, 8)})`)
    console.log('  EDGES:')
    for (const e of c.edges) console.log(`    ${e.from.label} — ${e.edgeType} → ${e.to.label}  [scope ${e.edgeScope}]  (${e.edgeId.slice(0, 8)}, ${e.sourceItemIds.length} src)`)
    console.log('\nRun with --confirm to create these as graph_proposals(pending_review) for Ontology Lab approval.')
    process.exit(0)
  }

  // promoted
  const nOk = res.nodes.filter((r) => r.result.ok).length
  const eOk = res.edges.filter((r) => r.result.ok).length
  console.log(`PROMOTED cluster ${c.id} — ${nOk}/${res.nodes.length} nodes, ${eOk}/${res.edges.length} edges created (pending_review):`)
  for (const { node, result } of res.nodes) console.log(`  ${result.ok ? '✓' : '✗'} NODE ${node.label}  ${result.ok ? '→ ' + result.proposalId : '→ ' + result.code + ': ' + result.error}`)
  for (const { edge, result } of res.edges) console.log(`  ${result.ok ? '✓' : '✗'} EDGE ${edge.from.label} — ${edge.edgeType} → ${edge.to.label}  ${result.ok ? '→ ' + result.proposalId : '→ ' + result.code + ': ' + result.error}`)
  console.log(`\nApprove them in the Ontology Lab (nodes first, then edges) to grow the map's midlevel layer.`)
  process.exit(nOk === res.nodes.length && eOk === res.edges.length ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
