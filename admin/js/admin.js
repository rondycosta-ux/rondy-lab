document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.querySelector('.admin-sidebar');
    const toggle = document.querySelector('.admin-mobile-toggle');

    if (sidebar && toggle) {
        toggle.addEventListener('click', () => {
            const isOpen = sidebar.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });

        sidebar.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
});
