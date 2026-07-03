/**
 * Phase 43.A — persist-real gate (pure; no I/O).
 *
 * 42.3.3a shipped the persistence runners hardcoded test-owned ("intentionally no
 * real-persist flag"). Phase 43.A supersedes that by design: real persistence is now
 * possible, but ONLY behind a double flag, and never unbounded.
 *
 *   Test-owned (default, byte-identical to 42.3.3a):  no flags
 *   Real:  --persist-real --confirm-persist-real --max-findings <n>
 *
 * Rules enforced here:
 *   - real requires BOTH flags; one flag alone refuses (typo-safety);
 *   - a real run must declare a finding cap (--max-findings, positive integer) —
 *     no real run may be unbounded (Phase 43 never-compress list, item D7);
 *   - real runs are stamped requested_by='tara' (per-run Tara authorisation);
 *     test-owned runs keep 'system'.
 */

export type PersistGate =
  | { ok: true; real: boolean; maxFindings: number | null; requestedBy: 'tara' | 'system' }
  | { ok: false; reason: string }

export function resolvePersistGate(argv: string[]): PersistGate {
  const has = (f: string) => argv.includes(`--${f}`)
  const val = (f: string) => {
    const i = argv.indexOf(`--${f}`)
    return i >= 0 ? argv[i + 1] : undefined
  }

  const persistReal = has('persist-real')
  const confirmReal = has('confirm-persist-real')
  if (persistReal !== confirmReal) {
    return { ok: false, reason: 'real persistence requires BOTH --persist-real and --confirm-persist-real (one alone refuses)' }
  }
  const real = persistReal && confirmReal

  let maxFindings: number | null = null
  if (has('max-findings')) {
    const raw = val('max-findings')
    const n = raw === undefined ? NaN : Number(raw)
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, reason: `--max-findings requires a positive integer (got '${raw ?? ''}')` }
    }
    maxFindings = n
  }
  if (real && maxFindings === null) {
    return { ok: false, reason: 'a REAL run must declare --max-findings <n> — no real run may be unbounded' }
  }

  return { ok: true, real, maxFindings, requestedBy: real ? 'tara' : 'system' }
}

/** Returns a refusal reason if the built report exceeds the declared cap, else null. Pure. */
export function findingCapRefusal(findingCount: number, gate: { maxFindings: number | null }): string | null {
  if (gate.maxFindings !== null && findingCount > gate.maxFindings) {
    return `REFUSED: report has ${findingCount} findings, exceeding --max-findings ${gate.maxFindings} — nothing persisted`
  }
  return null
}
