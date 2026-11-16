// ========================================================
// Gaming Omar - Admin Logic
// ========================================================

let categoriesList = [];
let adminMods = [];
let editingMod = null; // السطر الكامل للعبة اللي كتتعدل (null = إضافة جديدة)

// v2: escape DB text before innerHTML (XSS fix)
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

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
    document.getElementById('userEmailTag').innerHTML = `<i class="fa-solid fa-user-shield"></i> ${esc(user.email)}`;

    loadAdminCategories();
    loadAdminMods();
    loadAdminReports();
    loadContactMessages();
    loadGameRequestsAdmin();
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

    // v2: was `event.currentTarget` — `event` is not reliably defined here
    const btn = document.querySelector(`.tab-btn[onclick="switchAdminTab('${tabId}')"]`);
    if (btn) btn.classList.add('active');
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');
    if (tabId === 'reportsTab') loadAdminReports();
    if (tabId === 'messagesTab') loadContactMessages();
    if (tabId === 'requestsTab') loadGameRequestsAdmin();
    if (tabId === 'categoriesTab') loadAdminCategories();
    if (tabId === 'settingsTab') loadAdminSettings();
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
                <td><strong>${esc(c.name)}</strong></td>
                <td><code>${esc(c.slug)}</code></td>
                <td><i class="fa-solid ${esc(c.icon || 'fa-folder')}"></i></td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="deleteCategory('${c.id}')"><i class="fa-solid fa-trash highlight"></i></button>
                </td>
            </tr>
        `;
    });

    const select = document.getElementById('formModCategory');
    select.innerHTML = '';
    categoriesList.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${esc(c.name)}</option>`;
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
    const inside = adminMods.filter(m => m.category_id === id).length;
    const warn = inside > 0
        ? `هاد القسم فيه ${inside} لعبة/مود. إلا مسحتيه غادي يبقاو بلا تصنيف. متأكد؟`
        : "هل أنت متأكد من حذف هذا القسم؟";
    if (!confirm(warn)) return;
    const { error } = await window.supabaseClient.from('categories').delete().eq('id', id);
    if (error) alert(error.message);
    else loadAdminCategories();
};

async function loadAdminMods() {
    // Supabase كيرجع 1000 سطر فقط فكل طلب — خاصنا نجيبو الصفحات وحدة بوحدة
    // وإلا الألعاب اللي فوق 1000 ما غاديش تبان فالأدمن والإحصائيات غاتكون غالطة.
    let mods = [];
    let from = 0;
    const PAGE = 1000;
    for (;;) {
        const { data: page, error } = await window.supabaseClient
            .from('mods')
            .select('*, categories(name)')
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }) // tie-breaker باش الصفحات ما يتكررو
            .range(from, from + PAGE - 1);
        if (error) {
            console.error('Admin mods error:', error);
            const tb = document.getElementById('modsTableBody');
            if (tb) tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#ff8a8a;padding:20px;">تعذر جلب الألعاب: ' + esc(error.message) + '</td></tr>';
            return;
        }
        mods = mods.concat(page || []);
        if (!page || page.length < PAGE) break;
        from += PAGE;
    }
    adminMods = mods;

    document.getElementById('statTotalMods').textContent = adminMods.length;
    const totalDownloads = adminMods.reduce((sum, m) => sum + (m.download_count || 0), 0);
    document.getElementById('statTotalDownloads').textContent = totalDownloads;

    renderAdminMods(adminMods);
}

function renderAdminMods(mods) {
    const tbody = document.getElementById('modsTableBody');
    if (!tbody) return;
    if (!mods.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-gray);padding:20px;">لا توجد ألعاب بعد — اضغط "إضافة لعبة أو مود جديد".</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    mods.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
                <td><img src="${esc(m.image_url || '')}" class="table-thumb" alt="" onerror="this.style.display='none'"></td>
                <td><strong>${esc(m.title)}</strong><br><small>${m.is_published ? '<span class="badge-published">منشور</span>' : '<span class="badge-draft">مسودة</span>'}</small></td>
                <td>${esc(m.categories ? m.categories.name : '-')}</td>
                <td>${esc(m.file_size)}</td>
                <td>⭐ ${Number(m.rating_avg ?? 5).toFixed(1)} (${m.rating_count ?? 0})</td>
                <td>${m.download_count ?? 0}</td>
                <td style="white-space:nowrap">
                    <button class="btn btn-secondary btn-sm" onclick="editMod('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-secondary btn-sm" onclick="togglePublish('${m.id}', ${!!m.is_published})">${m.is_published ? 'إخفاء' : 'نشر'}</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteMod('${m.id}')"><i class="fa-solid fa-trash"></i></button>
                </td>
        `;
        tbody.appendChild(tr);
    });
}

window.filterAdminMods = function() {
    const q = (document.getElementById('adminModSearch')?.value || '').trim().toLowerCase();
    renderAdminMods(adminMods.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.short_desc || '').toLowerCase().includes(q)));
};

window.togglePublish = async function(id, currentlyPublished) {
    const { error } = await window.supabaseClient.from('mods').update({ is_published: !currentlyPublished }).eq('id', id);
    if (error) { alert('فشل التغيير: ' + error.message); return; }
    loadAdminMods();
};

window.toggleDownloadFields = function() {
    const type = document.getElementById('formDownloadType').value;
    document.getElementById('externalLinkGroup').style.display = type === 'external' ? 'block' : 'none';
    document.getElementById('storageUploadGroup').style.display = type === 'storage' ? 'block' : 'none';
};

window.openModFormModal = function() {
    editingMod = null;
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
            } else if (!(id && editingMod && editingMod.id === id && editingMod.file_url)) {
                // إضافة جديدة، ولا تعديل بدّل النوع لـ storage وما عندو حتى ملف قديم
                throw new Error("يجب اختيار ملف الـ ZIP أو APK لرفعه.");
            }
        } else {
            external_url = document.getElementById('formExternalUrl').value.trim();
            if (!external_url) throw new Error("يرجى إدخال رابط التحميل المباشر.");
        }

        // v2: repo saved only 8 fields and silently dropped the rest
        // (online/offline, RAM, GPU, YouTube, mirrors, published)
        const payload = {
            title, category_id, short_desc, description,
            image_url, download_type, file_size, game_version,
            is_online: document.getElementById('formIsOnline').value === 'true',
            ram_req: document.getElementById('formRamReq').value.trim() || '2 GB',
            gpu_compat: document.getElementById('formGpuCompat').value.trim() || 'Mali / Adreno / PowerVR',
            youtube_url: document.getElementById('formYoutubeUrl').value.trim() || null,
            link_drive: document.getElementById('formLinkDrive').value.trim() || null,
            link_mega: document.getElementById('formLinkMega').value.trim() || null,
            is_published: document.getElementById('formIsPublished')?.checked ?? true,
        };
        // update() كيبدّل غير الأعمدة اللي فـ payload، يعني الملف القديم كيبقى إلا ما رفعتيش جديد
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
    const { data: mod, error: editErr } = await window.supabaseClient.from('mods').select('*').eq('id', id).single();
    if (editErr || !mod) { alert('تعذر جلب بيانات اللعبة: ' + (editErr ? editErr.message : 'غير موجودة')); return; }

    // reset: بلا هادي الملفات (صورة/APK) اللي اخترتي فتعديل سابق كتبقى فالفورم وكتتحمل فاللعبة الغالطة
    editingMod = mod;
    document.getElementById('modForm').reset();
    document.getElementById('editModId').value = mod.id;
    document.getElementById('formModTitle').value = mod.title || '';
    document.getElementById('formModCategory').value = mod.category_id || '';
    document.getElementById('formIsOnline').value = String(!!mod.is_online);
    document.getElementById('formModShortDesc').value = mod.short_desc || '';
    document.getElementById('formModFullDesc').value = mod.description || '';
    document.getElementById('formModSize').value = mod.file_size || '';
    document.getElementById('formModVersion').value = mod.game_version || 'Android 5.0+';
    document.getElementById('formRamReq').value = mod.ram_req || '2 GB';
    document.getElementById('formGpuCompat').value = mod.gpu_compat || 'Mali / Adreno / PowerVR';
    document.getElementById('formYoutubeUrl').value = mod.youtube_url || '';
    document.getElementById('formModImgUrl').value = mod.image_url || '';
    document.getElementById('formLinkDrive').value = mod.link_drive || '';
    document.getElementById('formLinkMega').value = mod.link_mega || '';
    if (document.getElementById('formIsPublished')) document.getElementById('formIsPublished').checked = !!mod.is_published;
    document.getElementById('formDownloadType').value = mod.download_type || 'external';

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
// ========================================================
// v2: Reports + contact messages — admin.html called
// loadAdminReports() but it did not exist (ReferenceError),
// and contact messages had no admin view at all.
// ========================================================
async function loadAdminReports() {
    const { data, error } = await window.supabaseClient
        .from('broken_links').select('*').order('created_at', { ascending: false });
    const body = document.getElementById('reportsTableBody');
    if (!body) return;
    const stat = document.getElementById('statTotalReports');
    if (error) { body.innerHTML = '<tr><td colspan="3">خطأ في جلب البلاغات: ' + esc(error.message) + '</td></tr>'; return; }
    if (stat) stat.textContent = (data || []).filter(r => !r.resolved).length;
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

window.resolveReport = async function(id) {
    await window.supabaseClient.from('broken_links').update({ resolved: true }).eq('id', id);
    loadAdminReports();
};
window.deleteReport = async function(id) {
    if (!confirm('حذف هذا البلاغ؟')) return;
    await window.supabaseClient.from('broken_links').delete().eq('id', id);
    loadAdminReports();
};

async function loadContactMessages() {
    const { data, error } = await window.supabaseClient
        .from('contact_messages').select('*').order('created_at', { ascending: false });
    const body = document.getElementById('messagesTableBody');
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
window.markMessageRead = async function(id) {
    await window.supabaseClient.from('contact_messages').update({ is_read: true }).eq('id', id);
    loadContactMessages();
};
window.deleteMessage = async function(id) {
    if (!confirm('حذف هذه الرسالة؟')) return;
    await window.supabaseClient.from('contact_messages').delete().eq('id', id);
    loadContactMessages();
};

// طلبات الألعاب (أدمن): تغيير الحالة + حذف
const REQUEST_STATUS_LABELS_ADMIN = {
    pending: ['قيد الانتظار', 'badge-draft'],
    approved: ['تم القبول', 'badge-approved'],
    done: ['تمت الإضافة ✅', 'badge-published'],
    rejected: ['مرفوض', 'badge-rejected']
};
async function loadGameRequestsAdmin() {
    const { data, error } = await window.supabaseClient
        .from('game_requests').select('*').order('created_at', { ascending: false });
    const body = document.getElementById('requestsTableBody');
    if (!body) return;
    if (error) { body.innerHTML = '<tr><td colspan="5">خطأ: ' + esc(error.message) + '</td></tr>'; return; }
    if (!data?.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-gray)">لا توجد طلبات.</td></tr>'; return; }
    body.innerHTML = '';
    data.forEach(r => {
        const [label, cls] = REQUEST_STATUS_LABELS_ADMIN[r.status] || REQUEST_STATUS_LABELS_ADMIN.pending;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${esc(r.game_title)}</strong><br><small>طلبها ${esc(r.name)}</small>${r.details ? `<br><small style="color:var(--text-gray)">${esc(r.details)}</small>` : ''}</td>
            <td>${esc(r.game_type)}</td>
            <td><span class="${cls}">${esc(label)}</span></td>
            <td>${new Date(r.created_at).toLocaleDateString('ar-EG')}</td>
            <td style="white-space:nowrap">
                ${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="setRequestStatus('${r.id}', 'approved')">قبول</button>` : ''}
                ${r.status === 'approved' ? `<button class="btn btn-primary btn-sm" onclick="setRequestStatus('${r.id}', 'done')">تمت الإضافة</button>` : ''}
                ${r.status === 'pending' || r.status === 'approved' ? `<button class="btn btn-secondary btn-sm" onclick="setRequestStatus('${r.id}', 'rejected')">رفض</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteGameRequest('${r.id}')">حذف</button>
            </td>`;
        body.appendChild(tr);
    });
}
window.loadGameRequestsAdmin = loadGameRequestsAdmin;
window.setRequestStatus = async function(id, status) {
    await window.supabaseClient.from('game_requests').update({ status }).eq('id', id);
    loadGameRequestsAdmin();
};
window.deleteGameRequest = async function(id) {
    if (!confirm('حذف هذا الطلب؟')) return;
    await window.supabaseClient.from('game_requests').delete().eq('id', id);
    loadGameRequestsAdmin();
};
