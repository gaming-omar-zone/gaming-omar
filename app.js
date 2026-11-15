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

// v2 (GitHub merge): escape DB/user text before innerHTML (XSS fix)
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="600" height="360" fill="#131518"/><text x="300" y="190" font-size="64" text-anchor="middle">🎮</text></svg>');

document.addEventListener('DOMContentLoaded', async () => {
    const yearSpan = document.getElementById('yearSpan');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
    setupMobileNav();
    updateFavoritesBadge();
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    if (!window.supabaseClient) {
        showLoadError('تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت وأعد المحاولة.');
        return;
    }
    const sortSel = document.getElementById('sortSelect');
    if (sortSel) sortSel.addEventListener('change', () => {
        selectedSort = sortSel.value;
        renderModsGrid(applyCurrentFilters());
    });
    await loadSettings();
    await loadCategories();
    await loadMods();
    await loadTrending();
    await loadGameRequests();
    setupSearch();
    setupInteractiveStars();
});

window.switchView = function(viewName) {
    const viewHome = document.getElementById('viewHome');
    const viewAbout = document.getElementById('viewAbout');
    const viewContact = document.getElementById('viewContact');
    const viewRequests = document.getElementById('viewRequests');

    if (viewHome) viewHome.style.display = (viewName === 'home' || viewName === 'mods') ? 'block' : 'none';
    if (viewAbout) viewAbout.style.display = viewName === 'about' ? 'block' : 'none';
    if (viewContact) viewContact.style.display = viewName === 'contact' ? 'block' : 'none';
    if (viewRequests) {
        viewRequests.style.display = viewName === 'requests' ? 'block' : 'none';
        if (viewName === 'requests') loadGameRequests();
    }

    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[onclick="switchView('${viewName}')"]`);
    if (targetLink) targetLink.classList.add('active');

    if (viewName === 'mods') {
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
    switchView('mods');
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
    try {
        return JSON.parse(localStorage.getItem('gaming_omar_favs') || '[]');
    } catch (e) {
        return [];
    }
}

function isFavorite(modId) {
    return getFavorites().includes(modId);
}

window.toggleFavorite = function(e, modId) {
    if (e) e.stopPropagation();
    let favs = getFavorites();
    if (favs.includes(modId)) {
        favs = favs.filter(id => id !== modId);
    } else {
        favs.push(modId);
    }
    localStorage.setItem('gaming_omar_favs', JSON.stringify(favs));
    updateFavoritesBadge();
    renderModsGrid(applyCurrentFilters());
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
                a.onclick = () => filterByCategory(cat.id);
                li.appendChild(a);
                footerCats.appendChild(li);
            }
        });

        const allBtn = document.querySelector('.filter-btn[data-category="all"]');
        if (allBtn) {
            allBtn.onclick = function() {
                filterByCategory('all', this);
            };
        }
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
        const { data: mods, error } = await window.supabaseClient
            .from('mods')
            .select('*, categories(name)')
            .eq('is_published', true)
            .order('created_at', { ascending: false });

        if (loading) loading.style.display = 'none';
        if (error) throw error;

        allMods = mods || [];
        renderModsGrid(applyCurrentFilters());
    } catch (err) {
        if (loading) loading.style.display = 'none';
        console.error("Error loading mods:", err);
        showLoadError('تعذر جلب الألعاب: ' + (err.message || 'خطأ غير معروف'));
    }
}
window.reloadMods = loadMods;

// الرائج: أعلى 6 ألعاب/مودات حسب عدد التحميلات.
// القسم يبقى مخفياً إلا كان هناك عناصر (قاعدة خاوية أو خطأ).
async function loadTrending() {
    const section = document.getElementById('trendingSection');
    const grid = document.getElementById('trendingGrid');
    if (!section || !grid) return;
    try {
        const { data: top, error } = await window.supabaseClient
            .from('mods')
            .select('id, title, image_url, download_count, rating_avg, rating_count, categories(name)')
            .eq('is_published', true)
            .order('download_count', { ascending: false })
            .limit(6);
        if (error || !top || top.length === 0) return;
        grid.innerHTML = '';
        top.forEach((mod, i) => {
            const card = document.createElement('article');
            card.className = 'trending-card';
            card.innerHTML = `
                <div class="trending-img-wrap">
                    <img src="${esc(mod.image_url || PLACEHOLDER_IMG)}" alt="${esc(mod.title)}" class="trending-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${PLACEHOLDER_IMG}'">
                    <span class="trending-rank">#${i + 1}</span>
                </div>
                <div class="trending-info">
                    <h3 class="trending-title">${esc(mod.title)}</h3>
                    <div class="trending-meta">
                        <span><i class="fa-solid fa-star" style="color:var(--star-gold);"></i> ${Number(mod.rating_avg ?? 5).toFixed(1)} (${mod.rating_count ?? 0})</span>
                        <span><i class="fa-solid fa-download highlight"></i> ${mod.download_count ?? 0} تنزيل</span>
                    </div>
                    <button class="btn btn-primary btn-block btn-sm" onclick="openDetails('${esc(mod.id)}')">
                        <i class="fa-solid fa-cloud-arrow-down"></i> تحميل
                    </button>
                </div>
            `;
            grid.appendChild(card);
        });
        section.style.display = 'block';
    } catch (e) {
        console.error('Error loading trending:', e);
    }
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
        const { data, error } = await window.supabaseClient
            .from('game_requests')
            .select('*')
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
                        طلبها ${esc(r.name)} • ${esc(r.game_type)} • ${new Date(r.created_at).toLocaleDateString('ar-EG')}
                    </div>
                    ${r.details ? `<div style="color:var(--text-gray); font-size:0.9rem; margin-top:4px;">${esc(r.details)}</div>` : ''}
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
    if (name.length < 2 || gameTitle.length < 2) return;
    const { error } = await window.supabaseClient.from('game_requests').insert([{
        name, game_title: gameTitle, game_type: gameType, details: details || null
    }]);
    if (error) { alert('تعذر إرسال الطلب: ' + error.message); return; }
    e.target.reset();
    const ok = document.getElementById('reqSuccess');
    if (ok) { ok.style.display = 'block'; setTimeout(() => { ok.style.display = 'none'; }, 5000); }
    loadGameRequests();
};

function applyCurrentFilters() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const favs = getFavorites();

    const filtered = allMods.filter(mod => {
        const matchCat = selectedCategory === 'all' || mod.category_id === selectedCategory;
        const hay = ((mod.title || '') + ' ' + (mod.short_desc || '') + ' ' + (mod.description || '')).toLowerCase();
        const matchSearch = !q || hay.includes(q);
        const matchFav = !showingFavorites || favs.includes(mod.id);
        return matchCat && matchSearch && matchFav;
    });
    if (selectedSort === 'downloads') filtered.sort((a, b) => (b.download_count || 0) - (a.download_count || 0));
    else if (selectedSort === 'rating') filtered.sort((a, b) => (Number(b.rating_avg) || 0) - (Number(a.rating_avg) || 0));
    return filtered;
}

// v3.6 — ترقيم (pagination): نرسم 24 بطاقة فقط في البداية،
// والباقي كيبان بزر "عرض المزيد" — هادي أكبر خطوة للسلاسة مع 221 لعبة.
const PAGE_SIZE = 24;
let visibleCount = PAGE_SIZE;
let lastFilteredMods = null;
let lastFilteredFingerprint = '';

window.loadMoreMods = function() {
    visibleCount += PAGE_SIZE;
    renderModsGrid(lastFilteredMods);
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

    visible.forEach(mod => {
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
                <button class="fav-card-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${esc(mod.id)}')" title="حفظ في المفضلة">
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
        grid.appendChild(card);
    });

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

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    let videoId = null;

    if (cleanUrl.includes('youtu.be/')) {
        videoId = cleanUrl.split('youtu.be/')[1].split('?')[0].split('&')[0];
    } else if (cleanUrl.includes('youtube.com/shorts/')) {
        videoId = cleanUrl.split('youtube.com/shorts/')[1].split('?')[0].split('&')[0];
    } else if (cleanUrl.includes('watch?v=')) {
        videoId = cleanUrl.split('watch?v=')[1].split('&')[0];
    } else if (cleanUrl.includes('embed/')) {
        videoId = cleanUrl.split('embed/')[1].split('?')[0];
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=0` : null;
}

// 3. فتح تفاصيل اللعبة وتشغيل عداد الـ 7 ثوانٍ
window.openDetails = async function(modId) {
    const mod = allMods.find(m => m.id === modId);
    if (!mod) return;
    activeMod = mod;

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

    // المعاينة
    const mediaBox = document.getElementById('modalMediaContainer');
    const embedUrl = getYouTubeEmbedUrl(mod.youtube_url);
    if (embedUrl) {
        mediaBox.innerHTML = `
            <div class="video-responsive">
                <iframe src="${embedUrl}" allowfullscreen></iframe>
            </div>
        `;
    } else {
        const img = document.createElement('img');
        img.src = mod.image_url || PLACEHOLDER_IMG;
        img.alt = mod.title || '';
        img.className = 'modal-img';
        img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER_IMG; };
        mediaBox.innerHTML = '';
        mediaBox.appendChild(img);
    }

    // Reset stars to the rating already given from this browser, if any
    const rated = JSON.parse(localStorage.getItem('gaming_omar_rated') || '{}');
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

    // تجهيز رابط التحميل المباشر
    const primaryUrl = mod.download_type === 'storage' ? mod.file_url : mod.external_url;
    const directBtn = document.getElementById('modalDirectDownloadBtn');
    if (directBtn) {
        directBtn.href = primaryUrl || '#';
    }

    // تجهيز السيرفرات البديلة
    const mirrorsBox = document.getElementById('mirrorsGroup');
    const driveBtn = document.getElementById('driveDownloadLink');
    const megaBtn = document.getElementById('megaDownloadLink');
    let hasMirrors = false;

    if (mod.link_drive && mod.link_drive.trim().length > 5) {
        driveBtn.href = mod.link_drive.trim();
        driveBtn.style.display = 'flex';
        hasMirrors = true;
    } else {
        driveBtn.style.display = 'none';
    }

    if (mod.link_mega && mod.link_mega.trim().length > 5) {
        megaBtn.href = mod.link_mega.trim();
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
        }
    }, 1000);

    await loadComments(mod.id);

    const modal = document.getElementById('modModal');
    if (modal) modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
    if (countdownTimer) clearInterval(countdownTimer);
    const modal = document.getElementById('modModal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
    const mediaBox = document.getElementById('modalMediaContainer');
    if (mediaBox) mediaBox.innerHTML = '';
};

window.handleBackdropClick = function(e) {
    if (e.target.id === 'modModal') closeModal();
};

// 4. نقرة التحميل
window.handleDownloadClick = async function(e) {
    if (!activeMod) return;
    const primaryUrl = activeMod.download_type === 'storage' ? activeMod.file_url : activeMod.external_url;
    
    if (!primaryUrl || primaryUrl === '#') {
        if (e) e.preventDefault();
        alert("عذراً، لم يقم الأدمن بإضافة رابط تحميل لهذا الملف بعد!");
        return;
    }

    try {
        await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id });
        activeMod.download_count = (activeMod.download_count || 0) + 1;
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
                alert("تم تسجيل بلاغك مسبقاً، شكراً لتعاونك!");
            } else {
                alert("شكراً لك! تم إرسال البلاغ إلى الأدمن ليتم تجديد الرابط فوراً.");
            }
        } catch (err) {
            alert("تم إرسال البلاغ بنجاح!");
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
            stars.forEach((s, idx) => {
                if (idx < val) s.classList.add('active');
                else s.classList.remove('active');
            });

            if (!activeMod) return;
            const rated = JSON.parse(localStorage.getItem('gaming_omar_rated') || '{}');
            if (rated[activeMod.id]) {
                alert('قيّمت هذه اللعبة من قبل (' + rated[activeMod.id] + ' نجوم). شكراً لك!');
                return;
            }
            paintStars(val);
            try {
                const { error } = await window.supabaseClient.rpc('add_mod_rating', {
                    target_mod_id: activeMod.id,
                    user_stars: val
                });
                if (error) throw error;
                rated[activeMod.id] = val;
                localStorage.setItem('gaming_omar_rated', JSON.stringify(rated));
                const { data } = await window.supabaseClient.from('mods')
                    .select('rating_avg, rating_count').eq('id', activeMod.id).single();
                if (data) {
                    activeMod.rating_avg = data.rating_avg;
                    activeMod.rating_count = data.rating_count;
                    document.getElementById('modalRatingScore').textContent = Number(data.rating_avg).toFixed(1);
                    document.getElementById('modalRatingVotes').textContent = data.rating_count;
                    renderModsGrid(applyCurrentFilters());
                }
                alert(`شكراً لك! تم تسجيل تقييمك (${val} نجوم) بنجاح.`);
            } catch (e) {
                console.error("Rating error:", e);
                alert('فشل تسجيل التقييم: ' + (e.message || 'خطأ غير معروف'));
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

    if (author_name.length < 2 || content.length < 2) {
        alert('اكتب اسمك وتعليقك أولاً.');
        return;
    }

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
    }
};

// v2: v1 was fake (showed "success" but saved nothing).
// Now saves to contact_messages; admin reads it in "رسائل الزوار".
window.handlePublicContact = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
        const { error } = await window.supabaseClient.from('contact_messages').insert([{
            name: document.getElementById('contactName').value.trim(),
            email: document.getElementById('contactEmail').value.trim(),
            message: document.getElementById('contactMsg').value.trim(),
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
