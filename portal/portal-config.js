// URLs públicas das Edge Functions. Nenhuma chave é exposta aqui.
(() => {
    'use strict';
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    const host = window.location.hostname.toLowerCase();
    const projectByEnvironment = {
        dev: 'https://nirwkoxmyqbvsnoliysu.supabase.co',
        prod: 'https://lmgymzcqdnysqrwsjlbs.supabase.co'
    };
    const environment = localHosts.has(host) ? 'dev' : host === 'lab.rondy.com.br' ? 'prod' : null;
    const projectUrl = environment ? projectByEnvironment[environment] : null;

    window.RondyPortalConfig = Object.freeze({
        environment,
        functionUrl: projectUrl ? `${projectUrl}/functions/v1/portal-lojista` : null
    });
})();
