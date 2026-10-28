document.addEventListener('DOMContentLoaded', async () => {
    'use strict';
    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;
    const client = window.RondySupabase.getClient();
    const body = document.getElementById('estoque-lista'), history = document.getElementById('estoque-historico'), msg = document.getElementById('estoque-mensagem');
    const form = document.getElementById('estoque-form'), panel = document.getElementById('estoque-form-panel'), formMsg = document.getElementById('estoque-form-mensagem');
    let userId, rows = [], filter = 'todos', target = null;
    const notice = (node, text, error = false) => { node.textContent = text; node.classList.toggle('is-error', error); };
    const errorText = (e) => e?.message || 'Ocorreu um erro inesperado.';
    async function user() { const { data, error } = await client.auth.getUser(); if (error || !data?.user || data.user.is_anonymous || (userId && userId !== data.user.id)) throw new Error('Sua sessão mudou. Recarregue a página.'); userId = data.user.id; }
    const cell = (tr, text) => { const td = document.createElement('td'); td.textContent = text; tr.append(td); return td; };
    async function load() {
        await user(); notice(msg, 'Carregando estoque…');
        const [products, variations, movements] = await Promise.all([
            client.from('produtos').select('id,nome').eq('user_id', userId),
            client.from('produto_variacoes').select('id,produto_id,nome,modelo,sku,cor,tamanho,variacao_padrao,estoque_atual,estoque_minimo,arquivado').eq('user_id', userId),
            client.from('produto_movimentacoes').select('variacao_id,movimentado_em,tipo,quantidade,observacao').eq('user_id', userId).order('movimentado_em', { ascending: false }).limit(100)
        ]);
        if (products.error || variations.error || movements.error) throw products.error || variations.error || movements.error;
        const names = new Map((products.data || []).map((p) => [p.id, p.nome]));
        rows = (variations.data || []).map((v) => ({ ...v, produto: names.get(v.produto_id) || 'Produto indisponível' }));
        render(); renderHistory(movements.data || []); notice(msg, `${rows.length} variação(ões) carregada(s).`);
    }
    function isLow(v) { return v.estoque_atual > 0 && v.estoque_minimo > 0 && v.estoque_atual <= v.estoque_minimo; }
    function render() {
        const stockRows = rows.filter((v) => !v.arquivado); const total = stockRows.reduce((sum, v) => sum + v.estoque_atual, 0); document.getElementById('estoque-total').textContent = total; document.getElementById('estoque-zerado').textContent = stockRows.filter((v) => v.estoque_atual === 0).length; document.getElementById('estoque-baixo').textContent = stockRows.filter(isLow).length;
        const query = document.getElementById('estoque-busca').value.trim().toLocaleLowerCase('pt-BR'); const fragment = document.createDocumentFragment();
        stockRows.filter((v) => { const text = `${v.produto} ${v.nome || ''} ${v.modelo || ''} ${v.sku || ''}`.toLocaleLowerCase('pt-BR'); return (!query || text.includes(query)) && (filter === 'todos' || (filter === 'com-estoque' && v.estoque_atual > 0) || (filter === 'zerados' && v.estoque_atual === 0) || (filter === 'baixo' && isLow(v))); }).forEach((v) => {
            const tr = document.createElement('tr'); cell(tr, v.produto); cell(tr, v.variacao_padrao ? 'Padrão' : (v.nome || [v.cor, v.tamanho].filter(Boolean).join(' / ') || '—')); cell(tr, [v.modelo, v.sku].filter(Boolean).join(' / ') || '—'); cell(tr, String(v.estoque_atual)); cell(tr, String(v.estoque_minimo)); const actions = cell(tr, '');
            const min = document.createElement('button'); min.type = 'button'; min.textContent = 'MÍNIMO'; min.addEventListener('click', () => setMinimum(v)); const move = document.createElement('button'); move.type = 'button'; move.textContent = 'MOVIMENTAR'; move.disabled = v.arquivado; move.addEventListener('click', () => openMove(v)); actions.append(min, move); fragment.append(tr);
        });
        if (!fragment.childNodes.length) { const tr = document.createElement('tr'); const td = cell(tr, 'Nenhuma variação encontrada.'); td.colSpan = 6; fragment.append(tr); } body.replaceChildren(fragment);
    }
    function renderHistory(movements) { const byId = new Map(rows.map((r) => [r.id, r])); const fragment = document.createDocumentFragment(); movements.forEach((m) => { const v = byId.get(m.variacao_id); const tr = document.createElement('tr'); cell(tr, new Date(m.movimentado_em).toLocaleString('pt-BR')); cell(tr, v?.produto || 'Produto indisponível'); cell(tr, v?.variacao_padrao ? 'Padrão' : (v?.nome || v?.sku || '—')); cell(tr, m.tipo === 'SAIDA' ? 'SAÍDA' : m.tipo); cell(tr, String(m.quantidade)); cell(tr, m.observacao || '—'); fragment.append(tr); }); if (!fragment.childNodes.length) { const tr = document.createElement('tr'); const td = cell(tr, 'Nenhuma movimentação registrada.'); td.colSpan = 6; fragment.append(tr); } history.replaceChildren(fragment); }
    async function setMinimum(v) { const raw = window.prompt(`Estoque mínimo para ${v.produto}:`, String(v.estoque_minimo)); if (raw === null) return; const value = Number(raw); if (!Number.isInteger(value) || value < 0) { notice(msg, 'Informe um estoque mínimo inteiro e não negativo.', true); return; } try { await user(); const { error } = await client.from('produto_variacoes').update({ estoque_minimo: value }).eq('id', v.id).eq('user_id', userId); if (error) throw error; await load(); notice(msg, 'Estoque mínimo atualizado.'); } catch (e) { notice(msg, `Não foi possível atualizar o mínimo. ${errorText(e)}`, true); } }
    function openMove(v) { target = v; form.reset(); document.getElementById('estoque-variacao').textContent = `${v.produto} — saldo atual: ${v.estoque_atual}`; notice(formMsg, 'Registre uma entrada, saída ou ajuste.'); panel.classList.remove('is-hidden'); }
    form.addEventListener('submit', async (event) => { event.preventDefault(); if (!target || !form.reportValidity()) return; const quantity = Number(form.elements.quantidade.value); const type = form.elements.tipo.value; if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'AJUSTE' && quantity === 0)) { notice(formMsg, 'Informe uma quantidade inteira válida.', true); return; } try { const { data, error } = await client.rpc('registrar_movimentacao_produto', { p_id: crypto.randomUUID(), p_variacao_id: target.id, p_tipo: type, p_quantidade: quantity, p_observacao: form.elements.observacao.value.trim() }); if (error || !data) throw error || new Error('Movimentação não confirmada.'); panel.classList.add('is-hidden'); await load(); notice(msg, 'Movimentação registrada com sucesso.'); } catch (e) { notice(formMsg, `Não foi possível registrar. ${errorText(e)}`, true); } });
    document.getElementById('estoque-cancelar').addEventListener('click', () => panel.classList.add('is-hidden')); document.getElementById('estoque-busca').addEventListener('input', render); document.getElementById('estoque-filtros').addEventListener('click', (e) => { const b = e.target.closest('button[data-filter]'); if (!b) return; filter = b.dataset.filter; document.querySelectorAll('#estoque-filtros button').forEach((x) => x.classList.toggle('is-active', x === b)); render(); });
    try { await load(); } catch (e) { notice(msg, `Não foi possível carregar o estoque. ${errorText(e)}`, true); }
});
