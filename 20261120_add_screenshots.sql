-- v6.7 — screenshots gallery: one screenshot list per game (APKVision-style gallery in the modal)
-- Run this in the Supabase SQL Editor (project gaming-omar).
-- Screenshots live in screenshots: ["https://img.apkvision.org/...-1.webp", "...-2.webp", ...]
-- The modal shows the first screenshot as the main image + a thumbnail strip below it.
-- Screenshot URLs are collected from the game's APKVision/APKPorts page (JSON-LD "screenshot"
-- array) — do NOT guess URLs; leave the list empty until verified.
-- Same pattern as the download_files migration (20261119_add_download_files.sql).
alter table public.mods
  add column if not exists screenshots jsonb not null default '[]'::jsonb;
