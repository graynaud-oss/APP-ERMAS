import { getSupabaseClient } from './supabase-client.js';

export async function logoutCurrentSession({ client, redirect }) {
    if (!client?.auth || typeof client.auth.signOut !== 'function') {
        throw new TypeError('Un client Supabase Auth valide est requis.');
    }

    try {
        await client.auth.signOut();
    } finally {
        redirect('index.html');
    }
}

export function installGlobalLogout({
    client = getSupabaseClient(),
    root = document,
    redirect = (destination) => { window.location.href = destination; }
} = {}) {
    const button = root.querySelector('[data-global-logout]');
    if (!button) return null;

    button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;

        try {
            await logoutCurrentSession({ client, redirect });
        } catch (error) {
            button.disabled = false;
        }
    });

    return button;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const install = () => installGlobalLogout();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
}
