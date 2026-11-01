// ========================================================
// Gaming Omar - Admin Logic
// ========================================================

let categoriesList = [];

document.addEventListener('DOMContentLoaded', async () => {
    await initAuthCheck();
});

async function initAuthCheck() {
    const user = await getCurrentUser();
    if (!user) {
        showLoginView();
        return;
    }

    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
        alert("غير مصرح لك بالدخول! هذا الحساب ليس أدمن.");
        await window.supabaseClient.auth.signOut();
        showLoginView();
        return;
    }

    showDashboardView(user);
}

function showLoginView() {
    document.getElementById('loginView').style.display = 'flex';
    document.getElementById('dashboardView').style.display = 'none';
}

function showDashboardView(user) {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('userEmailTag').innerHTML = `<i class="fa-solid fa-user-shield"></i> ${user.email}`;

    loadAdminCategories();
    loadAdminMods();
    loadAdminSettings();
}

window.handleAdminLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const btn = document.getElementById('loginBtn');
    const errBox = document.getElementById('loginError');

    errBox.style.display = 'none';
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        errBox.textContent = "بيانات الدخول غير صحيحة: " + error.message;
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول';
        return;
    }

    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
        errBox.textContent = "تم تسجيل الدخول لكن هذا الحساب لا يملك صلاحية (Admin)!";
        errBox.style.display = 'block';
        await window.supabaseClient.auth.signOut();
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول';
        return;
    }

    initAuthCheck();
};

window.handleLogout = async function() {
    await window.supabaseClient.auth.signOut();
    location.reload();
};

window.switchAdminTab = function(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.add('active');
};

async function loadAdminCategories() {
    const { data: categories } = await window.supabaseClient.from('categories').select('*').order('created_at', { ascending: true });
    categoriesList = categories || [];

    document.getElementById('statTotalCats').textContent = categoriesList.length;

    const tbody = document.getElementById('categoriesTableBody');
    tbody.innerHTML = '';
    categoriesList.forEach(c => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td><code>${c.slug}</code></td>
                <td><i class="fa-solid ${c.icon}"></i></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="deleteCategory('${c.id}')"><i class="fa-solid fa-trash highlight"></i></button>
                </td>
            </tr>
        `;
    });

    const select = document.getElementById('formModCategory');
    select.innerHTML = '';
    categoriesList.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });
}

window.promptAddCategory = async function() {
    const name = prompt("أدخل اسم القسم الجديد (مثال: مودات سيارات كلاسيكية):");
    if (!name) return;
    const slug = prompt("أدخل المعرف اللاتيني (Slug) بدون مسافات (مثال: classic-cars):");
    if (!slug) return;
    const icon = prompt("أيقونة FontAwesome (مثال: fa-car):", "fa-folder");

    const { error } = await window.supabaseClient.from('categories').insert([{ name, slug, icon }]);
    if (error) {
        alert("فشل إضافة القسم: " + error.message);
    } else {
        loadAdminCategories();
    }
};

window.deleteCategory = async function(id) {
    if (!confirm("هل أنت متأكد من حذف هذا القسم؟")) return;
    const { error } = await window.supabaseClient.from('categories').delete().eq('id', id);
    if (error) alert(error.message);
    else loadAdminCategories();
};

async function loadAdminMods() {
    const { data: mods, error } = await window.supabaseClient
        .from('mods')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

    if (error) return;

    document.getElementById('statTotalMods').textContent = mods.length;
    const totalDownloads = mods.reduce((sum, m) => sum + (m.download_count || 0), 0);
    document.getElementById('statTotalDownloads').textContent = totalDownloads;

    const tbody = document.getElementById('modsTableBody');
    tbody.innerHTML = '';

    mods.forEach(m => {
        tbody.innerHTML += `
            <tr>
                <td><img src="${m.image_url}" class="table-thumb"></td>
                <td><strong>${m.title}</strong></td>
                <td>${m.categories ? m.categories.name : '-'}</td>
                <td>${m.file_size}</td>
                <td>${m.download_count}</td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="editMod('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-secondary btn-sm" onclick="deleteMod('${m.id}')"><i class="fa-solid fa-trash highlight"></i></button>
                </td>
            </tr>
        `;
    });
}

window.toggleDownloadFields = function() {
    const type = document.getElementById('formDownloadType').value;
    document.getElementById('externalLinkGroup').style.display = type === 'external' ? 'block' : 'none';
    document.getElementById('storageUploadGroup').style.display = type === 'storage' ? 'block' : 'none';
};

window.openModFormModal = function() {
    document.getElementById('modForm').reset();
    document.getElementById('editModId').value = '';
    document.getElementById('modFormTitle').textContent = 'إضافة مود جديد';
    toggleDownloadFields();
    document.getElementById('modFormModal').classList.add('show');
};

window.closeModFormModal = function() {
    document.getElementById('modFormModal').classList.remove('show');
};

async function uploadToStorage(file, bucket) {
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    
    const { data, error } = await window.supabaseClient.storage.from(bucket).upload(fileName, file);
    if (error) throw error;
    
    const { data: { publicUrl } } = window.supabaseClient.storage.from(bucket).getPublicUrl(fileName);
    return publicUrl;
}

window.handleSaveMod = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveModBtn');
    const progress = document.getElementById('uploadProgress');
    
    btn.disabled = true;
    progress.style.display = 'block';

    try {
        const id = document.getElementById('editModId').value;
        const title = document.getElementById('formModTitle').value.trim();
        const category_id = document.getElementById('formModCategory').value;
        const short_desc = document.getElementById('formModShortDesc').value.trim();
        const description = document.getElementById('formModFullDesc').value.trim();
        const file_size = document.getElementById('formModSize').value.trim();
        const game_version = document.getElementById('formModVersion').value.trim();
        const download_type = document.getElementById('formDownloadType').value;

        let image_url = document.getElementById('formModImgUrl').value.trim();
        const imgFile = document.getElementById('formModImgFile').files[0];
        if (imgFile) {
            image_url = await uploadToStorage(imgFile, 'mod-images');
        }

        if (!image_url) throw new Error("يجب وضع رابط صورة أو اختيار صورة لرفعها.");

        let file_url = null;
        let external_url = null;

        if (download_type === 'storage') {
            const modBinary = document.getElementById('formModBinaryFile').files[0];
            if (modBinary) {
                file_url = await uploadToStorage(modBinary, 'mod-files');
            } else if (!id) {
                throw new Error("يجب اختيار ملف الـ ZIP أو APK لرفعه.");
            }
        } else {
            external_url = document.getElementById('formExternalUrl').value.trim();
            if (!external_url) throw new Error("يرجى إدخال رابط التحميل المباشر.");
        }

        const payload = {
            title, category_id, short_desc, description,
            image_url, download_type, file_size, game_version
        };
        if (file_url) payload.file_url = file_url;
        if (external_url) payload.external_url = external_url;

        let res;
        if (id) {
            res = await window.supabaseClient.from('mods').update(payload).eq('id', id);
        } else {
            res = await window.supabaseClient.from('mods').insert([payload]);
        }

        if (res.error) throw res.error;

        closeModFormModal();
        loadAdminMods();
        alert("تم حفظ ونشر المود بنجاح!");
    } catch (err) {
        alert("خطأ أثناء الحفظ: " + err.message);
    } finally {
        btn.disabled = false;
        progress.style.display = 'none';
    }
};

window.deleteMod = async function(id) {
    if (!confirm("هل أنت متأكد من حذف هذا المود نهائياً؟")) return;
    const { error } = await window.supabaseClient.from('mods').delete().eq('id', id);
    if (error) alert(error.message);
    else loadAdminMods();
};

window.editMod = async function(id) {
    const { data: mod } = await window.supabaseClient.from('mods').select('*').eq('id', id).single();
    if (!mod) return;

    document.getElementById('editModId').value = mod.id;
    document.getElementById('formModTitle').value = mod.title;
    document.getElementById('formModCategory').value = mod.category_id;
    document.getElementById('formModShortDesc').value = mod.short_desc;
    document.getElementById('formModFullDesc').value = mod.description;
    document.getElementById('formModSize').value = mod.file_size;
    document.getElementById('formModVersion').value = mod.game_version;
    document.getElementById('formModImgUrl').value = mod.image_url;
    document.getElementById('formDownloadType').value = mod.download_type;

    if (mod.download_type === 'external') {
        document.getElementById('formExternalUrl').value = mod.external_url || '';
    }
    toggleDownloadFields();
    document.getElementById('modFormTitle').textContent = 'تعديل المود';
    document.getElementById('modFormModal').classList.add('show');
};

async function loadAdminSettings() {
    const { data } = await window.supabaseClient.from('site_settings').select('*');
    if (!data) return;
    const hero = data.find(i => i.key === 'hero')?.value;
    if (hero) {
        document.getElementById('settingBadge').value = hero.badge || '';
        document.getElementById('settingTitle').value = hero.title || '';
        document.getElementById('settingSubtitle').value = hero.subtitle || '';
    }
}

window.handleSaveSettings = async function(e) {
    e.preventDefault();
    const hero = {
        badge: document.getElementById('settingBadge').value.trim(),
        title: document.getElementById('settingTitle').value.trim(),
        subtitle: document.getElementById('settingSubtitle').value.trim()
    };

    const { error } = await window.supabaseClient.from('site_settings').upsert({ key: 'hero', value: hero });
    if (error) alert("فشل الحفظ: " + error.message);
    else alert("تم تحديث نصوص واجهة الموقع بنجاح!");
};