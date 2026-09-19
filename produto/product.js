const produtos = [
    {
        id: 'design-dia-a-dia',
        categoria: 'HOME',
        nome: 'Design para o dia a dia',
        descricao: 'Objetos criados para unir funcionalidade, design e as possibilidades da impressão 3D.',
        imagem: '../assets/images/prod1.jpg'
    },
    {
        id: 'pecas-com-personalidade',
        categoria: 'COLECIONÁVEIS',
        nome: 'Peças que ganham personalidade',
        descricao: 'Colecionáveis e peças decorativas que transformam personagens, referências e ideias em objetos reais.',
        imagem: '../assets/images/prod2.jpg'
    },
    {
        id: 'feito-para-voce',
        categoria: 'CUSTOM',
        nome: 'Feito especialmente para você',
        descricao: 'Projetos personalizados criados a partir de uma ideia, referência ou necessidade específica.',
        imagem: '../assets/images/prod3.jpg'
    },
    {
        id: 'criatividade-diversao',
        categoria: 'PLAY',
        nome: 'Criatividade que vira diversão',
        descricao: 'Brinquedos e objetos criativos que exploram as possibilidades da fabricação digital de forma divertida.',
        imagem: '../assets/images/prod4.jpg'
    }
];

const categoriaClasses = {
    HOME: 'product-category--home',
    COLECIONÁVEIS: 'product-category--colecionaveis',
    CUSTOM: 'product-category--custom',
    PLAY: 'product-category--play',
    PETS: 'product-category--pets',
    AUTO: 'product-category--auto'
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('product-content');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    const product = produtos.find((item) => item.id === productId);

    if (!product) {
        container.innerHTML = `
            <section class="product-not-found" aria-live="polite">
                <h1>PRODUTO NÃO ENCONTRADO.</h1>
                <p>O produto que você procura não está disponível.</p>
                <a class="product-not-found__link" href="/catalogo/">VOLTAR AO CATÁLOGO <span aria-hidden="true">→</span></a>
            </section>
        `;
        return;
    }

    const categoryClass = categoriaClasses[product.categoria] || 'product-category--home';

    container.innerHTML = `
        <article class="product-detail" aria-label="Detalhes do produto ${product.nome}">
            <div class="product-detail__media">
                <img src="${product.imagem}" alt="${product.nome}">
            </div>

            <div class="product-detail__content">
                <a class="product-detail__back" href="/catalogo/" aria-label="Voltar ao catálogo">← VOLTAR AO CATÁLOGO</a>

                <span class="product-detail__category ${categoryClass}">${product.categoria}</span>
                <h1 class="product-detail__title">${product.nome}</h1>
                <p class="product-detail__description">${product.descricao}</p>

                <a
                    class="btn btn--primary product-detail__cta"
                    href="/contato/?produto=${encodeURIComponent(product.nome)}"
                    aria-label="Tenho interesse no produto ${product.nome}"
                >
                    TENHO INTERESSE <span aria-hidden="true">→</span>
                </a>
            </div>
        </article>
    `;
});
