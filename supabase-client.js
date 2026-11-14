// ========================================================
// Gaming Omar - Supabase Client Configuration
// ========================================================

const SUPABASE_URL = "https://uwqspcsyzyzoqlydlpiv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cXNwY3N5enl6b3FseWRscGl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NTgwNjcsImV4cCI6MjExMDIzNDA2N30.o8j0zgh0v9HS1d3s0vgiZsyMxF9Psl7U_VzsyeEf3wg";

// نستخدم supabaseClient لتفادي أي تضارب مع اسم المكتبة العامة
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getCurrentUser() {
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