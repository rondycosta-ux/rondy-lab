(() => {
    'use strict';

    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!LOCAL_HOSTS.has(window.location.hostname)) return;

    const localConfigPath = '/admin/js/supabase-config.local.js';
    let status = 0;

    try {
        const request = new XMLHttpRequest();
        request.open('GET', localConfigPath, false);
        request.send();
        status = request.status;
    } catch {
        window.RondySupabaseLocalOverrideError = 'não foi possível verificar o arquivo local.';
        window.RondySupabaseLocalOverrideExpected = true;
        return;
    }

    if (status === 404) return;

    if (status < 200 || status >= 300) {
        window.RondySupabaseLocalOverrideError = `o arquivo local retornou HTTP ${status}.`;
        window.RondySupabaseLocalOverrideExpected = true;
        return;
    }

    window.RondySupabaseLocalOverrideExpected = true;
    document.write(`<script src="${localConfigPath}"><\/script>`);
})();
