// Sem dependências e sem rede. Executar com: node --test tests/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadSupabaseConfig({ hostname, localOverrideExpected, localOverrideError, localConfig } = {}) {
    const document = { documentElement: { dataset: {} } };
    const window = {
        location: { hostname },
        RondySupabaseLocalOverrideExpected: localOverrideExpected,
        RondySupabaseLocalOverrideError: localOverrideError,
        RondySupabaseLocalConfig: localConfig
    };
    vm.runInNewContext(read('admin/js/supabase-config.js'), {
        window,
        document,
        URL,
        console: { error() {}, info() {} }
    });
    return { window, document };
}

test('configuração local válida substitui a padrão somente em host local', () => {
    const env = loadSupabaseConfig({
        hostname: 'localhost',
        localOverrideExpected: true,
        localConfig: {
            projectUrl: 'https://homologacao.example.supabase.co',
            publishableKey: 'sb_publishable_homologacao'
        }
    });
    assert.equal(env.window.RondySupabaseConfig.projectUrl, 'https://homologacao.example.supabase.co');
    assert.equal(env.window.RondySupabaseConfig.publishableKey, 'sb_publishable_homologacao');
    assert.equal(env.window.RondySupabaseConfigError, null);
    assert.equal(env.window.RondySupabaseEnvironment.name, 'local-homologacao');
    assert.equal(env.document.documentElement.dataset.supabaseEnvironment, 'local-homologacao');
});

test('host local sem override mantém a configuração padrão', () => {
    const env = loadSupabaseConfig({ hostname: '127.0.0.1' });
    assert.match(env.window.RondySupabaseConfig.projectUrl, /^https:\/\//);
    assert.match(env.window.RondySupabaseConfig.publishableKey, /^sb_publishable_/);
    assert.equal(env.window.RondySupabaseConfigError, null);
    assert.equal(env.window.RondySupabaseEnvironment.name, 'configuracao-padrao');
});

test('override local inválido bloqueia a inicialização sem fallback silencioso', () => {
    const env = loadSupabaseConfig({
        hostname: 'localhost',
        localOverrideExpected: true,
        localConfig: { projectUrl: 'http://inseguro.example.supabase.co', publishableKey: '' }
    });
    assert.deepEqual({ ...env.window.RondySupabaseConfig }, {});
    assert.match(env.window.RondySupabaseConfigError, /inválida ou incompleta/);
    assert.equal(env.window.RondySupabaseEnvironment.name, 'local-configuracao-invalida');
    assert.equal(env.document.documentElement.dataset.supabaseEnvironment, 'local-configuracao-invalida');
});

test('domínio publicado ignora override local mesmo se ele estiver presente', () => {
    const env = loadSupabaseConfig({
        hostname: 'rondylab.com.br',
        localOverrideExpected: true,
        localConfig: {
            projectUrl: 'https://homologacao.example.supabase.co',
            publishableKey: 'sb_publishable_homologacao'
        }
    });
    assert.notEqual(env.window.RondySupabaseConfig.projectUrl, 'https://homologacao.example.supabase.co');
    assert.notEqual(env.window.RondySupabaseConfig.publishableKey, 'sb_publishable_homologacao');
    assert.equal(env.window.RondySupabaseConfigError, null);
    assert.equal(env.window.RondySupabaseEnvironment.name, 'configuracao-padrao');
});

test('páginas existentes carregam o loader antes da configuração do Supabase', () => {
    const pages = ['', 'calculadora/', 'configuracoes/', 'filamentos/', 'produtos/', 'pedidos/', 'estoque/', 'consignacao/'];
    for (const route of pages) {
        const html = read(`admin/${route}index.html`);
        assert.ok(
            html.indexOf('/admin/js/supabase-config-local-loader.js') < html.indexOf('/admin/js/supabase-config.js'),
            `${route || 'dashboard'} deve carregar o override antes da configuração padrão`
        );
    }
    const login = read('admin/login/index.html');
    assert.ok(login.indexOf('/admin/js/supabase-config-local-loader.js') < login.indexOf('/admin/js/supabase-config.js'));
});
