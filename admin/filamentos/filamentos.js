document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEYS = {
        filamentos: 'rondyLabFilamentos',
        movimentacoes: 'rondyLabFilamentosMovimentacoes'
    };

    const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Outro'];
    const LOW_STOCK_THRESHOLD = 0.2;

    const formPanel = document.getElementById('filamento-form-panel');
    const form = document.getElementById('filamento-form');
    const openFormButton = document.getElementById('open-filamento-form');
    const cancelFormButton = document.getElementById('cancel-filamento-form');
    const formMessage = document.getElementById('filamento-form-message');
    const tableBody = document.getElementById('filamentos-table-body');
    const searchInput = document.getElementById('filamento-search');
    const statusFilter = document.getElementById('status-filter');
    const metricTotalRolos = document.getElementById('metric-total-rolos');
    const metricTotalDisponivel = document.getElementById('metric-total-disponivel');
    const metricEstoqueBaixo = document.getElementById('metric-estoque-baixo');

    const movimentacoesPanel = document.getElementById('movimentacoes-panel');
    const movimentacoesList = document.getElementById('movimentacoes-list');
    const movimentacaoForm = document.getElementById('movimentacao-form');
    const movimentoTipo = document.getElementById('movimento-tipo');
    const quantidadeMovInput = document.getElementById('movimento-quantidade');
    const saldoAjusteInput = document.getElementById('movimento-saldo-ajuste');
    const movimentacaoMessage = document.getElementById('movimento-form-message');
    const closeMovimentacoesButton = document.getElementById('close-movimentacoes');
    const movimentacaoAdjustField = document.querySelector('.movimentacao-adjust-field');

    let editingFilamentoId = null;
    let selectedFilamentoId = null;

    function readStorage(key, fallback) {
        try {
            const rawValue = localStorage.getItem(key);
            if (!rawValue) {
                return fallback;
            }
            return JSON.parse(rawValue) ?? fallback;
        } catch (error) {
            console.warn('Erro ao ler localStorage:', error);
            return fallback;
        }
    }

    function writeStorage(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.warn('Erro ao salvar localStorage:', error);
        }
    }

    function safeNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        }).format(value);
    }

    function formatGram(value) {
        return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} g`;
    }

    function getFilamentos() {
        const stored = readStorage(STORAGE_KEYS.filamentos, []);
        return Array.isArray(stored) ? stored : [];
    }

    function saveFilamentos(filamentos) {
        writeStorage(STORAGE_KEYS.filamentos, filamentos);
    }

    function getMovimentacoes() {
        const stored = readStorage(STORAGE_KEYS.movimentacoes, []);
        return Array.isArray(stored) ? stored : [];
    }

    function saveMovimentacoes(movimentacoes) {
        writeStorage(STORAGE_KEYS.movimentacoes, movimentacoes);
    }

    function uniqueId(prefix = 'id') {
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }

    function getCustoPorGrama(filamento) {
        const valorPago = safeNumber(filamento.valorPago, 0);
        const pesoNominal = safeNumber(filamento.pesoNominal, 0);
        if (pesoNominal <= 0) {
            return 0;
        }
        return valorPago / pesoNominal;
    }

    function getStatusBySaldo(filamento) {
        const pesoNominal = safeNumber(filamento.pesoNominal, 1);
        const saldo = safeNumber(filamento.quantidadeDisponivel, 0);
        const percentual = pesoNominal > 0 ? saldo / pesoNominal : 0;

        if (saldo <= 0) {
            return 'ESGOTADO';
        }

        if (percentual <= LOW_STOCK_THRESHOLD) {
            return 'ESTOQUE BAIXO';
        }

        return 'DISPONÍVEL';
    }

    function getStatusClass(status) {
        if (status === 'ESTOQUE BAIXO') {
            return 'filamento-tag--estoque-baixo';
        }

        if (status === 'ESGOTADO') {
            return 'filamento-tag--esgotado';
        }

        return 'filamento-tag--disponivel';
    }

    function renderIndicators() {
        const filamentos = getFilamentos();
        const totalRolos = filamentos.length;
        const totalDisponivel = filamentos.reduce((sum, item) => sum + safeNumber(item.quantidadeDisponivel, 0), 0);
        const estoqueBaixo = filamentos.filter((item) => getStatusBySaldo(item) === 'ESTOQUE BAIXO').length;

        metricTotalRolos.textContent = String(totalRolos);
        metricTotalDisponivel.textContent = `${Math.round(totalDisponivel).toLocaleString('pt-BR')} g`;
        metricEstoqueBaixo.textContent = String(estoqueBaixo);
    }

    function resetFormMessage() {
        formMessage.textContent = '';
        formMessage.classList.remove('is-error');
    }

    function setFormMessage(message, isError = false) {
        formMessage.textContent = message;
        formMessage.classList.toggle('is-error', isError);
    }

    function setMovementMessage(message, isError = false) {
        movimentacaoMessage.textContent = message;
        movimentacaoMessage.classList.toggle('is-error', isError);
    }

    function openForm() {
        formPanel.classList.remove('is-hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function closeForm() {
        form.reset();
        formPanel.classList.add('is-hidden');
        editingFilamentoId = null;
        resetFormMessage();
        openFormButton.textContent = '+ CADASTRAR FILAMENTO';
    }

    function getFormValues() {
        const formData = new FormData(form);
        return {
            material: String(formData.get('material') || '').trim(),
            marca: String(formData.get('marca') || '').trim(),
            linha: String(formData.get('linha') || '').trim(),
            cor: String(formData.get('cor') || '').trim(),
            pesoNominal: safeNumber(formData.get('pesoNominal'), 0),
            quantidadeDisponivel: safeNumber(formData.get('quantidadeDisponivel'), 0),
            valorPago: safeNumber(formData.get('valorPago'), 0),
            observacoes: String(formData.get('observacoes') || '').trim()
        };
    }

    function validateFilamento(values) {
        if (!values.material || !MATERIALS.includes(values.material)) {
            return 'Selecione um material válido.';
        }

        if (!values.marca || values.marca.length < 2) {
            return 'Informe a marca do filamento.';
        }

        if (!values.cor || values.cor.length < 2) {
            return 'Informe a cor do filamento.';
        }

        if (values.pesoNominal <= 0) {
            return 'O peso nominal do rolo deve ser maior que zero.';
        }

        if (values.quantidadeDisponivel < 0) {
            return 'O saldo inicial não pode ser negativo.';
        }

        if (values.quantidadeDisponivel > values.pesoNominal) {
            return 'O saldo inicial não pode ser maior que o peso nominal.';
        }

        if (values.valorPago < 0) {
            return 'O valor pago não pode ser negativo.';
        }

        return '';
    }

    function renderFilamentos() {
        const filamentos = getFilamentos();
        const searchTerm = searchInput.value.trim().toLowerCase();
        const filterStatus = statusFilter.value;

        const filtered = filamentos.filter((filamento) => {
            const searchableText = `${filamento.material} ${filamento.marca} ${filamento.linha || ''} ${filamento.cor}`.toLowerCase();
            const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
            const status = getStatusBySaldo(filamento);
            const matchesStatus = filterStatus === 'todos' || status.toLowerCase().replace(/\s+/g, '-') === filterStatus;
            return matchesSearch && matchesStatus;
        });

        if (!filtered.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum filamento encontrado para os filtros atuais.</td></tr>';
            return;
        }

        tableBody.innerHTML = filtered.map((filamento) => {
            const custoPorGrama = getCustoPorGrama(filamento);
            const status = getStatusBySaldo(filamento);
            const labelClass = getStatusClass(status);
            const saldoText = `${Math.round(safeNumber(filamento.quantidadeDisponivel, 0))} g / ${Math.round(safeNumber(filamento.pesoNominal, 0))} g`;

            return `
                <tr data-filamento-id="${filamento.id}">
                    <td>
                        <div class="filamento-info">
                            <span class="filamento-info__material">${filamento.material}</span>
                        </div>
                    </td>
                    <td>${filamento.marca}</td>
                    <td>${filamento.linha || '—'}</td>
                    <td>${filamento.cor}</td>
                    <td>${saldoText}</td>
                    <td>${formatCurrency(custoPorGrama)}/g</td>
                    <td><span class="filamento-tag ${labelClass}">${status}</span></td>
                    <td>
                        <div class="filamento-actions">
                            <button type="button" data-action="edit" data-id="${filamento.id}">EDITAR</button>
                            <button type="button" data-action="movimentacoes" data-id="${filamento.id}">MOVIMENTAÇÕES</button>
                            <button type="button" data-action="delete" data-id="${filamento.id}">EXCLUIR</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function createInitialMovement(filamentoId, quantidade) {
        const movements = getMovimentacoes();
        movements.push({
            id: uniqueId('mov'),
            filamentoId,
            tipo: 'ENTRADA',
            quantidade,
            dataHora: new Date().toISOString(),
            observacao: 'Cadastro inicial do rolo.'
        });
        saveMovimentacoes(movements);
    }

    function handleSubmit(event) {
        event.preventDefault();

        const values = getFormValues();
        const validationError = validateFilamento(values);
        if (validationError) {
            setFormMessage(validationError, true);
            return;
        }

        const filamentos = getFilamentos();

        if (editingFilamentoId) {
            const index = filamentos.findIndex((item) => item.id === editingFilamentoId);
            if (index >= 0) {
                filamentos[index] = {
                    ...filamentos[index],
                    material: values.material,
                    marca: values.marca,
                    linha: values.linha,
                    cor: values.cor,
                    pesoNominal: values.pesoNominal,
                    quantidadeDisponivel: Math.min(values.quantidadeDisponivel, values.pesoNominal),
                    valorPago: values.valorPago,
                    observacoes: values.observacoes,
                    atualizadoEm: new Date().toISOString()
                };
            }
        } else {
            const novoFilamento = {
                id: uniqueId('filamento'),
                material: values.material,
                marca: values.marca,
                linha: values.linha,
                cor: values.cor,
                pesoNominal: values.pesoNominal,
                quantidadeDisponivel: values.quantidadeDisponivel,
                valorPago: values.valorPago,
                observacoes: values.observacoes,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString()
            };

            filamentos.push(novoFilamento);
            createInitialMovement(novoFilamento.id, values.quantidadeDisponivel);
        }

        saveFilamentos(filamentos);
        renderIndicators();
        renderFilamentos();
        closeForm();
    }

    function populateForm(filamentoId) {
        const filamento = getFilamentos().find((item) => item.id === filamentoId);
        if (!filamento) {
            return;
        }

        editingFilamentoId = filamentoId;
        document.getElementById('filamento-material').value = filamento.material;
        document.getElementById('filamento-marca').value = filamento.marca;
        document.getElementById('filamento-linha').value = filamento.linha || '';
        document.getElementById('filamento-cor').value = filamento.cor;
        document.getElementById('filamento-peso').value = filamento.pesoNominal;
        document.getElementById('filamento-quantidade').value = filamento.quantidadeDisponivel;
        document.getElementById('filamento-valor').value = filamento.valorPago;
        document.getElementById('filamento-observacoes').value = filamento.observacoes || '';

        openForm();
        setFormMessage('Editando rolo selecionado.');
        openFormButton.textContent = 'EDITAR FILAMENTO';
    }

    function deleteFilamento(filamentoId) {
        const filamentos = getFilamentos();
        const filamento = filamentos.find((item) => item.id === filamentoId);
        if (!filamento) {
            return;
        }

        const confirmed = window.confirm(`Excluir o filamento ${filamento.marca} - ${filamento.cor}?`);
        if (!confirmed) {
            return;
        }

        const remainingFilamentos = filamentos.filter((item) => item.id !== filamentoId);
        saveFilamentos(remainingFilamentos);

        const remainingMovements = getMovimentacoes().filter((movimento) => movimento.filamentoId !== filamentoId);
        saveMovimentacoes(remainingMovements);

        renderIndicators();
        renderFilamentos();
    }

    function getFilamentoById(filamentoId) {
        return getFilamentos().find((item) => item.id === filamentoId) || null;
    }

    function getMovimentacoesByFilamento(filamentoId) {
        return getMovimentacoes().filter((mov) => mov.filamentoId === filamentoId).sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora));
    }

    function renderMovimentacoes(filamentoId) {
        const filamento = getFilamentoById(filamentoId);
        if (!filamento) {
            return;
        }

        const movimentacoes = getMovimentacoesByFilamento(filamentoId);
        const title = `${filamento.material} • ${filamento.marca} • ${filamento.linha || 'Sem linha'} • ${filamento.cor}`;
        document.getElementById('movimentacoes-title').textContent = title;

        if (!movimentacoes.length) {
            movimentacoesList.innerHTML = '<div class="empty-state">Nenhuma movimentação registrada para este rolo.</div>';
            return;
        }

        movimentacoesList.innerHTML = movimentacoes.map((movimento) => {
            const date = new Date(movimento.dataHora);
            return `
                <article class="movimento-item">
                    <div class="movimento-item__top">
                        <span class="movimento-item__tipo">${movimento.tipo}</span>
                        <strong class="movimento-item__quantidade">${movimento.tipo === 'AJUSTE' ? `${safeNumber(movimento.quantidade, 0)} g` : `${movimento.quantidade > 0 ? '+' : ''}${Math.round(safeNumber(movimento.quantidade, 0))} g`}</strong>
                    </div>
                    <div class="movimento-item__meta">
                        <div>${date.toLocaleString('pt-BR')}</div>
                        ${movimento.observacao ? `<div>${movimento.observacao}</div>` : ''}
                    </div>
                </article>
            `;
        }).join('');
    }

    function openMovimentacoes(filamentoId) {
        selectedFilamentoId = filamentoId;
        renderMovimentacoes(filamentoId);
        movimentacoesPanel.classList.remove('is-hidden');
    }

    function closeMovimentacoes() {
        movimentacoesPanel.classList.add('is-hidden');
        selectedFilamentoId = null;
        movimentacaoForm.reset();
        setMovementMessage('');
    }

    function validateMovimentacao(tipo, quantidade, saldoAtual, saldoAjuste) {
        if (!tipo || !['ENTRADA', 'CONSUMO', 'AJUSTE'].includes(tipo)) {
            return 'Selecione um tipo de movimentação válido.';
        }

        if (tipo === 'AJUSTE') {
            if (saldoAjuste < 0) {
                return 'O saldo do ajuste não pode ser negativo.';
            }
            return '';
        }

        if (quantidade <= 0) {
            return 'Informe uma quantidade maior que zero.';
        }

        if (tipo === 'CONSUMO' && quantidade > saldoAtual) {
            return 'O consumo não pode exceder o saldo disponível do rolo.';
        }

        return '';
    }

    function handleMovementSubmit(event) {
        event.preventDefault();

        if (!selectedFilamentoId) {
            return;
        }

        const tipo = movimentoTipo.value;
        const quantidade = safeNumber(quantidadeMovInput.value, 0);
        const saldoAjuste = safeNumber(saldoAjusteInput.value, 0);
        const observacao = document.getElementById('movimento-observacao').value.trim();

        const filamento = getFilamentoById(selectedFilamentoId);
        if (!filamento) {
            return;
        }

        const saldoAtual = safeNumber(filamento.quantidadeDisponivel, 0);
        const validationError = validateMovimentacao(tipo, quantidade, saldoAtual, saldoAjuste);
        if (validationError) {
            setMovementMessage(validationError, true);
            return;
        }

        const movimentacoes = getMovimentacoes();
        let nextSaldo = saldoAtual;

        if (tipo === 'ENTRADA') {
            nextSaldo += quantidade;
        }

        if (tipo === 'CONSUMO') {
            nextSaldo -= quantidade;
        }

        if (tipo === 'AJUSTE') {
            nextSaldo = saldoAjuste;
        }

        if (nextSaldo < 0) {
            setMovementMessage('O saldo após a movimentação não pode ficar negativo.', true);
            return;
        }

        const payload = {
            id: uniqueId('mov'),
            filamentoId: selectedFilamentoId,
            tipo,
            quantidade: tipo === 'AJUSTE' ? saldoAjuste : quantidade,
            dataHora: new Date().toISOString(),
            observacao: observacao || ''
        };

        movimentacoes.push(payload);
        saveMovimentacoes(movimentacoes);

        const filamentos = getFilamentos();
        const targetIndex = filamentos.findIndex((item) => item.id === selectedFilamentoId);
        if (targetIndex >= 0) {
            filamentos[targetIndex].quantidadeDisponivel = nextSaldo;
            filamentos[targetIndex].atualizadoEm = new Date().toISOString();
            saveFilamentos(filamentos);
        }

        renderIndicators();
        renderFilamentos();
        renderMovimentacoes(selectedFilamentoId);
        movimentacaoForm.reset();
        setMovementMessage('');
    }

    function toggleMovementFields() {
        const tipo = movimentoTipo.value;
        const isAjuste = tipo === 'AJUSTE';
        document.querySelector('.movimentacao-quantity-field').style.display = isAjuste ? 'none' : 'block';
        movimentacaoAdjustField.classList.toggle('is-hidden', !isAjuste);

        if (isAjuste) {
            quantidadeMovInput.value = '';
        }
    }

    openFormButton.addEventListener('click', () => {
        if (formPanel.classList.contains('is-hidden')) {
            form.reset();
            editingFilamentoId = null;
            openForm();
            openFormButton.textContent = '+ CADASTRAR FILAMENTO';
            resetFormMessage();
        }
    });

    cancelFormButton.addEventListener('click', closeForm);
    form.addEventListener('submit', handleSubmit);

    searchInput.addEventListener('input', renderFilamentos);
    statusFilter.addEventListener('change', renderFilamentos);

    tableBody.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
            return;
        }

        const filamentId = button.dataset.id;
        const action = button.dataset.action;

        if (action === 'edit') {
            populateForm(filamentId);
        }

        if (action === 'movimentacoes') {
            openMovimentacoes(filamentId);
        }

        if (action === 'delete') {
            deleteFilamento(filamentId);
        }
    });

    closeMovimentacoesButton.addEventListener('click', closeMovimentacoes);
    movimentoTipo.addEventListener('change', toggleMovementFields);
    movimentacaoForm.addEventListener('submit', handleMovementSubmit);

    form.reset();
    renderIndicators();
    renderFilamentos();
    toggleMovementFields();
});
