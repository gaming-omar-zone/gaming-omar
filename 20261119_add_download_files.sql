-- v6.5 — multi-file downloads: extra files per game (APK + Data/OBB/ISO/ZIP/RAR/7Z/PKG)
-- Run this in the Supabase SQL Editor (project gaming-omar).
-- The primary file stays in external_url (first button, unchanged).
-- Extra files live in download_files: [{ "label": "...", "size": "...", "url": "https://dl.apkvision.org/..." }]
-- The site modal renders one button per extra file, directly under the primary button.
-- Data URLs are filled in by the backfill runs (resolved via the browser from APKVision
-- download pages) — do NOT guess URLs; leave the list empty until a link is verified.
alter table public.mods
  add column if not exists download_files jsonb not null default '[]'::jsonb;
