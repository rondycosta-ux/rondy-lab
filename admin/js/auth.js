(() => {
    'use strict';
    const loginPage = document.body.dataset.authPage === 'login';
    const root = document.documentElement;
    const status = document.getElementById('auth-status');
    let client;
    let currentUserId;
    let checking;
    let signedOut = false;

    function hideContent() {
        root.classList.remove('auth-ready');
    }

    function message(text) {
        if (status) status.textContent = text;
    }

    function goToLogin() {
        hideContent();
        window.location.replace('/admin/login/');
    }

    async function verify() {
        if (checking) return checking;
        hideContent();
        checking = (async () => {
            try {
                const { data, error } = await client.auth.getUser();
                if (signedOut) return false;
                if (error || !data?.user || data.user.is_anonymous) {
                    if (!loginPage) goToLogin();
                    return false;
                }
                if (loginPage) {
                    window.location.replace('/admin/');
                    return false;
                }
                // Recarregue os módulos se outra conta entrar em uma segunda aba.
                if (currentUserId && currentUserId !== data.user.id) {
                    window.location.reload();
                    return false;
                }
                currentUserId = data.user.id;
                root.classList.add('auth-ready');
                return true;
            } catch {
                message('Não foi possível verificar sua sessão. Verifique a conexão e recarregue a página.');
                return false;
            }
        })();
        try {
            return await checking;
        } finally {
            checking = null;
        }
    }

    async function start() {
        try {
            client = window.RondySupabase.getClient();
        } catch (error) {
            message(error.message);
            return false;
        }
        client.auth.onAuthStateChange((event) => {
            // Não chamar métodos assíncronos do Auth dentro deste callback.
            if (event === 'SIGNED_OUT') {
                signedOut = true;
                if (!loginPage) goToLogin();
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                signedOut = false;
                setTimeout(() => { void verify(); }, 0);
            }
        });
        if (loginPage) {
            setupLogin();
        } else {
            setupLogout();
            window.addEventListener('pagehide', hideContent);
            window.addEventListener('pageshow', (event) => {
                if (event.persisted) void verify();
            });
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) hideContent();
                else void verify();
            });
        }
        return verify();
    }

    function setupLogin() {
        const form = document.getElementById('login-form');
        const button = document.getElementById('login-submit');
        const password = document.getElementById('login-password');
        button.disabled = false;
        message('');
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (button.disabled || !form.reportValidity()) return;
            button.disabled = true;
            message('Entrando…');
            try {
                const { data, error } = await client.auth.signInWithPassword({
                    email: document.getElementById('login-email').value.trim(),
                    password: password.value
                });
                password.value = '';
                if (error || !data?.session || !data?.user || data.user.is_anonymous) {
                    message('Não foi possível entrar. Confira e-mail e senha ou tente novamente mais tarde.');
                    return;
                }
                window.location.replace('/admin/');
            } catch {
                message('Não foi possível conectar. Verifique sua conexão e tente novamente.');
            } finally {
                password.value = '';
                button.disabled = false;
            }
        });
    }

    function setupLogout() {
        const area = document.createElement('div');
        area.className = 'admin-session';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-button admin-button--ghost';
        button.textContent = 'SAIR';
        const feedback = document.createElement('p');
        feedback.className = 'admin-form-message';
        feedback.setAttribute('role', 'status');
        area.append(button, feedback);
        document.querySelector('.admin-sidebar').append(area);
        button.addEventListener('click', async () => {
            button.disabled = true;
            feedback.textContent = 'Saindo…';
            try {
                const { error } = await client.auth.signOut({ scope: 'local' });
                if (error) throw error;
                signedOut = true;
                goToLogin();
            } catch {
                feedback.textContent = 'Não foi possível sair. Verifique a conexão e tente novamente.';
                button.disabled = false;
            }
        });
    }

    window.RondyAuth = Object.freeze({ ready: start() });
})();
