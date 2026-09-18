document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');

    if (!header || !toggle || !nav) return;

    toggle.addEventListener('click', () => {
        const isOpen = header.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            header.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
});
