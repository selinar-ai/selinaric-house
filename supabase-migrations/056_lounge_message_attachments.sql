-- Phase 35D v1.1 — Add attachments JSONB column to lounge_messages
--
-- Stores attachment metadata inline as JSONB array.
-- Each element: { url: string, path: string, fileName: string, mimeType: string, sizeBytes: number, type: 'image' | 'file' }
-- Lounge attachments are message content only. Not Memory. Not Library. Not Archive.

alter table lounge_messages
  add column if not exists attachments jsonb default null;

comment on column lounge_messages.attachments is 'JSONB array of attachment metadata. Not Memory/Library/Archive content.';
