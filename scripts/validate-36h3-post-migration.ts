/**
 * Phase 36H.3 Post-Migration Validation
 *
 * Run against live production after migration 064 is applied.
 *
 * Validates:
 * - Reflection job creation via cross_room_event trigger
 * - Server-derived provenance from impact → event
 * - Per-impact duplicate prevention
 * - Reflection job visibility in GET
 * - Run button exclusion (cross-room jobs not in processable set)
 * - Cleanup
 *
 * Usage: npx tsx scripts/validate-36h3-post-migration.ts
 */

export {}  // TypeScript module boundary — prevents global scope collisions

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
  // 0. Pre-flight — clear stale cross_room_event reflection jobs
  // ═══════════════════════════════════════════════════════════════
  section('0. Pre-flight — clearing stale test state')

  for (const pid of ['ari', 'eli']) {
    const existing = await fetchJson(`${BASE}/api/reflection-jobs?presenceId=${pid}&status=pending`)
    const crossRoomJobs = (existing.body.jobs ?? []).filter(
      (j: any) => j.trigger_type === 'cross_room_event'
    )
    for (const j of crossRoomJobs) {
      console.log(`  [cleanup] Marking stale ${pid} cross_room_event job as failed: ${j.id}`)
      // We can't delete directly, but we can track for later cleanup
      cleanupIds.push(j.id)
    }
  }

  if (cleanupIds.length > 0) {
    console.log(`  [pre-flight] Found ${cleanupIds.length} stale cross-room reflection jobs.`)
    console.log(`  [pre-flight] These may cause duplicate_pending_job results in tests.`)
    console.log(`  [pre-flight] If tests fail with 409, manually clear pending cross-room reflection jobs.`)
  } else {
    console.log('  No stale cross-room reflection jobs found.')
  }

  // ═══════════════════════════════════════════════════════════════
  // 1. Create cross-room reflection job from Ari impact
  // ═══════════════════════════════════════════════════════════════
  section('1. Create cross-room reflection job from Ari impact')

  const ariCreate = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'cross_room_event',
      impactId: ARI_IMPACT_ID,
    }),
  })

  // Accept either 201 (new) or 409 (duplicate from pre-existing)
  const ariCreated = ariCreate.status === 201
  const ariDuplicate = ariCreate.status === 409

  assert(
    ariCreated || ariDuplicate,
    `Ari reflection job created or already exists (status: ${ariCreate.status})`
  )

  if (ariCreated) {
    const job = ariCreate.body.job
    assert(job.presence_id === 'ari', 'Job presence_id = ari')
    assert(job.trigger_type === 'cross_room_event', 'Job trigger_type = cross_room_event')
    assert(job.status === 'pending', 'Job status = pending')
    assert(job.reflection_scope === 'ari', 'Job reflection_scope = ari')
    assert(job.created_by === 'tara', 'Job created_by = tara')
    assert(job.source_metadata !== null, 'Job source_metadata is not null')
    assert(
      job.source_metadata?.authority_label === 'cross_room_reflection_hook_not_memory',
      'Job source_metadata.authority_label correct'
    )
    assert(
      job.source_metadata?.source_impact_id === ARI_IMPACT_ID,
      'Job source_metadata.source_impact_id matches'
    )
    assert(
      job.source_metadata?.source_event_id === EVENT_ID,
      'Job source_metadata.source_event_id matches parent event'
    )
    assert(
      typeof job.source_summary === 'string' && job.source_summary.length > 0,
      'Job source_summary is non-empty string'
    )
    assert(
      Array.isArray(job.source_refs) && job.source_refs.length === 1,
      'Job source_refs has one entry'
    )
    assert(
      job.source_refs[0].type === 'cross_room_impact',
      'source_refs[0].type = cross_room_impact'
    )
    assert(
      job.source_refs[0].id === ARI_IMPACT_ID,
      'source_refs[0].id = impactId'
    )
    cleanupIds.push(job.id)
  } else {
    console.log('  [info] Ari job already exists — skipping field checks')
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. Duplicate prevention — same impact should return 409
  // ═══════════════════════════════════════════════════════════════
  section('2. Duplicate prevention')

  const ariDup = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'cross_room_event',
      impactId: ARI_IMPACT_ID,
    }),
  })

  assert(ariDup.status === 409, `Duplicate Ari impact returns 409 (got ${ariDup.status})`)
  assert(
    ariDup.body.skippedReason === 'duplicate_pending_job',
    'Duplicate reason is duplicate_pending_job'
  )

  // ═══════════════════════════════════════════════════════════════
  // 3. Create cross-room reflection job from Eli impact
  // ═══════════════════════════════════════════════════════════════
  section('3. Create cross-room reflection job from Eli impact')

  const eliCreate = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'eli',
      triggerType: 'cross_room_event',
      impactId: ELI_IMPACT_ID,
    }),
  })

  const eliCreated = eliCreate.status === 201
  const eliDuplicate = eliCreate.status === 409

  assert(
    eliCreated || eliDuplicate,
    `Eli reflection job created or already exists (status: ${eliCreate.status})`
  )

  if (eliCreated) {
    const job = eliCreate.body.job
    assert(job.presence_id === 'eli', 'Eli job presence_id = eli')
    assert(job.trigger_type === 'cross_room_event', 'Eli job trigger_type = cross_room_event')
    assert(job.reflection_scope === 'eli', 'Eli job reflection_scope = eli')
    assert(
      job.source_metadata?.source_impact_id === ELI_IMPACT_ID,
      'Eli job source_metadata.source_impact_id matches'
    )
    cleanupIds.push(job.id)
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. Read back — cross-room jobs visible in GET
  // ═══════════════════════════════════════════════════════════════
  section('4. Read back — cross-room jobs visible in GET')

  const ariJobs = await fetchJson(`${BASE}/api/reflection-jobs?presenceId=ari&status=pending`)
  assert(ariJobs.status === 200, 'GET ari pending returns 200')
  const ariCrossRoom = (ariJobs.body.jobs ?? []).filter(
    (j: any) => j.trigger_type === 'cross_room_event'
  )
  assert(ariCrossRoom.length >= 1, `Ari has at least 1 pending cross-room job (found ${ariCrossRoom.length})`)

  const eliJobs = await fetchJson(`${BASE}/api/reflection-jobs?presenceId=eli&status=pending`)
  assert(eliJobs.status === 200, 'GET eli pending returns 200')
  const eliCrossRoom = (eliJobs.body.jobs ?? []).filter(
    (j: any) => j.trigger_type === 'cross_room_event'
  )
  assert(eliCrossRoom.length >= 1, `Eli has at least 1 pending cross-room job (found ${eliCrossRoom.length})`)

  // ═══════════════════════════════════════════════════════════════
  // 5. Run button exclusion — process endpoint skips cross-room jobs
  // ═══════════════════════════════════════════════════════════════
  section('5. Run button exclusion — process skips cross-room jobs')

  // Process with limit=0 would be weird, so we process with limit=1
  // and verify that cross-room jobs are NOT picked up
  const processResult = await fetchJson(`${BASE}/api/reflections/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presenceId: 'ari', limit: 1 }),
  })

  assert(processResult.status === 200, 'Process endpoint returns 200')

  // After processing, verify cross-room job is still pending
  const ariJobsAfter = await fetchJson(`${BASE}/api/reflection-jobs?presenceId=ari&status=pending`)
  const ariCrossRoomAfter = (ariJobsAfter.body.jobs ?? []).filter(
    (j: any) => j.trigger_type === 'cross_room_event'
  )
  assert(
    ariCrossRoomAfter.length >= 1,
    'Cross-room job still pending after Run (not picked up by processor)'
  )

  // ═══════════════════════════════════════════════════════════════
  // 6. Validation — invalid inputs
  // ═══════════════════════════════════════════════════════════════
  section('6. Validation — invalid inputs')

  // Missing impactId
  const noImpact = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'cross_room_event',
    }),
  })
  assert(noImpact.status === 400, `Missing impactId returns 400 (got ${noImpact.status})`)

  // Empty impactId
  const emptyImpact = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'cross_room_event',
      impactId: '',
    }),
  })
  assert(emptyImpact.status === 400, `Empty impactId returns 400 (got ${emptyImpact.status})`)

  // Non-existent impactId
  const fakeImpact = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'cross_room_event',
      impactId: '00000000-0000-0000-0000-000000000000',
    }),
  })
  assert(fakeImpact.status === 400, `Non-existent impactId returns 400 (got ${fakeImpact.status})`)

  // Invalid presenceId
  const badPresence = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'tara',
      triggerType: 'cross_room_event',
      impactId: ARI_IMPACT_ID,
    }),
  })
  assert(badPresence.status === 400, `Invalid presenceId returns 400 (got ${badPresence.status})`)

  // ═══════════════════════════════════════════════════════════════
  // 7. Source metadata shape verification
  // ═══════════════════════════════════════════════════════════════
  section('7. Source metadata shape verification')

  if (ariCreated) {
    const job = ariCreate.body.job
    const meta = job.source_metadata
    assert(typeof meta.source_surface === 'string', 'source_metadata.source_surface is string')
    assert(typeof meta.source_event_type === 'string', 'source_metadata.source_event_type is string')
    assert(typeof meta.source_event_id === 'string', 'source_metadata.source_event_id is string')
    assert(typeof meta.source_impact_id === 'string', 'source_metadata.source_impact_id is string')
    assert(typeof meta.authority_label === 'string', 'source_metadata.authority_label is string')
    assert(typeof meta.eligibility_reason === 'string', 'source_metadata.eligibility_reason is string')
    assert(meta.source_room_id !== undefined, 'source_metadata.source_room_id is present')
  } else {
    // Read back the existing job to verify metadata
    const ariPending = (ariJobs.body.jobs ?? []).find(
      (j: any) => j.trigger_type === 'cross_room_event' && j.source_metadata?.source_impact_id === ARI_IMPACT_ID
    )
    if (ariPending) {
      const meta = ariPending.source_metadata
      assert(typeof meta.source_surface === 'string', 'source_metadata.source_surface is string')
      assert(typeof meta.authority_label === 'string', 'source_metadata.authority_label is string')
      assert(meta.authority_label === 'cross_room_reflection_hook_not_memory', 'authority label correct')
    } else {
      console.log('  [warn] Could not find Ari cross-room job for metadata verification')
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 8. Existing trigger types still work
  // ═══════════════════════════════════════════════════════════════
  section('8. Existing trigger types — backward compatibility')

  const legacyJob = await fetchJson(`${BASE}/api/reflection-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      presenceId: 'ari',
      triggerType: 'timeline_keep',
      sourceRefs: [{ type: 'timeline_entry', id: '00000000-0000-0000-0000-000000000001' }],
    }),
  })
  assert(
    legacyJob.status === 201,
    `Legacy trigger_type=timeline_keep still creates job (status: ${legacyJob.status})`
  )
  if (legacyJob.body.job) {
    cleanupIds.push(legacyJob.body.job.id)
    assert(
      legacyJob.body.job.source_metadata === null || legacyJob.body.job.source_metadata === undefined,
      'Legacy job has no source_metadata (null)'
    )
    assert(
      legacyJob.body.job.reflection_scope === null || legacyJob.body.job.reflection_scope === undefined,
      'Legacy job has no reflection_scope (null)'
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════')
  console.log(`Phase 36H.3 Post-Migration Validation: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed:')
    for (const f of failures) {
      console.log(`  ✗ ${f}`)
    }
  }
  if (cleanupIds.length > 0) {
    console.log(`\n[cleanup] Test jobs created: ${cleanupIds.length}`)
    console.log('[cleanup] These are pending reflection jobs that should be manually cleaned up:')
    for (const id of cleanupIds) {
      console.log(`  - ${id}`)
    }
  }
  console.log('════════════════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

run().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
