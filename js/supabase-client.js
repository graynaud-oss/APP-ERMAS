const SUPABASE_URL = 'https://wtxmaolhztuvujtgouaw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0eG1hb2xoenR1dnVqdGdvdWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4MjgzMDIsImV4cCI6MjEwMTQwNDMwMn0.ttuoJAutNJ98KDz45Te40VOqLyMIuda7n2CtaFK8IGg';

const AUTH_OPTIONS = Object.freeze({
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
});

let sharedClient = null;

export function createSupabaseClient(supabaseSdk = globalThis.supabase) {
    if (!supabaseSdk || typeof supabaseSdk.createClient !== 'function') {
        throw new Error('Le SDK Supabase JS v2 doit être chargé avant le client partagé.');
    }

    return supabaseSdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { ...AUTH_OPTIONS }
    });
}

export function getSupabaseClient() {
    if (!sharedClient) {
        sharedClient = createSupabaseClient();
    }

    return sharedClient;
}

