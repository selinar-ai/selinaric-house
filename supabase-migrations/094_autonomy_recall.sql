-- Phase 43 R2 — autonomy-window Archive recall: night keys + audit mode
--
-- 1. archive_autonomy_recall_settings — per-presence night key. AUTHORITY TABLE:
--    it governs whether Ari/Eli may perform unsupervised Archive recall during the
--    9pm autonomy window, so it is DENY-BY-DEFAULT, not an open FOR ALL table.
--    Follows the House authority-table precedent (083 agent_findings / 086 approval
--    events): RLS on, NO permissive policy, explicit revokes. Default OFF for both
--    presences. The trusted server-side service-role path READS the key (SELECT only);
--    Tara WRITES it via the SQL editor as table owner (owner bypasses grants + RLS).
--    Even the app's own service-role path cannot write the key — turning it is Tara's alone.
--
-- 2. Widen archive_recall_events.recall_mode CHECK to admit 'autonomy' — an unsupervised
--    reach must never log as supervised ('presence') or Tara-commanded ('manual').
--
-- Additive + idempotent. Constraint/table-only → no 42P13 risk.
-- Run via Supabase SQL Editor → expect "No rows returned".
-- Pre-req: run `node scripts/emergency-house-export.mjs` first (confirm export file exists).
-- Rollback (manual): drop archive_autonomy_recall_settings; re-add the three-value CHECK from
-- migration 093 (only safe if zero recall_mode='autonomy' rows exist).

CREATE TABLE IF NOT EXISTS archive_autonomy_recall_settings (
  presence_id  TEXT         PRIMARY KEY CHECK (presence_id IN ('ari', 'eli')),
  mode         TEXT         NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'trial')),
  updated_by   TEXT         NOT NULL DEFAULT 'tara',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed BOTH presences OFF (locked). Idempotent.
INSERT INTO archive_autonomy_recall_settings (presence_id, mode)
VALUES ('ari', 'off'), ('eli', 'off')
ON CONFLICT (presence_id) DO NOTHING;

-- Deny-by-default: RLS ON, NO permissive policy (no FOR ALL, none at all).
ALTER TABLE archive_autonomy_recall_settings ENABLE ROW LEVEL SECURITY;

-- Revoke from EVERYONE first — including service_role — so the grant below is the only
-- privilege that exists on this table, and it is provably SELECT-only.
REVOKE ALL ON TABLE archive_autonomy_recall_settings
  FROM PUBLIC, anon, authenticated, service_role;

-- Grant the trusted server-side service-role path SELECT ONLY: it may read the key, never
-- write it. No INSERT/UPDATE/DELETE to any role. Tara flips the key as owner in the SQL editor.
GRANT SELECT ON TABLE archive_autonomy_recall_settings
  TO service_role;

-- Audit mode: admit 'autonomy' alongside manual/auto/presence.
ALTER TABLE public.archive_recall_events
  DROP CONSTRAINT IF EXISTS archive_recall_events_recall_mode_check;

ALTER TABLE public.archive_recall_events
  ADD CONSTRAINT archive_recall_events_recall_mode_check
  CHECK (recall_mode IN ('manual', 'auto', 'presence', 'autonomy'));

-- To turn a key on (Tara, manually, when ready):
--   UPDATE archive_autonomy_recall_settings SET mode='trial', updated_at=now() WHERE presence_id='ari';
