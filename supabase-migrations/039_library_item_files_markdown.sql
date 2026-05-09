-- Phase 33C.2 — Add markdown to library_item_files file_type constraint
-- Uploading a file is not remembering.

alter table library_item_files
  drop constraint library_item_files_file_type_check;

alter table library_item_files
  add constraint library_item_files_file_type_check
  check (file_type in ('docx', 'pdf', 'image', 'markdown', 'other'));
