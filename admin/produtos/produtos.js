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

    let client;
    let authenticatedUserId = null;
    let produtos = [];
    let dataLoaded = false;
    let creatingProduct = false;
    let draftProductId = null;
    let editingProductId = null;

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
