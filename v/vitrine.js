document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('vitrine-content');
    const slug = new URLSearchParams(location.search).get('slug') || location.pathname.split('/').filter(Boolean).pop();
    const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    const state = (text) => { root.replaceChildren(); const section = document.createElement('section'); section.className = 'public-vitrine__state'; const title = document.createElement('h1'); title.textContent = 'Vitrine indisponível'; const message = document.createElement('p'); message.textContent = text; const link = document.createElement('a'); link.className = 'btn btn--primary'; link.href = '/catalogo/'; link.textContent = 'CONHEÇA O CATÁLOGO'; section.append(title, message, link); root.append(section); };

    function createLightbox() {
        const dialog = document.createElement('div'); dialog.className = 'vitrine-lightbox'; dialog.hidden = true; dialog.tabIndex = -1; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Galeria de imagens do produto');
        const close = document.createElement('button'); close.type = 'button'; close.className = 'vitrine-lightbox__close'; close.textContent = 'Fechar';
        const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'vitrine-lightbox__nav vitrine-lightbox__nav--previous'; previous.setAttribute('aria-label', 'Imagem anterior'); previous.textContent = '←';
        const next = document.createElement('button'); next.type = 'button'; next.className = 'vitrine-lightbox__nav vitrine-lightbox__nav--next'; next.setAttribute('aria-label', 'Próxima imagem'); next.textContent = '→';
        const image = document.createElement('img'); image.className = 'vitrine-lightbox__image'; const counter = document.createElement('p'); counter.className = 'vitrine-lightbox__counter'; dialog.append(close, previous, image, next, counter); document.body.append(dialog);
        let images = [], index = 0, opener = null, touchStartX = null;
        const render = () => { image.src = images[index]?.url || ''; image.alt = images[index]?.alt || ''; counter.textContent = `${index + 1} de ${images.length}`; const multiple = images.length > 1; previous.hidden = !multiple; next.hidden = !multiple; counter.hidden = !multiple; };
        const move = (step) => { index = (index + step + images.length) % images.length; render(); };
        const closeDialog = () => { dialog.hidden = true; document.body.classList.remove('has-vitrine-lightbox'); opener?.focus(); };
        const open = (gallery, startIndex, trigger) => { images = gallery; index = startIndex; opener = trigger; render(); dialog.hidden = false; document.body.classList.add('has-vitrine-lightbox'); close.focus(); };
        close.addEventListener('click', closeDialog); previous.addEventListener('click', () => move(-1)); next.addEventListener('click', () => move(1));
        dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(); });
        dialog.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeDialog();
            if (images.length > 1 && event.key === 'ArrowLeft') move(-1);
            if (images.length > 1 && event.key === 'ArrowRight') move(1);
            if (event.key === 'Tab') {
                const focusable = [close, previous, next].filter((control) => !control.hidden);
                const current = focusable.indexOf(document.activeElement);
                const nextIndex = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current === focusable.length - 1 ? 0 : current + 1);
                event.preventDefault(); focusable[nextIndex].focus();
            }
        });
        dialog.addEventListener('touchstart', (event) => { touchStartX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
        dialog.addEventListener('touchend', (event) => { const endX = event.changedTouches[0]?.clientX; if (touchStartX !== null && Number.isFinite(endX) && Math.abs(endX - touchStartX) > 45 && images.length > 1) move(endX < touchStartX ? 1 : -1); touchStartX = null; }, { passive: true });
        return { open };
    }

    async function signedGallery(client, product) {
        const images = Array.isArray(product.imagens) ? product.imagens : [];
        const signed = await Promise.all(images.map(async (item) => { if (!item?.bucket_id || !item?.storage_path) return null; const { data } = await client.storage.from(item.bucket_id).createSignedUrl(item.storage_path, 900); return data?.signedUrl ? { url: data.signedUrl, alt: product.nome } : null; }));
        return signed.filter(Boolean);
    }

    async function start() {
        if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { state('Não encontramos esta vitrine.'); return; }
        try { const client = window.RondySupabase.getClient(); const { data, error } = await client.rpc('consultar_vitrine_publica', { p_slug: slug }); if (error) throw error; if (!data) { state('Esta vitrine não existe ou não está ativa.'); return; } render(data, client); } catch (_) { state('Não foi possível carregar esta vitrine agora. Tente novamente em instantes.'); }
    }

    async function render(vitrine, client) {
        root.replaceChildren(); const lightbox = createLightbox(); const intro = document.createElement('section'); intro.className = 'public-vitrine__intro';
        const kicker = document.createElement('p'); kicker.className = 'page-kicker'; kicker.textContent = `SELEÇÃO PARA ${vitrine.cliente_nome}`; const title = document.createElement('h1'); title.className = 'page-title'; title.textContent = vitrine.nome; const description = document.createElement('p'); description.className = 'public-vitrine__description'; description.textContent = vitrine.descricao || 'Produtos selecionados pela FazLab para você.'; intro.append(kicker, title, description);
        const grid = document.createElement('section'); grid.className = 'public-vitrine__grid';
        for (const product of vitrine.produtos || []) {
            const card = document.createElement('article'); card.className = 'public-vitrine__product'; const gallery = await signedGallery(client, product);
            if (gallery.length) { const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'public-vitrine__image-trigger'; trigger.setAttribute('aria-label', `Ampliar imagens de ${product.nome}`); const image = document.createElement('img'); image.className = 'public-vitrine__image'; image.src = gallery[0].url; image.alt = product.nome; image.loading = 'lazy'; trigger.append(image); trigger.addEventListener('click', () => lightbox.open(gallery, 0, trigger)); card.append(trigger); } else { const image = document.createElement('img'); image.className = 'public-vitrine__image is-missing'; image.alt = `Imagem indisponível para ${product.nome}`; card.append(image); }
            const body = document.createElement('div'); body.className = 'public-vitrine__product-body'; const name = document.createElement('h2'); name.textContent = product.nome; const text = document.createElement('p'); text.textContent = product.descricao || 'Produto FazLab.'; const price = document.createElement('strong'); price.textContent = money.format(Number(product.preco || 0)); const contact = document.createElement('a'); contact.className = 'btn btn--primary'; contact.target = '_blank'; contact.rel = 'noopener noreferrer'; contact.href = `https://wa.me/5511954963077?text=${encodeURIComponent(`Olá! Vim pela vitrine ${vitrine.nome} e gostaria de saber mais sobre ${product.nome}.`)}`; contact.textContent = 'SOLICITAR INFORMAÇÕES'; body.append(name, text, price, contact); card.append(body); grid.append(card);
        }
        const catalog = document.createElement('a'); catalog.className = 'public-vitrine__catalog'; catalog.href = '/catalogo/'; catalog.textContent = 'CONHEÇA O CATÁLOGO COMPLETO →'; root.append(intro, grid, catalog);
    }
    start();
});
