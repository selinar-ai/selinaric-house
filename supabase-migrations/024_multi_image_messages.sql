-- Phase 25A — Multi-image message attachments
--
-- Adds image_urls text[] to room_messages so a single message can carry
-- multiple image references. Single-image messages continue to use image_url
-- (backward compatible). Multi-image messages populate both image_url (first
-- image, for legacy display) and image_urls (full array).
--
-- Run in Supabase SQL Editor → expect "No rows returned".

ALTER TABLE room_messages
  ADD COLUMN IF NOT EXISTS image_urls text[];
