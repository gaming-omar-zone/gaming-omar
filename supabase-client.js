// ========================================================
// Gaming Omar - Supabase Client Configuration
// ========================================================

const SUPABASE_URL = "https://uwqspcsyzyzoqlydlpiv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cXNwY3N5enl6b3FseWRscGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NTgwNjcsImV4cCI6MjExMDIzNDA2N30.o8j0zgh0v9HS1d3s0vgiZsyMxF9Psl7U_VzsyeEf3wg";

// v6 (F-10) — إلا مكتبة Supabase ما تحملاتش من الـ CDN (محجوبة،
// إنترنت مقطوع، SRI ما طابقش)، ما نرميوش ReferenceError ونخليو
// الصفحة بيضاء: supabaseClient كيبقى null، وكل صفحة كتبين رسالة واضحة.
// (الأنون key علني بالتصميم — عمر ما يتزاد service_role هنا.)
window.supabaseLoadError = false;
window.supabaseClient = null;
try {
    if (typeof window.supabase !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
        // نستخدم supabaseClient لتفادي أي تضارب مع اسم المكتبة العامة
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
        throw new Error('Supabase library failed to load');
    }
} catch (e) {
    window.supabaseLoadError = true;
    console.error('Supabase library failed to load:', e);
    // رسالة مرئية إلا كان الـ DOM جاهز: صندوق الخطأ ديال الأدمن،
    // ولا loadError ديال الصفحة العامة (app.js كيدير نفس الشيء عند البداية).
    document.addEventListener('DOMContentLoaded', () => {
        const loginErr = document.getElementById('loginError');
        if (loginErr) {
            loginErr.textContent = 'تعذر تحميل مكتبة قاعدة البيانات (CDN). تحقق من الإنترنت وأعد تحميل الصفحة.';
            loginErr.style.display = 'block';
        }
        if (typeof window.showLoadError === 'function') {
            window.showLoadError('تعذر تحميل مكتبة قاعدة البيانات (CDN). تحقق من الإنترنت وأعد تحميل الصفحة.');
        }
    });
}

async function getCurrentUser() {
    if (!window.supabaseClient) return null;
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    return user;
}

async function checkIsAdmin() {
    const user = await getCurrentUser();
    if (!user) return false;
    
    const { data, error } = await window.supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
        
    return !error && data && data.role === 'admin';
}
