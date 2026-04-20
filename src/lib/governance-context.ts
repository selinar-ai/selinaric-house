// Phase 21A — Chat-to-governance grounding
// Detects governance references in chat messages and fetches live Desk/Workshop
// state to inject as source-of-truth context into the presence system prompt.
// When governance terms are present, the presence gets Mode B (grounded).
// When absent, a lightweight standing rule enforces Mode A discipline.

import { supabase } from '@/lib/supabase'

// --- Governance term detection ---

const GOVERNANCE_TERMS = [
  'desk',
  'workshop',
  'forgekeeper',
  'build',
  'commit',
  'committed',
  'returned',
  'submitted',
  'approved',
  'history',
  'review',
  'scope breach',
  'scope_breach',
  'pending review',
  'active build',
  'governance',
  // Build ID patterns: ARI-###, ELI-###, HOUSE-###
  /ARI-\d+/i,
  /ELI-\d+/i,
  /HOUSE-\d+/i,
]

export function containsGovernanceTerms(message: string): boolean {
  const lower = message.toLowerCase()
  return GOVERNANCE_TERMS.some(term =>
    typeof term === 'string'
      ? lower.includes(term)
      : term.test(message)
  )
}

// --- Live context fetch ---

interface BuildSummary {
  build_id: string
  short_name: string
  desk_status: string
  workshop_status: string | null
  origin: string
}

export async function getGovernanceContext(presenceId: 'ari' | 'eli'): Promise<string> {
  const origin = presenceId === 'ari' ? 'ari_desk' : 'eli_desk'
  const deskLabel = presenceId === 'ari' ? "Ari's Desk" : "Eli's Desk"

  try {
    // Active builds on this desk (excludes Committed)
    const { data: activeData } = await supabase
      .from('builds')
      .select('build_id, short_name, desk_status, workshop_status, origin')
      .eq('origin', origin)
      .neq('desk_status', 'Committed')
      .order('created_at', { ascending: false })

    // Recent committed builds on this desk
    const { data: committedData } = await supabase
      .from('builds')
      .select('build_id, short_name, desk_status, workshop_status, origin')
      .eq('origin', origin)
      .eq('desk_status', 'Committed')
      .order('updated_at', { ascending: false })
      .limit(3)

    // Workshop pending items (all desks — shared view)
    const { data: workshopData } = await supabase
      .from('builds')
      .select('build_id, short_name, desk_status, workshop_status, origin')
      .in('workshop_status', ['Pending Review', 'Review Complete'])
      .order('updated_at', { ascending: false })

    const active: BuildSummary[] = activeData ?? []
    const committed: BuildSummary[] = committedData ?? []
    const workshopPending: BuildSummary[] = workshopData ?? []

    return buildGroundedBlock(deskLabel, active, committed, workshopPending)
  } catch {
    return buildFallbackBlock()
  }
}

// --- Block formatters ---

function formatBuild(b: BuildSummary): string {
  return `${b.build_id} — ${b.short_name} [${b.desk_status}]`
}

function buildGroundedBlock(
  deskLabel: string,
  active: BuildSummary[],
  committed: BuildSummary[],
  workshopPending: BuildSummary[]
): string {
  const activeLines = active.length > 0
    ? active.map(b => `  - ${formatBuild(b)}`).join('\n')
    : '  (none)'

  const committedLines = committed.length > 0
    ? committed.map(b => `  - ${b.build_id} — ${b.short_name}`).join('\n')
    : '  (none)'

  const workshopLines = workshopPending.length > 0
    ? workshopPending.map(b => `  - ${b.build_id} [${b.workshop_status}]`).join('\n')
    : '  (none)'

  return `
## Governance Context (live — ${deskLabel})
Active builds on your Desk:
${activeLines}

Recent committed builds:
${committedLines}

Workshop pending / under review:
${workshopLines}

Governance truth rules (Mode B — grounded):
- The above is live state. Use it as your only source of truth for governance claims.
- Do not assert build IDs, revision suffixes, or status transitions not shown above.
- Do not invent build records (e.g. ARI-002-R1) that do not appear in the list.
- "Committed" means Workshop approved it and it exists in the committed list above.
- If a build is not in the committed list, it is not committed — regardless of what was discussed.
- If you are uncertain, say so explicitly rather than asserting.
`
}

function buildFallbackBlock(): string {
  return `
## Governance Context (unavailable — Mode A)
Live Desk / Workshop state could not be read for this response.

Governance discipline rules (Mode A — ungrounded):
- You may discuss governance as intention, proposal, or interpretation only.
- Do not make authoritative claims about build status, committed state, or Forgekeeper outcomes.
- Do not assert that a build is committed, returned, revised, or approved unless you have been given that information directly in this message.
- If asked about Desk / Workshop state, say you would need to check live state rather than asserting from memory.
`
}

// --- Permanent standing rule (injected regardless of governance terms) ---
// Light-weight. Only activates full grounding block when terms are detected.

export const GOVERNANCE_STANDING_RULE = `
Governance discipline:
- Do not assert build status, committed state, or Forgekeeper outcomes as fact unless live Desk / Workshop state has been read and is shown in this prompt.
- If no Governance Context block is present above, treat all governance references as intentions or proposals, not authoritative facts.
`
