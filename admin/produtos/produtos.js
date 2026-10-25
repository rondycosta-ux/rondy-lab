document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('produto-search');
    const typeFilter = document.getElementById('produto-tipo-filter');
    const toolbar = document.getElementById('produtos-toolbar');
    const listNotice = document.getElementById('produtos-listagem-notice');
    const tableWrap = document.getElementById('produtos-table-wrap');
    const tableBody = document.getElementById('produtos-table-body');
    const loadingState = document.getElementById('produtos-loading-state');
    const errorState = document.getElementById('produtos-error-state');
    const errorMessage = document.getElementById('produtos-error-message');
    const retryLoadButton = document.getElementById('retry-produtos-load');
    const metricProdutosAtivos = document.getElementById('metric-produtos-ativos');
    const metricVariacoesAtivas = document.getElementById('metric-variacoes-ativas');
    const metricEstoqueTotal = document.getElementById('metric-estoque-total');
    const openFormButton = document.getElementById('open-produto-form');
    const formPanel = document.getElementById('produto-form-panel');
    const form = document.getElementById('produto-form');
    const formMessage = document.getElementById('produto-form-message');
    const formTitle = document.getElementById('produto-form-title');
    const submitButton = document.getElementById('submit-produto-form');
    const cancelFormButton = document.getElementById('cancel-produto-form');
    const variationsPanel = document.getElementById('variacoes-panel');
    const variationsBody = document.getElementById('variacoes-body');
    const variationsMessage = document.getElementById('variacoes-message');
    const variationsProduct = document.getElementById('variacoes-produto');
    const variationForm = document.getElementById('variacao-form');
    const variationTitle = document.getElementById('variacao-form-title');
    const variationSubmit = document.getElementById('variacao-salvar');
    const stockPanel = document.getElementById('estoque-panel');
    const stockForm = document.getElementById('estoque-form');
    const stockMessage = document.getElementById('estoque-message');
    const stockHistory = document.getElementById('estoque-historico');
    const stockSubmit = document.getElementById('estoque-submit');

    let client;
    let authenticatedUserId = null;
    let produtos = [];
    let dataLoaded = false;
    let creatingProduct = false;
    let draftProductId = null;
    let editingProductId = null;
    let selectedProduct = null;
    let editingVariationId = null;
    let variationBusy = false;
    let variationDraftId = null;
    let stockVariation = null;
    let stockBusy = false;

    setFiltersDisabled(true);

    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;

    function setFiltersDisabled(disabled) {
        searchInput.disabled = disabled;
        typeFilter.disabled = disabled;
        toolbar.setAttribute('aria-disabled', String(disabled));
    }

    function setIndicators({ produtosAtivos = null, variacoesAtivas = null, estoqueTotal = null } = {}) {
        metricProdutosAtivos.textContent = produtosAtivos === null ? '—' : String(produtosAtivos);
        metricVariacoesAtivas.textContent = variacoesAtivas === null ? '—' : String(variacoesAtivas);
        metricEstoqueTotal.textContent = estoqueTotal === null ? '—' : String(estoqueTotal);
    }

    function setState(state, message = '') {
        const loading = state === 'loading';
        const error = state === 'error';
        const content = state === 'content';

        loadingState.classList.toggle('is-hidden', !loading);
        errorState.classList.toggle('is-hidden', !error);
        tableWrap.classList.toggle('is-hidden', !content);

        if (error) errorMessage.textContent = message;
    }

    function setFormMessage(message, isError = false) {
        formMessage.textContent = message;
        formMessage.classList.toggle('is-error', isError);
        formMessage.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setFormControlsDisabled(disabled) {
        form.querySelectorAll('input, select, textarea, button').forEach((control) => {
            control.disabled = disabled;
        });
    }

    function resetAndHideForm() {
        if (creatingProduct) return;
        form.reset();
        draftProductId = null;
        editingProductId = null;
        formTitle.textContent = 'NOVO PRODUTO';
        submitButton.textContent = 'SALVAR PRODUTO';
        setFormMessage('Preencha os dados para cadastrar um novo produto.');
        formPanel.classList.add('is-hidden');
    }

    function createDraftId() {
        if (!window.crypto?.randomUUID) {
            throw new Error('O navegador não oferece geração segura de identificador. Atualize o navegador antes de cadastrar.');
        }
        return window.crypto.randomUUID();
    }

    function getFormValues() {
        const nome = form.elements.nome.value.trim();
        const descricao = form.elements.descricao.value;
        const tipoAtendimento = form.elements.tipoAtendimento.value;
        const custoText = form.elements.custoBase.value.trim();
        const precoText = form.elements.precoBase.value.trim();
        const custoBase = Number(custoText);
        const precoBase = Number(precoText);

        if (nome.length < 1 || nome.length > 200) {
            throw new Error('Nome: informe entre 1 e 200 caracteres.');
        }
        if (!['pronta_entrega', 'sob_encomenda'].includes(tipoAtendimento)) {
            throw new Error('Tipo de atendimento: selecione uma opção válida.');
        }
        if (!custoText || !Number.isFinite(custoBase) || custoBase < 0) {
            throw new Error('Custo base: informe um valor monetário igual ou maior que zero.');
        }
        if (!precoText || !Number.isFinite(precoBase) || precoBase < 0) {
            throw new Error('Preço de venda base: informe um valor monetário igual ou maior que zero.');
        }

        return { nome, descricao, tipoAtendimento, custoBase, precoBase };
    }

    function appendCell(row, content, className = '') {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = content;
        row.append(cell);
        return cell;
    }

    function appendEmptyRow(message) {
        const row = document.createElement('tr');
        const cell = appendCell(row, message, 'empty-state');
        cell.colSpan = 7;
        tableBody.replaceChildren(row);
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function typeLabel(type) {
        return type === 'pronta_entrega' ? 'Pronta entrega' : 'Sob encomenda';
    }

    function mapProduto(row) {
        if (!row || row.user_id !== authenticatedUserId || typeof row.id !== 'string'
            || typeof row.nome !== 'string' || typeof row.descricao !== 'string' || !['pronta_entrega', 'sob_encomenda'].includes(row.tipo_atendimento)) {
            throw new Error('A consulta retornou um produto com dados inválidos.');
        }

        const custoBase = Number(row.custo_base);
        const precoBase = Number(row.preco_base);
        if (!Number.isFinite(custoBase) || custoBase < 0 || !Number.isFinite(precoBase) || precoBase < 0) {
            throw new Error('A consulta retornou um valor base inválido.');
        }

        return {
            id: row.id,
            nome: row.nome,
            descricao: row.descricao,
            custoBase,
            tipoAtendimento: row.tipo_atendimento,
            precoBase,
            variacoes: []
        };
    }

    function mapVariacao(row) {
        if (!row || row.user_id !== authenticatedUserId || typeof row.produto_id !== 'string') {
            throw new Error('A consulta retornou uma variação sem propriedade válida.');
        }

        const estoqueAtual = Number(row.estoque_atual);
        if (!Number.isInteger(estoqueAtual) || estoqueAtual < 0) {
            throw new Error('A consulta retornou um saldo de variação inválido.');
        }

        return { produtoId: row.produto_id, estoqueAtual };
    }

    async function fetchAllRows(queryFactory) {
        const rows = [];
        const pageSize = 1000;
        let offset = 0;

        while (true) {
            const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
            if (error) throw error;
            if (!Array.isArray(data)) {
                throw new Error('A consulta ao Supabase não retornou uma lista válida.');
            }
            rows.push(...data);
            if (data.length < pageSize) return rows;
            offset += data.length;
        }
    }

    function getVisibleProdutos() {
        const searchTerm = searchInput.value.trim().toLocaleLowerCase('pt-BR');
        const selectedType = typeFilter.value;

        return produtos.filter((produto) => {
            const matchesSearch = !searchTerm || produto.nome.toLocaleLowerCase('pt-BR').includes(searchTerm);
            const matchesType = selectedType === 'todos' || produto.tipoAtendimento === selectedType;
            return matchesSearch && matchesType;
        });
    }

    function renderProdutos() {
        const visibleProdutos = getVisibleProdutos();

        if (!produtos.length) {
            appendEmptyRow('Nenhum produto ativo foi encontrado para esta conta.');
            return;
        }

        if (!visibleProdutos.length) {
            appendEmptyRow('Nenhum produto encontrado para os filtros atuais.');
            return;
        }

        const fragment = document.createDocumentFragment();
        visibleProdutos.forEach((produto) => {
            const row = document.createElement('tr');
            const variacoesAtivas = produto.variacoes.length;
            const estoqueTotal = produto.variacoes.reduce((total, variacao) => total + variacao.estoqueAtual, 0);

            appendCell(row, produto.nome);
            appendCell(row, typeLabel(produto.tipoAtendimento));
            appendCell(row, formatCurrency(produto.precoBase));
            appendCell(row, String(variacoesAtivas));
            appendCell(row, String(estoqueTotal));

            const statusCell = document.createElement('td');
            const status = document.createElement('span');
            status.className = 'filamento-tag filamento-tag--disponivel';
            status.textContent = 'Ativo';
            statusCell.append(status);
            row.append(statusCell);

            const actionsCell = document.createElement('td');
            const actions = document.createElement('div');
            actions.className = 'filamento-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.textContent = 'EDITAR';
            editButton.addEventListener('click', () => {
                if (!dataLoaded || creatingProduct) return;
                editingProductId = produto.id;
                draftProductId = null;
                form.elements.nome.value = produto.nome;
                form.elements.descricao.value = produto.descricao;
                form.elements.tipoAtendimento.value = produto.tipoAtendimento;
                form.elements.custoBase.value = produto.custoBase;
                form.elements.precoBase.value = produto.precoBase;
                formTitle.textContent = 'EDITAR PRODUTO';
                submitButton.textContent = 'SALVAR ALTERAÇÕES';
                setFormMessage('Edite os dados do produto selecionado.');
                formPanel.classList.remove('is-hidden');
                form.elements.nome.focus();
            });
            actions.append(editButton);
            const variationsButton = document.createElement('button');
            variationsButton.type = 'button';
            variationsButton.textContent = 'VARIAÇÕES';
            variationsButton.addEventListener('click', () => {
                if (variationBusy || creatingProduct || stockBusy) return;
                stockPanel.classList.add('is-hidden');
                stockVariation = null;
                selectedProduct = produto;
                variationsProduct.textContent = produto.nome;
                variationsPanel.classList.remove('is-hidden');
                resetVariationForm();
                void loadVariations();
            });
            actions.append(variationsButton);
            actionsCell.append(actions);
            row.append(actionsCell);

            fragment.append(row);
        });

        tableBody.replaceChildren(fragment);
    }

    function renderIndicators() {
        const variacoesAtivas = produtos.reduce((total, produto) => total + produto.variacoes.length, 0);
        const estoqueTotal = produtos.reduce(
            (total, produto) => total + produto.variacoes.reduce((subtotal, variacao) => subtotal + variacao.estoqueAtual, 0),
            0
        );
        setIndicators({
            produtosAtivos: produtos.length,
            variacoesAtivas,
            estoqueTotal
        });
    }

    function getErrorMessage(error) {
        if (error?.message) return error.message;
        return 'Verifique sua conexão e tente novamente.';
    }

    async function loadProdutos(successMessage = '') {
        setFiltersDisabled(true);
        openFormButton.disabled = true;
        retryLoadButton.disabled = true;
        listNotice.textContent = 'Carregando produtos da sua conta…';
        setState('loading');
        setIndicators();

        try {
            client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous) {
                throw new Error('Não há uma sessão autenticada válida. Entre novamente no Admin.');
            }
            authenticatedUserId = userData.user.id;

            const produtoRows = await fetchAllRows(() => client
                .from('produtos')
                .select('id, user_id, nome, descricao, tipo_atendimento, custo_base, preco_base')
                .eq('user_id', authenticatedUserId)
                .eq('arquivado', false)
                .order('criado_em', { ascending: false })
                .order('id', { ascending: true }));

            const loadedProdutos = produtoRows.map(mapProduto);
            const produtoIds = loadedProdutos.map((produto) => produto.id);
            const variacaoRows = produtoIds.length
                ? await fetchAllRows(() => client
                    .from('produto_variacoes')
                    .select('id, user_id, produto_id, estoque_atual')
                    .eq('user_id', authenticatedUserId)
                    .eq('arquivado', false)
                    .in('produto_id', produtoIds)
                    .order('criado_em', { ascending: true })
                    .order('id', { ascending: true }))
                : [];

            const produtosPorId = new Map(loadedProdutos.map((produto) => [produto.id, produto]));
            variacaoRows.map(mapVariacao).forEach((variacao) => {
                const produto = produtosPorId.get(variacao.produtoId);
                if (!produto) {
                    throw new Error('A consulta retornou uma variação sem produto correspondente.');
                }
                produto.variacoes.push(variacao);
            });

            const { data: confirmedUserData, error: confirmedUserError } = await client.auth.getUser();
            if (confirmedUserError) throw confirmedUserError;
            if (!confirmedUserData?.user || confirmedUserData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante o carregamento. Tente novamente.');
            }

            produtos = loadedProdutos;
            if (selectedProduct) {
                selectedProduct = loadedProdutos.find((produto) => produto.id === selectedProduct.id) || null;
                if (selectedProduct) variationsProduct.textContent = selectedProduct.nome;
                else variationsPanel.classList.add('is-hidden');
            }
            dataLoaded = true;
            renderIndicators();
            renderProdutos();
            setFiltersDisabled(false);
            openFormButton.disabled = false;
            listNotice.textContent = successMessage || 'Listagem atualizada.';
            setState('content');
        } catch (error) {
            console.error('Falha ao consultar produtos no Supabase:', error);
            produtos = [];
            dataLoaded = false;
            setIndicators();
            listNotice.textContent = 'A lista não está disponível porque a consulta falhou.';
            setState('error', `Não foi possível carregar os produtos. ${getErrorMessage(error)}`);
        } finally {
            retryLoadButton.disabled = false;
        }
    }

    async function submitProduto(event) {
        event.preventDefault();
        if (!dataLoaded || creatingProduct || !form.reportValidity()) return;

        let values;
        try {
            values = getFormValues();
            if (!editingProductId && !draftProductId) draftProductId = createDraftId();
        } catch (error) {
            setFormMessage(getErrorMessage(error), true);
            return;
        }

        const isEditing = editingProductId !== null;
        creatingProduct = true;
        setFormControlsDisabled(true);
        openFormButton.disabled = true;
        setFormMessage('Salvando produto no Supabase…');

        try {
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de salvar o produto.');
            }

            if (isEditing) {
                const { data, error } = await client.from('produtos')
                    .update({
                        nome: values.nome,
                        descricao: values.descricao,
                        tipo_atendimento: values.tipoAtendimento,
                        custo_base: values.custoBase,
                        preco_base: values.precoBase
                    })
                    .eq('id', editingProductId)
                    .eq('user_id', authenticatedUserId)
                    .eq('arquivado', false)
                    .select('id');
                if (error) throw error;
                if (!Array.isArray(data) || data.length !== 1 || data[0].id !== editingProductId) {
                    throw new Error('O produto não foi atualizado: não foi encontrado ou não está disponível para esta conta.');
                }
            } else {
                const { data, error } = await client.rpc('criar_produto', {
                    p_id: draftProductId,
                    p_nome: values.nome,
                    p_descricao: values.descricao,
                    p_tipo_atendimento: values.tipoAtendimento,
                    p_custo_base: values.custoBase,
                    p_preco_base: values.precoBase
                });
                if (error) throw error;
                if (!data || data.produto_id !== draftProductId || typeof data.variacao_padrao_id !== 'string') {
                    throw new Error('O Supabase não confirmou a criação do produto e da variação padrão.');
                }
            }

            const { data: confirmedUserData, error: confirmedUserError } = await client.auth.getUser();
            if (confirmedUserError) throw confirmedUserError;
            if (!confirmedUserData?.user || confirmedUserData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante o salvamento. Recarregue a página para confirmar o resultado.');
            }

            creatingProduct = false;
            setFormControlsDisabled(false);
            resetAndHideForm();
            await loadProdutos(isEditing ? 'Produto atualizado com sucesso.' : 'Produto cadastrado com sucesso. A variação padrão foi criada automaticamente.');
        } catch (error) {
            console.error('Não foi possível salvar o produto no Supabase:', error);
            setFormMessage(`Não foi possível salvar o produto. ${getErrorMessage(error)}`, true);
        } finally {
            creatingProduct = false;
            setFormControlsDisabled(false);
            openFormButton.disabled = !dataLoaded;
        }
    }

    function variationNotice(message, error = false) {
        variationsMessage.textContent = message;
        variationsMessage.classList.toggle('is-error', error);
        variationsMessage.setAttribute('role', error ? 'alert' : 'status');
    }

    function resetVariationForm() {
        variationForm.reset();
        editingVariationId = null;
        variationDraftId = null;
        variationTitle.textContent = 'NOVA VARIAÇÃO';
        variationSubmit.textContent = 'ADICIONAR VARIAÇÃO';
    }

    function setVariationBusy(busy) {
        variationBusy = busy;
        variationForm.querySelectorAll('input, button').forEach((element) => { element.disabled = busy; });
        variationsBody.querySelectorAll('button').forEach((element) => { element.disabled = busy; });
    }

    async function checkVariationUser() {
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        if (!data?.user || data.user.is_anonymous || data.user.id !== authenticatedUserId) {
            throw new Error('A sessão mudou. Recarregue a página.');
        }
    }

    async function loadVariations(message = '') {
        if (!selectedProduct) return;
        setVariationBusy(true);
        variationNotice('Carregando variações…');
        try {
            await checkVariationUser();
            const rows = await fetchAllRows(() => client.from('produto_variacoes')
                .select('id, user_id, produto_id, nome, modelo, sku, cor, tamanho, variacao_padrao, custo_unitario, preco_unitario, estoque_atual, arquivado')
                .eq('user_id', authenticatedUserId).eq('produto_id', selectedProduct.id)
                .order('criado_em', { ascending: true }).order('id', { ascending: true }));
            await checkVariationUser();
            const fragment = document.createDocumentFragment();
            rows.forEach((v) => {
                if (v.user_id !== authenticatedUserId || v.produto_id !== selectedProduct.id) throw new Error('Variação com propriedade inválida.');
                const row = document.createElement('tr');
                appendCell(row, v.variacao_padrao ? 'Padrão' : (v.nome || 'Sem nome'));
                [v.modelo, v.sku, v.cor, v.tamanho].forEach((value) => appendCell(row, value || '—'));
                appendCell(row, v.custo_unitario === null ? `Herdado (${formatCurrency(selectedProduct.custoBase)})` : formatCurrency(Number(v.custo_unitario)));
                appendCell(row, v.preco_unitario === null ? `Herdado (${formatCurrency(selectedProduct.precoBase)})` : formatCurrency(Number(v.preco_unitario)));
                appendCell(row, String(v.estoque_atual));
                appendCell(row, v.arquivado ? 'Arquivada' : 'Ativa');
                const actions = appendCell(row, '');
                const stock = document.createElement('button');
                stock.type = 'button'; stock.textContent = 'ESTOQUE';
                stock.addEventListener('click', () => { void openStock(v); });
                actions.append(stock);
                if (!v.variacao_padrao && !v.arquivado) {
                    const edit = document.createElement('button');
                    edit.type = 'button'; edit.textContent = 'EDITAR';
                    edit.addEventListener('click', () => {
                        if (variationBusy || stockBusy) return;
                        editingVariationId = v.id;
                        variationDraftId = null;
                        ['nome', 'modelo', 'sku', 'cor', 'tamanho'].forEach((name) => { variationForm.elements[name].value = v[name] || ''; });
                        variationForm.elements.custo.value = v.custo_unitario ?? '';
                        variationForm.elements.preco.value = v.preco_unitario ?? '';
                        variationTitle.textContent = 'EDITAR VARIAÇÃO';
                        variationSubmit.textContent = 'SALVAR ALTERAÇÕES';
                        variationNotice('Edite a variação selecionada.');
                        variationForm.elements.nome.focus();
                    });
                    actions.append(edit);
                }
                if (!v.variacao_padrao && !v.arquivado) {
                    const archive = document.createElement('button');
                    archive.type = 'button'; archive.textContent = 'ARQUIVAR';
                    archive.addEventListener('click', () => { void archiveVariation(v); });
                    actions.append(archive);
                }
                fragment.append(row);
            });
            variationsBody.replaceChildren(fragment);
            variationNotice(message || 'Variações atualizadas.');
        } catch (error) {
            variationsBody.replaceChildren();
            variationNotice(`Não foi possível carregar as variações. ${getErrorMessage(error)}`, true);
        } finally { setVariationBusy(false); }
    }

    async function archiveVariation(variation) {
        if (variationBusy || stockBusy || !window.confirm('Arquivar esta variação?')) return;
        setVariationBusy(true);
        try {
            await checkVariationUser();
            const { data, error } = await client.rpc('definir_arquivamento_variacao_produto', { p_variacao_id: variation.id, p_arquivado: true });
            if (error) throw error;
            if (data?.variacao_id !== variation.id || data.arquivado !== true) throw new Error('O arquivamento não foi confirmado.');
            resetVariationForm();
            await loadProdutos();
            await loadVariations('Variação arquivada com sucesso.');
        } catch (error) { variationNotice(`Não foi possível arquivar. ${getErrorMessage(error)}`, true); }
        finally { setVariationBusy(false); }
    }

    variationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (variationBusy || stockBusy || !selectedProduct || !variationForm.reportValidity()) return;
        const fields = {};
        for (const name of ['nome', 'modelo', 'sku', 'cor', 'tamanho']) fields[name] = variationForm.elements[name].value.trim() || null;
        if (!fields.nome) { variationNotice('Informe o nome da variação.', true); return; }
        for (const name of ['custo', 'preco']) {
            const value = variationForm.elements[name].value.trim();
            fields[name] = value === '' ? null : Number(value);
            if (fields[name] !== null && (!Number.isFinite(fields[name]) || fields[name] < 0)) {
                variationNotice('Informe valores monetários válidos e não negativos.', true); return;
            }
        }
        setVariationBusy(true);
        try {
            await checkVariationUser();
            if (editingVariationId) {
                const { data, error } = await client.from('produto_variacoes').update({ nome: fields.nome, modelo: fields.modelo, sku: fields.sku, cor: fields.cor, tamanho: fields.tamanho, custo_unitario: fields.custo, preco_unitario: fields.preco })
                    .eq('id', editingVariationId).eq('produto_id', selectedProduct.id).eq('user_id', authenticatedUserId).eq('variacao_padrao', false).eq('arquivado', false).select('id');
                if (error) throw error;
                if (!Array.isArray(data) || data.length !== 1 || data[0].id !== editingVariationId) throw new Error('A atualização não foi confirmada.');
            } else {
                if (!variationDraftId) variationDraftId = createDraftId();
                const { data, error } = await client.rpc('criar_variacao_produto', { p_id: variationDraftId, p_produto_id: selectedProduct.id, p_nome: fields.nome, p_modelo: fields.modelo, p_sku: fields.sku, p_cor: fields.cor, p_tamanho: fields.tamanho, p_custo_unitario: fields.custo, p_preco_unitario: fields.preco });
                if (error) throw error;
                if (data?.variacao_id !== variationDraftId || data.produto_id !== selectedProduct.id) throw new Error('A criação não foi confirmada.');
            }
            await checkVariationUser();
            resetVariationForm();
            await loadProdutos();
            await loadVariations('Variação salva com sucesso.');
        } catch (error) { variationNotice(`Não foi possível confirmar o salvamento. ${getErrorMessage(error)} Atualize a listagem antes de tentar novamente.`, true); }
        finally { setVariationBusy(false); }
    });
    document.getElementById('variacao-cancelar').addEventListener('click', () => { if (!variationBusy) { resetVariationForm(); variationNotice(''); } });
    document.getElementById('variacoes-fechar').addEventListener('click', () => { if (!variationBusy && !stockBusy) { selectedProduct = null; stockVariation = null; stockPanel.classList.add('is-hidden'); resetVariationForm(); variationsPanel.classList.add('is-hidden'); } });

    function stockNotice(message, error = false) {
        stockMessage.textContent = message;
        stockMessage.classList.toggle('is-error', error);
        stockMessage.setAttribute('role', error ? 'alert' : 'status');
    }

    function pendingStockKey() { return `rondyLabProdutoMovimentoPendente:${authenticatedUserId}`; }

    function readPendingStock() {
        const raw = sessionStorage.getItem(pendingStockKey());
        return raw ? JSON.parse(raw) : null;
    }

    function configureStockForm(pending) {
        const retry = pending && stockVariation && pending.p_variacao_id === stockVariation.id;
        if (retry) {
            stockForm.elements.tipo.value = pending.p_tipo;
            stockForm.elements.quantidade.value = pending.p_quantidade;
            stockForm.elements.observacao.value = pending.p_observacao;
        }
        ['tipo', 'quantidade', 'observacao'].forEach((name) => { stockForm.elements[name].disabled = Boolean(pending) || stockBusy; });
        stockSubmit.disabled = stockBusy || Boolean(stockVariation?.arquivado && !retry) || Boolean(pending && !retry);
        stockSubmit.textContent = retry ? 'CONFIRMAR MOVIMENTAÇÃO PENDENTE' : 'REGISTRAR MOVIMENTAÇÃO';
        document.getElementById('estoque-fechar').disabled = stockBusy;
    }

    async function loadStockHistory() {
        await checkVariationUser();
        const rows = await fetchAllRows(() => client.from('produto_movimentacoes')
            .select('id, user_id, variacao_id, movimentado_em, tipo, quantidade, observacao')
            .eq('user_id', authenticatedUserId).eq('variacao_id', stockVariation.id)
            .order('movimentado_em', { ascending: false }).order('id', { ascending: false }));
        await checkVariationUser();
        const fragment = document.createDocumentFragment();
        rows.forEach((row) => {
            if (row.user_id !== authenticatedUserId || row.variacao_id !== stockVariation.id) throw new Error('Movimentação com propriedade inválida.');
            const tr = document.createElement('tr');
            const date = new Date(row.movimentado_em);
            appendCell(tr, Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR'));
            appendCell(tr, row.tipo === 'SAIDA' ? 'SAÍDA' : row.tipo);
            appendCell(tr, String(row.quantidade));
            appendCell(tr, row.observacao || '—');
            fragment.append(tr);
        });
        if (!rows.length) {
            const tr = document.createElement('tr');
            const cell = appendCell(tr, 'Nenhuma movimentação registrada.'); cell.colSpan = 4; fragment.append(tr);
        }
        stockHistory.replaceChildren(fragment);
    }

    async function openStock(variation) {
        if (stockBusy || variationBusy) return;
        stockVariation = variation;
        stockForm.reset();
        document.getElementById('estoque-variacao').textContent = `${variation.variacao_padrao ? 'Padrão' : (variation.nome || [variation.cor, variation.tamanho].filter(Boolean).join(' / ') || 'Sem nome')} — saldo: ${variation.estoque_atual}${variation.arquivado ? ' — arquivada' : ''}`;
        stockPanel.classList.remove('is-hidden');
        stockHistory.replaceChildren();
        stockBusy = true;
        try {
            const pending = readPendingStock();
            configureStockForm(pending);
            stockNotice('Carregando histórico…');
            await loadStockHistory();
            stockNotice(pending ? (pending.p_variacao_id === variation.id ? 'Há uma movimentação pendente. Confirme-a para verificar o resultado sem duplicar o registro.' : 'Há uma movimentação pendente em outra variação. Confirme-a antes de registrar outra.') : (variation.arquivado ? 'Variação arquivada: novas movimentações estão bloqueadas.' : 'Histórico atualizado.'));
        } catch (error) { stockNotice(`Não foi possível carregar o histórico. ${getErrorMessage(error)}`, true); }
        finally {
            stockBusy = false;
            try { configureStockForm(readPendingStock()); } catch (error) { stockSubmit.disabled = true; stockNotice('Não foi possível acessar a operação pendente nesta sessão.', true); }
        }
    }

    stockForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (stockBusy || variationBusy || !stockVariation || !selectedProduct) return;
        let pending;
        let confirmed = false;
        try {
            pending = readPendingStock();
            if (pending && pending.p_variacao_id !== stockVariation.id) throw new Error('Confirme a movimentação pendente da outra variação.');
            if (!pending) {
                if (!stockForm.reportValidity()) return;
                const tipo = stockForm.elements.tipo.value;
                const raw = stockForm.elements.quantidade.value.trim();
                const quantidade = Number(raw);
                if (!['ENTRADA', 'SAIDA', 'AJUSTE'].includes(tipo) || !raw || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > 2147483647 || (tipo !== 'AJUSTE' && quantidade === 0)) throw new Error('Informe uma quantidade inteira válida; entrada e saída devem ser positivas.');
                pending = { p_id: createDraftId(), p_variacao_id: stockVariation.id, p_tipo: tipo, p_quantidade: quantidade, p_observacao: stockForm.elements.observacao.value };
                sessionStorage.setItem(pendingStockKey(), JSON.stringify(pending));
            }
            stockBusy = true;
            configureStockForm(pending);
            stockNotice('Registrando movimentação…');
            await checkVariationUser();
            const { data, error } = await client.rpc('registrar_movimentacao_produto', pending);
            if (error) {
                if (typeof error.code === 'string' && /^[235][0-9A-Z]{4}$/.test(error.code)) sessionStorage.removeItem(pendingStockKey());
                throw error;
            }
            if (data?.id !== pending.p_id || data.variacao_id !== pending.p_variacao_id || data.tipo !== pending.p_tipo || data.quantidade !== pending.p_quantidade) throw new Error('A resposta não confirmou a movimentação.');
            await checkVariationUser();
            sessionStorage.removeItem(pendingStockKey());
            confirmed = true;
            stockForm.reset();
            await loadProdutos();
            await loadVariations();
            const { data: refreshed, error: refreshError } = await client.from('produto_variacoes').select('estoque_atual, arquivado').eq('id', stockVariation.id).eq('produto_id', selectedProduct.id).eq('user_id', authenticatedUserId).single();
            if (refreshError) throw refreshError;
            stockVariation.estoque_atual = refreshed.estoque_atual;
            stockVariation.arquivado = refreshed.arquivado;
            document.getElementById('estoque-variacao').textContent = `Saldo atual: ${refreshed.estoque_atual}`;
            await loadStockHistory();
            stockNotice('Movimentação registrada com sucesso.');
        } catch (error) { stockNotice(confirmed ? `Movimentação registrada, mas não foi possível atualizar a tela. ${getErrorMessage(error)} Reabra o estoque para consultar o resultado.` : `Não foi possível concluir. ${getErrorMessage(error)} Se houver operação pendente, confirme-a antes de registrar outra.`, true); }
        finally {
            stockBusy = false;
            try { configureStockForm(readPendingStock()); } catch (error) { stockSubmit.disabled = true; stockNotice('Não foi possível acessar a operação pendente nesta sessão.', true); }
        }
    });
    document.getElementById('estoque-fechar').addEventListener('click', () => { if (!stockBusy) { stockPanel.classList.add('is-hidden'); stockVariation = null; } });

    searchInput.addEventListener('input', renderProdutos);
    typeFilter.addEventListener('change', renderProdutos);
    retryLoadButton.addEventListener('click', () => { void loadProdutos(); });
    openFormButton.addEventListener('click', () => {
        if (!dataLoaded || creatingProduct) return;
        resetAndHideForm();
        formPanel.classList.remove('is-hidden');
        form.elements.nome.focus();
    });
    cancelFormButton.addEventListener('click', resetAndHideForm);
    form.addEventListener('submit', (event) => { void submitProduto(event); });

    void loadProdutos();
});
