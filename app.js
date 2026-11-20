// ========================================================
// Gaming Omar - Public Site Logic (عداد الثواني وروابط التحميل)
// ========================================================

let allMods = [];
let allCategories = [];
let selectedCategory = 'all';
let selectedSort = 'newest';
let activeMod = null;
let showingFavorites = false;
let countdownTimer = null;
let _voterId = null; // B1 — كاش معرّف الزائر: بلا هادي، متصفح بلا تخزين كيولّد معرّف جديد فكل نداء

// v3.9 — قسم الألعاب بحدو والمودات بحدهم في الواجهة الرئيسية.
// تصنيف "ألعاب أندرويد" كيتحل وقت التشغيل من الـ slug (شوف gamesCategoryId()).
const HOME_SHOWCASE_COUNT = 8; // المودات: صفّان (4 أعمدة × 2)
const GAMES_RAIL_COUNT = 24; // الألعاب: 3 صفوف أفقية × 8 بطاقات
const NEW_GAMES_COUNT = 12; // v6.6 — قسم "ألعاب جديدة": أحدث 12 لعبة مضافة
const RAIL_ROWS = 3;

// v2 (GitHub merge): escape DB/user text before innerHTML (XSS fix)
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
// B10 — طول بالنقاط (code points) ماشي وحدات UTF-16: إيموجي واحد
// كيحسب 2 فـ JS (.length) ولكن 1 فـ Postgres (char_length)، فيقدر
// يدوز التحقق ديال JS ويفشل فـ CHECK ديال قاعدة البيانات.
const cplen = s => [...(s || '')].length;
const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#131518"/><text x="300" y="190" font-size="64" text-anchor="middle">🎮</text></svg>');

// v6 (F-06) — localStorage محمي: التخزين يقدر يتبلوكا (متصفحات داخلية،
// وضع خصوصية صارم، كوطا عامرة) أو الـ JSON يتخسر. بلا هاد الحماية
// openDetails كيطيح قبل ما يتحل المودال. هاد الدوال كترجع القيمة
// الافتراضية بدل ما ترمي استثناء.
function readStore(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        const v = JSON.parse(raw);
        // B6 — تحقق من النوع، ماشي غير من JSON: قيمة مخزنة 'null' ولا
        // رقم/نص كترجع fallback بدل ما تطيّح openDetails/buildModCard.
        const ok = Array.isArray(fallback) ? Array.isArray(v) : (v && typeof v === 'object' && !Array.isArray(v));
        return ok ? v : fallback;
    } catch (e) {
        return fallback;
    }
}
function writeStore(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

// v6 (F-01) — معرّف عشوائي للزائر، كيتولد مرة وحدة وكيتحفظ.
// كيتبعت مع التقييم والتحميل باش السيرفر يمنع التكرار (mod_votes).
function getVoterId() {
    // B1 — كاش فمتغير: إلا التخزين متبلوكا، نرجعو نفس معرّف الجلسة
    // بدل ما نولّدو واحد جديد فكل نداء (كان كيكسر "صوت واحد لكل زائر").
    if (_voterId) return _voterId;
    let id = null;
    try { id = localStorage.getItem('gaming_omar_voter'); } catch (e) { id = null; }
    if (!id) {
        id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : ('v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
        try { localStorage.setItem('gaming_omar_voter', id); } catch (e) { /* بلا تخزين: معرّف الجلسة فقط */ }
    }
    _voterId = id;
    return id;
}

// v6 (F-07) — تصنيف "ألعاب أندرويد" كيتحل من التصنيفات المحملة حسب
// الـ slug، ماشي UUID ثابت. إلا ما تحملوش التصنيفات، كنرجعو للـ UUID القديم.
const GAMES_CATEGORY_ID_FALLBACK = '49fbd197-c507-40a4-b1f7-f740fae5b194';
function gamesCategoryId() {
    const cat = allCategories.find(c => c.slug === 'android-games');
    return cat ? cat.id : GAMES_CATEGORY_ID_FALLBACK;
}

// v6 (F-16e) — روابط التحميل كتتعمر غير ملي يسالي العداد (بلا ما تكون
// فالـ DOM قبل). v6 (F-15) — آخر عنصر كان فيه التركيز قبل المودال.
let pendingDownload = null;
let lastFocusedBeforeModal = null;
let originalDocTitle = document.title;
let originalMetaDesc = '';

document.addEventListener('DOMContentLoaded', async () => {
    const yearSpan = document.getElementById('yearSpan');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
    setupMobileNav();
    updateFavoritesBadge();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    if (!window.supabaseClient) {
        // v6 (F-10) — فرّق بين مكتبة Supabase ما تحملاتش (CDN) وبين خطأ اتصال عادي
        showLoadError(window.supabaseLoadError
            ? 'تعذر تحميل مكتبة قاعدة البيانات (CDN). تحقق من الإنترنت وأعد تحميل الصفحة.'
            : 'تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت وأعد المحاولة.');
        return;
    }
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.addEventListener('change', () => {
        selectedSort = sortSel.value;
        renderModsGrid(applyCurrentFilters());
    });
    // v6 (F-05) — الطلبات الكبيرة كتمشي بالتوازي بدل التتابع؛
// الرائج كيتحسب محلياً من allMods؛ طلبات الألعاب ما كتتجبدش
    // عند البداية (switchView('requests') كتجيبها ملي كتحتاجها).
    await Promise.all([loadSettings(), loadCategories(), loadMods()]);
    // B3 — إعادة الرسم هنا (بعد ما تحملو التصنيفات): loadMods كيرسم
    // داخلياً، ولكن تحت Promise.all يقدر gamesCategoryId() يرجع الـ UUID
    // الاحتياطي إلا التصنيفات ما وصلوش بعد. B5 — renderTrending() تحيدات
    // من هنا: دابا كتتنادى فآخر loadMods (شوف تحت).
    // v6.1 (Claude round 2) — إلا فشل التحميل، ما ترسمش "لا نتائج" تحت صندوق الخطأ
    if (allMods.length) { renderHomeSections(); renderModsGrid(applyCurrentFilters()); }
    setupSearch();
    setupInteractiveStars();
    handleDeepLink();
});

// v3.7 — روابط مباشرة للألعاب: ?game=<id> يفتح نافذة اللعبة، ?search=<نص> يعبّي البحث
function handleDeepLink() {
    try {
        const params = new URLSearchParams(window.location.search);
        const q = params.get('search');
        if (q) {
            const input = document.getElementById('searchInput');
            if (input) { input.value = q; renderModsGrid(applyCurrentFilters()); }
        }
        const gameId = params.get('game');
        if (gameId) {
            // v6 (F-04) — openDetails كتجيب الصف الكامل من السيرفر إلا ما كانش
            // فالقائمة المختصرة، يعني الرابط العميق خدام حتى إلا ما كانش العنصر فالصفحة
            switchView('library');
            setTimeout(() => window.openDetails(gameId), 400);
        }
    } catch (e) { /* تجاهل أخطاء الرابط */ }
}

window.switchView = function(viewName) {
    const viewHome = document.getElementById('viewHome');
    const viewAbout = document.getElementById('viewAbout');
    const viewContact = document.getElementById('viewContact');
    const viewRequests = document.getElementById('viewRequests');

    // v3.9 — 'games' قسم الألعاب، 'mods' قسم المودات، 'library' المكتبة الكاملة
    const homeViews = ['home', 'mods', 'games', 'library'];
    if (viewHome) viewHome.style.display = homeViews.includes(viewName) ? 'block' : 'none';
    if (viewAbout) viewAbout.style.display = viewName === 'about' ? 'block' : 'none';
    if (viewContact) viewContact.style.display = viewName === 'contact' ? 'block' : 'none';
    if (viewRequests) {
        viewRequests.style.display = viewName === 'requests' ? 'block' : 'none';
        if (viewName === 'requests') loadGameRequests();
    }

    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[onclick="switchView('${viewName}')"]`);
    if (targetLink) targetLink.classList.add('active');
    document.querySelectorAll('.bn-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));

    // v6.2.1 — إلا تحلات صفحة "من نحن"، عمّر الإحصائيات من البيانات
    // اللي تحملات (إلا كان التحميل ما سالاش بعد، كتبقى "…" حتى يسالي).
    if (viewName === 'about') fillAboutStats();

    if (viewName === 'games') {
        const el = document.getElementById('gamesSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (viewName === 'mods') {
        const el = document.getElementById('modsSection');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (viewName === 'library') {
        const modsSection = document.getElementById('mods');
        if (modsSection) modsSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.classList.remove('show');
};

// زر البحث في القائمة العلوية: يهبط لصندوق البحث، يفتحو، ويوميض عليه
window.goToSearch = function() {
    switchView('library');
    // v6 (F-08) — تبويب "بحث" فالشريط السفلي كيتفعّل حتى هو
    document.querySelectorAll('.bn-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === 'search'));
    setTimeout(() => {
        const input = document.getElementById('searchInput');
        const box = document.querySelector('.search-box');
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus({ preventScroll: true });
            if (box) {
                box.classList.add('search-highlight');
                setTimeout(() => box.classList.remove('search-highlight'), 1800);
            }
        }
    }, 450);
};

function setupMobileNav() {
    const toggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (toggle && navLinks) {
        toggle.addEventListener('click', () => {
            navLinks.classList.toggle('show');
        });
    }
}

// 1. المفضلة
function getFavorites() {
    return readStore('gaming_omar_favs', []);
}

function isFavorite(modId) {
    return getFavorites().includes(modId);
}

window.toggleFavorite = function(e, modId) {
    if (e) e.stopPropagation();
    let favs = getFavorites();
    const nowFav = !favs.includes(modId);
    if (nowFav) {
        favs.push(modId);
    } else {
        favs = favs.filter(id => id !== modId);
    }
    writeStore('gaming_omar_favs', favs);
    updateFavoritesBadge();
    // v6 (F-16a) — بدّل كلاس القلب على كل زر ديال هاد المود (المكتبة +
    // الرئيسية + الرائج) باش يبقاو متزامنين. إلا كان فلتر "المفضلة"
    // مفعّل، خاص إعادة الرسم حتى هي باش العنصر يبان/يختفي.
    // B8 — تبديل الكلاس كيدار ديما، ماشي غير إلا ما كانش فلتر المفضلة.
    document.querySelectorAll(`[data-fav-id="${modId}"]`).forEach(btn => {
        btn.classList.toggle('active', nowFav);
    });
    if (showingFavorites) {
        renderModsGrid(applyCurrentFilters());
    }
};

function updateFavoritesBadge() {
    const count = getFavorites().length;
    const badge = document.getElementById('favCount');
    if (badge) badge.textContent = count;
}

window.toggleFavoritesFilter = function() {
    showingFavorites = !showingFavorites;
    const favBtn = document.getElementById('favFilterBtn');
    if (showingFavorites) {
        selectedCategory = 'all'; // وإلا كتبقى المفضلة محصورة فآخر تصنيف تختار
        if (favBtn) favBtn.classList.add('active');
        document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    } else {
        if (favBtn) favBtn.classList.remove('active');
        const allBtn = document.querySelector('.filter-btn[data-category="all"]');
        if (allBtn) allBtn.classList.add('active');
    }
    renderModsGrid(applyCurrentFilters());
};

window.showFavoritesOnly = function() {
    showingFavorites = true;
    selectedCategory = 'all';
    const favBtn = document.getElementById('favFilterBtn');
    if (favBtn) favBtn.classList.add('active');
    document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    renderModsGrid(applyCurrentFilters());
    const modsSection = document.getElementById('mods');
    if (modsSection) modsSection.scrollIntoView({ behavior: 'smooth' });
};

function showLoadError(msg) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'none';
    const box = document.getElementById('loadError');
    if (box) {
        box.style.display = 'block';
        const msgEl = document.getElementById('loadErrorMsg');
        if (msgEl) msgEl.textContent = msg;
    }
}

// 2. جلب البيانات
async function loadSettings() {
    try {
        const { data } = await window.supabaseClient.from('site_settings').select('*');
        if (data) {
            const heroData = data.find(item => item.key === 'hero')?.value;
            if (heroData) {
                if (heroData.title) document.getElementById('heroTitle').textContent = heroData.title;
                if (heroData.subtitle) document.getElementById('heroSubtitle').textContent = heroData.subtitle;
                if (heroData.badge) {
                    const badgeEl = document.getElementById('heroBadge');
                    badgeEl.innerHTML = '';
                    const icon = document.createElement('i');
                    icon.className = 'fa-brands fa-android';
                    badgeEl.append(icon, document.createTextNode(' ' + heroData.badge));
                }
            }
        }
    } catch (e) {
        console.error("Settings error:", e);
    }
}

async function loadCategories() {
    // زر "الكل" خاصو يخدم حتى إلا فشل جلب التصنيفات
    const allBtn = document.querySelector('.filter-btn[data-category="all"]');
    if (allBtn) {
        allBtn.onclick = function() {
            filterByCategory('all', this);
        };
    }
    try {
        const { data: categories, error } = await window.supabaseClient
            .from('categories')
            .select('*')
            .order('created_at', { ascending: true });

        if (error || !categories) return;
        allCategories = categories;

        const categoriesBar = document.getElementById('categoriesBar');
        const footerCats = document.getElementById('footerCats');

        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.setAttribute('data-category', cat.id);
            btn.innerHTML = `<i class="fa-solid ${esc(cat.icon || 'fa-folder')}"></i> ${esc(cat.name)}`;
            btn.onclick = () => filterByCategory(cat.id, btn);
            if (categoriesBar) categoriesBar.appendChild(btn);

            if (footerCats) {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#mods';
                a.textContent = cat.name;
                a.onclick = (ev) => {
                    ev.preventDefault();
                    switchView('library'); // خاصنا نرجعو للرئيسية إلا كان الزائر فصفحة من نحن/اتصل بنا
                    filterByCategory(cat.id, btn);
                };
                li.appendChild(a);
                footerCats.appendChild(li);
            }
        });

    } catch (e) {
        console.error("Categories error:", e);
    }
}

async function loadMods() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'block';
    const errBox = document.getElementById('loadError');
    if (errBox) errBox.style.display = 'none';

    try {
        // Paginated fetch: Supabase REST caps one request at 1000 rows,
        // and the library is now past 1000 items (1323 on 2026-11-17).
        // Without paging, the oldest items never reach the page.
        // v6 (F-04) — القائمة كتجيب غير الأعمدة اللي كتبان فالبطاقات؛
        // الوصف الكامل والروابط والمواصفات كتتجبد فـ openDetails للعنصر الواحد.
        const LIST_COLUMNS = 'id, title, image_url, short_desc, category_id, file_size, game_version, is_online, download_count, rating_avg, rating_count, created_at, categories(name)';
        let all = [];
        let from = 0;
        const PAGE = 1000;
        for (;;) {
            const { data: page, error } = await window.supabaseClient
                .from('mods')
                .select(LIST_COLUMNS)
                .eq('is_published', true)
                .order('created_at', { ascending: false })
                .order('id', { ascending: false }) // tie-breaker: بلا هادي الصفحات يمكن تتكرر/تنقص عناصر عندها نفس created_at
                .range(from, from + PAGE - 1);
            if (error) throw error;
            all = all.concat(page || []);
            if (!page || page.length < PAGE) break;
            from += PAGE;
        }
        const mods = all;

        if (loading) loading.style.display = 'none';

        allMods = mods || [];
        // v6.2.1 — عمّر إحصائيات "من نحن" فور ما توصل البيانات، قبل رسم
        // البطاقات: إلا طاح رسم البطاقات/الصفوف (صف ناقص من السيرفر)،
        // الإحصائيات كتبقى معمرة.
        fillAboutStats();
        renderModsGrid(applyCurrentFilters());
        renderHomeSections(); // v3.9 — عمّر قسمي الألعاب والمودات في الرئيسية
        // B5 — الرائج كيتحسب من allMods، يعني خاصو يترسم من بعد كل تحميل
        // ناجح (ماشي غير عند البداية): إلا فشل أول تحميل والزائر ضغط
        // "إعادة المحاولة" (window.reloadMods)، الرائج ما كانش كيبان.
        renderTrending();
    } catch (err) {
        if (loading) loading.style.display = 'none';
        console.error("Error loading mods:", err);
        showLoadError('تعذر جلب الألعاب: ' + (err.message || 'خطأ غير معروف'));
    }
}
window.reloadMods = loadMods;

// الرائج: أعلى 6 ألعاب/مودات حسب عدد التحميلات.
// v6.4 (Gemini + مراجعة) — كيتحسب محلياً من allMods (بلا طلب جديد للسيرفر).
// القسم يبقى مخفياً إلا كان هناك عناصر (قاعدة خاوية أو خطأ).
// الترتيب: التحميلات، ثم التقييم، ثم الأحدث. منشور فقط (is_published).
function getTrendingItems(sourceMods) {
    const list = Array.isArray(sourceMods) ? sourceMods : [];

    // Respect RLS / schema: only include published items when is_published is explicitly false
    const published = list.filter((item) => item && item.is_published !== false);

    if (!published.length) {
        return [];
    }

    const sorted = [...published].sort((a, b) => {
        const downloadsA = Number(a.download_count) || 0;
        const downloadsB = Number(b.download_count) || 0;
        if (downloadsB !== downloadsA) {
            return downloadsB - downloadsA;
        }

        // Tie-breaker: higher rating average, then newer created_at
        const ratingA = Number(a.rating_avg) || 0;
        const ratingB = Number(b.rating_avg) || 0;
        if (ratingB !== ratingA) {
            return ratingB - ratingA;
        }

        const timeA = a.created_at ? Date.parse(a.created_at) || 0 : 0;
        const timeB = b.created_at ? Date.parse(b.created_at) || 0 : 0;
        return timeB - timeA;
    });

    return sorted.slice(0, 6);
}

// v6.4.1 (مراجعة AI Studio): بلا inline onclick/onerror — مستمعين DOM،
// وكل زر تحميل عندو aria-label خاص باللعبة ديالو.
function renderTrending() {
    const section = document.getElementById('trendingSection');
    const grid = document.getElementById('trendingGrid');
    if (!section || !grid) return;

    // بلا بيانات: القسم يبقى مخفي (نفس سلوك v6) — ما نعرضوش بطاقة وهمية.
    if (typeof allMods === 'undefined' || !Array.isArray(allMods) || !allMods.length) {
        section.style.display = 'none';
        return;
    }

    const top = getTrendingItems(allMods);
    if (!top.length) {
        section.style.display = 'none';
        return;
    }

    const fallbackImg = typeof PLACEHOLDER_IMG !== 'undefined' ? PLACEHOLDER_IMG : '';

    grid.innerHTML = '';

    top.forEach((mod, i) => {
        const card = document.createElement('article');
        card.className = 'trending-card';

        // القيم الخام (بلا هروب HTML) — textContent و addEventListener كيحميو من الحقن.
        const rawTitle = mod.title || 'بدون عنوان';
        const rawId = mod.id ?? `item-${i + 1}`;
        const downloads = Math.max(0, Number(mod.download_count) || 0).toLocaleString('en-US');
        const ratingAvg = Math.min(5, Math.max(0, Number(mod.rating_avg ?? 5))).toFixed(1);
        const ratingCount = Math.max(0, Number(mod.rating_count) || 0);

        const imgWrap = document.createElement('div');
        imgWrap.className = 'trending-img-wrap';
        const img = document.createElement('img');
        img.className = 'trending-img';
        img.src = mod.image_url || fallbackImg;
        img.alt = rawTitle;
        img.loading = 'lazy';
        img.decoding = 'async';
        let fellBack = false;
        img.addEventListener('error', () => {
            if (!fellBack) { fellBack = true; img.src = fallbackImg; }
        });
        imgWrap.appendChild(img);

        const rank = document.createElement('span');
        rank.className = 'trending-rank';
        rank.textContent = `#${i + 1}`;
        rank.title = `الترتيب ${i + 1}`;
        imgWrap.appendChild(rank);
        card.appendChild(imgWrap);

        const info = document.createElement('div');
        info.className = 'trending-info';

        const titleEl = document.createElement('h3');
        titleEl.className = 'trending-title';
        titleEl.textContent = rawTitle;
        titleEl.title = rawTitle;
        info.appendChild(titleEl);

        const meta = document.createElement('div');
        meta.className = 'trending-meta';
        const ratingSpan = document.createElement('span');
        ratingSpan.innerHTML = '<i class="fa-solid fa-star" style="color:var(--star-gold);" aria-hidden="true"></i>';
        ratingSpan.appendChild(document.createTextNode(` ${ratingAvg} (${ratingCount})`));
        const downloadsSpan = document.createElement('span');
        downloadsSpan.innerHTML = '<i class="fa-solid fa-download highlight" aria-hidden="true"></i>';
        downloadsSpan.appendChild(document.createTextNode(` ${downloads} تنزيل`));
        meta.appendChild(ratingSpan);
        meta.appendChild(downloadsSpan);
        info.appendChild(meta);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-block btn-sm';
        btn.setAttribute('aria-label', `تحميل ${rawTitle}`);
        const btnIcon = document.createElement('i');
        btnIcon.className = 'fa-solid fa-cloud-arrow-down';
        btnIcon.setAttribute('aria-hidden', 'true');
        btn.appendChild(btnIcon);
        btn.appendChild(document.createTextNode(' تحميل'));
        // القيمة الخام ديال id كتوصل لـ openDetails بلا تحويل لنص.
        btn.addEventListener('click', () => {
            if (typeof openDetails === 'function') openDetails(rawId);
        });
        info.appendChild(btn);

        card.appendChild(info);
        grid.appendChild(card);
    });

    section.style.display = 'block';
}

// طلبات الألعاب: لائحة عامة + فورم الإرسال
const REQUEST_STATUS_LABELS = {
    pending: ['قيد الانتظار', 'badge-draft'],
    approved: ['تم القبول', 'badge-approved'],
    done: ['تمت الإضافة ✅', 'badge-published'],
    rejected: ['مرفوض', 'badge-rejected']
};
function requestStatusBadge(status) {
    const [label, cls] = REQUEST_STATUS_LABELS[status] || REQUEST_STATUS_LABELS.pending;
    return `<span class="${cls}">${esc(label)}</span>`;
}

async function loadGameRequests() {
    const list = document.getElementById('requestsList');
    if (!list) return;
    try {
        // v6 (F-03) — اللائحة العامة كتقرا من العرض game_requests_public
        // (العنوان + النوع + الحالة + التاريخ فقط). الاسم والتفاصيل
        // ما كيبانوش للزوار — الأدمن كيشوفهم فلوحة التحكم.
        const { data, error } = await window.supabaseClient
            .from('game_requests_public')
            .select('game_title, game_type, status, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
        if (error || !data || data.length === 0) {
            list.innerHTML = '<p style="color:var(--text-gray)">لا توجد طلبات بعد — كن أول من يطلب! 🎮</p>';
            return;
        }
        list.innerHTML = '';
        data.forEach(r => {
            const item = document.createElement('div');
            item.className = 'request-item';
            item.innerHTML = `
                <div>
                    <strong>${esc(r.game_title)}</strong> ${requestStatusBadge(r.status)}
                    <div style="color:var(--text-gray); font-size:0.85rem; margin-top:4px;">
                        ${esc(r.game_type)} • ${new Date(r.created_at).toLocaleDateString('ar-EG')}
                    </div>
                </div>
            `;
            list.appendChild(item);
        });
    } catch (e) {
        list.innerHTML = '<p style="color:var(--text-gray)">تعذر جلب الطلبات حالياً.</p>';
    }
}

window.handleGameRequest = async function(e) {
    e.preventDefault();
    const name = document.getElementById('reqName').value.trim();
    const gameTitle = document.getElementById('reqGameTitle').value.trim();
    const gameType = document.getElementById('reqGameType').value;
    const details = document.getElementById('reqDetails').value.trim();
    // v6 (F-02) — نفس حدود قاعدة البيانات (CHECK constraints فـ v6)؛
    // B10 — cplen: الطول بالنقاط، ماشي وحدات UTF-16 (إيموجي = 1 فـ Postgres).
    if (cplen(name) < 2 || cplen(name) > 40 || cplen(gameTitle) < 2 || cplen(gameTitle) > 120 || cplen(details) > 500) {
        alert('تحقق من الطلب: الاسم 2-40 حرف، اسم اللعبة 2-120 حرف، التفاصيل 500 حرف كحد أقصى.');
        return;
    }
    const form = e.target;
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true; // كيمنع الإرسال مرتين
    try {
        const { error } = await window.supabaseClient.from('game_requests').insert([{
            name, game_title: gameTitle, game_type: gameType, details: details || null
        }]);
        if (error) { alert('تعذر إرسال الطلب: ' + error.message); return; }
        form.reset();
        const ok = document.getElementById('reqSuccess');
        if (ok) { ok.style.display = 'block'; setTimeout(() => { ok.style.display = 'none'; }, 5000); }
        loadGameRequests();
    } finally {
        if (btn) btn.disabled = false;
    }
};

function applyCurrentFilters() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const favs = getFavorites();

    const filtered = allMods.filter(mod => {
        // v3.9 — 'mods-only': كل المودات (أي تصنيف ما عدا ألعاب أندرويد)
        const matchCat = selectedCategory === 'all'
            || (selectedCategory === 'mods-only' ? mod.category_id !== gamesCategoryId() : mod.category_id === selectedCategory);
        // v6 (F-04) — البحث فالعنوان + الوصف القصير فقط (الوصف الكامل
        // ما كيتحملش مع القائمة، يعني ما يمكنش يتقلب فيه محلياً)
        const hay = ((mod.title || '') + ' ' + (mod.short_desc || '')).toLowerCase();
        const matchSearch = !q || hay.includes(q);
        const matchFav = !showingFavorites || favs.includes(mod.id);
        return matchCat && matchSearch && matchFav;
    });
    // v6.6 — "الأحدث": ترتيب صريح حسب created_at تنازلياً (ماشي غير
    // الاعتماد على ترتيب السيرفر): إلا الزائر بدّل الترتيب ورجع
    // لـ "الأحدث"، الألعاب الجديدة خاصها ترجع لولين.
    if (selectedSort === 'newest') filtered.sort((a, b) => {
        const timeA = a.created_at ? Date.parse(a.created_at) || 0 : 0;
        const timeB = b.created_at ? Date.parse(b.created_at) || 0 : 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''));
    });
    else if (selectedSort === 'downloads') filtered.sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
    else if (selectedSort === 'rating') filtered.sort((a, b) => (Number(b.rating_avg) || 0) - (Number(a.rating_avg) || 0));
    return filtered;
}

// v3.6 — ترقيم (pagination): نرسم 24 بطاقة فقط في البداية،
// والباقي كيبان بزر "عرض المزيد" — هادي أكبر خطوة للسلاسة مع 1323 عنصر.
const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;
let lastFilteredMods = null;
let lastFilteredFingerprint = '';

window.loadMoreMods = function() {
    visibleCount += PAGE_SIZE;
    renderModsGrid(lastFilteredMods);
};

// v3.9 — بطاقة واحدة مشتركة: شبكة المكتبة + قسمي الألعاب والمودات في الرئيسية
function buildModCard(mod) {
    const catName = mod.categories ? mod.categories.name : 'ألعاب أندرويد';
    const isFav = isFavorite(mod.id);
    const modeTag = mod.is_online
        ? '<span class="tag-badge tag-online">أونلاين</span>'
        : '<span class="tag-badge tag-offline">أوفلاين</span>';

    const card = document.createElement('div');
    card.className = 'mod-card';
    card.innerHTML = `
        <div class="card-img-wrapper">
            <img src="${esc(mod.image_url || PLACEHOLDER_IMG)}" alt="${esc(mod.title)}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
            <span class="card-badge">${esc(catName)}</span>
            <button class="fav-card-btn ${isFav ? 'active' : ''}" data-fav-id="${esc(mod.id)}" onclick="toggleFavorite(event, '${esc(mod.id)}')" title="حفظ في المفضلة">
                <i class="fa-solid fa-heart"></i>
            </button>
        </div>
        <div class="card-content">
            <div class="card-rating-row">
                <i class="fa-solid fa-star"></i>
                <span>${Number(mod.rating_avg ?? 5).toFixed(1)}</span>
                <span style="color:var(--text-gray); font-size:0.75rem;">(${mod.rating_count ?? 0})</span>
                <span style="margin-right:auto;">${modeTag}</span>
            </div>
            <h3 class="card-title">${esc(mod.title)}</h3>
            <p class="card-desc">${esc(mod.short_desc)}</p>
            <div class="card-meta">
                <span><i class="fa-solid fa-file-zipper highlight"></i> ${esc(mod.file_size)}</span>
                <span><i class="fa-solid fa-download highlight"></i> ${mod.download_count ?? 0} تنزيل</span>
            </div>
            <button class="btn btn-primary btn-block" onclick="openDetails('${esc(mod.id)}')">
                <i class="fa-solid fa-eye"></i> التفاصيل والتحميل
            </button>
        </div>
    `;
    return card;
}

// v5 — بطاقة مصغرة للصفوف الأفقية فالرئيسية (الصورة، الحالة، العنوان، الإصدار، التنزيلات)
function buildRailCard(mod) {
    const card = document.createElement('article');
    card.className = 'rail-card';
    card.tabIndex = 0;
    card.innerHTML = `
        <div class="rail-img-wrap">
            <img src="${esc(mod.image_url || PLACEHOLDER_IMG)}" alt="${esc(mod.title)}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
            <span class="rail-badge">${mod.is_online ? 'أونلاين' : 'أوفلاين'}</span>
            <button class="rail-fav ${isFavorite(mod.id) ? 'active' : ''}" data-fav-id="${esc(mod.id)}" aria-label="المفضلة" onclick="toggleFavorite(event, '${esc(mod.id)}')"><i class="fa-solid fa-heart"></i></button>
        </div>
        <h3 class="rail-title">${esc(mod.title)}</h3>
        <div class="rail-ver">${esc(mod.game_version || '')}</div>
        <div class="rail-dl">${mod.download_count ?? 0} <i class="fa-solid fa-download"></i></div>`;
    card.addEventListener('click', () => openDetails(mod.id));
    // v6 (F-15) — بطاقة الصف كتفتح بـ Enter و Space
    card.addEventListener('keydown', e => {
        // B7 — غير البطاقة نفسها كتفتح المودال: Enter/Space اللي طالعين
        // من زر القلب الداخلي كانو كيفتحو المودال، فمستحيل تفضّل من الصف بالكيبورد.
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(mod.id); }
    });
    return card;
}

// كيوزّع العناصر على 3 صفوف، كل صف كيتحرك بوحدو وعندو سهم. كيحافظ على موضع السكرول عند إعادة الرسم.
function fillRails(container, items) {
    const prev = [...container.querySelectorAll('.rail-scroll')].map(s => s.scrollLeft);
    container.innerHTML = '';
    for (let r = 0; r < RAIL_ROWS; r++) {
        const rowItems = items.filter((_, i) => i % RAIL_ROWS === r);
        if (!rowItems.length) continue;
        const row = document.createElement('div');
        row.className = 'rail-row';
        const scroller = document.createElement('div');
        scroller.className = 'rail-scroll';
        rowItems.forEach(m => scroller.appendChild(buildRailCard(m)));
        const arrow = document.createElement('button');
        arrow.className = 'rail-arrow';
        arrow.setAttribute('aria-label', 'التالي');
        arrow.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        arrow.addEventListener('click', () => scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: 'smooth' }));
        // v6 (F-15) — السهم كيتخبى ملي الصف يوصل للآخر (ولا ملي ما كاين حتى سكرول).
        // التطبيع ديال scrollLeft خدام فكل المتصفحات (RTL: كروم/فايرفوكس سالب، سفاري موجب).
        const syncArrow = () => {
            const max = scroller.scrollWidth - scroller.clientWidth;
            if (max <= 4) { arrow.style.display = 'none'; return; }
            const pos = scroller.scrollLeft <= 0 ? -scroller.scrollLeft : max - scroller.scrollLeft;
            arrow.style.display = pos >= max - 4 ? 'none' : '';
        };
        scroller.addEventListener('scroll', syncArrow, { passive: true });
        row.append(scroller, arrow);
        container.appendChild(row);
        scroller.scrollLeft = prev[r] || 0;
        syncArrow();
    }
}

// v6.2 — إحصائيات صفحة "من نحن": كتعمر من نفس البيانات (allMods).
// v6.2.1 — دالة مستقلة: كتتنادى من loadMods (فور التحميل)، من
// renderHomeSections، ومن switchView('about') — يعني الترتيب ولا خطأ
// فالرسم ما يقدرش يخليها "…" إلا كانت البيانات ما تحملاتش أصلاً.
function fillAboutStats() {
    if (!allMods.length) return; // بلا بيانات: خلّي "…" (حالة التحميل) بدل 0
    const aboutGames = document.getElementById('aboutGamesCount');
    const aboutMods = document.getElementById('aboutModsCount');
    const aboutTotal = document.getElementById('aboutTotalCount');
    if (!aboutGames && !aboutMods && !aboutTotal) return;
    const gid = gamesCategoryId();
    const g = allMods.filter(mod => mod.category_id === gid);
    const m = allMods.filter(mod => mod.category_id !== gid);
    if (aboutGames) aboutGames.textContent = g.length;
    if (aboutMods) aboutMods.textContent = m.length;
    if (aboutTotal) aboutTotal.textContent = allMods.length;
}

// v3.9 — أقسام الواجهة الرئيسية: الألعاب بحدها والمودات بحدهم.
// الألعاب: 8 ألعاب (صفّان × 4 أعمدة على الحاسوب)؛ المودات: 8 مودات. الأحدث أولاً.
function renderHomeSections() {
    const games = allMods.filter(mod => mod.category_id === gamesCategoryId());
    // v6.6 — قسم "ألعاب جديدة": أحدث الألعاب المضافة لولين دائماً،
    // قبل قسم الرائج — الرائج كيرتب حسب التحميلات، يعني لعبة جديدة
    // بـ 0 تحميل ما كتبانش فيه.
    const newGamesGrid = document.getElementById('newGamesGrid');
    const newGamesSection = document.getElementById('newGamesSection');
    if (newGamesGrid) {
        fillRails(newGamesGrid, games.slice(0, NEW_GAMES_COUNT));
        if (newGamesSection) newGamesSection.style.display = games.length ? '' : 'none';
        const ngc = document.getElementById('newGamesCount');
        if (ngc) ngc.textContent = games.length ? `(${Math.min(games.length, NEW_GAMES_COUNT)} لعبة)` : '';
    }
    const gamesGrid = document.getElementById('gamesGrid');
    if (gamesGrid) {
        fillRails(gamesGrid, games.slice(0, GAMES_RAIL_COUNT));
        const gc = document.getElementById('gamesCount');
        if (gc) gc.textContent = `(${games.length} لعبة)`;
    }
    const modsGrid = document.getElementById('modsHomeGrid');
    if (modsGrid) {
        const mods = allMods.filter(mod => mod.category_id !== gamesCategoryId());
        // تنويع: أحدث مود من كل تصنيف أولاً (سيارات، ملابس، شخصيات، أسلحة،
        // جرافيكس، خرائط، كليو) باش القسم يبيّن كل الأنواع، ثم كمّل بالأحدث.
        const picked = [];
        const seen = new Set();
        const modCatIds = [...new Set(mods.map(m => m.category_id))];
        modCatIds.forEach(catId => {
            const newest = mods.find(m => m.category_id === catId);
            if (newest && !seen.has(newest.id)) { picked.push(newest); seen.add(newest.id); }
        });
        for (const mod of mods) {
            if (picked.length >= HOME_SHOWCASE_COUNT) break;
            if (!seen.has(mod.id)) { picked.push(mod); seen.add(mod.id); }
        }
        modsGrid.innerHTML = '';
        picked.slice(0, HOME_SHOWCASE_COUNT).forEach(mod => modsGrid.appendChild(buildModCard(mod)));
        const mc = document.getElementById('modsHomeCount');
        if (mc) mc.textContent = `(${mods.length} مود)`;
    }

    fillAboutStats();
}

// أزرار "عرض كل الألعاب / عرض كل المودات": تهبط للمكتبة مع الفلتر المناسب
window.showAllGames = function() {
    switchView('library');
    const btn = document.querySelector(`.filter-btn[data-category="${gamesCategoryId()}"]`);
    filterByCategory(gamesCategoryId(), btn || null);
};

window.showAllMods = function() {
    switchView('library');
    const btn = document.querySelector('.filter-btn[data-category="mods-only"]');
    filterByCategory('mods-only', btn || null);
};

function renderModsGrid(mods) {
    const grid = document.getElementById('modsGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;
    grid.innerHTML = '';
    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = mods && mods.length ? `(${mods.length} لعبة / مود)` : '';

    if (!mods || mods.length === 0) {
        if (noResults) noResults.style.display = 'block';
        const moreBtn0 = document.getElementById('loadMoreBtn');
        if (moreBtn0) moreBtn0.style.display = 'none';
        return;
    }
    if (noResults) noResults.style.display = 'none';

    // v3.6 — إلا تبدلات القائمة (بحث/فلتر/ترتيب) رجع للـ 24 الأولى؛
    // إلا كانت نفس القائمة (مثلاً ضغط على قلب المفضلة) كمّل من فين وصلنا.
    const fingerprint = mods.length + '|' + (mods[0] ? mods[0].id : '') + '|' + (mods[mods.length - 1] ? mods[mods.length - 1].id : '');
    if (fingerprint !== lastFilteredFingerprint) {
        visibleCount = PAGE_SIZE;
        lastFilteredFingerprint = fingerprint;
    }
    lastFilteredMods = mods;
    const visible = mods.slice(0, visibleCount);

    visible.forEach(mod => grid.appendChild(buildModCard(mod)));

    // v3.6 — زر "عرض المزيد": يبان إلا بقاو ألعاب ما ترسموش
    const moreBtn = document.getElementById('loadMoreBtn');
    if (moreBtn) {
        const remaining = mods.length - visibleCount;
        moreBtn.style.display = remaining > 0 ? 'block' : 'none';
        if (remaining > 0) moreBtn.textContent = `عرض المزيد (${remaining} لعبة باقية) ⬇️`;
    }
}

window.filterByCategory = function(catId, btnElement) {
    selectedCategory = catId;
    showingFavorites = false;
    const favBtn = document.getElementById('favFilterBtn');
    if (favBtn) favBtn.classList.remove('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderModsGrid(applyCurrentFilters());
};

function setupSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        let t;
        input.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => renderModsGrid(applyCurrentFilters()), 150);
        });
        // أيقونة العدسة داخل صندوق البحث كتفتح الكتابة
        const icon = document.querySelector('.search-box .search-icon');
        if (icon) icon.addEventListener('click', () => input.focus());
    }
}

// يقبل غير روابط http/https (كيمنع javascript: وما شابه)
function safeUrl(u) {
    try {
        const x = new URL(String(u || '').trim());
        return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : '';
    } catch (e) {
        return '';
    }
}

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const clean = String(url).trim();
    let id = null;
    try {
        const u = new URL(/^https?:\/\//i.test(clean) ? clean : 'https://' + clean);
        const host = u.hostname.replace(/^(www\.|m\.)/, '');
        if (host === 'youtu.be') {
            id = u.pathname.slice(1).split('/')[0];
        } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            if (u.pathname === '/watch') {
                id = u.searchParams.get('v');
            } else {
                const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
                if (m) id = m[1];
            }
        }
    } catch (e) {
        return null;
    }
    // معرّف يوتيوب = 11 حرف بالضبط؛ هاد التحقق كيمنع كسر الـ HTML
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}?autoplay=0` : null;
}

// 3. فتح تفاصيل اللعبة وتشغيل عداد الـ 7 ثوانٍ
// v6.7 — شريط صور اللعبة: مصغرات أفقية تحت الصورة الرئيسية؛ تكليكي على
// مصغرة كتبدّل الصورة الرئيسية (onSelect). إلا ما كايناش صور، الشريط كيبقى مخفي.
function setActiveGalleryThumb(stripEl, activeBtn) {
    if (!stripEl) return;
    stripEl.querySelectorAll('.gallery-thumb').forEach((btn) => {
        const isCurrent = btn === activeBtn;
        btn.classList.toggle('active', isCurrent);
        btn.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
    });
}
function buildGalleryStrip(shots, stripEl, onSelect, onVideoSelect) {
    if (!stripEl) return;
    stripEl.replaceChildren();
    if (!shots || !shots.length) { stripEl.style.display = 'none'; return; }
    stripEl.style.display = '';
    if (typeof onVideoSelect === 'function') {
        const videoBtn = document.createElement('button');
        videoBtn.type = 'button';
        videoBtn.className = 'gallery-thumb gallery-thumb--video active';
        videoBtn.setAttribute('aria-label', 'فيديو المعاينة');
        videoBtn.setAttribute('aria-pressed', 'true');
        videoBtn.textContent = '▶ فيديو';
        videoBtn.addEventListener('click', () => {
            onVideoSelect();
            setActiveGalleryThumb(stripEl, videoBtn);
        });
        stripEl.appendChild(videoBtn);
    }
    shots.forEach((url, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isInitialActive = !onVideoSelect && idx === 0;
        btn.className = isInitialActive ? 'gallery-thumb active' : 'gallery-thumb';
        btn.dataset.shotUrl = url;
        btn.setAttribute('aria-label', 'لقطة ' + (idx + 1));
        btn.setAttribute('aria-pressed', isInitialActive ? 'true' : 'false');
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.alt = 'لقطة ' + (idx + 1);
        thumb.loading = 'lazy';
        thumb.onerror = () => {
            btn.remove();
            if (!stripEl.querySelector('.gallery-thumb[data-shot-url]')) {
                stripEl.replaceChildren();
                stripEl.style.display = 'none';
            }
        };
        btn.addEventListener('click', () => {
            onSelect(url);
            setActiveGalleryThumb(stripEl, btn);
        });
        btn.appendChild(thumb);
        stripEl.appendChild(btn);
    });
}

window.openDetails = async function(modId) {
    // v6 (F-04) — القائمة المختصرة ما فيهاش الوصف الكامل والروابط:
    // إلا كان العنصر ناقص، جيب الصف الكامل من السيرفر قبل ما يبان المودال.
    let mod = allMods.find(m => m.id === modId);
    if (!mod) {
        try {
            const { data, error } = await window.supabaseClient.from('mods').select('*, categories(name)').eq('id', modId).single();
            // B4 — فشل الجلب = تنبيه ورجوع، بلا ما يتحل المودال بصف ناقص
            if (error || !data) { alert('تعذر تحميل تفاصيل اللعبة، حاول مرة أخرى.'); return; }
            mod = data;
        } catch (e) { alert('تعذر تحميل تفاصيل اللعبة، حاول مرة أخرى.'); return; }
    } else if (mod.description === undefined) {
        try {
            const { data, error } = await window.supabaseClient.from('mods').select('*, categories(name)').eq('id', modId).single();
            // B4 — نفس الشي هنا: بلا صف كامل، ما نفتحوش المودال بوصف خاوي/روابط undefined
            if (error || !data) { alert('تعذر تحميل تفاصيل اللعبة، حاول مرة أخرى.'); return; }
            Object.assign(mod, data);
            if (mod.description === undefined) { alert('تعذر تحميل تفاصيل اللعبة، حاول مرة أخرى.'); return; }
        } catch (e) { alert('تعذر تحميل تفاصيل اللعبة، حاول مرة أخرى.'); return; }
    }
    activeMod = mod;

    // v6 (F-15) — حفظ العنصر اللي كان فيه التركيز باش نرجعوه ملي يتسد المودال
    lastFocusedBeforeModal = document.activeElement;

    // v6 (F-13) — عنوان ووصف خاصين باللعبة (للمشاركة والـ SEO)
    if (!originalMetaDesc) {
        const md0 = document.querySelector('meta[name="description"]');
        originalMetaDesc = md0 ? md0.content : '';
    }
    document.title = (mod.title || 'لعبة أندرويد') + ' | Gaming Omar';
    const mdEl = document.querySelector('meta[name="description"]');
    if (mdEl) mdEl.content = (mod.short_desc || mod.title || '').slice(0, 160);

    // نفرّغو تعليقات اللعبة السابقة قبل ما يبان المودال
    const prevComments = document.getElementById('commentsList');
    if (prevComments) prevComments.innerHTML = '';
    const prevCount = document.getElementById('commentsCount');
    if (prevCount) prevCount.textContent = '0';

    document.getElementById('modalTitle').textContent = mod.title || 'لعبة أندرويد';
    document.getElementById('modalBadge').textContent = mod.categories ? mod.categories.name : 'ألعاب أندرويد';
    
    // وضع اللعب
    const modeTag = document.getElementById('modalModeTag');
    if (mod.is_online) {
        if (modeTag) {
            modeTag.textContent = 'أونلاين 🌐';
            modeTag.className = 'tag-badge tag-online';
        }
        document.getElementById('modalModeVal').textContent = 'أونلاين بالنت';
    } else {
        if (modeTag) {
            modeTag.textContent = 'أوفلاين 📴';
            modeTag.className = 'tag-badge tag-offline';
        }
        document.getElementById('modalModeVal').textContent = 'بدون نت';
    }

    // المعاينة — v6.7: معرض صور اللعبة (screenshots JSONB)، بحال APKVision.
    // الصورة الرئيسية = أول سكرينشوت (أو الفيديو إلا كان)؛ الشريط تحتها كيبدّلها.
    // إلا ما كايناش سكرينشوتات، المودال كيبان بالضبط كيفما كان (صورة الغلاف وحدة).
    const mediaBox = document.getElementById('modalMediaContainer');
    const galleryStrip = document.getElementById('modalGalleryStrip');
    if (mediaBox) {
        let rawShots = mod.screenshots;
        if (typeof rawShots === 'string') {
            try { rawShots = JSON.parse(rawShots); } catch (err) { console.warn('Invalid screenshots JSON:', err); rawShots = []; }
        }
        const shotsList = (Array.isArray(rawShots) ? rawShots : [])
            .map((u) => (typeof u === 'string' ? safeUrl(u) : null))
            .filter(Boolean)
            .slice(0, 12);
        const embedUrl = getYouTubeEmbedUrl(mod.youtube_url);
        const failedUrls = new Set();
        const showPlaceholder = () => {
            const img = document.createElement('img');
            img.src = safeUrl(mod.image_url) || PLACEHOLDER_IMG;
            img.alt = mod.title || '';
            img.className = 'modal-img';
            img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_IMG; };
            mediaBox.replaceChildren(img);
        };
        const showVideo = () => {
            mediaBox.innerHTML = `
                <div class="video-responsive">
                    <iframe src="${embedUrl}" title="فيديو المعاينة" loading="lazy" allowfullscreen></iframe>
                </div>
            `;
        };
        const showShot = (url) => {
            const img = document.createElement('img');
            img.src = url;
            img.alt = mod.title || '';
            img.className = 'modal-img';
            img.onerror = () => {
                failedUrls.add(url);
                const brokenBtn = galleryStrip
                    ? Array.from(galleryStrip.children).find((el) => el.dataset.shotUrl === url)
                    : null;
                if (brokenBtn) brokenBtn.remove();
                const nextUrl = shotsList.find((u) => !failedUrls.has(u));
                if (nextUrl) {
                    const nextBtn = galleryStrip
                        ? Array.from(galleryStrip.children).find((el) => el.dataset.shotUrl === nextUrl)
                        : null;
                    setActiveGalleryThumb(galleryStrip, nextBtn || null);
                    showShot(nextUrl);
                } else {
                    if (galleryStrip && !galleryStrip.querySelector('.gallery-thumb[data-shot-url]')) {
                        galleryStrip.replaceChildren();
                        galleryStrip.style.display = 'none';
                    }
                    showPlaceholder();
                }
            };
            mediaBox.replaceChildren(img);
        };
        if (embedUrl) {
            showVideo();
        } else if (shotsList.length) {
            showShot(shotsList[0]);
        } else {
            showPlaceholder();
        }
        buildGalleryStrip(shotsList, galleryStrip, showShot, embedUrl ? showVideo : null);
    }

    // Reset stars to the rating already given from this browser, if any
    const rated = readStore('gaming_omar_rated', {});
    paintStars(rated[mod.id] || 0);

    // المواصفات
    document.getElementById('modalRatingScore').textContent = Number(mod.rating_avg ?? 5).toFixed(1);
    document.getElementById('modalRatingVotes').textContent = mod.rating_count ?? 0;
    document.getElementById('modalSize').textContent = mod.file_size || 'غير محدد';
    document.getElementById('modalVersion').textContent = mod.game_version || 'Android 5.0+';
    document.getElementById('modalRam').textContent = mod.ram_req || '2 GB';
    document.getElementById('modalGpu').textContent = mod.gpu_compat || 'جميع المعالجات';
    document.getElementById('modalDownloads').textContent = mod.download_count || 0;
    document.getElementById('modalDesc').textContent = mod.description || '';

    // تجهيز روابط التحميل — v6 (F-16e): الـ href كيتعمر غير ملي يسالي
    // العداد (شوف تحت)، باش الرابط ما يكونش فالـ DOM قبل الوقت.
    const primaryUrl = safeUrl(mod.download_type === 'storage' ? mod.file_url : mod.external_url);
    // v6.5 — الملفات الإضافية (APK + Data): كتجي من download_files (JSONB) —
    // مصفوفة ولا نص JSON؛ إلا كانت خاوية/غلط، ما كيبان والو.
    let rawExtraFiles = mod.download_files;
    if (typeof rawExtraFiles === 'string') {
        try {
            rawExtraFiles = JSON.parse(rawExtraFiles);
        } catch (_) {
            rawExtraFiles = [];
        }
    }
    const extraFilesList = Array.isArray(rawExtraFiles) ? rawExtraFiles : [];

    pendingDownload = {
        primary: primaryUrl,
        drive: safeUrl(mod.link_drive),
        mega: safeUrl(mod.link_mega),
        extras: []
    };
    const directBtn = document.getElementById('modalDirectDownloadBtn');
    if (directBtn) directBtn.href = '#';
    const extraBox = document.getElementById('extraDownloadButtons');
    if (extraBox) {
        extraBox.replaceChildren();
        extraFilesList.forEach((file) => {
            if (!file || typeof file !== 'object') return;
            const cleanUrl = safeUrl(file.url);
            if (!cleanUrl) return;
            const labelText = (typeof file.label === 'string' && file.label.trim())
                ? file.label.trim()
                : 'ملف إضافي';
            const sizeText = (typeof file.size === 'string' && file.size.trim())
                ? file.size.trim()
                : '';
            const btn = document.createElement('a');
            btn.href = '#';
            btn.target = '_blank';
            btn.rel = 'noopener noreferrer';
            btn.className = 'btn-download-big btn-download-extra';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-file-zipper';
            const textSpan = document.createElement('span');
            textSpan.textContent = sizeText ? `${labelText} (${sizeText})` : labelText;
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(' '));
            btn.appendChild(textSpan);
            btn.addEventListener('click', (e) => handleDownloadClick(e));
            extraBox.appendChild(btn);
            pendingDownload.extras.push({ btn, url: cleanUrl });
        });
        extraBox.style.display = pendingDownload.extras.length > 0 ? 'block' : 'none';
    }

    // تجهيز السيرفرات البديلة (الـ href كيتعمر مع العداد حتى هو)
    const mirrorsBox = document.getElementById('mirrorsGroup');
    const driveBtn = document.getElementById('driveDownloadLink');
    const megaBtn = document.getElementById('megaDownloadLink');
    let hasMirrors = false;

    if (pendingDownload.drive) {
        driveBtn.style.display = 'flex';
        hasMirrors = true;
    } else {
        driveBtn.style.display = 'none';
    }

    if (pendingDownload.mega) {
        megaBtn.style.display = 'flex';
        hasMirrors = true;
    } else {
        megaBtn.style.display = 'none';
    }

    if (mirrorsBox) {
        mirrorsBox.style.display = hasMirrors ? 'flex' : 'none';
    }

    // ==========================================
    // تشغيل العداد التنازلي التلقائي (7 ثوانٍ)
    // ==========================================
    const timerBox = document.getElementById('timerBox');
    const downloadButtonsBox = document.getElementById('downloadButtonsBox');
    const timerCount = document.getElementById('timerCount');

    if (countdownTimer) clearInterval(countdownTimer);

    timerBox.style.display = 'block';
    downloadButtonsBox.style.display = 'none';

    let seconds = 7;
    timerCount.textContent = seconds;

    countdownTimer = setInterval(() => {
        seconds--;
        timerCount.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(countdownTimer);
            timerBox.style.display = 'none';
            downloadButtonsBox.style.display = 'block';
            // v6 (F-16e) — دابا فقط كتتعمر روابط التحميل
            if (pendingDownload) {
                if (directBtn) directBtn.href = pendingDownload.primary || '#';
                if (driveBtn && pendingDownload.drive) driveBtn.href = pendingDownload.drive;
                if (megaBtn && pendingDownload.mega) megaBtn.href = pendingDownload.mega;
                // v6.5 — روابط الملفات الإضافية كتتعمر هنا حتى هي (بعد العداد)
                if (Array.isArray(pendingDownload.extras)) {
                    pendingDownload.extras.forEach(({ btn, url }) => {
                        btn.href = url;
                    });
                }
            }
        }
    }, 1000);

    // المودال كيبان أولاً (والعداد كيبدا معاه)، والتعليقات كيتحملو من بعد
    const modal = document.getElementById('modModal');
    if (modal) modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    // v6 (F-15) — التركيز كيدخل للمودال (زر الإغلاق)
    const closeBtn = modal ? modal.querySelector('.modal-close') : null;
    if (closeBtn) closeBtn.focus();

    loadComments(mod.id);
};

window.closeModal = function() {
    if (countdownTimer) clearInterval(countdownTimer);
    const modal = document.getElementById('modModal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
    const mediaBox = document.getElementById('modalMediaContainer');
    if (mediaBox) mediaBox.innerHTML = '';
    // v6.7 — فرّغ شريط الصور حتى ما يبقاش ديال اللعبة السابقة
    const galleryStrip = document.getElementById('modalGalleryStrip');
    if (galleryStrip) { galleryStrip.replaceChildren(); galleryStrip.style.display = 'none'; }
    // v6 (F-13/F-15) — رجّع عنوان ووصف الصفحة، ورجّع التركيز للعنصر اللي فتح المودال
    if (originalDocTitle) document.title = originalDocTitle;
    const mdEl = document.querySelector('meta[name="description"]');
    if (mdEl && originalMetaDesc) mdEl.content = originalMetaDesc;
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
        lastFocusedBeforeModal.focus();
        lastFocusedBeforeModal = null;
    }
};

// v6 (F-15) — حبس التركيز داخل المودال: Tab كيدور غير على عناصر المودال
document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const modal = document.getElementById('modModal');
    if (!modal || !modal.classList.contains('show')) return;
    const focusables = modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const visible = [...focusables].filter(el => !el.disabled && el.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0], last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

window.handleBackdropClick = function(e) {
    if (e.target.id === 'modModal') closeModal();
};

// 4. نقرة التحميل
window.handleDownloadClick = async function(e) {
    if (!activeMod) return;
    const primaryUrl = safeUrl(activeMod.download_type === 'storage' ? activeMod.file_url : activeMod.external_url);
    
    if (!primaryUrl) {
        if (e) e.preventDefault();
        alert("عذراً، لم يقم الأدمن بإضافة رابط تحميل لهذا الملف بعد!");
        return;
    }

    try {
        // v6 (F-01) — voter_id باش السيرفر يحسب تحميل واحد فاليوم لكل زائر ومود
        const { error } = await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id, voter_id: getVoterId() });
        // B2 — العداد المحلي كيتزاد غير إلا السيرفر قبل الزيادة فعلاً.
        // ملاحظة: الـ RPC كيرجع void والتكرار فنفس اليوم كيتجاهل بصمت
        // (ON CONFLICT DO NOTHING فـ schema-v6)، يعني نجاح النداء بوحدو
        // ما كيثبتش بلي تزاد — خاصنا نقراو العدد الحقيقي من السيرفر.
        // إلا النداء رجّع خطأ (تكرار مرفوض ولا مشكل آخر)، ما كنزيدو والو.
        if (error) { console.error("Increment error:", error); return; }
        const { data, error: fetchError } = await window.supabaseClient.from('mods')
            .select('download_count').eq('id', activeMod.id).single();
        if (fetchError || !data || typeof data.download_count !== 'number') {
            console.error("Download count re-read error:", fetchError);
            return;
        }
        activeMod.download_count = data.download_count;
        const dlSpan = document.getElementById('modalDownloads');
        if (dlSpan) dlSpan.textContent = activeMod.download_count;
    } catch (err) {
        console.error("Increment error:", err);
    }
};

// 5. الإبلاغ عن رابط معطل
window.reportCurrentMod = async function() {
    if (!activeMod) return;
    if (confirm("هل تريد الإبلاغ عن أن رابط تحميل هذا الملف لا يعمل؟")) {
        try {
            const { error } = await window.supabaseClient.from('broken_links').insert([
                { mod_id: activeMod.id, mod_title: activeMod.title }
            ]);
            if (error) {
                console.error("Report error:", error);
                alert("تعذر إرسال البلاغ حالياً، حاول مرة أخرى لاحقاً.");
            } else {
                alert("شكراً لك! تم إرسال البلاغ إلى الأدمن ليتم تجديد الرابط فوراً.");
            }
        } catch (err) {
            console.error("Report error:", err);
            alert("تعذر إرسال البلاغ حالياً، حاول مرة أخرى لاحقاً.");
        }
    }
};

// 6. تقييم النجوم
function paintStars(val) {
    document.querySelectorAll('#starsRatingBox i').forEach((s, idx) => {
        s.classList.toggle('active', idx < val);
    });
}
function setupInteractiveStars() {
    const stars = document.querySelectorAll('#starsRatingBox i');
    stars.forEach(star => {
        star.addEventListener('click', async () => {
            const val = parseInt(star.getAttribute('data-val'));

            if (!activeMod) return;
            const rated = readStore('gaming_omar_rated', {});
            if (rated[activeMod.id]) {
                paintStars(rated[activeMod.id]); // نبقاو نبينو التقييم القديم، ماشي النجمة اللي ضغط عليها
                alert('قيّمت هذه اللعبة من قبل (' + rated[activeMod.id] + ' نجوم). شكراً لك!');
                return;
            }
            paintStars(val);
            try {
                // v6 (F-01) — voter_id: السيرفر كيرفض التقييم الثاني من نفس الزائر
                const { error } = await window.supabaseClient.rpc('add_mod_rating', {
                    target_mod_id: activeMod.id,
                    user_stars: val,
                    voter_id: getVoterId()
                });
                if (error) throw error;
                rated[activeMod.id] = val;
                writeStore('gaming_omar_rated', rated);
                const { data } = await window.supabaseClient.from('mods')
                    .select('rating_avg, rating_count').eq('id', activeMod.id).single();
                if (data) {
                    activeMod.rating_avg = data.rating_avg;
                    activeMod.rating_count = data.rating_count;
                    document.getElementById('modalRatingScore').textContent = Number(data.rating_avg).toFixed(1);
                    document.getElementById('modalRatingVotes').textContent = data.rating_count;
                    renderModsGrid(applyCurrentFilters());
                    renderHomeSections();
                    // B8 — التقييم كيبدّل المتوسطات، يعني ترتيب الرائج يقدر يتبدل
                    renderTrending();
                }
                alert(`شكراً لك! تم تسجيل تقييمك (${val} نجوم) بنجاح.`);
            } catch (e) {
                console.error("Rating error:", e);
                // v6 (F-01) — إلا السيرفر قال "مكرر" (الزائر مسح التخزين
                // وعاود قيّم)، بين ليه بلي قيّم من قبل بدل خطأ عام.
                // B9 — كود Postgres 23505 (unique_violation) هو الإشارة
                // الموثوقة؛ مطابقة نص "duplicate key" كتبقى غير احتياط.
                if (e.code === '23505' || (e.message && /duplicate key/i.test(e.message))) {
                    rated[activeMod.id] = val;
                    writeStore('gaming_omar_rated', rated);
                    paintStars(val);
                    alert('قيّمت هذه اللعبة من قبل (' + val + ' نجوم). شكراً لك!');
                } else {
                    paintStars(rated[activeMod.id] || 0); // رجّع النجوم كيف كانت
                    alert('فشل تسجيل التقييم: ' + (e.message || 'خطأ غير معروف'));
                }
            }
        });
    });
}

// 7. التعليقات
async function loadComments(modId) {
    const list = document.getElementById('commentsList');
    const countSpan = document.getElementById('commentsCount');
    if (!list) return;

    try {
        const { data: comments } = await window.supabaseClient
            .from('comments')
            .select('*')
            .eq('mod_id', modId)
            .order('created_at', { ascending: false });

        // إلا الزائر بدّل اللعبة قبل ما توصل التعليقات، ما نكتبوش فوق تعليقات اللعبة الجديدة
        if (!activeMod || activeMod.id !== modId) return;

        if (countSpan) countSpan.textContent = comments ? comments.length : 0;
        list.innerHTML = '';

        if (!comments || comments.length === 0) {
            list.innerHTML = '<small style="color:var(--text-gray);">كن أول من يكتب تعليقاً حول هذه اللعبة!</small>';
            return;
        }

        comments.forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            const header = document.createElement('div');
            header.className = 'comment-header';
            const strong = document.createElement('strong');
            strong.textContent = c.author_name;
            const date = document.createElement('span');
            date.textContent = new Date(c.created_at).toLocaleDateString('ar-EG');
            header.append(strong, date);
            const p = document.createElement('p');
            p.style.fontSize = '0.9rem';
            p.textContent = c.content;
            item.append(header, p);
            list.appendChild(item);
        });
    } catch (e) {
        if (list) list.innerHTML = '<small style="color:var(--text-gray);">التعليقات متاحة قريباً.</small>';
    }
}

window.handlePostComment = async function(e) {
    e.preventDefault();
    if (!activeMod) return;

    const authorInput = document.getElementById('commentAuthor');
    const textInput = document.getElementById('commentText');
    const author_name = authorInput ? authorInput.value.trim() : 'زائر';
    const content = textInput ? textInput.value.trim() : '';

    if (cplen(author_name) < 2 || cplen(author_name) > 40 || cplen(content) < 2 || cplen(content) > 1000) {
        alert('اكتب اسمك (2-40 حرف) وتعليقك (2-1000 حرف) أولاً.');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true; // كيمنع التعليق يتبعت مرتين
    try {
        const { error } = await window.supabaseClient.from('comments').insert([
            { mod_id: activeMod.id, author_name, content }
        ]);

        if (error) {
            alert("فشل إضافة التعليق: " + error.message);
        } else {
            if (textInput) textInput.value = '';
            await loadComments(activeMod.id);
        }
    } catch (err) {
        alert("حدث خطأ أثناء إرسال التعليق.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
};

// v2: v1 was fake (showed "success" but saved nothing).
// Now saves to contact_messages; admin reads it in "رسائل الزوار".
window.handlePublicContact = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    // v6 (F-02) — نفس حدود قاعدة البيانات + تحقق من شكل الإيميل
    const cName = document.getElementById('contactName').value.trim();
    const cEmail = document.getElementById('contactEmail').value.trim();
    const cMsg = document.getElementById('contactMsg').value.trim();
    if (cplen(cName) < 2 || cplen(cName) > 40 || cplen(cEmail) > 120
        || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(cEmail)
        || cplen(cMsg) < 2 || cplen(cMsg) > 2000) {
        alert('تحقق من الرسالة: الاسم 2-40 حرف، إيميل صحيح (120 حرف كحد أقصى)، الرسالة 2-2000 حرف.');
        return;
    }
    if (btn) btn.disabled = true;
    try {
        const { error } = await window.supabaseClient.from('contact_messages').insert([{
            name: cName,
            email: cEmail,
            message: cMsg,
        }]);
        if (error) throw error;
        const successBox = document.getElementById('contactSuccess');
        if (successBox) successBox.style.display = 'block';
        e.target.reset();
        setTimeout(() => {
            if (successBox) successBox.style.display = 'none';
        }, 4000);
    } catch (err) {
        alert('فشل إرسال الرسالة: ' + (err.message || 'خطأ غير معروف') + ' — حاول مرة أخرى.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

// ===== v6.1 — نافذة "تعريف بالمطور" (مستقلة على مودال التحميل) =====
let lastFocusedBeforeDev = null;

window.openDevModal = function() {
    const m = document.getElementById('devModal');
    if (!m) return;
    lastFocusedBeforeDev = document.activeElement;
    m.classList.add('show');
    document.body.style.overflow = 'hidden';
    const closeBtn = m.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
};

window.closeDevModal = function() {
    const m = document.getElementById('devModal');
    if (!m || !m.classList.contains('show')) return;
    m.classList.remove('show');
    document.body.style.overflow = '';
    if (lastFocusedBeforeDev && typeof lastFocusedBeforeDev.focus === 'function') {
        lastFocusedBeforeDev.focus();
        lastFocusedBeforeDev = null;
    }
};

window.handleDevBackdropClick = function(e) {
    if (e.target.id === 'devModal') closeDevModal();
};

document.addEventListener('keydown', e => {
    const m = document.getElementById('devModal');
    if (!m || !m.classList.contains('show')) return;
    if (e.key === 'Escape') { closeDevModal(); return; }
    if (e.key !== 'Tab') return;
    const visible = [...m.querySelectorAll('button, a[href]')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0], last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
