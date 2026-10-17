document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('product-content');
    if (!container) return;

    const catalog = window.RondyCatalog;
    const params = new URLSearchParams(window.location.search);
    const product = catalog.products.find((item) => item.id === params.get('id'));

    if (!product) {
        const notFound = document.createElement('section');
        notFound.className = 'product-not-found';
        notFound.setAttribute('aria-live', 'polite');

        const title = document.createElement('h1');
        title.textContent = 'PRODUTO NÃO ENCONTRADO.';
        const message = document.createElement('p');
        message.textContent = 'O produto que você procura não está disponível.';
        const backLink = document.createElement('a');
        backLink.className = 'product-not-found__link';
        backLink.href = '../catalogo/';
        backLink.append('VOLTAR AO CATÁLOGO ');
        const arrow = document.createElement('span');
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        backLink.append(arrow);

        notFound.append(title, message, backLink);
        container.append(notFound);
        return;
    }

    const categoryNames = new Map(catalog.categories.map((category) => [category.id, category.name]));
    const article = document.createElement('article');
    article.className = 'product-detail';
    article.setAttribute('aria-label', `Detalhes do produto ${product.name}`);

    const media = document.createElement('div');
    media.className = 'product-detail__media';
    const image = document.createElement('img');
    image.src = `../${product.image}`;
    image.alt = product.name;
    media.append(image);

    const content = document.createElement('div');
    content.className = 'product-detail__content';

    const backLink = document.createElement('a');
    backLink.className = 'product-detail__back';
    backLink.href = '../catalogo/';
    backLink.setAttribute('aria-label', 'Voltar ao catálogo');
    backLink.textContent = '← VOLTAR AO CATÁLOGO';

    const category = document.createElement('span');
    category.className = [
        'product-detail__category',
        ...product.categories.map((id) => `product-category--${id}`)
    ].join(' ');
    category.textContent = product.categories.map((id) => categoryNames.get(id)).join(' · ');

    const title = document.createElement('h1');
    title.className = 'product-detail__title';
    title.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'product-detail__description';
    description.textContent = product.description;

    const contact = document.createElement('a');
    contact.className = 'btn btn--primary product-detail__cta';
    contact.href = `../contato/?produto=${encodeURIComponent(product.name)}`;
    contact.setAttribute('aria-label', `Tenho interesse no produto ${product.name}`);
    contact.append('TENHO INTERESSE ');
    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    contact.append(arrow);

    content.append(backLink, category, title, description, contact);
    article.append(media, content);
    container.append(article);

    document.title = `${product.name} | Rondy Lab`;
});
