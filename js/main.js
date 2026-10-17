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

    const contactPage = document.querySelector('.contact-page');
    if (contactPage) {
        const params = new URLSearchParams(window.location.search);
        const productName = params.get('produto');
        const productBlock = document.getElementById('contact-product');
        const productNameNode = document.getElementById('contact-product-name');
        const whatsappLink = document.getElementById('whatsapp-link');

        const baseMessage = 'Olá! Vim pelo site da Rondy Lab e gostaria de mais informações.';
        const buildMessage = (name) => {
            const message = name
                ? `Olá! Vim pelo site da Rondy Lab e tenho interesse no produto: ${name}.`
                : baseMessage;
            return encodeURIComponent(message);
        };

        if (productName && productBlock && productNameNode && whatsappLink) {
            productBlock.hidden = false;
            productNameNode.textContent = productName;
            const nextMessage = buildMessage(productName);
            whatsappLink.href = `https://wa.me/5511954963077?text=${nextMessage}`;
        } else if (whatsappLink) {
            whatsappLink.href = `https://wa.me/5511954963077?text=${encodeURIComponent(baseMessage)}`;
        }
    }

    const catalogPage = document.querySelector('.catalog-page');
    const catalog = window.RondyCatalog;
    if (!catalog) return;

    const productImagePath = (product) => `../${product.image}`;
    const detailUrl = (product) => `../produto/?id=${encodeURIComponent(product.id)}`;
    const categoryNames = new Map(catalog.categories.map((category) => [category.id, category.name]));
    const categoryClasses = (baseClass, categories) => [
        baseClass,
        ...categories.map((id) => `${baseClass}--${id}`)
    ].join(' ');

    const createProductCard = (product) => {
        const article = document.createElement('article');
        article.className = 'catalog-product';
        article.dataset.categories = product.categories.join(',');

        const link = document.createElement('a');
        link.href = detailUrl(product);
        link.setAttribute('aria-label', `Ver detalhes do produto ${product.name}`);

        const image = document.createElement('img');
        image.src = productImagePath(product);
        image.alt = product.name;
        image.loading = 'lazy';
        link.append(image);

        const content = document.createElement('div');
        content.className = 'catalog-product__content';

        const category = document.createElement('span');
        category.className = categoryClasses('catalog-product__category', product.categories);
        category.textContent = product.categories.map((id) => categoryNames.get(id)).join(' · ');

        const name = document.createElement('h2');
        name.className = 'catalog-product__name';
        name.textContent = product.name;

        const details = document.createElement('span');
        details.className = 'catalog-product__link';
        details.append('VER DETALHES ');
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        details.append(arrow);

        content.append(category, name, details);
        link.append(content);
        article.append(link);
        return article;
    };

    const createFeaturedProduct = (product) => {
        const article = document.createElement('article');
        article.className = 'featured-product';

        const link = document.createElement('a');
        link.className = 'featured-product__link';
        link.href = `/produto/?id=${encodeURIComponent(product.id)}`;
        link.setAttribute('aria-label', `Ver produto ${product.name}`);

        const image = document.createElement('img');
        image.className = 'featured-product__image';
        image.src = product.image;
        image.alt = product.name;
        image.loading = 'lazy';

        const content = document.createElement('div');
        content.className = 'featured-product__content';
        const category = document.createElement('span');
        category.className = categoryClasses('featured-product__category', product.categories);
        category.textContent = product.categories.map((id) => categoryNames.get(id)).join(' · ');

        const name = document.createElement('h3');
        name.className = 'featured-product__name';
        name.textContent = product.name;

        content.append(category, name);
        link.append(image, content);
        article.append(link);
        return article;
    };

    const featuredProducts = document.querySelector('.featured-products__grid');
    if (featuredProducts) {
        const featuredProductIds = [
            'kit-fitness',
            'gaviao-corinthians',
            'hei-hei',
            'homem-aranha-miles-morales'
        ];
        const featuredCatalogProducts = featuredProductIds.map((id) => {
            const product = catalog.products.find((item) => item.id === id);
            if (!product) throw new Error(`Produto em destaque não encontrado no catálogo: ${id}`);
            return product;
        });

        featuredCatalogProducts.forEach((product) => {
            featuredProducts.append(createFeaturedProduct(product));
        });
    }

    if (!catalogPage) return;

    const filters = Array.from(document.querySelectorAll('.catalog-filter'));
    const productsContainer = document.querySelector('.catalog-products');
    const emptyState = document.querySelector('.catalog-empty');

    catalog.products.forEach((product) => {
        productsContainer.append(createProductCard(product));
    });

    const products = Array.from(productsContainer.querySelectorAll('.catalog-product'));
    const validCategories = new Set(['all', ...catalog.categories.map((category) => category.id)]);

    const applyFilter = (selectedCategory) => {
        const normalized = validCategories.has(selectedCategory) ? selectedCategory : 'all';
        let visibleProducts = 0;

        filters.forEach((filter) => {
            const isActive = filter.dataset.filter === normalized;
            filter.classList.toggle('is-active', isActive);
            filter.setAttribute('aria-pressed', String(isActive));
        });

        products.forEach((product) => {
            const productCategories = product.dataset.categories.split(',');
            const matches = normalized === 'all' || productCategories.includes(normalized);
            product.hidden = !matches;
            if (matches) visibleProducts += 1;
        });

        if (emptyState) {
            emptyState.hidden = normalized === 'all' || visibleProducts > 0;
        }
    };

    const params = new URLSearchParams(window.location.search);
    applyFilter(params.get('categoria'));

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
