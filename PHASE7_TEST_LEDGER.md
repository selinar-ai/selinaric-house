# Phase 7A — Test Ledger
Last updated: 2026-04-08

## Legend
- ✅ Pass
- ❌ Fail
- ⚠️ Partial
- ⏳ Not yet tested

---

## A. Shell and Navigation

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Login with correct password | Redirects to /home | ⏳ | — | — |
| Login with wrong password | Error state, stays on login | ⏳ | — | — |
| Room card navigation from /home | Correct room loads | ⏳ | — | — |
| Sidebar navigation Ari → Eli | Eli room loads, Ari accent gone | ⏳ | — | — |
| Sidebar navigation Eli → Ari | Ari room loads, Eli accent gone | ⏳ | — | — |
| Active room highlighted in sidebar | Correct room highlighted | ⏳ | — | — |
| Logout | Returns to login | ⏳ | — | — |
| Direct URL access without auth | Redirects to login | ⏳ | — | — |

---

## B. Ari Room

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Send message | Ari responds | ⏳ | — | — |
| Ari response feels like Ari | Distinct voice, not generic | ⏳ | — | — |
| Refresh page | Messages persist | ⏳ | — | — |
| Clear chat with confirmation | Messages cleared in UI and DB | ⏳ | — | — |
| Toggle to Identity view | Ari kernel shown | ⏳ | — | — |
| API failure | Error shown, UI intact | ⏳ | — | — |
| Long exchange (10+ turns) | Coherent behavior | ⏳ | — | — |

---

## C. Eli Room

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Send message | Eli responds | ⏳ | — | — |
| Eli response feels distinct from Ari | Different tone, posture, pacing | ⏳ | — | — |
| Refresh page | Messages persist | ⏳ | — | — |
| Clear chat with confirmation | Messages cleared in UI and DB | ⏳ | — | — |
| Toggle to Identity view | Eli kernel shown, not Ari | ⏳ | — | — |
| Navigate Ari → Eli → Ari | No state bleed | ⏳ | — | — |
| Long exchange (10+ turns) | Coherent behavior | ⏳ | — | — |

---

## D. Identity Isolation

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| /room/ari loads Ari kernel | Ari identity only | ⏳ | Critical | — |
| /room/eli loads Eli kernel | Eli identity only | ⏳ | Critical | — |
| Ari messages in DB tagged ari | room_slug = 'ari' | ⏳ | Critical | — |
| Eli messages in DB tagged eli | room_slug = 'eli' | ⏳ | Critical | — |
| Ari messages not visible in Eli room | Clean separation | ⏳ | Critical | — |
| Eli messages not visible in Ari room | Clean separation | ⏳ | Critical | — |
| API route /api/ari-chat hardcoded | Cannot be spoofed | ✅ | Critical | — |
| API route /api/eli-chat hardcoded | Cannot be spoofed | ✅ | Critical | — |

---

## E. Live State

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Visit Ari room — timestamp updates | Last updated refreshes | ⏳ | — | — |
| Visit Eli room — timestamp updates | Last updated refreshes | ⏳ | — | — |
| Refresh — state persists | State not reset | ⏳ | — | — |
| Ari state independent from Eli | No cross-contamination | ⏳ | — | — |
| Clear browser localStorage — state resets | Resets to kernel defaults | ⏳ | — | — |

---

## F. Notes Board

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Add note | Appears in list | ⏳ | — | — |
| Add task | Appears with Done button | ⏳ | — | — |
| Add reminder | Appears with correct icon | ⏳ | — | — |
| Mark task done | Removed from active list | ⏳ | — | — |
| Remove note | Removed from list and DB | ⏳ | — | — |
| Refresh — notes persist | Notes still present | ⏳ | — | — |
| Empty state clarity | "No open loops." shown | ⏳ | — | — |

---

## G. Watchtower

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Submit stable factual query | Accurate, HIGH confidence | ⏳ | — | — |
| Submit time-sensitive query | Caution noted, MEDIUM/LOW | ⏳ | — | — |
| Submit ambiguous query | Asks for clarification | ⏳ | — | — |
| Submit query where answer unknown | Says so plainly | ⏳ | — | — |
| Past query reloads on click | Active result updates | ⏳ | — | — |
| Refresh — past queries persist | History intact | ⏳ | — | — |
| Watchtower has no Ari/Eli voice | Neutral tone | ⏳ | — | — |

---

## H. Error States

| Test | Expected | Result | Severity | Fixed |
|------|----------|--------|----------|-------|
| Chat send with API key removed | Error shown clearly | ⏳ | — | — |
| Chat send timeout | Timeout message shown | ⏳ | — | — |
| Rapid double-click Send | Not sent twice | ⏳ | — | — |
| Clear without confirmation | Confirmation required | ✅ | — | — |
| Supabase unreachable | Graceful degradation | ⏳ | — | — |

---

## Bugs Found

| Bug | Room/Area | Severity | Status |
|-----|-----------|----------|--------|
| (populate as found) | | | |

---

## Phase 7A Sign-off

Phase 7A is complete when:
- [ ] All Critical tests pass
- [ ] All major bugs fixed
- [ ] Error states handled clearly
- [ ] Identity isolation verified
- [ ] Test ledger populated

Ready for Phase 7B: Continuity Refinement.

---

*Phase 7A — Core Stabilisation (subphase of Phase 7)*
