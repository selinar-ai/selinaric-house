-- Phase 12: Shared Sight — image sharing in rooms
-- Run this in the Supabase SQL Editor

alter table room_messages
  add column if not exists message_type text default 'text'
    check (message_type in ('text', 'image', 'text_image')),
  add column if not exists image_url text,
  add column if not exists image_path text,
  add column if not exists image_alt text;

-- Backfill existing messages that have null message_type
update room_messages set message_type = 'text' where message_type is null;
