// Configuração pública do projeto. Este arquivo é entregue ao navegador.
// Use somente a publishable key (sb_publishable_...). Nunca cole secrets,
// service_role, senha do banco ou senha de usuário neste arquivo.
(() => {
    'use strict';

    const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
    const isLocalHost = LOCAL_HOSTS.has(window.location.hostname);
    const productionConfig = {
        projectUrl: 'https://lmgymzcqdnysqrwsjlbs.supabase.co', // https://SEU-PROJETO.supabase.co
        publishableKey: 'sb_publishable_IRvBr-aSYivCPYWkLneVsA_sdKfFHVQ' // sb_publishable_...
    };
    const localOverrideExpected = window.RondySupabaseLocalOverrideExpected === true;
    const localOverrideError = window.RondySupabaseLocalOverrideError;
    const localConfig = window.RondySupabaseLocalConfig;
    let config = productionConfig;
    let environment = 'configuracao-padrao';
    let error = null;

    function isValidBrowserConfig(candidate) {
        if (!candidate || typeof candidate !== 'object'
            || typeof candidate.projectUrl !== 'string'
            || typeof candidate.publishableKey !== 'string'
            || !candidate.projectUrl.trim()
            || !candidate.publishableKey.trim()) {
            return false;
        }

        try {
            const url = new URL(candidate.projectUrl.trim());
            return url.protocol === 'https:'
                && !url.username
                && !url.password
                && !url.search
                && !url.hash
                && url.pathname === '/'
                && /^sb_publishable_[A-Za-z0-9_-]+$/.test(candidate.publishableKey.trim());
        } catch {
            return false;
        }
    }

    if (isLocalHost && localOverrideExpected) {
        if (localOverrideError) {
            error = `A configuração local do Supabase não pôde ser carregada: ${localOverrideError}`;
        } else if (!isValidBrowserConfig(localConfig)) {
            error = 'A configuração local do Supabase está inválida ou incompleta. Use uma Project URL HTTPS e uma publishable key válidas em /admin/js/supabase-config.local.js.';
        } else {
            config = {
                projectUrl: localConfig.projectUrl.trim(),
                publishableKey: localConfig.publishableKey.trim()
            };
            environment = 'local-homologacao';
        }
    }

    if (error) {
        config = {};
        environment = 'local-configuracao-invalida';
    }

    window.RondySupabaseConfig = Object.freeze(config);
    window.RondySupabaseEnvironment = Object.freeze({
        name: environment,
        isLocalHost
    });
    window.RondySupabaseConfigError = error;
    document.documentElement.dataset.supabaseEnvironment = environment;

    if (error) {
        console.error('Rondy Lab: configuração local do Supabase bloqueada.', error);
    } else if (environment === 'local-homologacao') {
        console.info('Rondy Lab: ambiente Supabase local de homologação ativo.');
    } else {
        console.info('Rondy Lab: configuração padrão do Supabase ativa.');
    }
})();
