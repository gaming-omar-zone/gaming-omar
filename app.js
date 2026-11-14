// ========================================================
// Gaming Omar - Public Site Logic v2 (FIXED)
// Fixes vs v1:
//  * XSS: all user/DB text is escaped before innerHTML
//  * Null-safety: title/short_desc/image_url may be null
//  * Download timer: cleared on modal close, no double-count;
//    the counter now increments ONCE when a mirror link is
//    actually clicked, not just when the timer ends
//  * Rating: one rating per mod per browser (localStorage),
//    UI refreshes from the DB after rating
//  * Contact form: actually saves to contact_messages table
//  * Load errors: shows a retry box instead of a stuck spinner
//  * Sorting: newest / most downloaded / highest rated
// ========================================================

let allMods = [];
let allCategories = [];
let selectedCategory = 'all';
let selectedSort = 'newest';
let activeMod = null;
let showingFavorites = false;
let downloadTimerId = null;
let downloadCounted = false;

// Placeholder image when a mod has no / broken image
const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#131518"/><text x="300" y="190" font-size="64" text-anchor="middle">🎮</text></svg>');

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function safeText(v, fallback = '') { return (v == null || v === '') ? fallback : String(v); }
function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', async () => {
    $('yearSpan').textContent = new Date().getFullYear();
    setupMobileNav();
    updateFavoritesBadge();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    if (!window.supabaseClient) {
        showLoadError('تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت وأعد المحاولة.');
        return;
    }
    await loadSettings();
    await loadCategories();
    await loadMods();
    setupSearch();
    setupInteractiveStars();
    const sortSel = $('sortSelect');
    if (sortSel) sortSel.addEventListener('change', () => {
        selectedSort = sortSel.value;
        renderModsGrid(applyCurrentFilters());
    });
});

function showLoadError(msg) {
    const loading = $('loadingIndicator');
    if (loading) loading.style.display = 'none';
    const box = $('loadError');
    if (box) {
        box.style.display = 'block';
        const msgEl = $('loadErrorMsg');
        if (msgEl) msgEl.textContent = msg;
    }
}

window.switchView = function (viewName) {
    $('viewHome').style.display = (viewName === 'home' || viewName === 'mods') ? 'block' : 'none';
    $('viewAbout').style.display = viewName === 'about' ? 'block' : 'none';
    $('viewContact').style.display = viewName === 'contact' ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[onclick="switchView('${viewName}')"]`);
    if (targetLink) targetLink.classList.add('active');

    if (viewName === 'mods') {
        $('mods').scrollIntoView({ behavior: 'smooth' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    $('navLinks').classList.remove('show');
};

function setupMobileNav() {
    $('navToggle').addEventListener('click', () => {
        $('navLinks').classList.toggle('show');
    });
}

// 1. نظام المفضلة (Favorites)
function getFavorites() {
    try { return JSON.parse(localStorage.getItem('gaming_omar_favs') || '[]'); }
    catch { return []; }
}
function isFavorite(modId) { return getFavorites().includes(modId); }

window.toggleFavorite = function (e, modId) {
    e.stopPropagation();
    let favs = getFavorites();
    favs = favs.includes(modId) ? favs.filter(id => id !== modId) : [...favs, modId];
    localStorage.setItem('gaming_omar_favs', JSON.stringify(favs));
    updateFavoritesBadge();
    renderModsGrid(applyCurrentFilters());
};

function updateFavoritesBadge() {
    const badge = $('favCount');
    if (badge) badge.textContent = getFavorites().length;
}

window.toggleFavoritesFilter = function () {
    showingFavorites = !showingFavorites;
    const favBtn = $('favFilterBtn');
    if (showingFavorites) {
        favBtn.classList.add('active');
        document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    } else {
        favBtn.classList.remove('active');
        document.querySelector('.filter-btn[data-category="all"]').classList.add('active');
    }
    renderModsGrid(applyCurrentFilters());
};

window.showFavoritesOnly = function () {
    showingFavorites = true;
    $('favFilterBtn').classList.add('active');
    document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    renderModsGrid(applyCurrentFilters());
    $('mods').scrollIntoView({ behavior: 'smooth' });
};

// 2. جلب البيانات والإعدادات
async function loadSettings() {
    try {
        const { data } = await window.supabaseClient.from('site_settings').select('*');
        if (data) {
            const heroData = data.find(item => item.key === 'hero')?.value;
            if (heroData) {
                if (heroData.title) $('heroTitle').textContent = heroData.title;
                if (heroData.subtitle) $('heroSubtitle').textContent = heroData.subtitle;
                // badge is admin-controlled text: insert as text, keep the icon
                if (heroData.badge) {
                    $('heroBadge').innerHTML = '';
                    const icon = document.createElement('i');
                    icon.className = 'fa-brands fa-android';
                    $('heroBadge').append(icon, document.createTextNode(' ' + heroData.badge));
                }
            }
        }
    } catch (e) { console.error('Settings error:', e); }
}

async function loadCategories() {
    const { data: categories, error } = await window.supabaseClient
        .from('categories').select('*').order('created_at', { ascending: true });
    if (error || !categories) return;
    allCategories = categories;
    const categoriesBar = $('categoriesBar');
    const footerCats = $('footerCats');
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.setAttribute('data-category', cat.id);
        btn.innerHTML = `<i class="fa-solid ${esc(cat.icon || 'fa-folder')}"></i> ${esc(cat.name)}`;
        btn.onclick = () => filterByCategory(cat.id, btn);
        categoriesBar.appendChild(btn);

        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#mods';
        a.textContent = cat.name;
        a.onclick = () => filterByCategory(cat.id);
        li.appendChild(a);
        footerCats.appendChild(li);
    });
    const allBtn = document.querySelector('.filter-btn[data-category="all"]');
    if (allBtn) allBtn.onclick = function () { filterByCategory('all', this); };
}

async function loadMods() {
    const loading = $('loadingIndicator');
    if (loading) loading.style.display = 'block';
    const errBox = $('loadError');
    if (errBox) errBox.style.display = 'none';
    try {
        const { data: mods, error } = await window.supabaseClient
            .from('mods').select('*, categories(name)')
            .eq('is_published', true)
            .order('created_at', { ascending: false });
        if (error) throw error;
        allMods = mods || [];
        renderModsGrid(applyCurrentFilters());
    } catch (e) {
        console.error('Mods error:', e);
        showLoadError('تعذر جلب الألعاب: ' + (e.message || 'خطأ غير معروف'));
    } finally {
        if (loading) loading.style.display = 'none';
    }
}
window.reloadMods = loadMods;

function applyCurrentFilters() {
    const q = ($('searchInput').value || '').trim().toLowerCase();
    const favs = getFavorites();
    const filtered = allMods.filter(mod => {
        const matchCat = selectedCategory === 'all' || mod.category_id === selectedCategory;
        // v1 crashed here when short_desc was null
        const hay = ((mod.title || '') + ' ' + (mod.short_desc || '') + ' ' + (mod.description || '')).toLowerCase();
        const matchSearch = !q || hay.includes(q);
        const matchFav = !showingFavorites || favs.includes(mod.id);
        return matchCat && matchSearch && matchFav;
    });
    if (selectedSort === 'downloads') filtered.sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
    else if (selectedSort === 'rating') filtered.sort((a, b) => (Number(b.rating_avg) || 0) - (Number(a.rating_avg) || 0));
    // 'newest' is already the DB order (created_at desc)
    return filtered;
}

function renderModsGrid(mods) {
    const grid = $('modsGrid');
    const noResults = $('noResults');
    const countEl = $('resultsCount');
    grid.innerHTML = '';
    if (countEl) countEl.textContent = mods.length ? `(${mods.length} لعبة / مود)` : '';
    if (mods.length === 0) { noResults.style.display = 'block'; return; }
    noResults.style.display = 'none';

    mods.forEach(mod => {
        const catName = mod.categories ? mod.categories.name : 'ألعاب أندرويد';
        const isFav = isFavorite(mod.id);
        const modeTag = mod.is_online
            ? '<span class="tag-badge tag-online">أونلاين</span>'
            : '<span class="tag-badge tag-offline">أوفلاين</span>';
        const card = document.createElement('div');
        card.className = 'mod-card';
        // All DB text goes through esc() — v1 injected it raw (XSS)
        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${esc(mod.image_url || PLACEHOLDER_IMG)}" alt="${esc(mod.title)}" class="card-img" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
                <span class="card-badge">${esc(catName)}</span>
                <button class="fav-card-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${esc(mod.id)}')" title="حفظ في المفضلة" aria-label="حفظ في المفضلة">
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
            </div>`;
        grid.appendChild(card);
    });
}

window.filterByCategory = function (catId, btnElement) {
    selectedCategory = catId;
    showingFavorites = false;
    $('favFilterBtn').classList.remove('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    else {
        const btn = document.querySelector(`.filter-btn[data-category="${catId}"]`);
        if (btn) btn.classList.add('active');
    }
    renderModsGrid(applyCurrentFilters());
};

function setupSearch() {
    const input = $('searchInput');
    let t;
    input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => renderModsGrid(applyCurrentFilters()), 150); // debounce
    });
}

// 3. تحويل رابط يوتيوب العادي إلى رابط Embed
function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

function clearDownloadTimer() {
    if (downloadTimerId) { clearInterval(downloadTimerId); downloadTimerId = null; }
}

// 4. فتح تفاصيل اللعبة / المود
window.openDetails = async function (modId) {
    const mod = allMods.find(m => m.id === modId);
    if (!mod) return;
    activeMod = mod;
    downloadCounted = false;
    clearDownloadTimer();

    $('modalTitle').textContent = mod.title || '';
    $('modalBadge').textContent = mod.categories ? mod.categories.name : 'لعبة أندرويد';

    const modeTag = $('modalModeTag');
    if (mod.is_online) {
        modeTag.textContent = 'أونلاين 🌐';
        modeTag.className = 'tag-badge tag-online';
        $('modalModeVal').textContent = 'أونلاين بالنت';
    } else {
        modeTag.textContent = 'أوفلاين 📴';
        modeTag.className = 'tag-badge tag-offline';
        $('modalModeVal').textContent = 'بدون نت';
    }

    const mediaBox = $('modalMediaContainer');
    const embedUrl = getYouTubeEmbedUrl(mod.youtube_url);
    if (embedUrl) {
        mediaBox.innerHTML = `<div class="video-responsive"><iframe src="${esc(embedUrl)}" allowfullscreen title="${esc(mod.title)}"></iframe></div>`;
    } else {
        const img = document.createElement('img');
        img.src = mod.image_url || PLACEHOLDER_IMG;
        img.alt = mod.title || '';
        img.className = 'modal-img';
        img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_IMG; };
        mediaBox.innerHTML = '';
        mediaBox.appendChild(img);
    }

    $('modalRatingScore').textContent = Number(mod.rating_avg ?? 5).toFixed(1);
    $('modalRatingVotes').textContent = mod.rating_count ?? 0;
    $('modalSize').textContent = safeText(mod.file_size, '—');
    $('modalVersion').textContent = safeText(mod.game_version, 'Android 5.0+');
    $('modalRam').textContent = safeText(mod.ram_req, '2 GB');
    $('modalGpu').textContent = safeText(mod.gpu_compat, 'جميع المعالجات');
    $('modalDownloads').textContent = mod.download_count ?? 0;
    $('modalDesc').textContent = mod.description || '';

    // Reset stars: show already-given rating, if any
    const rated = JSON.parse(localStorage.getItem('gaming_omar_rated') || '{}');
    paintStars(rated[mod.id] || 0);

    $('timerContainer').style.display = 'none';
    $('mirrorsGroup').style.display = 'none';
    $('modalStartDownloadBtn').style.display = 'inline-flex';

    await loadComments(mod.id);
    $('modModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function () {
    clearDownloadTimer(); // v1: interval kept running after close
    $('modModal').classList.remove('show');
    document.body.style.overflow = '';
    $('modalMediaContainer').innerHTML = '';
    activeMod = null;
};

window.handleBackdropClick = function (e) {
    if (e.target.id === 'modModal') closeModal();
};

// 5. العداد التنازلي والتحميل بروابط متعددة
window.startDownloadProcess = function () {
    if (!activeMod || downloadTimerId) return; // prevent double timers
    const startBtn = $('modalStartDownloadBtn');
    const timerBox = $('timerContainer');
    const timerCount = $('timerCount');
    const mirrorsGroup = $('mirrorsGroup');
    startBtn.style.display = 'none';
    timerBox.style.display = 'block';
    let seconds = 7;
    timerCount.textContent = seconds;
    downloadTimerId = setInterval(() => {
        seconds--;
        timerCount.textContent = seconds;
        if (seconds <= 0) {
            clearDownloadTimer();
            timerBox.style.display = 'none';
            mirrorsGroup.style.display = 'flex';
            const primaryUrl = activeMod.download_type === 'storage' ? activeMod.file_url : activeMod.external_url;
            const primaryLink = $('primaryDownloadLink');
            primaryLink.href = primaryUrl || '#';
            if (!primaryUrl) primaryLink.style.opacity = '0.5';

            const driveBtn = $('driveDownloadLink');
            if (activeMod.link_drive) { driveBtn.href = activeMod.link_drive; driveBtn.style.display = 'flex'; }
            else driveBtn.style.display = 'none';
            const megaBtn = $('megaDownloadLink');
            if (activeMod.link_mega) { megaBtn.href = activeMod.link_mega; megaBtn.style.display = 'flex'; }
            else megaBtn.style.display = 'none';

            // Count only when the user REALLY clicks a link, once per modal open
            mirrorsGroup.querySelectorAll('a').forEach(a => {
                a.onclick = async () => { await countDownloadOnce(); };
            });
        }
    }, 1000);
};

async function countDownloadOnce() {
    if (downloadCounted || !activeMod) return;
    downloadCounted = true;
    try {
        await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id });
        activeMod.download_count = (activeMod.download_count || 0) + 1;
        $('modalDownloads').textContent = activeMod.download_count;
        renderModsGrid(applyCurrentFilters());
    } catch (e) { console.error('Increment error', e); }
}

// 6. الإبلاغ عن رابط معطل
window.reportCurrentMod = async function () {
    if (!activeMod) return;
    if (!confirm('هل تريد الإبلاغ عن هذا الرابط لأنه لا يعمل؟')) return;
    const { error } = await window.supabaseClient.from('broken_links').insert([
        { mod_id: activeMod.id, mod_title: activeMod.title }
    ]);
    if (error) alert('حدث خطأ أثناء الإبلاغ: ' + error.message);
    else alert('شكراً لك! تم إرسال البلاغ وسيقوم الأدمن بتحديث الرابط فوراً.');
};

// 7. نظام تقييم النجوم
function paintStars(val) {
    document.querySelectorAll('#starsRatingBox i').forEach((s, idx) => {
        s.classList.toggle('active', idx < val);
    });
}
function setupInteractiveStars() {
    const stars = document.querySelectorAll('#starsRatingBox i');
    stars.forEach(star => {
        star.addEventListener('click', async () => {
            if (!activeMod) return;
            const val = parseInt(star.getAttribute('data-val'), 10);
            const rated = JSON.parse(localStorage.getItem('gaming_omar_rated') || '{}');
            if (rated[activeMod.id]) {
                alert('قيّمت هذه اللعبة من قبل (' + rated[activeMod.id] + ' نجوم). شكراً لك!');
                return;
            }
            paintStars(val);
            try {
                const { error } = await window.supabaseClient.rpc('add_mod_rating', {
                    target_mod_id: activeMod.id, user_stars: val
                });
                if (error) throw error;
                rated[activeMod.id] = val;
                localStorage.setItem('gaming_omar_rated', JSON.stringify(rated));
                // Refresh the real average from the DB
                const { data } = await window.supabaseClient.from('mods')
                    .select('rating_avg, rating_count').eq('id', activeMod.id).single();
                if (data) {
                    activeMod.rating_avg = data.rating_avg;
                    activeMod.rating_count = data.rating_count;
                    $('modalRatingScore').textContent = Number(data.rating_avg).toFixed(1);
                    $('modalRatingVotes').textContent = data.rating_count;
                    renderModsGrid(applyCurrentFilters());
                }
                alert(`شكراً لك! تم تسجيل تقييمك (${val} نجوم) بنجاح.`);
            } catch (e) {
                console.error('Rating error:', e);
                alert('فشل تسجيل التقييم: ' + (e.message || 'خطأ غير معروف'));
            }
        });
    });
}

// 8. نظام التعليقات
async function loadComments(modId) {
    const { data: comments } = await window.supabaseClient
        .from('comments').select('*').eq('mod_id', modId).order('created_at', { ascending: false });
    const list = $('commentsList');
    $('commentsCount').textContent = comments ? comments.length : 0;
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
        strong.textContent = c.author_name; // textContent = safe, no XSS
        const date = document.createElement('span');
        date.textContent = new Date(c.created_at).toLocaleDateString('ar-EG');
        header.append(strong, date);
        const p = document.createElement('p');
        p.style.fontSize = '0.9rem';
        p.textContent = c.content;
        item.append(header, p);
        list.appendChild(item);
    });
}

window.handlePostComment = async function (e) {
    e.preventDefault();
    if (!activeMod) return;
    const author_name = $('commentAuthor').value.trim();
    const content = $('commentText').value.trim();
    if (author_name.length < 2 || content.length < 2) {
        alert('اكتب اسمك وتعليقك أولاً.');
        return;
    }
    const { error } = await window.supabaseClient.from('comments').insert([
        { mod_id: activeMod.id, author_name, content }
    ]);
    if (error) alert('فشل إضافة التعليق: ' + error.message);
    else {
        $('commentText').value = '';
        await loadComments(activeMod.id);
    }
};

// 9. اتصل بنا — v1 كان وهمياً (يعرض "نجاح" بلا حفظ).
// v2: يحفظ فعلاً في جدول contact_messages
window.handlePublicContact = async function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
        const { error } = await window.supabaseClient.from('contact_messages').insert([{
            name: $('contactName').value.trim(),
            email: $('contactEmail').value.trim(),
            message: $('contactMsg').value.trim(),
        }]);
        if (error) throw error;
        $('contactSuccess').style.display = 'block';
        e.target.reset();
        setTimeout(() => { $('contactSuccess').style.display = 'none'; }, 4000);
    } catch (err) {
        alert('فشل إرسال الرسالة: ' + (err.message || 'خطأ غير معروف') + ' — حاول مرة أخرى.');
    } finally {
        if (btn) btn.disabled = false;
    }
};
