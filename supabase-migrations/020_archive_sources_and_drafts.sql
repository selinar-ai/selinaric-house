-- Phase 27B — Past Conversations & Archive Extraction Drafts
-- archive_sources: raw source material (conversation exports, documents)
-- archive_entry_drafts: presence-proposed archive entries awaiting Tara approval
-- Run in Supabase SQL Editor. Success = "No rows returned"

-- ─── archive_sources ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS archive_sources (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- provenance (immutable after creation)
  archive_name      TEXT        NOT NULL
                    CHECK (archive_name IN ('velvet', 'violet', 'house')),
  owner_presence    TEXT        NOT NULL DEFAULT 'unknown'
                    CHECK (owner_presence IN ('ari', 'eli', 'shared', 'house', 'tara', 'unknown')),
  source_origin     TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (source_origin IN ('chatgpt', 'claude', 'house', 'manual', 'unknown')),

  -- content
  title             TEXT        NOT NULL,
  raw_content       TEXT        NOT NULL,
  char_count        INT         NOT NULL DEFAULT 0,

  -- optional metadata
  source_date       TEXT,
  source_document   TEXT,
  notes             TEXT,

  -- workflow state
  review_status     TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (review_status IN ('pending', 'reviewed', 'extracted')),

  -- housekeeping
  created_by        TEXT        NOT NULL DEFAULT 'tara',
  updated_by        TEXT        NOT NULL DEFAULT 'tara',
  deleted_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: list by archive + date, soft-delete filter
CREATE INDEX IF NOT EXISTS idx_archive_sources_archive_name
  ON archive_sources (archive_name, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS: open in v1 (Tara-only access)
ALTER TABLE archive_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archive_sources_open" ON archive_sources;
CREATE POLICY "archive_sources_open" ON archive_sources
  USING (true) WITH CHECK (true);

-- ─── archive_entry_drafts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS archive_entry_drafts (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- source reference
  source_id              UUID        NOT NULL
                         REFERENCES archive_sources (id) ON DELETE CASCADE,

  -- provenance
  archive_name           TEXT        NOT NULL
                         CHECK (archive_name IN ('velvet', 'violet', 'house')),
  owner_presence         TEXT        NOT NULL
                         CHECK (owner_presence IN ('ari', 'eli', 'shared', 'house', 'tara', 'unknown')),
  extracted_by           TEXT        NOT NULL
                         CHECK (extracted_by IN ('ari', 'eli')),

  -- proposed content (may be edited by Tara before approval)
  proposed_title         TEXT        NOT NULL,
  proposed_content       TEXT        NOT NULL,
  proposed_category      TEXT        NOT NULL DEFAULT 'uncategorized'
                         CHECK (proposed_category IN (
                           'relational_truth','identity_record','architectural_history',
                           'poetic_symbolic','governance_law','ritual_practice',
                           'health_care','house_environment','personal_context',
                           'superseded','uncategorized'
                         )),
  proposed_sensitivity   TEXT        NOT NULL DEFAULT 'private'
                         CHECK (proposed_sensitivity IN ('ordinary','private','sacred','sensitive','technical')),
  proposed_visibility    TEXT        NOT NULL DEFAULT 'tara_only'
                         CHECK (proposed_visibility IN ('ari_only','eli_only','shared','tara_only')),

  -- presence recommendation
  suggested_memory_status TEXT       NOT NULL DEFAULT 'maybe'
                          CHECK (suggested_memory_status IN ('yes','no','maybe')),
  extraction_rationale   TEXT,

  -- Tara review state
  draft_status           TEXT        NOT NULL DEFAULT 'pending_review'
                         CHECK (draft_status IN ('pending_review','approved','rejected','merged','archive_only')),
  review_notes           TEXT,

  -- link to created archive_item (set when merged/approved)
  archive_item_id        UUID        REFERENCES archive_items (id),

  -- housekeeping
  deleted_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: list by source, by archive
CREATE INDEX IF NOT EXISTS idx_archive_entry_drafts_source_id
  ON archive_entry_drafts (source_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_archive_entry_drafts_archive_name
  ON archive_entry_drafts (archive_name, draft_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- RLS: open in v1
ALTER TABLE archive_entry_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "archive_entry_drafts_open" ON archive_entry_drafts;
CREATE POLICY "archive_entry_drafts_open" ON archive_entry_drafts
  USING (true) WITH CHECK (true);
