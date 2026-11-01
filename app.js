// ========================================================
// Gaming Omar - Public Site Logic (ربط جميع الأزرار والتحميل المباشر)
// ========================================================

let allMods = [];
let allCategories = [];
let selectedCategory = 'all';
let activeMod = null;
let showingFavorites = false;

document.addEventListener('DOMContentLoaded', async () => {
    const yearSpan = document.getElementById('yearSpan');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();
    setupMobileNav();
    updateFavoritesBadge();
    await loadSettings();
    await loadCategories();
    await loadMods();
    setupSearch();
    setupInteractiveStars();
});

window.switchView = function(viewName) {
    const viewHome = document.getElementById('viewHome');
    const viewAbout = document.getElementById('viewAbout');
    const viewContact = document.getElementById('viewContact');

    if (viewHome) viewHome.style.display = (viewName === 'home' || viewName === 'mods') ? 'block' : 'none';
    if (viewAbout) viewAbout.style.display = viewName === 'about' ? 'block' : 'none';
    if (viewContact) viewContact.style.display = viewName === 'contact' ? 'block' : 'none';

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

function setupMobileNav() {
    const toggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (toggle && navLinks) {
        toggle.addEventListener('click', () => {
            navLinks.classList.toggle('show');
        });
    }
}

// 1. نظام المفضلة (Favorites)
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
        if (categoriesBar) categoriesBar.appendChild(btn);

        if (footerCats) {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#mods" onclick="filterByCategory('${cat.id}')">${cat.name}</a>`;
            footerCats.appendChild(li);
        }
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
    if (loading) loading.style.display = 'block';

    const { data: mods, error } = await window.supabaseClient
        .from('mods')
        .select('*, categories(name)')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    if (loading) loading.style.display = 'none';

    if (error) {
        console.error("Mods error:", error);
        return;
    }

    allMods = mods || [];
    renderModsGrid(applyCurrentFilters());
}

function applyCurrentFilters() {
    const searchInput = document.getElementById('searchInput');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const favs = getFavorites();

    return allMods.filter(mod => {
        const matchCat = selectedCategory === 'all' || mod.category_id === selectedCategory;
        const matchSearch = (mod.title && mod.title.toLowerCase().includes(q)) || 
                            (mod.short_desc && mod.short_desc.toLowerCase().includes(q));
        const matchFav = !showingFavorites || favs.includes(mod.id);
        return matchCat && matchSearch && matchFav;
    });
}

function renderModsGrid(mods) {
    const grid = document.getElementById('modsGrid');
    const noResults = document.getElementById('noResults');
    if (!grid) return;
    grid.innerHTML = '';

    if (!mods || mods.length === 0) {
        if (noResults) noResults.style.display = 'block';
        return;
    }
    if (noResults) noResults.style.display = 'none';

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
    const favBtn = document.getElementById('favFilterBtn');
    if (favBtn) favBtn.classList.remove('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    renderModsGrid(applyCurrentFilters());
};

function setupSearch() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.addEventListener('input', () => {
            renderModsGrid(applyCurrentFilters());
        });
    }
}

function getYouTubeEmbedUrl(url) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
}

// 3. فتح تفاصيل اللعبة وتجهيز روابط التحميل
window.openDetails = async function(modId) {
    const mod = allMods.find(m => m.id === modId);
    if (!mod) return;
    activeMod = mod;

    document.getElementById('modalTitle').textContent = mod.title;
    document.getElementById('modalBadge').textContent = mod.categories ? mod.categories.name : 'لعبة أندرويد';
    
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

    // المعاينة (فيديو أو صورة)
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

    // المواصفات
    document.getElementById('modalRatingScore').textContent = mod.rating_avg || 5.0;
    document.getElementById('modalRatingVotes').textContent = mod.rating_count || 1;
    document.getElementById('modalSize').textContent = mod.file_size;
    document.getElementById('modalVersion').textContent = mod.game_version || 'Android 5.0+';
    document.getElementById('modalRam').textContent = mod.ram_req || '2 GB';
    document.getElementById('modalGpu').textContent = mod.gpu_compat || 'جميع المعالجات';
    document.getElementById('modalDownloads').textContent = mod.download_count;
    document.getElementById('modalDesc').textContent = mod.description;

    // تجهيز رابط التحميل الأساسي المباشر
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

    if (mod.link_drive) {
        driveBtn.href = mod.link_drive;
        driveBtn.style.display = 'flex';
        hasMirrors = true;
    } else {
        driveBtn.style.display = 'none';
    }

    if (mod.link_mega) {
        megaBtn.href = mod.link_mega;
        megaBtn.style.display = 'flex';
        hasMirrors = true;
    } else {
        megaBtn.style.display = 'none';
    }

    if (mirrorsBox) {
        mirrorsBox.style.display = hasMirrors ? 'flex' : 'none';
    }

    await loadComments(mod.id);

    const modal = document.getElementById('modModal');
    if (modal) modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
    const modal = document.getElementById('modModal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
    const mediaBox = document.getElementById('modalMediaContainer');
    if (mediaBox) mediaBox.innerHTML = '';
};

window.handleBackdropClick = function(e) {
    if (e.target.id === 'modModal') closeModal();
};

// 4. نقرة التحميل وزيادة العداد تلقائياً
window.handleDownloadClick = async function() {
    if (!activeMod) return;
    try {
        await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id });
        activeMod.download_count = (activeMod.download_count || 0) + 1;
        const dlSpan = document.getElementById('modalDownloads');
        if (dlSpan) dlSpan.textContent = activeMod.download_count;
    } catch (e) {
        console.error("Increment error:", e);
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

// 6. نظام تقييم النجوم
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

// 7. نظام التعليقات
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

    if (!content) return;

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

window.handlePublicContact = function(e) {
    e.preventDefault();
    const successBox = document.getElementById('contactSuccess');
    if (successBox) successBox.style.display = 'block';
    e.target.reset();
    setTimeout(() => {
        if (successBox) successBox.style.display = 'none';
    }, 4000);
};
