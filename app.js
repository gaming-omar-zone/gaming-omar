// ========================================================
// Gaming Omar - Public Site Logic (جميع الميزات التفاعلية)
// ========================================================

let allMods = [];
let allCategories = [];
let selectedCategory = 'all';
let activeMod = null;
let showingFavorites = false;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('yearSpan').textContent = new Date().getFullYear();
    setupMobileNav();
    updateFavoritesBadge();
    await loadSettings();
    await loadCategories();
    await loadMods();
    setupSearch();
    setupInteractiveStars();
});

window.switchView = function(viewName) {
    document.getElementById('viewHome').style.display = (viewName === 'home' || viewName === 'mods') ? 'block' : 'none';
    document.getElementById('viewAbout').style.display = viewName === 'about' ? 'block' : 'none';
    document.getElementById('viewContact').style.display = viewName === 'contact' ? 'block' : 'none';

    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const targetLink = document.querySelector(`.nav-link[onclick="switchView('${viewName}')"]`);
    if (targetLink) targetLink.classList.add('active');

    if (viewName === 'mods') {
        document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    document.getElementById('navLinks').classList.remove('show');
};

function setupMobileNav() {
    document.getElementById('navToggle').addEventListener('click', () => {
        document.getElementById('navLinks').classList.toggle('show');
    });
}

// 1. نظام المفضلة (Favorites)
function getFavorites() {
    return JSON.parse(localStorage.getItem('gaming_omar_favs') || '[]');
}

function isFavorite(modId) {
    return getFavorites().includes(modId);
}

window.toggleFavorite = function(e, modId) {
    e.stopPropagation();
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
        favBtn.classList.add('active');
        document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    } else {
        favBtn.classList.remove('active');
        document.querySelector('.filter-btn[data-category="all"]').classList.add('active');
    }
    renderModsGrid(applyCurrentFilters());
};

window.showFavoritesOnly = function() {
    showingFavorites = true;
    document.getElementById('favFilterBtn').classList.add('active');
    document.querySelectorAll('.filter-btn:not(#favFilterBtn)').forEach(b => b.classList.remove('active'));
    renderModsGrid(applyCurrentFilters());
    document.getElementById('mods').scrollIntoView({ behavior: 'smooth' });
};

// 2. جلب البيانات والإعدادات
async function loadSettings() {
    try {
        const { data } = await window.supabaseClient.from('site_settings').select('*');
        if (data) {
            const heroData = data.find(item => item.key === 'hero')?.value;
            if (heroData) {
                if (heroData.title) document.getElementById('heroTitle').textContent = heroData.title;
                if (heroData.subtitle) document.getElementById('heroSubtitle').textContent = heroData.subtitle;
                if (heroData.badge) document.getElementById('heroBadge').innerHTML = `<i class="fa-brands fa-android"></i> ${heroData.badge}`;
            }
        }
    } catch (e) {
        console.error("Settings error:", e);
    }
}

async function loadCategories() {
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
        btn.innerHTML = `<i class="fa-solid ${cat.icon || 'fa-folder'}"></i> ${cat.name}`;
        btn.onclick = () => filterByCategory(cat.id, btn);
        categoriesBar.appendChild(btn);

        const li = document.createElement('li');
        li.innerHTML = `<a href="#mods" onclick="filterByCategory('${cat.id}')">${cat.name}</a>`;
        footerCats.appendChild(li);
    });

    const allBtn = document.querySelector('.filter-btn[data-category="all"]');
    if (allBtn) {
        allBtn.onclick = function() {
            filterByCategory('all', this);
        };
    }
}

async function loadMods() {
    const loading = document.getElementById('loadingIndicator');
    loading.style.display = 'block';

    const { data: mods, error } = await window.supabaseClient
        .from('mods')
        .select('*, categories(name)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    loading.style.display = 'none';

    if (error) {
        console.error("Mods error:", error);
        return;
    }

    allMods = mods || [];
    renderModsGrid(applyCurrentFilters());
}

function applyCurrentFilters() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const favs = getFavorites();

    return allMods.filter(mod => {
        const matchCat = selectedCategory === 'all' || mod.category_id === selectedCategory;
        const matchSearch = mod.title.toLowerCase().includes(q) || mod.short_desc.toLowerCase().includes(q);
        const matchFav = !showingFavorites || favs.includes(mod.id);
        return matchCat && matchSearch && matchFav;
    });
}

function renderModsGrid(mods) {
    const grid = document.getElementById('modsGrid');
    const noResults = document.getElementById('noResults');
    grid.innerHTML = '';

    if (mods.length === 0) {
        noResults.style.display = 'block';
        return;
    }
    noResults.style.display = 'none';

    mods.forEach(mod => {
        const catName = mod.categories ? mod.categories.name : 'ألعاب أندرويد';
        const isFav = isFavorite(mod.id);
        const modeTag = mod.is_online 
            ? '<span class="tag-badge tag-online">أونلاين</span>' 
            : '<span class="tag-badge tag-offline">أوفلاين</span>';

        const card = document.createElement('div');
        card.className = 'mod-card';
        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${mod.image_url}" alt="${mod.title}" class="card-img" loading="lazy">
                <span class="card-badge">${catName}</span>
                <button class="fav-card-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite(event, '${mod.id}')" title="حفظ في المفضلة">
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>
            <div class="card-content">
                <div class="card-rating-row">
                    <i class="fa-solid fa-star"></i>
                    <span>${mod.rating_avg || 5.0}</span>
                    <span style="color:var(--text-gray); font-size:0.75rem;">(${mod.rating_count || 1})</span>
                    <span style="margin-right:auto;">${modeTag}</span>
                </div>
                <h3 class="card-title">${mod.title}</h3>
                <p class="card-desc">${mod.short_desc}</p>
                <div class="card-meta">
                    <span><i class="fa-solid fa-file-zipper highlight"></i> ${mod.file_size}</span>
                    <span><i class="fa-solid fa-download highlight"></i> ${mod.download_count} تنزيل</span>
                </div>
                <button class="btn btn-primary btn-block" onclick="openDetails('${mod.id}')">
                    <i class="fa-solid fa-eye"></i> التفاصيل والتحميل
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.filterByCategory = function(catId, btnElement) {
    selectedCategory = catId;
    showingFavorites = false;
    document.getElementById('favFilterBtn').classList.remove('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderModsGrid(applyCurrentFilters());
};

function setupSearch() {
    const input = document.getElementById('searchInput');
    input.addEventListener('input', () => {
        renderModsGrid(applyCurrentFilters());
    });
}

// 3. تحويل رابط يوتيوب العادي إلى رابط Embed
function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

// 4. فتح تفاصيل اللعبة / المود
window.openDetails = async function(modId) {
    const mod = allMods.find(m => m.id === modId);
    if (!mod) return;
    activeMod = mod;

    document.getElementById('modalTitle').textContent = mod.title;
    document.getElementById('modalBadge').textContent = mod.categories ? mod.categories.name : 'لعبة أندرويد';
    
    // وضع اللعب
    const modeTag = document.getElementById('modalModeTag');
    if (mod.is_online) {
        modeTag.textContent = 'أونلاين 🌐';
        modeTag.className = 'tag-badge tag-online';
        document.getElementById('modalModeVal').textContent = 'أونلاين بالنت';
    } else {
        modeTag.textContent = 'أوفلاين 📴';
        modeTag.className = 'tag-badge tag-offline';
        document.getElementById('modalModeVal').textContent = 'بدون نت';
    }

    // المعاينة: فيديو يوتيوب أو صورة
    const mediaBox = document.getElementById('modalMediaContainer');
    const embedUrl = getYouTubeEmbedUrl(mod.youtube_url);
    if (embedUrl) {
        mediaBox.innerHTML = `
            <div class="video-responsive">
                <iframe src="${embedUrl}" allowfullscreen></iframe>
            </div>
        `;
    } else {
        mediaBox.innerHTML = `<img src="${mod.image_url}" alt="${mod.title}" class="modal-img">`;
    }

    // التقييم والمواصفات
    document.getElementById('modalRatingScore').textContent = mod.rating_avg || 5.0;
    document.getElementById('modalRatingVotes').textContent = mod.rating_count || 1;
    document.getElementById('modalSize').textContent = mod.file_size;
    document.getElementById('modalVersion').textContent = mod.game_version || 'Android 5.0+';
    document.getElementById('modalRam').textContent = mod.ram_req || '2 GB';
    document.getElementById('modalGpu').textContent = mod.gpu_compat || 'جميع المعالجات';
    document.getElementById('modalDownloads').textContent = mod.download_count;
    document.getElementById('modalDesc').textContent = mod.description;

    // تهيئة أزرار التحميل وإعادة ضبط العداد
    document.getElementById('timerContainer').style.display = 'none';
    document.getElementById('mirrorsGroup').style.display = 'none';
    document.getElementById('modalStartDownloadBtn').style.display = 'inline-flex';

    await loadComments(mod.id);

    document.getElementById('modModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
    document.getElementById('modModal').classList.remove('show');
    document.body.style.overflow = '';
    // إيقاف تشغيل الفيديو عند الإغلاق
    document.getElementById('modalMediaContainer').innerHTML = '';
};

window.handleBackdropClick = function(e) {
    if (e.target.id === 'modModal') closeModal();
};

// 5. العداد التنازلي والتحميل بروابط متعددة
window.startDownloadProcess = function() {
    const startBtn = document.getElementById('modalStartDownloadBtn');
    const timerBox = document.getElementById('timerContainer');
    const timerCount = document.getElementById('timerCount');
    const mirrorsGroup = document.getElementById('mirrorsGroup');

    startBtn.style.display = 'none';
    timerBox.style.display = 'block';

    let seconds = 7;
    timerCount.textContent = seconds;

    const countdown = setInterval(async () => {
        seconds--;
        timerCount.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(countdown);
            timerBox.style.display = 'none';
            mirrorsGroup.style.display = 'flex';

            // تجهيز الروابط
            const primaryUrl = activeMod.download_type === 'storage' ? activeMod.file_url : activeMod.external_url;
            document.getElementById('primaryDownloadLink').href = primaryUrl;

            const driveBtn = document.getElementById('driveDownloadLink');
            if (activeMod.link_drive) {
                driveBtn.href = activeMod.link_drive;
                driveBtn.style.display = 'flex';
            } else {
                driveBtn.style.display = 'none';
            }

            const megaBtn = document.getElementById('megaDownloadLink');
            if (activeMod.link_mega) {
                megaBtn.href = activeMod.link_mega;
                megaBtn.style.display = 'flex';
            } else {
                megaBtn.style.display = 'none';
            }

            // زيادة العداد
            try {
                await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id });
                activeMod.download_count += 1;
                document.getElementById('modalDownloads').textContent = activeMod.download_count;
            } catch (e) {
                console.error("Increment error", e);
            }
        }
    }, 1000);
};

// 6. الإبلاغ عن رابط معطل
window.reportCurrentMod = async function() {
    if (!activeMod) return;
    if (confirm("هل تريد الإبلاغ عن هذا الرابط لأنه لا يعمل؟")) {
        const { error } = await window.supabaseClient.from('broken_links').insert([
            { mod_id: activeMod.id, mod_title: activeMod.title }
        ]);
        if (error) {
            alert("حدث خطأ أثناء الإبلاغ!");
        } else {
            alert("شكراً لك! تم إرسال البلاغ وسيقوم الأدمن بتحديث الرابط فوراً.");
        }
    }
};

// 7. نظام تقييم النجوم
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
            try {
                await window.supabaseClient.rpc('add_mod_rating', { 
                    target_mod_id: activeMod.id, 
                    user_stars: val 
                });
                alert(`شكراً لك! تم تسجيل تقييمك (${val} نجوم) بنجاح.`);
            } catch (e) {
                console.error("Rating error:", e);
            }
        });
    });
}

// 8. نظام التعليقات
async function loadComments(modId) {
    const { data: comments } = await window.supabaseClient
        .from('comments')
        .select('*')
        .eq('mod_id', modId)
        .order('created_at', { ascending: false });

    const list = document.getElementById('commentsList');
    document.getElementById('commentsCount').textContent = comments ? comments.length : 0;
    list.innerHTML = '';

    if (!comments || comments.length === 0) {
        list.innerHTML = '<small style="color:var(--text-gray);">كن أول من يكتب تعليقاً حول هذه اللعبة!</small>';
        return;
    }

    comments.forEach(c => {
        const dateStr = new Date(c.created_at).toLocaleDateString('ar-EG');
        list.innerHTML += `
            <div class="comment-item">
                <div class="comment-header">
                    <strong>${c.author_name}</strong>
                    <span>${dateStr}</span>
                </div>
                <p style="font-size: 0.9rem;">${c.content}</p>
            </div>
        `;
    });
}

window.handlePostComment = async function(e) {
    e.preventDefault();
    if (!activeMod) return;

    const author_name = document.getElementById('commentAuthor').value.trim();
    const content = document.getElementById('commentText').value.trim();

    const { error } = await window.supabaseClient.from('comments').insert([
        { mod_id: activeMod.id, author_name, content }
    ]);

    if (error) {
        alert("فشل إضافة التعليق: " + error.message);
    } else {
        document.getElementById('commentText').value = '';
        await loadComments(activeMod.id);
    }
};

window.handlePublicContact = function(e) {
    e.preventDefault();
    document.getElementById('contactSuccess').style.display = 'block';
    e.target.reset();
    setTimeout(() => {
        document.getElementById('contactSuccess').style.display = 'none';
    }, 4000);
};
