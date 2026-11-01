// ========================================================
// Gaming Omar - Public Site Logic
// ========================================================

let allMods = [];
let allCategories = [];
let selectedCategory = 'all';
let activeMod = null;

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('yearSpan').textContent = new Date().getFullYear();
    setupMobileNav();
    await loadSettings();
    await loadCategories();
    await loadMods();
    setupSearch();
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
        console.error("Settings load error:", e);
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
    renderModsGrid(allMods);
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
        const catName = mod.categories ? mod.categories.name : 'عام';
        const card = document.createElement('div');
        card.className = 'mod-card';
        card.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${mod.image_url}" alt="${mod.title}" class="card-img" loading="lazy">
                <span class="card-badge">${catName}</span>
            </div>
            <div class="card-content">
                <h3 class="card-title">${mod.title}</h3>
                <p class="card-desc">${mod.short_desc}</p>
                <div class="card-meta">
                    <span><i class="fa-solid fa-file-zipper highlight"></i> ${mod.file_size}</span>
                    <span><i class="fa-solid fa-download highlight"></i> ${mod.download_count} تنزيل</span>
                </div>
                <button class="btn btn-primary btn-block" onclick="openDetails('${mod.id}')">
                    <i class="fa-solid fa-eye"></i> تفاصيل المود والتحميل
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.filterByCategory = function(catId, btnElement) {
    selectedCategory = catId;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    applyFilters();
};

function setupSearch() {
    const input = document.getElementById('searchInput');
    input.addEventListener('input', () => {
        applyFilters();
    });
}

function applyFilters() {
    const q = document.getElementById('searchInput').value.trim().toLowerCase();
    const filtered = allMods.filter(mod => {
        const matchCat = selectedCategory === 'all' || mod.category_id === selectedCategory;
        const matchSearch = mod.title.toLowerCase().includes(q) || mod.short_desc.toLowerCase().includes(q);
        return matchCat && matchSearch;
    });
    renderModsGrid(filtered);
}

window.openDetails = function(modId) {
    const mod = allMods.find(m => m.id === modId);
    if (!mod) return;
    activeMod = mod;

    document.getElementById('modalTitle').textContent = mod.title;
    document.getElementById('modalBadge').textContent = mod.categories ? mod.categories.name : 'مود أندرويد';
    document.getElementById('modalImg').src = mod.image_url;
    document.getElementById('modalSize').textContent = mod.file_size;
    document.getElementById('modalVersion').textContent = mod.game_version;
    document.getElementById('modalDownloads').textContent = mod.download_count;
    document.getElementById('modalDesc').textContent = mod.description;

    document.getElementById('modModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModal = function() {
    document.getElementById('modModal').classList.remove('show');
    document.body.style.overflow = '';
};

window.handleBackdropClick = function(e) {
    if (e.target.id === 'modModal') closeModal();
};

window.triggerDownload = async function() {
    if (!activeMod) return;

    try {
        await window.supabaseClient.rpc('increment_mod_download', { target_mod_id: activeMod.id });
        activeMod.download_count += 1;
        document.getElementById('modalDownloads').textContent = activeMod.download_count;
    } catch (e) {
        console.error("Count increment failed", e);
    }

    const targetUrl = activeMod.download_type === 'storage' ? activeMod.file_url : activeMod.external_url;
    window.open(targetUrl, '_blank');
};

window.handlePublicContact = function(e) {
    e.preventDefault();
    document.getElementById('contactSuccess').style.display = 'block';
    e.target.reset();
    setTimeout(() => {
        document.getElementById('contactSuccess').style.display = 'none';
    }, 4000);
};