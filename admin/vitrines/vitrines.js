document.addEventListener('DOMContentLoaded', async () => {
    'use strict';
    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;
    const client = window.RondySupabase.getClient();
    const form = document.getElementById('vitrine-form');
    const panel = document.getElementById('vitrine-form-panel');
    const name = document.getElementById('vitrine-nome');
    const slug = document.getElementById('vitrine-slug');
    const search = document.getElementById('vitrine-product-search');
    const selectedBox = document.getElementById('vitrine-selected-products');
    const optionsBox = document.getElementById('vitrine-product-options');
    const formMessage = document.getElementById('vitrine-form-message');
    const listMessage = document.getElementById('vitrine-list-message');
    const list = document.getElementById('vitrine-list');
    const header = document.querySelector('.admin-header');
    const newButton = document.createElement('button');
    newButton.type = 'button'; newButton.className = 'admin-button admin-button--primary admin-button--header'; newButton.textContent = 'NOVA VITRINE'; newButton.disabled = true; header.append(newButton);
    let userId, products = [], vitrines = [], selectedIds = [], editingId = null, slugEdited = false, busy = false;
    const errorText = (error) => error?.message || 'Ocorreu um erro inesperado.';
    const slugify = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
    const notice = (target, text, error = false) => { target.textContent = text; target.classList.toggle('is-error', error); };
    async function checkUser() {
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user || data.user.is_anonymous || (userId && userId !== data.user.id)) throw new Error('Sua sessão mudou. Recarregue a página.');
        userId = data.user.id;
    }
    function setBusy(value) { busy = value; form.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = value; }); newButton.disabled = value || !products.length; }
    function renderProducts() {
        const chosen = document.createDocumentFragment();
        selectedIds.forEach((id, index) => {
            const product = products.find((item) => item.id === id); if (!product) return;
            const row = document.createElement('div'); row.className = 'vitrine-selected-product';
            const label = document.createElement('span'); label.textContent = `${index + 1}. ${product.nome}`;
            const actions = document.createElement('div'); actions.className = 'vitrine-selected-product__actions';
            [['↑', index === 0, () => { [selectedIds[index - 1], selectedIds[index]] = [selectedIds[index], selectedIds[index - 1]]; renderProducts(); }], ['↓', index === selectedIds.length - 1, () => { [selectedIds[index + 1], selectedIds[index]] = [selectedIds[index], selectedIds[index + 1]]; renderProducts(); }], ['REMOVER', false, () => { selectedIds.splice(index, 1); renderProducts(); }]].forEach(([text, disabled, action]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.disabled = disabled; button.addEventListener('click', action); actions.append(button); });
            row.append(label, actions); chosen.append(row);
        });
        if (!selectedIds.length) { const empty = document.createElement('p'); empty.className = 'vitrine-products__empty'; empty.textContent = 'Nenhum produto selecionado.'; chosen.append(empty); }
        selectedBox.replaceChildren(chosen);
        const available = document.createDocumentFragment(); const query = search.value.trim().toLocaleLowerCase('pt-BR');
        products.filter((p) => !selectedIds.includes(p.id) && (!query || p.nome.toLocaleLowerCase('pt-BR').includes(query))).forEach((product) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'vitrine-product-option'; button.textContent = product.nome; button.addEventListener('click', () => { selectedIds.push(product.id); renderProducts(); }); available.append(button); });
        if (!available.childNodes.length) { const empty = document.createElement('p'); empty.className = 'vitrine-products__empty'; empty.textContent = 'Nenhum produto disponível.'; available.append(empty); }
        optionsBox.replaceChildren(available);
    }
    function reset() { form.reset(); editingId = null; selectedIds = []; slugEdited = false; document.getElementById('vitrine-form-title').textContent = 'NOVA VITRINE'; document.getElementById('vitrine-salvar').textContent = 'SALVAR VITRINE'; notice(formMessage, 'Preencha os dados e selecione ao menos um produto.'); renderProducts(); }
    function close() { if (!busy) { panel.classList.add('is-hidden'); reset(); } }
    function openNew() { if (!busy && products.length) { reset(); panel.classList.remove('is-hidden'); name.focus(); } }
    async function load() {
        await checkUser();
        const { data: productRows, error: productError } = await client.from('produtos').select('id,nome').eq('user_id', userId).eq('arquivado', false).order('nome'); if (productError) throw productError; products = productRows || [];
        const { data: rows, error } = await client.from('vitrines').select('id,nome,descricao,cliente_nome,slug,ativa,criado_em').eq('user_id', userId).order('criado_em', { ascending: false }); if (error) throw error;
        const ids = (rows || []).map((row) => row.id); let links = [];
        if (ids.length) { const result = await client.from('vitrine_produtos').select('vitrine_id,produto_id,ordem').in('vitrine_id', ids).order('ordem'); if (result.error) throw result.error; links = result.data || []; }
        vitrines = (rows || []).map((row) => ({ ...row, productIds: links.filter((link) => link.vitrine_id === row.id).sort((a, b) => a.ordem - b.ordem).map((link) => link.produto_id) }));
        renderList(); newButton.disabled = !products.length; notice(listMessage, `${vitrines.length} vitrine(s) cadastrada(s).`);
    }
    function renderList() {
        const fragment = document.createDocumentFragment();
        vitrines.forEach((v) => { const card = document.createElement('article'); card.className = 'vitrine-card'; const title = document.createElement('h3'); title.textContent = v.nome; const meta = document.createElement('p'); meta.textContent = `${v.cliente_nome} · ${v.productIds.length} produto(s) · /v/${v.slug}`; const status = document.createElement('span'); status.className = `vitrine-status${v.ativa ? ' is-active' : ''}`; status.textContent = v.ativa ? 'ATIVA' : 'INATIVA'; const actions = document.createElement('div'); actions.className = 'vitrine-card__actions'; [['COPIAR LINK', () => copy(v.slug)], ['EDITAR', () => edit(v)], [v.ativa ? 'DESATIVAR' : 'ATIVAR', () => toggle(v)], ['EXCLUIR', () => remove(v)]].forEach(([text, action]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.addEventListener('click', action); actions.append(b); }); card.append(title, status, meta, actions); fragment.append(card); });
        if (!vitrines.length) { const empty = document.createElement('p'); empty.className = 'vitrine-list__empty'; empty.textContent = 'Nenhuma vitrine cadastrada.'; fragment.append(empty); } list.replaceChildren(fragment);
    }
    function edit(v) { if (busy) return; editingId = v.id; selectedIds = v.productIds.filter((id) => products.some((p) => p.id === id)); slugEdited = true; form.elements.nome.value = v.nome; form.elements.cliente.value = v.cliente_nome; form.elements.descricao.value = v.descricao; form.elements.slug.value = v.slug; form.elements.ativa.checked = v.ativa; document.getElementById('vitrine-form-title').textContent = 'EDITAR VITRINE'; document.getElementById('vitrine-salvar').textContent = 'SALVAR ALTERAÇÕES'; notice(formMessage, 'Edite os dados, produtos ou ordem de exibição.'); panel.classList.remove('is-hidden'); renderProducts(); name.focus(); }
    async function copy(value) { const url = `${location.origin}/v/${value}`; try { await navigator.clipboard.writeText(url); notice(listMessage, 'Link copiado.'); } catch { window.prompt('Copie o link:', url); } }
    async function toggle(v) { try { await checkUser(); const { error } = await client.from('vitrines').update({ ativa: !v.ativa }).eq('id', v.id).eq('user_id', userId); if (error) throw error; await load(); notice(listMessage, `Vitrine ${v.ativa ? 'desativada' : 'ativada'} com sucesso.`); } catch (error) { notice(listMessage, `Não foi possível alterar. ${errorText(error)}`, true); } }
    async function remove(v) { if (!confirm(`Excluir a vitrine “${v.nome}”? Esta ação não pode ser desfeita.`)) return; try { await checkUser(); const { error } = await client.from('vitrines').delete().eq('id', v.id).eq('user_id', userId); if (error) throw error; if (editingId === v.id) close(); await load(); notice(listMessage, 'Vitrine excluída com sucesso.'); } catch (error) { notice(listMessage, `Não foi possível excluir. ${errorText(error)}`, true); } }
    form.addEventListener('submit', async (event) => { event.preventDefault(); const safeSlug = slugify(slug.value); if (busy || !form.reportValidity()) return; if (!selectedIds.length || safeSlug.length < 3) { notice(formMessage, !selectedIds.length ? 'Selecione ao menos um produto.' : 'Informe um slug válido.', true); return; } setBusy(true); try { await checkUser(); const data = { nome: name.value.trim(), cliente_nome: form.elements.cliente.value.trim(), descricao: form.elements.descricao.value.trim(), slug: safeSlug, ativa: form.elements.ativa.checked }; let id = editingId; if (id) { const { error } = await client.from('vitrines').update(data).eq('id', id).eq('user_id', userId); if (error) throw error; } else { const result = await client.from('vitrines').insert({ ...data, user_id: userId }).select('id').single(); if (result.error) throw result.error; id = result.data.id; } const deleted = await client.from('vitrine_produtos').delete().eq('vitrine_id', id); if (deleted.error) throw deleted.error; const inserted = await client.from('vitrine_produtos').insert(selectedIds.map((produto_id, ordem) => ({ vitrine_id: id, produto_id, ordem }))); if (inserted.error) throw inserted.error; await load(); panel.classList.add('is-hidden'); reset(); notice(listMessage, 'Vitrine salva com sucesso.'); } catch (error) { notice(formMessage, `Não foi possível salvar. ${errorText(error)}`, true); } finally { setBusy(false); } });
    name.addEventListener('input', () => { if (!slugEdited) slug.value = slugify(name.value); }); slug.addEventListener('input', () => { slug.value = slugify(slug.value); slugEdited = true; }); search.addEventListener('input', renderProducts); newButton.addEventListener('click', openNew); document.getElementById('vitrine-cancelar').addEventListener('click', close);
    try { await load(); reset(); } catch (error) { notice(listMessage, `Não foi possível carregar. ${errorText(error)}`, true); }
});
