document.addEventListener('DOMContentLoaded', async () => {
    'use strict';
    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;

    const client = window.RondySupabase.getClient();
    const $ = (id) => document.getElementById(id);
    const form = $('consignacao-form'), panel = $('consignacao-form-panel'), list = $('consignacao-lista');
    const message = $('consignacao-mensagem'), formMessage = $('consignacao-form-message');
    const movementForm = $('consignacao-movimento-form'), movementMessage = $('consignacao-movimento-mensagem');
    const establishmentSelect = $('consignacao-movimento-estabelecimento'), productSelect = $('consignacao-movimento-produto'), variationSelect = $('consignacao-movimento-variacao'), movementSubmit = $('consignacao-movimento-enviar');
    const balancesBody = $('consignacao-saldos'), historyBody = $('consignacao-historico');
    const conferenceForm = $('consignacao-conferencia-form'), conferenceSelect = $('consignacao-conferencia-estabelecimento');
    const conferenceItemsBody = $('consignacao-conferencia-itens'), conferenceEmpty = $('consignacao-conferencia-vazia'), conferenceMessage = $('consignacao-conferencia-mensagem'), conferenceSubmit = $('consignacao-conferencia-confirmar');
    const conferencesBody = $('consignacao-conferencias'), conferenceDetails = $('consignacao-conferencia-detalhes'), conferenceDetailsBody = $('consignacao-conferencia-detalhes-itens');
    const closingForm = $('consignacao-fechamento-form'), closingSelect = $('consignacao-fechamento-estabelecimento'), closingAvailableBody = $('consignacao-fechamento-conferencias-disponiveis'), closingEmpty = $('consignacao-fechamento-vazio'), closingMessage = $('consignacao-fechamento-mensagem'), closingSubmit = $('consignacao-fechamento-criar');
    const closingsBody = $('consignacao-fechamentos'), closingDetails = $('consignacao-fechamento-detalhes'), closingLinks = $('consignacao-fechamento-conferencias-vinculadas');
    const paymentForm = $('consignacao-pagamento-form'), paymentMessage = $('consignacao-pagamento-mensagem'), paymentSubmit = $('consignacao-pagamento-registrar'), paymentsBody = $('consignacao-pagamentos');
    const portalPanel = $('portal-links-teste'), portalEstablishment = $('portal-links-estabelecimento'), portalStatus = $('portal-links-status'), portalDetails = $('portal-links-detalhes'), portalMessage = $('portal-links-mensagem'), portalResult = $('portal-links-resultado'), portalUrl = $('portal-links-url');
    let userId, establishments = [], products = [], variations = [], balances = [], movements = [], commissions = [], conferences = [], conferenceItems = [], closings = [], closingConferences = [], payments = [], editId = null, conferenceOperationId = null, closingOperationId = null, paymentOperationId = null, selectedClosingId = null;
    let portalLinksReady = false, portalRequestPending = false;

    const notice = (node, text, error = false) => { node.textContent = text; node.classList.toggle('is-error', error); };
    const errorText = (error) => error?.message || 'Ocorreu um erro inesperado.';
    const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';
    const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    const variationName = (variation) => !variation ? 'Variação indisponível' : variation.variacao_padrao ? 'Padrão' : variation.nome || [variation.cor, variation.tamanho].filter(Boolean).join(' / ') || variation.modelo || variation.sku || '—';
    const cell = (row, text) => { const td = document.createElement('td'); td.textContent = text; row.append(td); return td; };
    const addOption = (select, value, label) => { const item = document.createElement('option'); item.value = value; item.textContent = label; select.append(item); };
    const today = () => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    };
    const valueNumber = (input) => Number(input.value);

    async function verifyAdmin() {
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user || data.user.is_anonymous) throw new Error('Sessão indisponível.');
        userId = data.user.id;
        const role = await client.from('user_roles').select('role').eq('user_id', userId).maybeSingle();
        if (role.error || role.data?.role !== 'admin') throw new Error('Acesso restrito a administradores.');
    }

    function maps() {
        return {
            variation: new Map(variations.map((item) => [item.id, item])),
            product: new Map(products.map((item) => [item.id, item])),
            establishment: new Map(establishments.map((item) => [item.id, item])),
            commission: new Map(commissions.map((item) => [`${item.estabelecimento_id}:${item.variacao_id}`, Number(item.percentual)]))
        };
    }

    function renderEstablishments() {
        const query = $('consignacao-busca').value.trim().toLocaleLowerCase('pt-BR'), fragment = document.createDocumentFragment();
        const visible = establishments.filter((item) => item.nome.toLocaleLowerCase('pt-BR').includes(query));
        $('consignacao-ativos').textContent = establishments.filter((item) => item.ativo).length;
        visible.forEach((item) => {
            const card = document.createElement('article'); card.className = 'consignacao-card';
            const title = document.createElement('h2'); title.textContent = item.nome;
            const status = document.createElement('span'); status.textContent = item.ativo ? 'ATIVO' : 'INATIVO'; status.className = item.ativo ? 'is-active' : '';
            const details = document.createElement('p'); details.textContent = `${item.responsavel || 'Sem responsável'} · ${item.whatsapp || 'Sem WhatsApp'} · Comissão: ${Number(item.comissao_percentual).toLocaleString('pt-BR')}%`;
            const actions = document.createElement('div');
            [['EDITAR', () => openEstablishment(item)], [item.ativo ? 'DESATIVAR' : 'ATIVAR', () => toggleEstablishment(item)]].forEach(([label, handler]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', handler); actions.append(button); });
            card.append(title, status, details, actions); fragment.append(card);
        });
        if (!visible.length) { const empty = document.createElement('p'); empty.textContent = 'Nenhum estabelecimento encontrado.'; fragment.append(empty); }
        list.replaceChildren(fragment);
    }

    function renderVariations() {
        const previous = variationSelect.value;
        variationSelect.replaceChildren(); addOption(variationSelect, '', 'Selecione a variação');
        variations.filter((item) => !item.arquivado && item.produto_id === productSelect.value).forEach((item) => addOption(variationSelect, item.id, [variationName(item), item.modelo, item.sku].filter(Boolean).join(' · ')));
        if ([...variationSelect.options].some((item) => item.value === previous)) variationSelect.value = previous;
    }

    function renderMovementSelectors() {
        const selectedEstablishment = establishmentSelect.value, selectedProduct = productSelect.value;
        establishmentSelect.replaceChildren(); addOption(establishmentSelect, '', 'Selecione o estabelecimento');
        establishments.filter((item) => item.ativo).forEach((item) => addOption(establishmentSelect, item.id, item.nome));
        establishmentSelect.value = establishments.some((item) => item.ativo && item.id === selectedEstablishment) ? selectedEstablishment : '';
        productSelect.replaceChildren(); addOption(productSelect, '', 'Selecione o produto');
        products.filter((item) => !item.arquivado).forEach((item) => addOption(productSelect, item.id, item.nome));
        productSelect.value = products.some((item) => !item.arquivado && item.id === selectedProduct) ? selectedProduct : '';
        renderVariations();
        const ready = establishments.some((item) => item.ativo) && products.some((item) => !item.arquivado) && variations.some((item) => !item.arquivado);
        movementSubmit.disabled = !ready;
        if (!ready) notice(movementMessage, 'Cadastre um estabelecimento ativo e uma variação de produto ativa para movimentar.', true);
    }

    function renderBalances() {
        const { variation, product } = maps(), selected = establishmentSelect.value, fragment = document.createDocumentFragment();
        balances.filter((item) => !selected || item.estabelecimento_id === selected).forEach((item) => {
            const current = variation.get(item.variacao_id), row = document.createElement('tr');
            cell(row, product.get(current?.produto_id)?.nome || 'Produto indisponível'); cell(row, variationName(current)); cell(row, [current?.sku, current?.modelo].filter(Boolean).join(' / ') || '—'); cell(row, String(item.quantidade)); cell(row, formatDate(item.atualizado_em)); fragment.append(row);
        });
        if (!fragment.childNodes.length) { const row = document.createElement('tr'), empty = cell(row, selected ? 'Nenhum saldo registrado neste estabelecimento.' : 'Selecione um estabelecimento para consultar os saldos.'); empty.colSpan = 5; fragment.append(row); }
        balancesBody.replaceChildren(fragment);
    }

    function renderMovementHistory() {
        const { variation, product, establishment } = maps(), fragment = document.createDocumentFragment();
        movements.forEach((item) => {
            const current = variation.get(item.variacao_id), row = document.createElement('tr');
            cell(row, formatDate(item.movimentado_em)); cell(row, establishment.get(item.estabelecimento_id)?.nome || 'Estabelecimento indisponível'); cell(row, product.get(current?.produto_id)?.nome || 'Produto indisponível'); cell(row, variationName(current)); cell(row, item.tipo.replace('_', ' ')); cell(row, String(item.quantidade)); cell(row, `${item.saldo_anterior} → ${item.saldo_resultante}`); cell(row, item.observacao); fragment.append(row);
        });
        if (!fragment.childNodes.length) { const row = document.createElement('tr'), empty = cell(row, 'Nenhuma movimentação registrada.'); empty.colSpan = 8; fragment.append(row); }
        historyBody.replaceChildren(fragment);
    }

    function activeConferenceBalances() {
        return balances.filter((item) => item.estabelecimento_id === conferenceSelect.value && Number(item.quantidade) > 0);
    }

    function renderConferenceSelector() {
        const previous = conferenceSelect.value;
        conferenceSelect.replaceChildren(); addOption(conferenceSelect, '', 'Selecione o estabelecimento');
        establishments.filter((item) => item.ativo).forEach((item) => addOption(conferenceSelect, item.id, item.nome));
        conferenceSelect.value = establishments.some((item) => item.ativo && item.id === previous) ? previous : '';
    }

    function input(type, value, max, label) {
        const field = document.createElement('input'); field.type = type; field.value = String(value); field.min = '0'; field.step = type === 'number' && label === 'preco' ? '0.01' : '1'; field.dataset.field = label;
        if (max !== undefined) field.max = String(max);
        field.setAttribute('aria-label', label === 'preco' ? 'preço unitário' : label);
        return field;
    }

    function defaultPrice(balance) {
        const { variation, product } = maps(), current = variation.get(balance.variacao_id);
        return Number(current?.preco_unitario ?? product.get(current?.produto_id)?.preco_base ?? 0);
    }

    function renderConferenceItems() {
        const { variation, product } = maps(), fragment = document.createDocumentFragment(), items = activeConferenceBalances();
        conferenceDetails.classList.add('is-hidden');
        items.forEach((balance) => {
            const current = variation.get(balance.variacao_id), row = document.createElement('tr');
            row.dataset.variationId = balance.variacao_id; row.dataset.expected = String(balance.quantidade);
            cell(row, `${product.get(current?.produto_id)?.nome || 'Produto indisponível'} · ${variationName(current)}`);
            cell(row, String(balance.quantidade));
            const found = cell(row, ''); found.append(input('number', balance.quantidade, balance.quantidade, 'encontrada'));
            const difference = cell(row, '0'); difference.dataset.difference = '';
            ['vendida', 'perdida', 'quebrada', 'extraviada'].forEach((field) => { const target = cell(row, ''); target.append(input('number', 0, balance.quantidade, field)); });
            const price = cell(row, ''); price.append(input('number', defaultPrice(balance).toFixed(2), undefined, 'preco'));
            row.querySelectorAll('input').forEach((field) => field.addEventListener('input', updateConferenceSummary));
            fragment.append(row);
        });
        conferenceItemsBody.replaceChildren(fragment);
        conferenceEmpty.textContent = items.length ? 'Classifique integralmente qualquer diferença antes de confirmar.' : 'Selecione um estabelecimento com saldo consignado positivo.';
        conferenceEmpty.classList.toggle('is-error', !items.length);
        conferenceSubmit.disabled = !items.length;
        updateConferenceSummary();
    }

    function conferencePayload(validate = false) {
        const items = []; let valid = true;
        conferenceItemsBody.querySelectorAll('tr[data-variation-id]').forEach((row) => {
            const expected = Number(row.dataset.expected), fields = Object.fromEntries([...row.querySelectorAll('input')].map((field) => [field.dataset.field, valueNumber(field)]));
            const difference = expected - fields.encontrada, classified = fields.vendida + fields.perdida + fields.quebrada + fields.extraviada;
            const rowValid = Object.values(fields).every((value) => Number.isFinite(value) && value >= 0) && Number.isInteger(fields.encontrada) && Number.isInteger(fields.vendida) && Number.isInteger(fields.perdida) && Number.isInteger(fields.quebrada) && Number.isInteger(fields.extraviada) && fields.encontrada <= expected && classified === difference && fields.preco <= 9999999999.99 && Math.round(fields.preco * 100) === fields.preco * 100;
            row.classList.toggle('is-invalid', !rowValid); valid = valid && rowValid;
            items.push({ variacao_id: row.dataset.variationId, quantidade_encontrada: fields.encontrada, quantidade_vendida: fields.vendida, quantidade_perdida: fields.perdida, quantidade_quebrada: fields.quebrada, quantidade_extraviada: fields.extraviada, preco_unitario: fields.preco });
        });
        if (validate && (!items.length || !valid)) throw new Error('Classifique integralmente cada diferença e revise as quantidades e preços informados.');
        return { items, valid };
    }

    function updateConferenceSummary() {
        const { establishment, commission } = maps(); let sold = 0, gross = 0, fee = 0;
        conferenceItemsBody.querySelectorAll('tr[data-variation-id]').forEach((row) => {
            const expected = Number(row.dataset.expected), fields = Object.fromEntries([...row.querySelectorAll('input')].map((field) => [field.dataset.field, valueNumber(field)]));
            const difference = expected - fields.encontrada, classified = fields.vendida + fields.perdida + fields.quebrada + fields.extraviada;
            row.querySelector('[data-difference]').textContent = Number.isInteger(difference) && difference >= 0 ? `${difference} (${classified}/${difference})` : 'inválida';
            const price = Number.isFinite(fields.preco) ? fields.preco : 0, percent = commission.get(`${conferenceSelect.value}:${row.dataset.variationId}`) ?? Number(establishment.get(conferenceSelect.value)?.comissao_percentual || 0);
            sold += Number.isInteger(fields.vendida) && fields.vendida >= 0 ? fields.vendida : 0;
            gross += (Number.isInteger(fields.vendida) && fields.vendida >= 0 ? fields.vendida : 0) * price;
            fee += (Number.isInteger(fields.vendida) && fields.vendida >= 0 ? fields.vendida : 0) * price * percent / 100;
        });
        $('consignacao-conferencia-total-vendido').textContent = String(sold); $('consignacao-conferencia-total-bruto').textContent = formatMoney(gross); $('consignacao-conferencia-total-comissao').textContent = formatMoney(fee); $('consignacao-conferencia-total-liquido').textContent = formatMoney(gross - fee);
    }

    function renderConferences() {
        const { establishment, variation, product } = maps(), byConference = new Map();
        conferenceItems.forEach((item) => { const items = byConference.get(item.conferencia_id) || []; items.push(item); byConference.set(item.conferencia_id, items); });
        const fragment = document.createDocumentFragment();
        conferences.forEach((conference) => {
            const items = byConference.get(conference.id) || []; let sold = 0, gross = 0, fee = 0;
            items.forEach((item) => { sold += item.quantidade_vendida; gross += Number(item.quantidade_vendida) * Number(item.preco_unitario); fee += Number(item.quantidade_vendida) * Number(item.preco_unitario) * Number(item.comissao_percentual) / 100; });
            const row = document.createElement('tr'); cell(row, conference.data_visita.split('-').reverse().join('/')); cell(row, formatDate(conference.confirmada_em)); cell(row, establishment.get(conference.estabelecimento_id)?.nome || 'Estabelecimento indisponível'); cell(row, conference.id); cell(row, String(sold)); cell(row, formatMoney(gross)); cell(row, formatMoney(fee));
            const actions = cell(row, ''); const button = document.createElement('button'); button.type = 'button'; button.textContent = 'VER ITENS'; button.addEventListener('click', () => renderConferenceDetails(conference, items, variation, product)); actions.append(button); fragment.append(row);
        });
        if (!fragment.childNodes.length) { const row = document.createElement('tr'), empty = cell(row, 'Nenhuma conferência registrada.'); empty.colSpan = 8; fragment.append(row); }
        conferencesBody.replaceChildren(fragment);
    }

    function renderConferenceDetails(conference, items, variation, product) {
        const fragment = document.createDocumentFragment();
        items.forEach((item) => { const current = variation.get(item.variacao_id), row = document.createElement('tr'); cell(row, product.get(current?.produto_id)?.nome || 'Produto indisponível'); cell(row, variationName(current)); cell(row, String(item.saldo_anterior)); cell(row, String(item.quantidade_encontrada)); cell(row, String(item.quantidade_vendida)); cell(row, `${item.quantidade_perdida} / ${item.quantidade_quebrada} / ${item.quantidade_extraviada}`); cell(row, formatMoney(item.preco_unitario)); cell(row, `${Number(item.comissao_percentual).toLocaleString('pt-BR')}%`); fragment.append(row); });
        conferenceDetailsBody.replaceChildren(fragment); conferenceDetails.classList.remove('is-hidden'); conferenceDetails.querySelector('h3').textContent = `ITENS DA CONFERÊNCIA ${conference.id}`; conferenceDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function conferenceFinancialTotal(conferenceId) {
        const total = conferenceItems.filter((item) => item.conferencia_id === conferenceId).reduce((current, item) => {
            const gross = Number(item.quantidade_vendida) * Number(item.preco_unitario);
            const fee = gross * Number(item.comissao_percentual) / 100;
            current.bruto += gross; current.comissao += fee;
            return current;
        }, { bruto: 0, comissao: 0, liquido: 0 });
        total.bruto = roundMoney(total.bruto); total.comissao = roundMoney(total.comissao); total.liquido = roundMoney(total.bruto - total.comissao);
        return total;
    }

    function renderClosingSelector() {
        const previous = closingSelect.value;
        closingSelect.replaceChildren(); addOption(closingSelect, '', 'Selecione o estabelecimento');
        establishments.forEach((item) => addOption(closingSelect, item.id, item.nome));
        closingSelect.value = establishments.some((item) => item.id === previous) ? previous : '';
    }

    function availableConferences() {
        const linked = new Set(closingConferences.map((item) => item.conferencia_id));
        return conferences.filter((item) => item.estabelecimento_id === closingSelect.value && !linked.has(item.id));
    }

    function updateClosingPreview() {
        let bruto = 0, comissao = 0, liquido = 0;
        closingAvailableBody.querySelectorAll('input[type="checkbox"]:checked').forEach((checkbox) => {
            const total = conferenceFinancialTotal(checkbox.value); bruto = roundMoney(bruto + total.bruto); comissao = roundMoney(comissao + total.comissao); liquido = roundMoney(liquido + total.liquido);
        });
        $('consignacao-fechamento-bruto').textContent = formatMoney(bruto);
        $('consignacao-fechamento-comissao').textContent = formatMoney(comissao);
        $('consignacao-fechamento-liquido').textContent = formatMoney(liquido);
        closingSubmit.disabled = !closingAvailableBody.querySelector('input[type="checkbox"]:checked');
    }

    function renderAvailableConferences() {
        const fragment = document.createDocumentFragment(), available = availableConferences();
        available.forEach((conference) => {
            const total = conferenceFinancialTotal(conference.id), row = document.createElement('tr');
            const check = document.createElement('input'); check.type = 'checkbox'; check.value = conference.id; check.setAttribute('aria-label', `Selecionar conferência ${conference.id}`); check.addEventListener('change', updateClosingPreview);
            cell(row, '').append(check); cell(row, conference.data_visita.split('-').reverse().join('/')); cell(row, formatDate(conference.confirmada_em)); cell(row, conference.id); cell(row, formatMoney(total.bruto)); cell(row, formatMoney(total.comissao)); cell(row, formatMoney(total.liquido)); fragment.append(row);
        });
        closingAvailableBody.replaceChildren(fragment);
        closingEmpty.textContent = available.length ? 'Selecione uma ou mais conferências para o fechamento.' : (closingSelect.value ? 'Não há conferências pendentes de fechamento neste estabelecimento.' : 'Selecione um estabelecimento para ver conferências sem fechamento.');
        closingEmpty.classList.toggle('is-error', Boolean(closingSelect.value) && !available.length);
        updateClosingPreview();
    }

    function renderFinancialSummary() {
        const selected = closingSelect.value;
        const rows = closings.filter((item) => !selected || item.estabelecimento_id === selected);
        $('consignacao-financeiro-devido').textContent = formatMoney(rows.reduce((total, item) => total + Number(item.valor_liquido), 0));
        $('consignacao-financeiro-recebido').textContent = formatMoney(rows.reduce((total, item) => total + Number(item.total_pago), 0));
        $('consignacao-financeiro-pendente').textContent = formatMoney(rows.reduce((total, item) => total + Number(item.saldo_pendente), 0));
    }

    function renderClosings() {
        const selected = closingSelect.value, fragment = document.createDocumentFragment();
        closings.filter((item) => !selected || item.estabelecimento_id === selected).forEach((closing) => {
            const row = document.createElement('tr');
            cell(row, closing.id); cell(row, formatDate(closing.criado_em)); cell(row, formatMoney(closing.valor_bruto)); cell(row, formatMoney(closing.valor_comissao)); cell(row, formatMoney(closing.valor_liquido)); cell(row, formatMoney(closing.total_pago)); cell(row, formatMoney(closing.saldo_pendente)); cell(row, closing.status);
            const actions = cell(row, ''); const button = document.createElement('button'); button.type = 'button'; button.textContent = 'DETALHES'; button.addEventListener('click', () => openClosingDetails(closing.id)); actions.append(button); fragment.append(row);
        });
        if (!fragment.childNodes.length) { const row = document.createElement('tr'), empty = cell(row, selected ? 'Nenhum fechamento neste estabelecimento.' : 'Selecione um estabelecimento para consultar os fechamentos.'); empty.colSpan = 9; fragment.append(row); }
        closingsBody.replaceChildren(fragment); renderFinancialSummary();
    }

    function openClosingDetails(closingId) {
        selectedClosingId = closingId; paymentOperationId = crypto.randomUUID();
        const closing = closings.find((item) => item.id === closingId), linked = closingConferences.filter((item) => item.fechamento_id === closingId);
        const links = document.createDocumentFragment();
        linked.forEach((item) => { const conference = conferences.find((current) => current.id === item.conferencia_id), line = document.createElement('p'); line.textContent = `${conference?.data_visita?.split('-').reverse().join('/') || 'Data indisponível'} · ${item.conferencia_id} · ${formatMoney(item.valor_liquido)}`; links.append(line); });
        closingLinks.replaceChildren(links);
        const history = document.createDocumentFragment();
        payments.filter((item) => item.fechamento_id === closingId).forEach((item) => { const row = document.createElement('tr'); cell(row, item.data_pagamento.split('-').reverse().join('/')); cell(row, formatDate(item.registrado_em)); cell(row, formatMoney(item.valor)); cell(row, item.forma_pagamento); cell(row, item.observacao); history.append(row); });
        if (!history.childNodes.length) { const row = document.createElement('tr'), empty = cell(row, 'Nenhum pagamento registrado.'); empty.colSpan = 5; history.append(row); }
        paymentsBody.replaceChildren(history); paymentForm.reset(); paymentForm.elements.dataPagamento.value = today(); paymentForm.elements.dataPagamento.max = today(); paymentForm.elements.valor.max = String(closing.saldo_pendente); paymentSubmit.disabled = closing.status === 'PAGO' || Number(closing.saldo_pendente) === 0; notice(paymentMessage, paymentSubmit.disabled ? 'Este fechamento está totalmente pago.' : `Saldo pendente: ${formatMoney(closing.saldo_pendente)}.`);
        closingDetails.classList.remove('is-hidden'); closingDetails.querySelector('h3').textContent = `DETALHES DO FECHAMENTO ${closing.id}`; closingDetails.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function load(messageText = '') {
        await verifyAdmin();
        const results = await Promise.all([
            client.from('estabelecimentos').select('id,nome,responsavel,whatsapp,comissao_percentual,ativo,criado_em').eq('user_id', userId).order('criado_em', { ascending: false }),
            client.from('produtos').select('id,nome,preco_base,arquivado').eq('user_id', userId).order('nome'),
            client.from('produto_variacoes').select('id,produto_id,nome,modelo,sku,cor,tamanho,variacao_padrao,preco_unitario,arquivado').eq('user_id', userId).order('criado_em'),
            client.from('consignacao_saldos').select('estabelecimento_id,variacao_id,quantidade,atualizado_em'),
            client.from('consignacao_movimentacoes').select('estabelecimento_id,variacao_id,tipo,quantidade,saldo_anterior,saldo_resultante,observacao,movimentado_em').eq('user_id', userId).order('movimentado_em', { ascending: false }).limit(100),
            client.from('estabelecimento_comissoes').select('estabelecimento_id,variacao_id,percentual'),
            client.from('consignacao_conferencias').select('id,estabelecimento_id,data_visita,observacao,confirmada_em').eq('user_id', userId).order('confirmada_em', { ascending: false }).limit(100),
            client.from('consignacao_conferencia_itens').select('conferencia_id,variacao_id,saldo_anterior,quantidade_encontrada,quantidade_vendida,quantidade_perdida,quantidade_quebrada,quantidade_extraviada,saldo_resultante,preco_unitario,comissao_percentual'),
            client.from('consignacao_fechamentos').select('id,estabelecimento_id,valor_bruto,valor_comissao,valor_liquido,total_pago,saldo_pendente,status,criado_em').eq('user_id', userId).order('criado_em', { ascending: false }),
            client.from('consignacao_fechamento_conferencias').select('fechamento_id,conferencia_id,valor_bruto,valor_comissao,valor_liquido'),
            client.from('consignacao_pagamentos').select('id,fechamento_id,data_pagamento,valor,forma_pagamento,observacao,registrado_em').eq('user_id', userId).order('registrado_em', { ascending: false })
        ]);
        const failed = results.find((result) => result.error); if (failed) throw failed.error;
        [establishments, products, variations, balances, movements, commissions, conferences, conferenceItems, closings, closingConferences, payments] = results.map((result) => result.data || []);
        renderEstablishments(); renderMovementSelectors(); renderBalances(); renderMovementHistory(); renderConferenceSelector(); renderConferenceItems(); renderConferences(); renderClosingSelector(); renderAvailableConferences(); renderClosings(); renderPortalEstablishments(); notice(message, messageText || `${establishments.length} estabelecimento(s) cadastrado(s).`);
    }

    function formatPortalDate(value) {
        return value ? new Date(value).toLocaleString('pt-BR') : '—';
    }

    function setPortalMessage(text, error = false) {
        notice(portalMessage, text, error);
        portalMessage.setAttribute('role', error ? 'alert' : 'status');
    }

    function hideGeneratedPortalLink() {
        portalUrl.value = '';
        portalResult.classList.add('is-hidden');
    }

    function renderPortalEstablishments() {
        const selected = portalEstablishment.value;
        portalEstablishment.replaceChildren();
        addOption(portalEstablishment, '', 'Selecione o estabelecimento');
        establishments.forEach((item) => addOption(portalEstablishment, item.id, item.ativo ? item.nome : `${item.nome} (inativo)`));
        portalEstablishment.value = establishments.some((item) => item.id === selected) ? selected : '';
        if (!portalEstablishment.value) {
            portalStatus.textContent = establishments.length ? 'Selecione um estabelecimento.' : 'Nenhum estabelecimento cadastrado.';
            portalDetails.textContent = '';
            hideGeneratedPortalLink();
        }
        portalPanel.hidden = false;
        portalPanel.classList.remove('is-hidden');
    }

    function setPortalControlsDisabled(disabled) {
        portalRequestPending = disabled;
        portalPanel.querySelectorAll('button, select').forEach((control) => { control.disabled = disabled; });
    }

    async function callPortalAction(action) {
        const establishmentId = portalEstablishment.value;
        if (!establishmentId) throw new Error('Selecione um estabelecimento.');
        const { data, error } = await client.auth.getSession();
        const accessToken = data?.session?.access_token;
        if (error || !accessToken) throw new Error('Sua sessão expirou. Entre novamente para administrar o acesso.');
        const projectUrl = window.RondySupabaseConfig?.projectUrl;
        if (!projectUrl) throw new Error('A configuração do Supabase não está disponível.');
        const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
        const isLocal = localHosts.has(window.location.hostname);
        const expectedProjectHost = isLocal ? 'nirwkoxmyqbvsnoliysu.supabase.co'
            : window.location.hostname === 'lab.rondy.com.br' ? 'lmgymzcqdnysqrwsjlbs.supabase.co' : null;
        if (!expectedProjectHost) {
            throw new Error('O gerenciamento de links só está disponível no ambiente local ou em lab.rondy.com.br.');
        }
        let configuredProjectHost;
        try { configuredProjectHost = new URL(projectUrl).hostname; } catch { throw new Error('A Project URL do Supabase está inválida.'); }
        if (configuredProjectHost !== expectedProjectHost) {
            throw new Error('A configuração do Supabase não corresponde ao ambiente atual.');
        }
        const response = await fetch(new URL('/functions/v1/portal-admin-links', projectUrl), {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, estabelecimento_id: establishmentId }),
            cache: 'no-store'
        });
        let payload = null;
        try { payload = await response.json(); } catch { /* A resposta sem JSON será tratada abaixo. */ }
        if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a solicitação ao portal.');
        return payload;
    }

    function showPortalStatus(payload) {
        const access = payload?.acesso;
        portalStatus.textContent = access?.status || 'Status indisponível';
        if (!access || access.status === 'SEM_LINK') {
            portalDetails.textContent = 'Este estabelecimento ainda não possui link de acesso.';
            return;
        }
        const details = [`Criado em ${formatPortalDate(access.criado_em)}`];
        if (access.expira_em) details.push(`expira em ${formatPortalDate(access.expira_em)}`);
        if (access.pausado_em) details.push(`pausado em ${formatPortalDate(access.pausado_em)}`);
        if (access.revogado_em) details.push(`revogado em ${formatPortalDate(access.revogado_em)}`);
        if (access.ultimo_acesso_em) details.push(`último acesso em ${formatPortalDate(access.ultimo_acesso_em)}`);
        portalDetails.textContent = details.join(' · ');
    }

    async function handlePortalAction(action) {
        const labels = { status: 'Status consultado.', gerar: 'Link gerado. Copie-o agora: o token puro não será exibido novamente.', substituir: 'Link substituído. Copie o novo link agora: o token anterior foi revogado.', pausar: 'Acesso pausado com sucesso.', reativar: 'Acesso reativado com sucesso.', revogar: 'Acesso revogado com sucesso.' };
        const confirmations = { substituir: 'Substituir este link? O link anterior será revogado.', pausar: 'Pausar o acesso deste estabelecimento?', reativar: 'Reativar o acesso deste estabelecimento?', revogar: 'Revogar este acesso? Esta ação não pode ser desfeita.' };
        try {
            if (confirmations[action] && !window.confirm(confirmations[action])) return;
            setPortalControlsDisabled(true);
            setPortalMessage('Processando…');
            if (action !== 'gerar' && action !== 'substituir') hideGeneratedPortalLink();
            const payload = await callPortalAction(action);
            if (action === 'status') showPortalStatus(payload);
            if (action === 'gerar' || action === 'substituir') {
                const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
                const portalBase = localHosts.has(window.location.hostname)
                    ? `${window.location.origin}/portal/#`
                    : 'https://lab.rondy.com.br/portal/';
                portalUrl.value = `${portalBase}${payload.token}`;
                portalResult.classList.remove('is-hidden');
                portalStatus.textContent = 'ATIVO';
                portalDetails.textContent = payload.expira_em ? `Expira em ${formatPortalDate(payload.expira_em)}.` : 'Sem data de expiração.';
            }
            setPortalMessage(labels[action]);
        } catch (error) {
            setPortalMessage(errorText(error), true);
        } finally {
            setPortalControlsDisabled(false);
        }
    }

    function initializePortalLinks() {
        if (portalLinksReady) return;
        portalLinksReady = true;
        portalEstablishment.addEventListener('change', () => {
            if (portalRequestPending) return;
            portalStatus.textContent = portalEstablishment.value ? 'Status não consultado.' : 'Selecione um estabelecimento.';
            portalDetails.textContent = '';
            hideGeneratedPortalLink();
            setPortalMessage('');
        });
        [['portal-links-consultar', 'status'], ['portal-links-gerar', 'gerar'], ['portal-links-substituir', 'substituir'], ['portal-links-pausar', 'pausar'], ['portal-links-reativar', 'reativar'], ['portal-links-revogar', 'revogar']].forEach(([id, action]) => {
            $(id).addEventListener('click', () => { void handlePortalAction(action); });
        });
        $('portal-links-copiar').addEventListener('click', async () => {
            if (!portalUrl.value) return;
            try {
                await navigator.clipboard.writeText(portalUrl.value);
                setPortalMessage('Link copiado. O portal público ainda não foi implementado.');
            } catch {
                portalUrl.focus(); portalUrl.select();
                setPortalMessage('Não foi possível copiar automaticamente. Selecione e copie o link exibido.', true);
            }
        });
    }

    function openEstablishment(item) {
        editId = item?.id || null; form.reset(); form.elements.ativo.checked = true;
        if (item) { form.elements.nome.value = item.nome; form.elements.responsavel.value = item.responsavel; form.elements.whatsapp.value = item.whatsapp; form.elements.comissao.value = item.comissao_percentual; form.elements.ativo.checked = item.ativo; $('consignacao-form-title').textContent = 'EDITAR ESTABELECIMENTO'; } else $('consignacao-form-title').textContent = 'NOVO ESTABELECIMENTO';
        notice(formMessage, ''); panel.classList.remove('is-hidden'); form.elements.nome.focus();
    }

    async function toggleEstablishment(item) {
        try { await verifyAdmin(); const result = await client.from('estabelecimentos').update({ ativo: !item.ativo }).eq('id', item.id).eq('user_id', userId); if (result.error) throw result.error; await load(`Estabelecimento ${item.ativo ? 'desativado' : 'ativado'} com sucesso.`); } catch (error) { notice(message, errorText(error), true); }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!form.reportValidity()) return;
        try { await verifyAdmin(); const payload = { nome: form.elements.nome.value.trim(), responsavel: form.elements.responsavel.value.trim(), whatsapp: form.elements.whatsapp.value.trim(), comissao_percentual: Number(form.elements.comissao.value), ativo: form.elements.ativo.checked }; const result = editId ? await client.from('estabelecimentos').update(payload).eq('id', editId).eq('user_id', userId) : await client.from('estabelecimentos').insert({ ...payload, user_id: userId }); if (result.error) throw result.error; panel.classList.add('is-hidden'); await load('Estabelecimento salvo com sucesso.'); } catch (error) { notice(formMessage, `Não foi possível salvar. ${errorText(error)}`, true); }
    });

    movementForm.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!movementForm.reportValidity()) return; const quantity = Number(movementForm.elements.quantidade.value);
        if (!Number.isInteger(quantity) || quantity < 1) { notice(movementMessage, 'Informe uma quantidade inteira maior que zero.', true); return; }
        try { await verifyAdmin(); movementSubmit.disabled = true; const { data, error } = await client.rpc('movimentar_consignacao', { p_id: crypto.randomUUID(), p_estabelecimento_id: establishmentSelect.value, p_variacao_id: variationSelect.value, p_tipo: movementForm.elements.tipo.value, p_quantidade: quantity, p_observacao: movementForm.elements.observacao.value.trim() }); if (error) throw error; const selectedEstablishment = establishmentSelect.value, selectedProduct = productSelect.value, selectedVariation = variationSelect.value; movementForm.reset(); establishmentSelect.value = selectedEstablishment; productSelect.value = selectedProduct; renderVariations(); variationSelect.value = selectedVariation; await load(`Movimentação registrada. Saldo consignado atual: ${data?.saldo ?? '—'}.`); notice(movementMessage, ''); } catch (error) { notice(movementMessage, `Não foi possível registrar a movimentação. ${errorText(error)}`, true); } finally { movementSubmit.disabled = false; }
    });

    conferenceForm.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!conferenceForm.reportValidity()) return;
        try {
            const { items } = conferencePayload(true);
            const establishment = establishments.find((item) => item.id === conferenceSelect.value);
            if (!establishment?.ativo) throw new Error('Selecione um estabelecimento ativo.');
            if (!window.confirm(`Confirmar definitivamente a conferência de ${establishment.nome}? Esta operação não poderá ser editada.`)) return;
            await verifyAdmin(); conferenceSubmit.disabled = true;
            const { data, error } = await client.rpc('confirmar_conferencia_consignacao', { p_id: conferenceOperationId, p_estabelecimento_id: conferenceSelect.value, p_data_visita: conferenceForm.elements.dataVisita.value, p_observacao: conferenceForm.elements.observacao.value.trim(), p_itens: items });
            if (error) throw error;
            conferenceOperationId = crypto.randomUUID(); conferenceForm.reset(); conferenceForm.elements.dataVisita.value = today();
            await load(`Conferência ${data?.ja_confirmada ? 'já confirmada' : 'confirmada'} com sucesso.`); notice(conferenceMessage, '');
        } catch (error) { notice(conferenceMessage, `Não foi possível confirmar. ${errorText(error)}`, true); } finally { conferenceSubmit.disabled = !activeConferenceBalances().length; }
    });

    closingForm.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!closingForm.reportValidity()) return;
        const conferenceIds = [...closingAvailableBody.querySelectorAll('input[type="checkbox"]:checked')].map((item) => item.value);
        if (!conferenceIds.length) { notice(closingMessage, 'Selecione ao menos uma conferência.', true); return; }
        try {
            const establishment = establishments.find((item) => item.id === closingSelect.value);
            if (!establishment) throw new Error('Selecione um estabelecimento.');
            if (!window.confirm(`Criar fechamento financeiro para ${establishment.nome} com ${conferenceIds.length} conferência(s)?`)) return;
            await verifyAdmin(); closingSubmit.disabled = true;
            const { data, error } = await client.rpc('criar_fechamento_consignacao', { p_id: closingOperationId, p_estabelecimento_id: closingSelect.value, p_conferencia_ids: conferenceIds, p_observacao: closingForm.elements.observacao.value.trim() });
            if (error) throw error;
            closingOperationId = crypto.randomUUID(); closingForm.reset(); await load(`Fechamento ${data?.ja_criado ? 'já existente' : 'criado'} com sucesso.`); notice(closingMessage, '');
        } catch (error) { notice(closingMessage, `Não foi possível criar o fechamento. ${errorText(error)}`, true); } finally { updateClosingPreview(); }
    });

    paymentForm.addEventListener('submit', async (event) => {
        event.preventDefault(); if (!paymentForm.reportValidity()) return;
        const closing = closings.find((item) => item.id === selectedClosingId), amount = Number(paymentForm.elements.valor.value);
        if (!closing || closing.status === 'PAGO' || Number(closing.saldo_pendente) === 0) { notice(paymentMessage, 'Este fechamento não aceita novos pagamentos.', true); return; }
        if (!Number.isFinite(amount) || amount <= 0 || amount > Number(closing.saldo_pendente) || Math.round(amount * 100) !== amount * 100) { notice(paymentMessage, 'Informe um valor válido, com até duas casas, que não ultrapasse o saldo pendente.', true); return; }
        try {
            if (!window.confirm(`Registrar recebimento de ${formatMoney(amount)}?`)) return;
            await verifyAdmin(); paymentSubmit.disabled = true;
            const { data, error } = await client.rpc('registrar_pagamento_consignacao', { p_id: paymentOperationId, p_fechamento_id: closing.id, p_data_pagamento: paymentForm.elements.dataPagamento.value, p_valor: amount, p_forma_pagamento: paymentForm.elements.forma.value, p_observacao: paymentForm.elements.observacao.value.trim() });
            if (error) throw error;
            const currentClosingId = closing.id; paymentOperationId = crypto.randomUUID(); await load(`Pagamento ${data?.ja_registrado ? 'já registrado' : 'registrado'} com sucesso.`); openClosingDetails(currentClosingId);
        } catch (error) { notice(paymentMessage, `Não foi possível registrar o pagamento. ${errorText(error)}`, true); } finally { const current = closings.find((item) => item.id === selectedClosingId); paymentSubmit.disabled = !current || current.status === 'PAGO'; }
    });

    $('consignacao-novo').addEventListener('click', () => openEstablishment());
    $('consignacao-cancelar').addEventListener('click', () => panel.classList.add('is-hidden'));
    $('consignacao-busca').addEventListener('input', renderEstablishments);
    productSelect.addEventListener('change', renderVariations); establishmentSelect.addEventListener('change', renderBalances);
    conferenceSelect.addEventListener('change', () => { conferenceOperationId = crypto.randomUUID(); renderConferenceItems(); });
    closingSelect.addEventListener('change', () => { closingOperationId = crypto.randomUUID(); closingDetails.classList.add('is-hidden'); renderAvailableConferences(); renderClosings(); });
    conferenceForm.elements.dataVisita.max = today(); conferenceForm.elements.dataVisita.value = today(); conferenceOperationId = crypto.randomUUID(); closingOperationId = crypto.randomUUID(); paymentOperationId = crypto.randomUUID(); initializePortalLinks();
    try { await load(); } catch (error) { notice(message, `Não foi possível carregar a consignação. ${errorText(error)}`, true); $('consignacao-novo').disabled = true; movementSubmit.disabled = true; conferenceSubmit.disabled = true; closingSubmit.disabled = true; }
});
