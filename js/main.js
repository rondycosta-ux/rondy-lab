document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.site-header');
    const toggle = document.querySelector('.nav-toggle');
    const nav = document.querySelector('.site-nav');

    if (header && toggle && nav) {
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
    }

    const catalogPage = document.querySelector('.catalog-page');
    if (!catalogPage) return;

    const filters = Array.from(document.querySelectorAll('.catalog-filter'));
    const products = Array.from(document.querySelectorAll('.catalog-product'));
    const emptyState = document.querySelector('.catalog-empty');
    const validCategories = new Set(['all', 'home', 'colecionaveis', 'custom', 'play', 'pets', 'auto']);

    const applyFilter = (selectedCategory) => {
        const normalized = validCategories.has(selectedCategory) ? selectedCategory : 'all';
        let visibleProducts = 0;

        filters.forEach((filter) => {
            const isActive = filter.dataset.filter === normalized;
            filter.classList.toggle('is-active', isActive);
            filter.setAttribute('aria-pressed', String(isActive));
        });

        products.forEach((product) => {
            const matches = normalized === 'all' || product.dataset.category === normalized;
            product.hidden = !matches;
            if (matches) visibleProducts += 1;
        });

        if (emptyState) {
            const shouldShowEmpty = normalized !== 'all' && visibleProducts === 0;
            emptyState.hidden = !shouldShowEmpty;
        }
    };

    const params = new URLSearchParams(window.location.search);
    const requestedCategory = params.get('categoria');
    const initialCategory = validCategories.has(requestedCategory) ? requestedCategory : 'all';

    applyFilter(initialCategory);

    filters.forEach((filter) => {
        filter.addEventListener('click', () => {
            const selectedCategory = filter.dataset.filter;
            const nextUrl = new URL(window.location.href);

            if (selectedCategory === 'all') {
                nextUrl.searchParams.delete('categoria');
            } else {
                nextUrl.searchParams.set('categoria', selectedCategory);
            }

            window.history.replaceState({}, '', nextUrl);
            applyFilter(selectedCategory);
        });
    });
});
