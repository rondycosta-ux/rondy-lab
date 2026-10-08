(() => {
    'use strict';
    let client;
    window.RondySupabase = Object.freeze({
        getClient() {
            if (client) return client;
            const config = window.RondySupabaseConfig || {};
            let url;
            try {
                url = new URL(config.projectUrl);
            } catch {
                throw new Error('Configure a Project URL em /admin/js/supabase-config.js.');
            }
            if (url.protocol !== 'https:' || url.username || url.password ||
                url.search || url.hash || url.pathname !== '/') {
                throw new Error('A Project URL deve ser uma origem HTTPS válida.');
            }
            if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey || '')) {
                throw new Error('Configure somente uma publishable key em /admin/js/supabase-config.js.');
            }
            if (!window.supabase?.createClient) {
                throw new Error('Não foi possível carregar a conexão. Verifique a internet e recarregue a página.');
            }
            client = window.supabase.createClient(url.origin, config.publishableKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: false
                }
            });
            return client;
        }
    });
})();
