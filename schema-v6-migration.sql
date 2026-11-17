-- ========================================================
-- Gaming Omar — schema-v6-migration.sql (audit v5.3 fixes)
-- Run this whole file ONCE in Supabase > SQL Editor > New query
-- (project gaming-omar). It is safe to run twice: every statement
-- uses IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT DO NOTHING
-- or a pg_constraint guard.
-- Covers: F-01 (votes + download dedupe), F-02 (length CHECKs),
--         F-03 (public requests view), F-07 (protect games category),
--         F-14 (game_version default).
-- NOTE: the v6 site code already expects these objects. After running
-- this file, the public requests list and the new rating/download
-- functions work. Before it runs, ratings/downloads show an error
-- message and the requests list shows "لا توجد طلبات بعد"
-- (loadGameRequests treats a query error like an empty list).
-- Existing rating/download numbers are NOT touched.
-- ========================================================

-- ================= F-01: ratings + downloads can't be spammed =================
-- One vote per visitor per mod (browser sends a random voter_id, see app.js).
CREATE TABLE IF NOT EXISTS public.mod_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mod_id UUID NOT NULL REFERENCES public.mods(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL CHECK (char_length(voter_id) BETWEEN 8 AND 64),
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (mod_id, voter_id)
);
ALTER TABLE public.mod_votes ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the SECURITY DEFINER functions below
-- touch this table; anon cannot read or insert into it directly.

-- One counted download per visitor per mod per day.
CREATE TABLE IF NOT EXISTS public.mod_downloads (
    mod_id UUID NOT NULL REFERENCES public.mods(id) ON DELETE CASCADE,
    voter_id TEXT NOT NULL CHECK (char_length(voter_id) BETWEEN 8 AND 64),
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (mod_id, voter_id, day)
);
ALTER TABLE public.mod_downloads ENABLE ROW LEVEL SECURITY;
-- No policies on purpose (same as mod_votes above).

-- If mod_votes / mod_downloads already exist from a previous run,
-- CREATE TABLE IF NOT EXISTS skipped them, so the voter_id length CHECK
-- above never landed. Add it here if missing (idempotent, NOT VALID so
-- legacy rows can't fail the run; still enforced for all NEW rows).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mod_votes_voter_id_len') THEN
        ALTER TABLE public.mod_votes ADD CONSTRAINT mod_votes_voter_id_len
            CHECK (char_length(voter_id) BETWEEN 8 AND 64) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mod_downloads_voter_id_len') THEN
        ALTER TABLE public.mod_downloads ADD CONSTRAINT mod_downloads_voter_id_len
            CHECK (char_length(voter_id) BETWEEN 8 AND 64) NOT VALID;
    END IF;
END $$;

-- Replace the old 2-arg functions (a new signature would otherwise
-- create an overload and leave the spammable version callable).
DROP FUNCTION IF EXISTS public.add_mod_rating(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.increment_mod_download(UUID);

CREATE OR REPLACE FUNCTION public.add_mod_rating(target_mod_id UUID, user_stars INTEGER, voter_id TEXT)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.mods WHERE id = target_mod_id AND is_published) THEN
        RAISE EXCEPTION 'mod not found or not published';
    END IF;
    IF user_stars < 1 OR user_stars > 5 THEN
        RAISE EXCEPTION 'Stars must be between 1 and 5';
    END IF;
    IF voter_id IS NULL OR char_length(voter_id) NOT BETWEEN 8 AND 64 THEN
        RAISE EXCEPTION 'invalid voter_id';
    END IF;
    -- Raises unique_violation on a second vote from the same voter;
    -- the site shows the "already rated" message in that case.
    INSERT INTO public.mod_votes (mod_id, voter_id, stars) VALUES (target_mod_id, voter_id, user_stars);
    UPDATE public.mods
    SET rating_avg = ROUND(
            ((COALESCE(rating_avg, 5.0) * rating_count) + user_stars)::numeric
            / (rating_count + 1), 2),
        rating_count = rating_count + 1
    WHERE id = target_mod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.add_mod_rating(UUID, INTEGER, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_mod_download(target_mod_id UUID, voter_id TEXT)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.mods WHERE id = target_mod_id AND is_published) THEN
        RAISE EXCEPTION 'mod not found or not published';
    END IF;
    IF voter_id IS NULL OR char_length(voter_id) NOT BETWEEN 8 AND 64 THEN
        RAISE EXCEPTION 'invalid voter_id';
    END IF;
    -- Repeats from the same voter/mod/day are ignored silently.
    INSERT INTO public.mod_downloads (mod_id, voter_id, day)
    VALUES (target_mod_id, voter_id, CURRENT_DATE)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
        UPDATE public.mods SET download_count = download_count + 1 WHERE id = target_mod_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION public.increment_mod_download(UUID, TEXT) TO anon, authenticated;

-- ================= F-02: length limits on public forms =================
-- Constraints are added NOT VALID, then validated best-effort: if old rows
-- already break a limit, the constraint stays NOT VALID (still enforced for
-- NEW rows) and the run only logs a NOTICE instead of failing.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_author_name_len') THEN
        ALTER TABLE public.comments ADD CONSTRAINT comments_author_name_len
            CHECK (char_length(btrim(author_name)) BETWEEN 2 AND 40) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_len') THEN
        ALTER TABLE public.comments ADD CONSTRAINT comments_content_len
            CHECK (char_length(btrim(content)) BETWEEN 2 AND 1000) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_name_len') THEN
        ALTER TABLE public.contact_messages ADD CONSTRAINT contact_name_len
            CHECK (char_length(btrim(name)) BETWEEN 2 AND 40) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_email_valid') THEN
        ALTER TABLE public.contact_messages ADD CONSTRAINT contact_email_valid
            CHECK (char_length(email) <= 120 AND email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_message_len') THEN
        ALTER TABLE public.contact_messages ADD CONSTRAINT contact_message_len
            CHECK (char_length(btrim(message)) BETWEEN 2 AND 2000) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_requests_name_len') THEN
        ALTER TABLE public.game_requests ADD CONSTRAINT game_requests_name_len
            CHECK (char_length(btrim(name)) BETWEEN 2 AND 40) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_requests_title_len') THEN
        ALTER TABLE public.game_requests ADD CONSTRAINT game_requests_title_len
            CHECK (char_length(btrim(game_title)) BETWEEN 2 AND 120) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_requests_details_len') THEN
        ALTER TABLE public.game_requests ADD CONSTRAINT game_requests_details_len
            CHECK (details IS NULL OR char_length(details) <= 500) NOT VALID;
    END IF;
END $$;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broken_links_title_len') THEN
        ALTER TABLE public.broken_links ADD CONSTRAINT broken_links_title_len
            CHECK (char_length(mod_title) <= 200) NOT VALID;
    END IF;
END $$;

-- Best-effort validation of old rows (NOTICE only, never fails the run).
DO $$ BEGIN ALTER TABLE public.comments VALIDATE CONSTRAINT comments_author_name_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'comments_author_name_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.comments VALIDATE CONSTRAINT comments_content_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'comments_content_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.contact_messages VALIDATE CONSTRAINT contact_name_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'contact_name_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.contact_messages VALIDATE CONSTRAINT contact_email_valid; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'contact_email_valid: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.contact_messages VALIDATE CONSTRAINT contact_message_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'contact_message_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.game_requests VALIDATE CONSTRAINT game_requests_name_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'game_requests_name_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.game_requests VALIDATE CONSTRAINT game_requests_title_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'game_requests_title_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.game_requests VALIDATE CONSTRAINT game_requests_details_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'game_requests_details_len: old rows break the limit; constraint stays NOT VALID.'; END $$;
DO $$ BEGIN ALTER TABLE public.broken_links VALIDATE CONSTRAINT broken_links_title_len; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'broken_links_title_len: old rows break the limit; constraint stays NOT VALID.'; END $$;

-- F-02: fill broken_links.mod_title from the mods table server-side
-- instead of trusting whatever the client sends.
CREATE OR REPLACE FUNCTION public.fill_broken_link_title()
RETURNS trigger AS $$
DECLARE
    client_title TEXT := NEW.mod_title;
    real_title TEXT;
BEGIN
    IF NEW.mod_id IS NOT NULL THEN
        SELECT title INTO real_title FROM public.mods WHERE id = NEW.mod_id;
        IF real_title IS NOT NULL THEN
            NEW.mod_title := real_title;
        ELSE
            NEW.mod_title := client_title;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS fill_broken_link_title_trigger ON public.broken_links;
CREATE TRIGGER fill_broken_link_title_trigger
    BEFORE INSERT ON public.broken_links
    FOR EACH ROW EXECUTE FUNCTION public.fill_broken_link_title();

-- ================= F-03: visitors' request details are no longer public =================
-- Public view with safe columns only. It runs as the view owner
-- (bypassing the table RLS for these 4 columns only); the table itself
-- no longer has a public SELECT policy.
-- Read-only: the view is auto-updatable, and anon gets default DML on new
-- objects in public, so the REVOKE below strips every privilege first
-- and only SELECT is granted back.
CREATE OR REPLACE VIEW public.game_requests_public AS
SELECT game_title, game_type, status, created_at
FROM public.game_requests;
REVOKE ALL ON public.game_requests_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.game_requests_public TO anon, authenticated;
DROP POLICY IF EXISTS "Anyone can view game requests" ON public.game_requests;
-- Kept as-is: "Anyone can send game requests" (INSERT, form still works)
-- and "Admins can manage game requests" (admin tab still sees everything).

-- ================= F-07: the games category cannot be deleted =================
CREATE OR REPLACE FUNCTION public.protect_games_category()
RETURNS trigger AS $$
BEGIN
    IF OLD.slug = 'android-games' THEN
        RAISE EXCEPTION 'The "android-games" category cannot be deleted';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;
DROP TRIGGER IF EXISTS protect_games_category_trigger ON public.categories;
CREATE TRIGGER protect_games_category_trigger
    BEFORE DELETE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.protect_games_category();

-- ================= F-14: wrong default version label =================
-- Games inserted without a version no longer claim "GTA SA v2.00+".
-- (Checked 2026-11-17: zero existing games have a 'GTA SA%' game_version,
-- so no data correction is needed.)
ALTER TABLE public.mods ALTER COLUMN game_version SET DEFAULT 'Android 5.0+';

-- Tell PostgREST to reload its schema cache so the new/changed objects
-- (view, functions, columns) are visible to the API right away.
NOTIFY pgrst, 'reload schema';
