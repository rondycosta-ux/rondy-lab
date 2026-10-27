document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('vitrine-content');
    const slug = new URLSearchParams(location.search).get('slug') || location.pathname.split('/').filter(Boolean).pop();
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const state = (text) => { root.replaceChildren(); const section = document.createElement('section'); section.className = 'public-vitrine__state'; const title = document.createElement('h1'); title.textContent = 'Vitrine indisponível'; const message = document.createElement('p'); message.textContent = text; const link = document.createElement('a'); link.className = 'btn btn--primary'; link.href = '/catalogo/'; link.textContent = 'CONHEÇA O CATÁLOGO'; section.append(title, message, link); root.append(section); };
    async function start() {
        if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { state('Não encontramos esta vitrine.'); return; }
        try {
            const client = window.RondySupabase.getClient();
            const { data, error } = await client.rpc('consultar_vitrine_publica', { p_slug: slug });
            if (error) throw error;
            if (!data) { state('Esta vitrine não existe ou não está ativa.'); return; }
            render(data, client);
        } catch (_) { state('Não foi possível carregar esta vitrine agora. Tente novamente em instantes.'); }
    }
    async function render(vitrine, client) {
        root.replaceChildren(); const intro = document.createElement('section'); intro.className = 'public-vitrine__intro';
        const kicker = document.createElement('p'); kicker.className = 'page-kicker'; kicker.textContent = `SELEÇÃO PARA ${vitrine.cliente_nome}`;
        const title = document.createElement('h1'); title.className = 'page-title'; title.textContent = vitrine.nome;
        const description = document.createElement('p'); description.className = 'public-vitrine__description'; description.textContent = vitrine.descricao || 'Produtos selecionados pela Rondy Lab para você.';
        intro.append(kicker, title, description); const grid = document.createElement('section'); grid.className = 'public-vitrine__grid';
        for (const product of vitrine.produtos || []) {
            const card = document.createElement('article'); card.className = 'public-vitrine__product';
            const image = document.createElement('img'); image.className = 'public-vitrine__image'; image.alt = product.nome; image.loading = 'lazy';
            if (product.imagem_bucket_id && product.imagem_storage_path) { const { data } = await client.storage.from(product.imagem_bucket_id).createSignedUrl(product.imagem_storage_path, 3600); if (data?.signedUrl) image.src = data.signedUrl; else image.classList.add('is-missing'); } else image.classList.add('is-missing');
            const body = document.createElement('div'); body.className = 'public-vitrine__product-body'; const name = document.createElement('h2'); name.textContent = product.nome; const text = document.createElement('p'); text.textContent = product.descricao || 'Produto Rondy Lab.'; const price = document.createElement('strong'); price.textContent = money.format(Number(product.preco || 0)); const contact = document.createElement('a'); contact.className = 'btn btn--primary'; contact.target = '_blank'; contact.rel = 'noopener noreferrer'; contact.href = `https://wa.me/5511954963077?text=${encodeURIComponent(`Olá! Vim pela vitrine ${vitrine.nome} e gostaria de saber mais sobre ${product.nome}.`)}`; contact.textContent = 'SOLICITAR INFORMAÇÕES'; body.append(name, text, price, contact); card.append(image, body); grid.append(card);
        }
        const catalog = document.createElement('a'); catalog.className = 'public-vitrine__catalog'; catalog.href = '/catalogo/'; catalog.textContent = 'CONHEÇA O CATÁLOGO COMPLETO →'; root.append(intro, grid, catalog);
    }
    start();
});
