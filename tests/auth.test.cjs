// Sem dependências. Executar com Node; mocks não acessam o Supabase real.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function element() {
    const classes = new Set();
    return {
        children: [], listeners: {}, textContent: '', value: '', disabled: false,
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        addEventListener(name, fn) { this.listeners[name] = fn; },
        append(...items) { this.children.push(...items); },
        setAttribute() {}, reportValidity: () => true
    };
}

function environment({ login = false, user = { id: 'user-a' }, configError, getError, logoutError, signInError } = {}) {
    const elements = Object.fromEntries(['auth-status', 'login-form', 'login-submit', 'login-password', 'login-email'].map(id => [id, element()]));
    const sidebar = element();
    const document = { body: { dataset: { authPage: login ? 'login' : 'protected' } }, documentElement: element(), hidden: false,
        listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
        getElementById: id => elements[id], querySelector: () => sidebar, createElement: element };
    let authCallback;
    let redirect;
    let logoutOptions;
    const client = { auth: {
        getUser: async () => ({ data: { user }, error: getError }),
        onAuthStateChange: fn => { authCallback = fn; },
        signInWithPassword: async args => { assert.equal(args.password, 'test-password'); return { data: { user: { id: 'user-a' }, session: {} }, error: signInError }; },
        signOut: async options => { logoutOptions = options; return { error: logoutError }; }
    } };
    const window = { location: { replace: url => { redirect = url; }, reload() {} }, addEventListener() {},
        RondySupabase: { getClient() { if (configError) throw new Error(configError); return client; } } };
    const context = vm.createContext({ window, document, setTimeout, URL });
    vm.runInContext(read('admin/js/auth.js'), context);
    return { window, document, elements, sidebar, client, emit: event => authCallback(event), redirect: () => redirect, logoutOptions: () => logoutOptions };
}

test('sem sessão não libera conteúdo nem inicializa módulos', async () => {
    const env = environment({ user: null });
    assert.equal(await env.window.RondyAuth.ready, false);
    assert.equal(env.redirect(), '/admin/login/');
    assert.equal(env.document.documentElement.classList.contains('auth-ready'), false);
});
test('getUser confirma sessão antes de liberar conteúdo', async () => {
    const env = environment();
    assert.equal(env.document.documentElement.classList.contains('auth-ready'), false);
    assert.equal(await env.window.RondyAuth.ready, true);
    assert.equal(env.document.documentElement.classList.contains('auth-ready'), true);
});
test('usuário anônimo e erro de sessão são bloqueados', async () => {
    for (const options of [{ user: { id: 'anon', is_anonymous: true } }, { getError: { message: 'invalid token' } }]) {
        const env = environment(options);
        assert.equal(await env.window.RondyAuth.ready, false);
        assert.equal(env.redirect(), '/admin/login/');
    }
});
test('configuração ausente falha fechada e explica o problema', async () => {
    const env = environment({ configError: 'Configure a Project URL.' });
    assert.equal(await env.window.RondyAuth.ready, false);
    assert.match(env.elements['auth-status'].textContent, /Project URL/);
});
test('logout usa scope local e redireciona sem limpar dados de negócio', async () => {
    const env = environment();
    await env.window.RondyAuth.ready;
    await env.sidebar.children[0].children[0].listeners.click();
    assert.equal(env.logoutOptions().scope, 'local');
    assert.equal(env.redirect(), '/admin/login/');
});
test('erro de logout não afirma saída e permite tentar novamente', async () => {
    const env = environment({ logoutError: new Error('offline') });
    await env.window.RondyAuth.ready;
    const [button, message] = env.sidebar.children[0].children;
    await button.listeners.click();
    assert.equal(env.redirect(), undefined);
    assert.equal(button.disabled, false);
    assert.match(message.textContent, /Não foi possível sair/);
});
test('logout em outra aba oculta imediatamente o Admin', async () => {
    const env = environment();
    await env.window.RondyAuth.ready;
    env.emit('SIGNED_OUT');
    assert.equal(env.document.documentElement.classList.contains('auth-ready'), false);
    assert.equal(env.redirect(), '/admin/login/');
});
test('login válido redireciona somente para destino interno fixo e limpa senha', async () => {
    const env = environment({ login: true, user: null });
    await env.window.RondyAuth.ready;
    env.elements['login-password'].value = 'test-password';
    env.elements['login-email'].value = 'test@example.invalid';
    await env.elements['login-form'].listeners.submit({ preventDefault() {} });
    assert.equal(env.redirect(), '/admin/');
    assert.equal(env.elements['login-password'].value, '');
});
test('login inválido mostra mensagem genérica e limpa senha', async () => {
    const env = environment({ login: true, user: null, signInError: { message: 'account-specific detail' } });
    await env.window.RondyAuth.ready;
    env.elements['login-password'].value = 'test-password';
    await env.elements['login-form'].listeners.submit({ preventDefault() {} });
    assert.equal(env.redirect(), undefined);
    assert.match(env.elements['auth-status'].textContent, /Não foi possível entrar/);
    assert.equal(env.elements['login-password'].value, '');
});
test('cliente recusa secrets e configurações inseguras; cria singleton', () => {
    for (const key of ['sb_secret_test', 'eyJhbGciOiJIUzI1NiJ9.fake.jwt', '']) {
        const window = { RondySupabaseConfig: { projectUrl: 'https://example.supabase.co', publishableKey: key } };
        vm.runInNewContext(read('admin/js/supabase-client.js'), { window, URL });
        assert.throws(() => window.RondySupabase.getClient(), /publishable/);
    }
    let count = 0;
    const window = { RondySupabaseConfig: { projectUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_example' }, supabase: { createClient(url, key, options) {
        count++; assert.equal(options.auth.detectSessionInUrl, false); return {};
    } } };
    vm.runInNewContext(read('admin/js/supabase-client.js'), { window, URL });
    assert.equal(window.RondySupabase.getClient(), window.RondySupabase.getClient());
    assert.equal(count, 1);
});
test('oito rotas carregam auth antes dos módulos, e scripts aguardam sessão', () => {
    const pages = ['', 'calculadora/', 'configuracoes/', 'filamentos/', 'produtos/', 'pedidos/', 'estoque/', 'consignacao/'];
    for (const route of pages) {
        const html = read(`admin/${route}index.html`);
        assert.match(html, /data-auth-page="protected"/);
        assert.ok(html.indexOf('/admin/js/auth.js') < html.indexOf('/admin/js/admin.js'));
        assert.match(html, /\/admin\/css\/auth.css/);
    }
    for (const module of ['js/admin.js', 'calculadora/calculadora.js', 'configuracoes/configuracoes.js', 'filamentos/filamentos.js']) {
        assert.match(read(`admin/${module}`), /await window.RondyAuth.ready/);
        new vm.Script(read(`admin/${module}`));
    }
    for (const file of ['auth.js', 'supabase-client.js', 'supabase-config.js']) {
        const source = read(`admin/js/${file}`);
        new vm.Script(source);
        assert.doesNotMatch(source, /localStorage\.(clear|removeItem|setItem)/);
        assert.doesNotMatch(source, /\.from\(/);
    }
});
