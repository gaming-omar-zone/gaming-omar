-- ========================================================
-- Gaming Omar — schema.sql v2 (FIXED)
-- Run this whole file in Supabase > SQL Editor > New query.
-- It is safe to run twice: every statement uses IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- v6 changes (audit v5.3: F-01, F-02, F-03, F-07, F-14) live in the
-- separate file schema-v6-migration.sql — run it after this one.
-- What v2 fixes vs v1:
--  * mods table now has every column app.js/admin.js use
--    (youtube_url, is_online, ram_req, gpu_compat, link_drive,
--     link_mega, rating_avg, rating_count)
--  * NEW tables: comments, broken_links, contact_messages
--    (v1 code inserted into them, but they did not exist)
--  * NEW function: add_mod_rating() (v1 code called it, it did not exist)
--  * RLS policies for the new tables
-- ========================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT 'fa-folder',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.categories (name, slug, icon) VALUES
('مودات السيارات', 'cars', 'fa-car-side'),
('مودات الملابس', 'clothes', 'fa-shirt'),
('مودات الشخصيات', 'characters', 'fa-person-rifle'),
('مودات الأسلحة', 'weapons', 'fa-gun'),
('مودات الجرافيكس', 'graphics', 'fa-wand-magic-sparkles'),
('مودات الخرائط', 'maps', 'fa-map-location-dot'),
('مودات كليو', 'cleo', 'fa-code')
ON CONFLICT (slug) DO NOTHING;

-- v3: تصنيف "ألعاب أندرويد" — app.js كيعتمد على هاد الـ UUID بالضبط (GAMES_CATEGORY_ID).
-- إلا كان عندك التصنيف من قبل فـ Supabase، هاد السطر كيتجاهل (ما كيدير والو).
INSERT INTO public.categories (id, name, slug, icon)
VALUES ('49fbd197-c507-40a4-b1f7-f740fae5b194', 'ألعاب أندرويد', 'android-games', 'fa-gamepad')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    short_desc TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    download_type TEXT NOT NULL CHECK (download_type IN ('storage', 'external')),
    file_url TEXT,
    external_url TEXT,
    file_size TEXT NOT NULL,
    game_version TEXT NOT NULL DEFAULT 'GTA SA v2.00+',
    download_count INTEGER DEFAULT 0 NOT NULL,
    is_published BOOLEAN DEFAULT true NOT NULL,
    -- v2: columns the JS already used but the table did not have
    youtube_url TEXT,
    is_online BOOLEAN NOT NULL DEFAULT false,
    ram_req TEXT NOT NULL DEFAULT '2 GB',
    gpu_compat TEXT NOT NULL DEFAULT 'Mali / Adreno / PowerVR',
    link_drive TEXT,
    link_mega TEXT,
    rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- v2: if the table already exists from v1, add the missing columns
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS ram_req TEXT NOT NULL DEFAULT '2 GB';
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS gpu_compat TEXT NOT NULL DEFAULT 'Mali / Adreno / PowerVR';
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS link_drive TEXT;
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS link_mega TEXT;
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.0;
ALTER TABLE public.mods ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

-- v2: NEW — comments (was referenced by app.js, table did not exist)
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mod_id UUID NOT NULL REFERENCES public.mods(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- v2: NEW — broken link reports
CREATE TABLE IF NOT EXISTS public.broken_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mod_id UUID REFERENCES public.mods(id) ON DELETE SET NULL,
    mod_title TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- v2: NEW — contact form messages (v1 form was fake: it showed
-- "success" but saved nothing anywhere)
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- v3.1: NEW — game requests (visitors request a game/mod, admins approve/fulfil)
CREATE TABLE IF NOT EXISTS public.game_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    game_title TEXT NOT NULL,
    game_type TEXT NOT NULL DEFAULT 'لعبة أندرويد',
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'done', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.site_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

INSERT INTO public.site_settings (key, value) VALUES
('hero', '{"title": "موقع Gaming Omar الرسمي", "subtitle": "المنصة الأولى لتحميل أحدث وأقوى مودات GTA San Andreas Android بروابط سريعة ومباشرة.", "badge": "تعديلات أندرويد حصرية"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Download counter (already in v1, kept)
CREATE OR REPLACE FUNCTION increment_mod_download(target_mod_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.mods
    SET download_count = download_count + 1
    WHERE id = target_mod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- v2: NEW — rating function (app.js called add_mod_rating, it did not exist)
-- Validates 1..5, then updates the running average atomically.
CREATE OR REPLACE FUNCTION add_mod_rating(target_mod_id UUID, user_stars INTEGER)
RETURNS void AS $$
BEGIN
    IF user_stars < 1 OR user_stars > 5 THEN
        RAISE EXCEPTION 'Stars must be between 1 and 5';
    END IF;
    UPDATE public.mods
    SET rating_avg = ROUND(
            ((COALESCE(rating_avg, 5.0) * rating_count) + user_stars)::numeric
            / (rating_count + 1), 2),
        rating_count = rating_count + 1
    WHERE id = target_mod_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---- RLS ----
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broken_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "Profiles access" ON public.profiles;
DROP POLICY IF EXISTS "Profiles read own or admin" ON public.profiles;
DROP POLICY IF EXISTS "Profiles admin write" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view published mods" ON public.mods;
DROP POLICY IF EXISTS "Admins can manage mods" ON public.mods;
DROP POLICY IF EXISTS "Anyone can view settings" ON public.site_settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can post comments" ON public.comments;
DROP POLICY IF EXISTS "Admins can manage comments" ON public.comments;
DROP POLICY IF EXISTS "Anyone can report broken links" ON public.broken_links;
DROP POLICY IF EXISTS "Admins can view reports" ON public.broken_links;
DROP POLICY IF EXISTS "Admins can manage reports" ON public.broken_links;
DROP POLICY IF EXISTS "Anyone can send contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can view contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Admins can manage contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Anyone can view game requests" ON public.game_requests;
DROP POLICY IF EXISTS "Anyone can send game requests" ON public.game_requests;
DROP POLICY IF EXISTS "Admins can manage game requests" ON public.game_requests;

-- v3 SECURITY FIX: السياسة القديمة "Profiles access" كانت FOR ALL ب auth.uid() = id،
-- يعني أي واحد كيدير Sign up كان يقدر يزيد/يبدل سطره فـ profiles ويحط role = 'admin'
-- ويولي أدمن. دابا: القراءة للمستخدم (سطرو) أو للأدمن، والكتابة (insert/update/delete) للأدمن فقط.
-- (زيادة الأدمن الأول كتبقى من Table Editor كيف فـ README، حيت هو كيتجاوز RLS.)
CREATE POLICY "Profiles read own or admin" ON public.profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Profiles admin write" ON public.profiles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Anyone can view categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view published mods" ON public.mods FOR SELECT USING (is_published = true OR is_admin());
CREATE POLICY "Admins can manage mods" ON public.mods FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.site_settings FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view comments" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Anyone can post comments" ON public.comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage comments" ON public.comments FOR ALL USING (is_admin());
CREATE POLICY "Anyone can report broken links" ON public.broken_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view reports" ON public.broken_links FOR SELECT USING (is_admin());
CREATE POLICY "Admins can manage reports" ON public.broken_links FOR ALL USING (is_admin());
CREATE POLICY "Anyone can send contact messages" ON public.contact_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view contact messages" ON public.contact_messages FOR SELECT USING (is_admin());
CREATE POLICY "Admins can manage contact messages" ON public.contact_messages FOR ALL USING (is_admin());
CREATE POLICY "Anyone can view game requests" ON public.game_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can send game requests" ON public.game_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage game requests" ON public.game_requests FOR ALL USING (is_admin());

-- ---- Storage buckets ----
INSERT INTO storage.buckets (id, name, public) VALUES ('mod-images', 'mod-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('mod-files', 'mod-files', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Read Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Images" ON storage.objects;
DROP POLICY IF EXISTS "Public Read Files" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload Files" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete Files" ON storage.objects;

CREATE POLICY "Public Read Images" ON storage.objects FOR SELECT USING (bucket_id = 'mod-images');
CREATE POLICY "Admin Upload Images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'mod-images' AND is_admin());
CREATE POLICY "Admin Delete Images" ON storage.objects FOR DELETE USING (bucket_id = 'mod-images' AND is_admin());

CREATE POLICY "Public Read Files" ON storage.objects FOR SELECT USING (bucket_id = 'mod-files');
CREATE POLICY "Admin Upload Files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'mod-files' AND is_admin());
CREATE POLICY "Admin Delete Files" ON storage.objects FOR DELETE USING (bucket_id = 'mod-files' AND is_admin());
