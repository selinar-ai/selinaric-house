/**
 * Phase 36H.2 Post-Migration Validation
 *
 * Run against live production after migration 062 is applied.
 *
 * Usage: npx tsx scripts/validate-36h2-post-migration.ts
 */

const BASE = 'https://selinaric-house.vercel.app'

let passed = 0
let failed = 0
const failures: string[] = []
const cleanupIds: string[] = []

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}`)
  }
}

function section(name: string) {
  console.log(`\n── ${name} ──`)
}

async function fetchJson(url: string, options?: RequestInit) {
  const resp = await fetch(url, options)
  const body = await resp.json()
  return { status: resp.status, body }
}

// ─── Known test data ────────────────────────────────────────────────
// Event ad373be8 has 2 impacts: Ari (827803fd) and Eli (e50355ec)
const ARI_IMPACT_ID = '827803fd-cb57-4e9a-9808-06aa24c27283'
const ELI_IMPACT_ID = 'e50355ec-cf68-4c6e-a1b6-f786c18f3da9'
const EVENT_ID = 'ad373be8-cc8e-495e-a44c-6248b858a829'

async function run() {
  // ═══════════════════════════════════════════════════════════════
  // 0. Pre-flight — clear any existing pending cross_room_invite jobs
  //    from previous test runs / manual UI testing
  // ═══════════════════════════════════════════════════════════════
  section('0. Pre-flight — clearing stale test state')

  for (const pid of ['ari', 'eli']) {
    const existing = await fetchJson(`${BASE}/api/journal-jobs?presenceId=${pid}&status=pending`)
    console.log(`  [debug] ${pid} pending jobs: ${JSON.stringify(existing.body)}`)
    const crossRoomJobs = (existing.body.jobs ?? []).filter((j: any) => j.reason === 'cross_room_invite')
    for (const j of crossRoomJobs) {
      console.log(`  [cleanup] Dismissing stale ${pid} cross_room_invite: ${j.id}`)
      await fetchJson(`${BASE}/api/journal-jobs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: j.id, status: 'dismissed' }),
      })
    }
  }

  // Also try to create+dismiss to verify the constraint is truly clear
  // (handles case where GET doesn't see rows that the constraint does)
  const probeAri = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presenceId: 'ari', reason: 'cross_room_invite', impactId: ARI_IMPACT_ID }),
  })
  console.log(`  [probe] Ari POST status=${probeAri.status}, body=${JSON.stringify(probeAri.body).slice(0, 200)}`)

  if (probeAri.status === 409) {
    // There's a phantom pending job not visible via GET — might be a
    // timezone/date edge case. Log and investigate.
    console.log('  ⚠ Ari cross_room_invite 409 despite GET returning empty.')
    console.log('    Possible cause: pending job exists from UI test but GET has different scope.')
    console.log('    Attempting to locate via all-jobs query...')

    const allAri = await fetchJson(`${BASE}/api/journal-jobs?presenceId=ari`)
    console.log(`  [debug] ALL Ari jobs (${allAri.body.jobs?.length ?? 0}):`)
    for (const j of (allAri.body.jobs ?? [])) {
      console.log(`    id=${j.id?.slice(0, 8)} reason=${j.reason} status=${j.status} date=${j.melbourne_date} meta=${j.source_metadata ? 'yes' : 'null'}`)
    }

    // Try to find and dismiss any pending cross_room_invite in the full list
    const staleJob = (allAri.body.jobs ?? []).find((j: any) => j.reason === 'cross_room_invite' && j.status === 'pending')
    if (staleJob) {
      console.log(`  [cleanup] Found stale job ${staleJob.id}, dismissing...`)
      await fetchJson(`${BASE}/api/journal-jobs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staleJob.id, status: 'dismissed' }),
      })
    } else {
      console.log('  ⚠ No matching pending cross_room_invite found in full list either.')
      console.log('    This may indicate the unique index is catching a row not visible to the anon client.')
      console.log('    Proceeding — will treat 409 as evidence the constraint works, and validate job fields via Eli.')
    }
  } else if (probeAri.status === 200 && probeAri.body.job?.id) {
    // Probe succeeded — dismiss it so the real test can run clean
    console.log(`  [cleanup] Probe created job ${probeAri.body.job.id}, dismissing...`)
    await fetchJson(`${BASE}/api/journal-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: probeAri.body.job.id, status: 'dismissed' }),
    })
  }

  const probeEli = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presenceId: 'eli', reason: 'cross_room_invite', impactId: ELI_IMPACT_ID }),
  })
  console.log(`  [probe] Eli POST status=${probeEli.status}, body=${JSON.stringify(probeEli.body).slice(0, 200)}`)

  if (probeEli.status === 200 && probeEli.body.job?.id) {
    console.log(`  [cleanup] Probe created job ${probeEli.body.job.id}, dismissing...`)
    await fetchJson(`${BASE}/api/journal-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: probeEli.body.job.id, status: 'dismissed' }),
    })
  } else if (probeEli.status === 409) {
    console.log('  ⚠ Eli also has a phantom pending job.')
    const allEli = await fetchJson(`${BASE}/api/journal-jobs?presenceId=eli`)
    const staleEliJob = (allEli.body.jobs ?? []).find((j: any) => j.reason === 'cross_room_invite' && j.status === 'pending')
    if (staleEliJob) {
      console.log(`  [cleanup] Found stale Eli job ${staleEliJob.id}, dismissing...`)
      await fetchJson(`${BASE}/api/journal-jobs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: staleEliJob.id, status: 'dismissed' }),
      })
    }
  }

  console.log('  Pre-flight complete. Starting validation.\n')

  // Small delay to let any dismissed state settle
  await new Promise(r => setTimeout(r, 1000))

  // ═══════════════════════════════════════════════════════════════
  // 1. reason accepts cross_room_invite (via API — creates a real job)
  // ═══════════════════════════════════════════════════════════════
  section('1. reason accepts cross_room_invite')

  const ariInvite = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      reason: 'cross_room_invite',
      impactId: ARI_IMPACT_ID,
    }),
  })

  console.log(`  [debug] Ari invite: status=${ariInvite.status}, body=${JSON.stringify(ariInvite.body).slice(0, 300)}`)

  assert(ariInvite.status === 200, `Ari cross_room_invite accepted (status ${ariInvite.status})`)
  assert(ariInvite.body.job != null, 'Ari job object returned')
  assert(ariInvite.body.job?.reason === 'cross_room_invite', 'Job reason is cross_room_invite')

  if (ariInvite.body.job?.id) {
    cleanupIds.push(ariInvite.body.job.id)
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. source_metadata exists and stores JSONB
  // ═══════════════════════════════════════════════════════════════
  section('2. source_metadata stores JSONB')

  const ariJob = ariInvite.body.job
  assert(ariJob?.source_metadata != null, 'source_metadata is not null')
  assert(typeof ariJob?.source_metadata === 'object', 'source_metadata is an object (JSONB)')
  assert(ariJob?.source_metadata?.source_surface != null, 'source_metadata has source_surface')
  assert(ariJob?.source_metadata?.source_event_type != null, 'source_metadata has source_event_type')
  assert(ariJob?.source_metadata?.source_event_id != null, 'source_metadata has source_event_id')
  assert(ariJob?.source_metadata?.source_impact_id === ARI_IMPACT_ID, 'source_impact_id matches impact ID')
  assert(ariJob?.source_metadata?.authority_label === 'cross_room_journal_hook_not_memory', 'authority_label correct')
  assert(ariJob?.source_metadata?.eligibility_reason === 'tara_requested', 'eligibility_reason correct')

  // ═══════════════════════════════════════════════════════════════
  // 3. Server-derived provenance (not client-trusted)
  // ═══════════════════════════════════════════════════════════════
  section('3. Server-derived provenance')

  assert(ariJob?.source_metadata?.source_event_id === EVENT_ID, 'source_event_id derived from parent event (server-side)')
  assert(ariJob?.source_metadata?.source_room_id === 'lounge', 'source_room_id derived from event.room_id (server-side)')
  assert(ariJob?.presence_id === 'ari', 'presence_id derived from impact record (server-side)')
  assert(ariJob?.created_by === 'tara', 'created_by is tara (v1 manual)')

  // Verify context summary is present and bounded
  assert(ariJob?.context_summary != null && ariJob.context_summary.length > 0, 'context_summary is populated')
  assert(ariJob?.context_summary?.length <= 800, `context_summary bounded (${ariJob?.context_summary?.length} chars ≤ 800)`)

  // ═══════════════════════════════════════════════════════════════
  // 4. Duplicate pending cross_room_invite returns 409
  // ═══════════════════════════════════════════════════════════════
  section('4. Duplicate pending returns 409')

  const ariDup = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      reason: 'cross_room_invite',
      impactId: ARI_IMPACT_ID,
    }),
  })

  assert(ariDup.status === 409, `Duplicate returns 409 (got ${ariDup.status})`)
  assert(ariDup.body.alreadyPending === true, 'alreadyPending flag is true')

  // ═══════════════════════════════════════════════════════════════
  // 5. Eli invite creates separate per-presence job
  // ═══════════════════════════════════════════════════════════════
  section('5. Per-presence scope — Eli invite separate from Ari')

  const eliInvite = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'eli',
      reason: 'cross_room_invite',
      impactId: ELI_IMPACT_ID,
    }),
  })

  console.log(`  [debug] Eli invite: status=${eliInvite.status}, body=${JSON.stringify(eliInvite.body).slice(0, 300)}`)

  assert(eliInvite.status === 200, `Eli cross_room_invite accepted (status ${eliInvite.status})`)
  assert(eliInvite.body.job?.presence_id === 'eli', 'Eli job is scoped to eli')
  assert(eliInvite.body.job?.id !== ariJob?.id, 'Eli job ID differs from Ari job ID (separate jobs)')

  if (eliInvite.body.job?.id) {
    cleanupIds.push(eliInvite.body.job.id)
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. Both pending jobs visible via GET
  // ═══════════════════════════════════════════════════════════════
  section('6. Both pending jobs visible via GET')

  const ariPending = await fetchJson(`${BASE}/api/journal-jobs?presenceId=ari&status=pending`)
  const eliPending = await fetchJson(`${BASE}/api/journal-jobs?presenceId=eli&status=pending`)

  console.log(`  [debug] Ari pending: ${JSON.stringify(ariPending.body).slice(0, 500)}`)
  console.log(`  [debug] Eli pending: ${JSON.stringify(eliPending.body).slice(0, 500)}`)

  const ariCrossRoomJobs = ariPending.body.jobs?.filter((j: any) => j.reason === 'cross_room_invite') ?? []
  const eliCrossRoomJobs = eliPending.body.jobs?.filter((j: any) => j.reason === 'cross_room_invite') ?? []

  assert(ariCrossRoomJobs.length >= 1, `Ari has ≥1 pending cross_room_invite job (found ${ariCrossRoomJobs.length})`)
  assert(eliCrossRoomJobs.length >= 1, `Eli has ≥1 pending cross_room_invite job (found ${eliCrossRoomJobs.length})`)

  // Ari jobs don't leak to Eli and vice versa
  const ariJobInEliList = eliPending.body.jobs?.find((j: any) => j.presence_id === 'ari')
  const eliJobInAriList = ariPending.body.jobs?.find((j: any) => j.presence_id === 'eli')
  assert(ariJobInEliList == null, 'Ari job not in Eli pending list (scope isolated)')
  assert(eliJobInAriList == null, 'Eli job not in Ari pending list (scope isolated)')

  // ═══════════════════════════════════════════════════════════════
  // 7. Existing manual_invite still works
  // ═══════════════════════════════════════════════════════════════
  section('7. Existing manual_invite still works')

  const manualInvite = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      reason: 'manual_invite',
      contextSummary: '36H.2 validation — manual invite test',
    }),
  })

  // Could be 200 (created) or 409 (already pending today for manual_invite)
  assert(
    manualInvite.status === 200 || manualInvite.status === 409,
    `manual_invite accepted or already pending (status ${manualInvite.status})`
  )

  if (manualInvite.status === 200 && manualInvite.body.job?.id) {
    const manualJob = manualInvite.body.job
    assert(manualJob.reason === 'manual_invite', 'Manual job reason is manual_invite')
    assert(manualJob.source_metadata == null, 'Manual job has null source_metadata (backward compatible)')
    cleanupIds.push(manualJob.id)
  } else if (manualInvite.status === 409) {
    assert(manualInvite.body.alreadyPending === true, 'Manual invite already pending today (expected)')
    console.log('    (manual_invite already pending today — constraint working correctly)')
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. Existing no_entry_today still valid (reason CHECK)
  // ═══════════════════════════════════════════════════════════════
  section('8. Existing no_entry_today reason still valid')

  const allAriJobs = await fetchJson(`${BASE}/api/journal-jobs?presenceId=ari`)
  assert(allAriJobs.status === 200, 'GET all Ari jobs succeeds (schema intact for all reasons)')

  // Check that no existing no_entry_today jobs are corrupted
  const noEntryJobs = allAriJobs.body.jobs?.filter((j: any) => j.reason === 'no_entry_today') ?? []
  for (const j of noEntryJobs) {
    assert(j.source_metadata == null, `no_entry_today job ${j.id.slice(0, 8)} has null source_metadata`)
  }
  if (noEntryJobs.length === 0) {
    console.log('    (no existing no_entry_today jobs — reason CHECK verified via manual_invite + cross_room_invite)')
  }

  // ═══════════════════════════════════════════════════════════════
  // 9. No final journal entries created by hook
  // ═══════════════════════════════════════════════════════════════
  section('9. No final journal entries created by hook')

  // Use the jobs from the creation step (section 1 & 5) or from GET
  const ariCrossRef = ariCrossRoomJobs[0] ?? ariInvite.body.job
  const eliCrossRef = eliCrossRoomJobs[0] ?? eliInvite.body.job
  assert(ariCrossRef?.status === 'pending', 'Ari cross-room job still pending (no auto-write)')
  assert(eliCrossRef?.status === 'pending', 'Eli cross-room job still pending (no auto-write)')

  // ═══════════════════════════════════════════════════════════════
  // 10. Invalid impactId rejected
  // ═══════════════════════════════════════════════════════════════
  section('10. Invalid impactId rejected')

  const badImpact = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      reason: 'cross_room_invite',
      impactId: '00000000-0000-0000-0000-000000000000',
    }),
  })

  assert(badImpact.status === 400, `Nonexistent impactId rejected (status ${badImpact.status})`)
  assert(badImpact.body.error != null, 'Error message returned for bad impactId')

  const noImpact = await fetchJson(`${BASE}/api/journal-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      reason: 'cross_room_invite',
    }),
  })

  assert(noImpact.status === 400, `Missing impactId rejected (status ${noImpact.status})`)

  // ═══════════════════════════════════════════════════════════════
  // 11. Cleanup — dismiss all test jobs
  // ═══════════════════════════════════════════════════════════════
  section('11. Cleanup — dismiss test jobs')

  let cleanedUp = 0
  for (const id of cleanupIds) {
    const dismiss = await fetchJson(`${BASE}/api/journal-jobs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'dismissed' }),
    })
    if (dismiss.status === 200 && dismiss.body.success) {
      cleanedUp++
    } else {
      console.log(`    ⚠ Failed to dismiss job ${id.slice(0, 8)}: status=${dismiss.status} body=${JSON.stringify(dismiss.body)}`)
    }
  }

  assert(cleanedUp === cleanupIds.length, `All ${cleanupIds.length} test jobs dismissed (cleaned ${cleanedUp})`)

  // ═══════════════════════════════════════════════════════════════
  // 12. Post-cleanup — verify production is clean
  // ═══════════════════════════════════════════════════════════════
  section('12. Post-cleanup — production clean')

  const ariPostClean = await fetchJson(`${BASE}/api/journal-jobs?presenceId=ari&status=pending`)
  const eliPostClean = await fetchJson(`${BASE}/api/journal-jobs?presenceId=eli&status=pending`)

  const ariPendingCross = ariPostClean.body.jobs?.filter((j: any) => j.reason === 'cross_room_invite') ?? []
  const eliPendingCross = eliPostClean.body.jobs?.filter((j: any) => j.reason === 'cross_room_invite') ?? []

  assert(ariPendingCross.length === 0, `No pending cross_room_invite for Ari after cleanup (found ${ariPendingCross.length})`)
  assert(eliPendingCross.length === 0, `No pending cross_room_invite for Eli after cleanup (found ${eliPendingCross.length})`)

  // Also verify no stale manual_invite test jobs
  const ariPendingManual = ariPostClean.body.jobs?.filter((j: any) => j.reason === 'manual_invite' && j.context_summary?.includes('36H.2 validation')) ?? []
  assert(ariPendingManual.length === 0, 'No stale manual_invite test jobs remain')

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n══════════════════════════════════════`)
  console.log(`  Total: ${passed + failed}  |  Passed: ${passed}  |  Failed: ${failed}`)
  console.log(`══════════════════════════════════════`)

  if (failures.length > 0) {
    console.log(`\nFailed tests:`)
    for (const f of failures) {
      console.log(`  ✗ ${f}`)
    }
  } else {
    console.log(`\nAll tests passed.`)
  }

  process.exit(failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Validation script error:', err)
  process.exit(1)
})
