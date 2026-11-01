// ========================================================
// Gaming Omar - Supabase Client Configuration
// ========================================================

const SUPABASE_URL = "https://agnjoweuttueadgqkolh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnbmpvd2V1dHR1ZWFkZ3Frb2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1Mzg3OTgsImV4cCI6MjEwOTExNDc5OH0.FEbz-eO-g74kd5HkPViTG3_PW1T5qNFjQ_xU5OYSX5c";

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