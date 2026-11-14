// ========================================================
// Gaming Omar - Admin Panel Logic v2 (REWRITTEN)
// v1 bug: this file was an exact copy of app.js, so NONE of
// the admin functions existed (login, save, tabs, ...).
// This file is now the real admin logic.
// ========================================================

let adminCategories = [];
let adminMods = [];
let editingModId = null;

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function $(id) { return document.getElementById(id); }
function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }

document.addEventListener('DOMContentLoaded', async () => {
    // If Supabase failed to load, show a clear error instead of crashing
    if (!window.supabaseClient) {
        const err = $('loginError');
        if (err) { err.textContent = 'تعذر الاتصال بـ Supabase. تحقق من الإنترنت وأعد تحميل الصفحة.'; show(err); }
        return;
    }
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session) {
        const ok = await window.checkIsAdmin();
        if (ok) { await enterDashboard(session.user); return; }
        await window.supabaseClient.auth.signOut();
    }
    showLogin();
});

function showLogin() {
    hide($('dashboardView'));
    show($('loginView'));
}
async function enterDashboard(user) {
    hide($('loginView'));
    show($('dashboardView'));
    if (user?.email) $('userEmailTag').innerHTML = '<i class="fa-solid fa-user-shield"></i> ' + esc(user.email);
    await loadAdminData();
}

window.handleAdminLogin = async function (e) {
    e.preventDefault();
    const btn = $('loginBtn');
    const errBox = $('loginError');
    hide(errBox);
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التحقق...';
    try {
        const email = $('adminEmail').value.trim();
        const password = $('adminPassword').value;
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const ok = await window.checkIsAdmin();
        if (!ok) {
            await window.supabaseClient.auth.signOut();
            throw new Error('هذا الحساب ليس أدمن. أضف دوره admin في جدول profiles.');
        }
        await enterDashboard(data.user);
    } catch (err) {
        errBox.textContent = 'فشل تسجيل الدخول: ' + (err.message || 'خطأ غير معروف');
        show(errBox);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول';
    }
};

window.handleLogout = async function () {
    await window.supabaseClient.auth.signOut();
    location.reload();
};

window.switchAdminTab = function (tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[onclick="switchAdminTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');
    const tab = $(tabId);
    if (tab) tab.classList.add('active');
    if (tabId === 'reportsTab') loadAdminReports();
    if (tabId === 'messagesTab') loadContactMessages();
    if (tabId === 'categoriesTab') loadAdminCategories();
    if (tabId === 'settingsTab') loadSettingsForm();
};

async function loadAdminData() {
    await loadAdminCategories();
    await loadAdminMods();
    await loadAdminReports();
    await loadContactMessages();
    await loadSettingsForm();
    await loadStats();
}

async function loadStats() {
    try {
        const [{ count: modsCount }, { data: mods }, { count: reportsCount }, { count: catsCount }] = await Promise.all([
            window.supabaseClient.from('mods').select('*', { count: 'exact', head: true }),
            window.supabaseClient.from('mods').select('download_count'),
            window.supabaseClient.from('broken_links').select('*', { count: 'exact', head: true }).eq('resolved', false),
            window.supabaseClient.from('categories').select('*', { count: 'exact', head: true }),
        ]);
        $('statTotalMods').textContent = modsCount ?? adminMods.length;
        $('statTotalDownloads').textContent = (mods || []).reduce((s, m) => s + (m.download_count || 0), 0);
        $('statTotalReports').textContent = reportsCount ?? 0;
        $('statTotalCats').textContent = catsCount ?? adminCategories.length;
    } catch (e) { console.error('Stats error:', e); }
}

// ---------- Mods ----------
async function loadAdminMods() {
    const { data, error } = await window.supabaseClient
        .from('mods').select('*, categories(name)')
        .order('created_at', { ascending: false });
    if (error) { console.error('Mods error:', error); return; }
    adminMods = data || [];
    renderAdminMods(adminMods);
}

function renderAdminMods(mods) {
    const body = $('modsTableBody');
    if (!mods.length) {
        body.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-gray);padding:20px;">لا توجد ألعاب بعد — اضغط "إضافة لعبة أو مود جديد".</td></tr>';
        return;
    }
    body.innerHTML = '';
    mods.forEach(mod => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><img src="${esc(mod.image_url || '')}" class="table-thumb" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect width=%2248%22 height=%2248%22 fill=%22%23131518%22/><text x=%2224%22 y=%2228%22 font-size=%2220%22 text-anchor=%22middle%22>🎮</text></svg>'"></td>
            <td><strong>${esc(mod.title)}</strong><br><small style="color:var(--text-gray)">${mod.is_published ? '<span class="badge-published">منشور</span>' : '<span class="badge-draft">مسودة</span>'}</small></td>
            <td>${esc(mod.categories?.name || '—')}</td>
            <td>${esc(mod.file_size || '—')}</td>
            <td>⭐ ${Number(mod.rating_avg ?? 5).toFixed(1)} (${mod.rating_count ?? 0})</td>
            <td>${mod.download_count ?? 0}</td>
            <td style="white-space:nowrap">
                <button class="btn btn-secondary btn-sm" onclick="openModFormModal('${mod.id}')">تعديل</button>
                <button class="btn btn-secondary btn-sm" onclick="togglePublish('${mod.id}', ${!!mod.is_published})">${mod.is_published ? 'إخفاء' : 'نشر'}</button>
                <button class="btn btn-danger btn-sm" onclick="deleteMod('${mod.id}', '${esc(mod.title).replace(/'/g, "\\'")}')">حذف</button>
            </td>`;
        body.appendChild(tr);
    });
}

window.filterAdminMods = function () {
    const q = ($('adminModSearch')?.value || '').trim().toLowerCase();
    renderAdminMods(adminMods.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.short_desc || '').toLowerCase().includes(q)));
};

window.openModFormModal = async function (modId) {
    editingModId = modId || null;
    $('modFormTitle').textContent = editingModId ? 'تعديل لعبة / مود' : 'إضافة لعبة / مود جديد';
    $('editModId').value = editingModId || '';
    // Fill categories select
    const sel = $('formModCategory');
    sel.innerHTML = adminCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('modForm').reset();
    $('formModVersion').value = 'Android 5.0+';
    $('formRamReq').value = '2 GB';
    $('formGpuCompat').value = 'Mali / Adreno / PowerVR';
    toggleDownloadFields();
    if (editingModId) {
        const mod = adminMods.find(m => m.id === editingModId);
        if (mod) {
            $('formModTitle').value = mod.title || '';
            $('formModCategory').value = mod.category_id || '';
            $('formIsOnline').value = String(!!mod.is_online);
            $('formModShortDesc').value = mod.short_desc || '';
            $('formModFullDesc').value = mod.description || '';
            $('formModSize').value = mod.file_size || '';
            $('formModVersion').value = mod.game_version || 'Android 5.0+';
            $('formRamReq').value = mod.ram_req || '2 GB';
            $('formGpuCompat').value = mod.gpu_compat || 'Mali / Adreno / PowerVR';
            $('formYoutubeUrl').value = mod.youtube_url || '';
            $('formModImgUrl').value = mod.image_url || '';
            $('formDownloadType').value = mod.download_type || 'external';
            $('formExternalUrl').value = mod.external_url || '';
            $('formLinkDrive').value = mod.link_drive || '';
            $('formLinkMega').value = mod.link_mega || '';
            $('formIsPublished').checked = !!mod.is_published;
            toggleDownloadFields();
        }
    }
    $('modFormModal').classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeModFormModal = function () {
    $('modFormModal').classList.remove('show');
    document.body.style.overflow = '';
    editingModId = null;
};

window.toggleDownloadFields = function () {
    const type = $('formDownloadType').value;
    $('externalLinkGroup').style.display = type === 'external' ? '' : 'none';
    $('storageUploadGroup').style.display = type === 'storage' ? '' : 'none';
    $('formExternalUrl').required = type === 'external';
};

async function uploadToBucket(bucket, file) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await window.supabaseClient.storage.from(bucket).upload(path, file);
    if (error) throw error;
    const { data } = window.supabaseClient.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
}

window.handleSaveMod = async function (e) {
    e.preventDefault();
    const btn = $('saveModBtn');
    const prog = $('uploadProgress');
    btn.disabled = true; show(prog);
    try {
        let image_url = $('formModImgUrl').value.trim();
        const imgFile = $('formModImgFile').files[0];
        if (imgFile) image_url = await uploadToBucket('mod-images', imgFile);
        if (!image_url) throw new Error('ضع رابط صورة أو ارفع صورة للعبة.');

        const download_type = $('formDownloadType').value;
        let file_url = null, external_url = null;
        if (download_type === 'storage') {
            const binFile = $('formModBinaryFile').files[0];
            if (binFile) file_url = await uploadToBucket('mod-files', binFile);
            else if (editingModId) {
                const old = adminMods.find(m => m.id === editingModId);
                file_url = old?.file_url || null;
            }
            if (!file_url) throw new Error('اختر ملف اللعبة (APK / ZIP) للرفع.');
        } else {
            external_url = $('formExternalUrl').value.trim();
            if (!external_url) throw new Error('ضع الرابط الأساسي للتحميل.');
        }

        const payload = {
            title: $('formModTitle').value.trim(),
            category_id: $('formModCategory').value || null,
            is_online: $('formIsOnline').value === 'true',
            short_desc: $('formModShortDesc').value.trim(),
            description: $('formModFullDesc').value.trim(),
            file_size: $('formModSize').value.trim(),
            game_version: $('formModVersion').value.trim(),
            ram_req: $('formRamReq').value.trim(),
            gpu_compat: $('formGpuCompat').value.trim(),
            youtube_url: $('formYoutubeUrl').value.trim() || null,
            image_url,
            download_type,
            file_url,
            external_url,
            link_drive: $('formLinkDrive').value.trim() || null,
            link_mega: $('formLinkMega').value.trim() || null,
            is_published: $('formIsPublished')?.checked ?? true,
        };

        let error;
        if (editingModId) {
            ({ error } = await window.supabaseClient.from('mods').update(payload).eq('id', editingModId));
        } else {
            ({ error } = await window.supabaseClient.from('mods').insert([payload]));
        }
        if (error) throw error;
        closeModFormModal();
        await loadAdminMods();
        await loadStats();
        alert(editingModId ? 'تم التعديل بنجاح ✅' : 'تم النشر على الموقع ✅');
    } catch (err) {
        alert('فشل الحفظ: ' + (err.message || 'خطأ غير معروف'));
    } finally {
        btn.disabled = false; hide(prog);
    }
};

window.deleteMod = async function (id, title) {
    if (!confirm('حذف "' + title + '" نهائياً؟')) return;
    const { error } = await window.supabaseClient.from('mods').delete().eq('id', id);
    if (error) { alert('فشل الحذف: ' + error.message); return; }
    await loadAdminMods(); await loadStats();
};

window.togglePublish = async function (id, currentlyPublished) {
    const { error } = await window.supabaseClient.from('mods').update({ is_published: !currentlyPublished }).eq('id', id);
    if (error) { alert('فشل التغيير: ' + error.message); return; }
    await loadAdminMods();
};

// ---------- Reports ----------
async function loadAdminReports() {
    const { data, error } = await window.supabaseClient
        .from('broken_links').select('*').order('created_at', { ascending: false });
    const body = $('reportsTableBody');
    if (error) { body.innerHTML = '<tr><td colspan="3">خطأ في جلب البلاغات: ' + esc(error.message) + '</td></tr>'; return; }
    if (!data?.length) { body.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-gray)">لا توجد بلاغات 🎉</td></tr>'; return; }
    body.innerHTML = '';
    data.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(r.mod_title)}</strong> ${r.resolved ? '<span class="badge-published">تم الإصلاح</span>' : '<span class="badge-draft">قيد الانتظار</span>'}</td>
            <td>${new Date(r.created_at).toLocaleDateString('ar-EG')}</td>
            <td style="white-space:nowrap">
                ${r.resolved ? '' : `<button class="btn btn-primary btn-sm" onclick="resolveReport('${r.id}')">تم الإصلاح</button>`}
                <button class="btn btn-danger btn-sm" onclick="deleteReport('${r.id}')">حذف</button>
            </td>`;
        body.appendChild(tr);
    });
}
window.loadAdminReports = loadAdminReports;

window.resolveReport = async function (id) {
    await window.supabaseClient.from('broken_links').update({ resolved: true }).eq('id', id);
    await loadAdminReports(); await loadStats();
};
window.deleteReport = async function (id) {
    if (!confirm('حذف هذا البلاغ؟')) return;
    await window.supabaseClient.from('broken_links').delete().eq('id', id);
    await loadAdminReports(); await loadStats();
};

// ---------- Categories ----------
async function loadAdminCategories() {
    const { data, error } = await window.supabaseClient
        .from('categories').select('*').order('created_at', { ascending: true });
    if (error) { console.error(error); return; }
    adminCategories = data || [];
    const body = $('categoriesTableBody');
    if (!body) return;
    body.innerHTML = '';
    adminCategories.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><i class="fa-solid ${esc(c.icon || 'fa-folder')}"></i> ${esc(c.name)}</td>
            <td><code>${esc(c.slug)}</code></td>
            <td><code>${esc(c.icon || '')}</code></td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}', '${esc(c.name).replace(/'/g, "\\'")}')">حذف</button></td>`;
        body.appendChild(tr);
    });
}

window.promptAddCategory = async function () {
    const name = prompt('اسم التصنيف الجديد:');
    if (!name?.trim()) return;
    const slug = prompt('المعرف (slug) بالإنجليزية بدون مسافات، مثال: cars:', name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    if (!slug?.trim()) return;
    const icon = prompt('أيقونة Font Awesome (اختياري):', 'fa-folder') || 'fa-folder';
    const { error } = await window.supabaseClient.from('categories').insert([{ name: name.trim(), slug: slug.trim(), icon: icon.trim() }]);
    if (error) { alert('فشل الإضافة: ' + error.message); return; }
    await loadAdminCategories(); await loadStats();
};

window.deleteCategory = async function (id, name) {
    if (!confirm('حذف تصنيف "' + name + '"؟ الألعاب فيه غادي تبقى بلا تصنيف.')) return;
    const { error } = await window.supabaseClient.from('categories').delete().eq('id', id);
    if (error) { alert('فشل الحذف: ' + error.message); return; }
    await loadAdminCategories(); await loadStats();
};

// ---------- Contact messages ----------
async function loadContactMessages() {
    const { data, error } = await window.supabaseClient
        .from('contact_messages').select('*').order('created_at', { ascending: false });
    const body = $('messagesTableBody');
    if (!body) return;
    if (error) { body.innerHTML = '<tr><td colspan="4">خطأ: ' + esc(error.message) + '</td></tr>'; return; }
    if (!data?.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-gray)">لا توجد رسائل.</td></tr>'; return; }
    body.innerHTML = '';
    data.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(m.name)}</strong><br><small>${esc(m.email)}</small> ${m.is_read ? '' : '<span class="badge-draft">جديدة</span>'}</td>
            <td>${esc(m.message)}</td>
            <td>${new Date(m.created_at).toLocaleDateString('ar-EG')}</td>
            <td style="white-space:nowrap">
                ${m.is_read ? '' : `<button class="btn btn-secondary btn-sm" onclick="markMessageRead('${m.id}')">تمت القراءة</button>`}
                <button class="btn btn-danger btn-sm" onclick="deleteMessage('${m.id}')">حذف</button>
            </td>`;
        body.appendChild(tr);
    });
}
window.loadContactMessages = loadContactMessages;
window.markMessageRead = async function (id) {
    await window.supabaseClient.from('contact_messages').update({ is_read: true }).eq('id', id);
    loadContactMessages();
};
window.deleteMessage = async function (id) {
    if (!confirm('حذف هذه الرسالة؟')) return;
    await window.supabaseClient.from('contact_messages').delete().eq('id', id);
    loadContactMessages();
};

// ---------- Settings ----------
async function loadSettingsForm() {
    const { data } = await window.supabaseClient.from('site_settings').select('*').eq('key', 'hero').single();
    const v = data?.value || {};
    if ($('settingBadge')) $('settingBadge').value = v.badge || '';
    if ($('settingTitle')) $('settingTitle').value = v.title || '';
    if ($('settingSubtitle')) $('settingSubtitle').value = v.subtitle || '';
}

window.handleSaveSettings = async function (e) {
    e.preventDefault();
    const value = {
        badge: $('settingBadge').value.trim(),
        title: $('settingTitle').value.trim(),
        subtitle: $('settingSubtitle').value.trim(),
    };
    const { error } = await window.supabaseClient.from('site_settings').upsert({ key: 'hero', value });
    if (error) { alert('فشل الحفظ: ' + error.message); return; }
    alert('تم حفظ إعدادات البانر ✅');
};
