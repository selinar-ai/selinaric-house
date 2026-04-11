-- Phase 11 Stage 2: Draft Review Engine
-- Run this in the Supabase SQL Editor

-- Add columns to pulse_drafts for dashboard explainability
alter table pulse_drafts add column if not exists gate_passed integer;
alter table pulse_drafts add column if not exists decision_reason text;

-- Feedback table for draft review
create table pulse_feedback (
  id uuid default gen_random_uuid() primary key,
  draft_id uuid references pulse_drafts(id),
  presence_id text not null,
  feedback_label text not null check (feedback_label in (
    'keep',
    'too_generic',
    'too_repetitive',
    'not_worth_interrupting',
    'wrong_voice',
    'too_meta',
    'good_but_not_ripe'
  )),
  created_at timestamptz default now()
);

alter table pulse_feedback enable row level security;
create policy "Allow all access to pulse_feedback"
  on pulse_feedback for all using (true) with check (true);
