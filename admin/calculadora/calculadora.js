document.addEventListener('DOMContentLoaded', async () => {
    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;

    const DEFAULT_SETTINGS = {
        tarifaEnergia: null,
        perdaPadrao: null,
        maoObraPadrao: null
    };

    const impressoraSelect = document.getElementById('impressora-select');
    const materialLinesContainer = document.getElementById('material-lines');
    const materialWarning = document.getElementById('material-warning');
    const addMaterialButton = document.getElementById('add-material-line');
    const quantidadeProducao = document.getElementById('quantidade-producao');
    const projetoNome = document.getElementById('projeto-nome');
    const tempoHoras = document.getElementById('tempo-horas');
    const tempoMinutos = document.getElementById('tempo-minutos');
    const percentualPerdas = document.getElementById('percentual-perdas');
    const markupPercent = document.getElementById('markup-percent');
    const precoVendaManual = document.getElementById('preco-venda-manual');
    const precoConsumidor = document.getElementById('preco-consumidor');
    const repasseTipo = document.getElementById('repasse-tipo');
    const repasseValor = document.getElementById('repasse-valor');
    const repasseUnit = document.getElementById('repasse-unit');
    const laborToggle = document.getElementById('labor-toggle');
    const laborPanel = document.getElementById('labor-panel');
    const laborHoras = document.getElementById('labor-horas');
    const laborMinutos = document.getElementById('labor-minutos');
    const laborRate = document.getElementById('labor-rate');
    const savePriceButton = document.getElementById('save-price');
    const newCalculationButton = document.getElementById('new-calculation');
    const toggleDetailsButton = document.getElementById('toggle-details');
    const detailsPanel = document.getElementById('details-panel');
    const savedPricingList = document.getElementById('saved-pricing-list');
    const savedPricingDetail = document.getElementById('saved-pricing-detail');
    const calculatorMessage = document.getElementById('calculator-message');
    const loadStatus = document.getElementById('calculator-load-status');
    const retryLoadButton = document.getElementById('retry-calculator-load');
    const costWarnings = document.getElementById('calculator-cost-warnings');

    const summaryMaterial = document.getElementById('summary-material');
    const summaryEnergy = document.getElementById('summary-energy');
    const summaryDepreciation = document.getElementById('summary-depreciation');
    const summaryMaintenance = document.getElementById('summary-maintenance');
    const summaryLosses = document.getElementById('summary-losses');
    const summaryLabor = document.getElementById('summary-labor');
    const summaryTotalCost = document.getElementById('summary-total-cost');
    const summaryUnitCost = document.getElementById('summary-unit-cost');
    const salesResult = document.getElementById('sales-result');

    const calculatorControls = Array.from(document.querySelectorAll(
        '.admin-calculadora-page input, .admin-calculadora-page select, .admin-calculadora-page button'
    ))
        .filter((control) => control !== retryLoadButton)
        .map((control) => ({ control, initiallyDisabled: control.disabled }));

    let client;
    let authenticatedUserId = null;
    let settings = { ...DEFAULT_SETTINGS };
    let printers = [];
    let filamentos = [];
    let savedPricings = [];
    let dataLoaded = false;
    let pricingMutationInProgress = false;
    let authSubscription = null;

    setCalculatorControlsDisabled(true);
    retryLoadButton.hidden = true;
    loadStatus.textContent = 'Aguardando verificação da sessão…';

    function safeNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function toCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(Number(value) || 0);
    }

    function normalizeNumber(value) {
        return Number(String(value).replace(',', '.'));
    }

    function readCalculationInput(input, label, errors, { required = true } = {}) {
        if (input.validity?.badInput) {
            errors.push(`${label}: informe um número válido.`);
            return null;
        }

        const rawValue = input.value.trim();
        if (!rawValue) {
            if (required) errors.push(`${label}: informe um valor.`);
            return null;
        }

        if (input.validity?.stepMismatch) {
            errors.push(`${label}: use a precisão indicada pelo campo.`);
            return null;
        }

        const value = normalizeNumber(rawValue);
        if (!Number.isFinite(value)) {
            errors.push(`${label}: informe um número válido.`);
            return null;
        }
        return value;
    }

    function containsNonFiniteNumber(value) {
        if (typeof value === 'number') return !Number.isFinite(value);
        if (Array.isArray(value)) return value.some(containsNonFiniteNumber);
        if (value && typeof value === 'object') {
            return Object.values(value).some(containsNonFiniteNumber);
        }
        return false;
    }

    function getErrorMessage(error) {
        return error && typeof error.message === 'string' && error.message
            ? error.message
            : 'Verifique a conexão e tente novamente.';
    }

    function getSettings() {
        return settings;
    }

    function getPrinters() {
        return printers;
    }

    function getFilamentos() {
        return filamentos;
    }

    function getSavedPricings() {
        return savedPricings;
    }

    function setCalculatorControlsDisabled(disabled) {
        calculatorControls.forEach(({ control, initiallyDisabled }) => {
            control.disabled = disabled || initiallyDisabled;
        });
    }

    function setLoadStatus(message, isError = false) {
        loadStatus.textContent = message;
        loadStatus.classList.toggle('is-error', isError);
        loadStatus.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setMessage(message, isError = false) {
        calculatorMessage.textContent = message;
        calculatorMessage.classList.toggle('is-error', isError);
        calculatorMessage.setAttribute('role', isError ? 'alert' : 'status');
    }

    function getCostWarnings() {
        const warnings = [];
        const tariff = settings.tarifaEnergia;
        if (tariff === null || !Number.isFinite(tariff) || tariff < 0) {
            warnings.push({
                blocking: true,
                message: 'Tarifa de energia não configurada ou inválida. Configure um valor em Configurações antes de salvar a precificação. R$ 0,00 é aceito quando configurado explicitamente.'
            });
        }

        const rawLosses = percentualPerdas.value;
        const losses = rawLosses === '' ? null : normalizeNumber(rawLosses);
        if (losses === null) {
            warnings.push({
                blocking: false,
                message: 'Nenhuma perda foi considerada: o cálculo utilizará 0%.'
            });
        } else if (!Number.isFinite(losses) || losses < 0 || losses > 100) {
            warnings.push({
                blocking: true,
                message: 'O percentual de perdas é inválido. Informe um valor entre 0% e 100%.'
            });
        }

        if (laborToggle.checked) {
            const rawLaborRate = laborRate.value;
            const rate = rawLaborRate === '' ? null : normalizeNumber(rawLaborRate);
            if (rate === null || !Number.isFinite(rate) || rate < 0) {
                warnings.push({
                    blocking: true,
                    message: 'Mão de obra está ativada, mas o valor por hora está ausente ou inválido. Informe um valor; R$ 0,00 é aceito quando explícito.'
                });
            }
        }

        const printer = getPrinterById(impressoraSelect.value);
        if (!printer) {
            warnings.push({
                blocking: true,
                message: 'Selecione uma impressora cadastrada para validar energia, depreciação e manutenção.'
            });
        } else if (!Number.isFinite(printer.consumoWatts) || printer.consumoWatts <= 0
            || !Number.isFinite(printer.valorPago) || printer.valorPago <= 0
            || !Number.isFinite(printer.vidaUtilHoras) || printer.vidaUtilHoras <= 0
            || !Number.isFinite(printer.manutencaoHora) || printer.manutencaoHora < 0) {
            warnings.push({
                blocking: true,
                message: 'A impressora selecionada possui consumo, valor pago, vida útil ou manutenção ausente/inválido. Corrija os dados em Configurações.'
            });
        }
        return warnings;
    }

    function renderCostWarnings(warnings = getCostWarnings()) {
        costWarnings.replaceChildren();
        warnings.forEach(({ blocking, message }) => {
            const item = document.createElement('p');
            item.className = blocking ? 'admin-form-message is-error' : 'calculator-warning';
            item.textContent = message;
            costWarnings.append(item);
        });
        costWarnings.setAttribute(
            'aria-live',
            warnings.some(({ blocking }) => blocking) ? 'assertive' : 'polite'
        );
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    function databaseNumber(value, fieldName) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            throw new Error(`O campo ${fieldName} retornado pelo Supabase não contém um número válido.`);
        }
        return parsed;
    }

    function requiredDatabaseNumber(value, fieldName) {
        if (value === null || value === undefined || value === '') {
            throw new Error(`O campo obrigatório ${fieldName} da impressora está ausente.`);
        }
        return databaseNumber(value, fieldName);
    }

    function isJsonObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function mapSettings(row) {
        if (!row || row.user_id !== authenticatedUserId) {
            throw new Error('A consulta retornou configurações sem propriedade válida.');
        }
        return {
            tarifaEnergia: row.tarifa_energia === null
                ? null
                : databaseNumber(row.tarifa_energia, 'tarifa_energia'),
            perdaPadrao: row.perda_padrao === null
                ? null
                : databaseNumber(row.perda_padrao, 'perda_padrao'),
            maoObraPadrao: row.mao_obra_padrao === null
                ? null
                : databaseNumber(row.mao_obra_padrao, 'mao_obra_padrao')
        };
    }

    function mapPrinter(row) {
        if (!row || row.user_id !== authenticatedUserId || !row.id) {
            throw new Error('A consulta retornou uma impressora sem propriedade ou identificador válido.');
        }
        const printer = {
            id: String(row.id),
            userId: row.user_id,
            nome: String(row.nome),
            valorPago: requiredDatabaseNumber(row.valor_pago, 'valor_pago'),
            vidaUtilHoras: requiredDatabaseNumber(row.vida_util_horas, 'vida_util_horas'),
            consumoWatts: requiredDatabaseNumber(row.consumo_watts, 'consumo_watts'),
            manutencaoHora: requiredDatabaseNumber(row.manutencao_hora, 'manutencao_hora')
        };
        if (printer.valorPago <= 0 || printer.vidaUtilHoras <= 0
            || printer.consumoWatts <= 0 || printer.manutencaoHora < 0) {
            throw new Error(`A impressora "${printer.nome}" possui parâmetros de custo inválidos. Corrija os dados em Configurações.`);
        }
        return printer;
    }

    function mapFilamento(row) {
        if (!row || row.user_id !== authenticatedUserId || !row.id) {
            throw new Error('A consulta retornou um filamento sem propriedade ou identificador válido.');
        }
        return {
            id: String(row.id),
            userId: row.user_id,
            material: String(row.material),
            marca: String(row.marca),
            linha: row.linha ?? '',
            cor: String(row.cor),
            pesoNominal: databaseNumber(row.peso_nominal, 'peso_nominal'),
            quantidadeDisponivel: databaseNumber(row.quantidade_disponivel, 'quantidade_disponivel'),
            valorPago: databaseNumber(row.valor_pago, 'valor_pago'),
            arquivado: row.arquivado
        };
    }

    function mapPricing(row) {
        if (!row || row.user_id !== authenticatedUserId || !row.id) {
            throw new Error('A consulta retornou uma precificação sem propriedade ou identificador válido.');
        }
        if (!Array.isArray(row.material) || !isJsonObject(row.detalhes) || !isJsonObject(row.snapshot)) {
            throw new Error('Uma precificação retornada pelo Supabase possui estrutura inválida.');
        }
        return {
            id: String(row.id),
            userId: row.user_id,
            nome: String(row.nome),
            data: row.data,
            quantidade: databaseNumber(row.quantidade, 'quantidade'),
            tipo: String(row.tipo),
            impressora: String(row.impressora),
            totalCost: databaseNumber(row.total_cost, 'total_cost'),
            unitCost: databaseNumber(row.unit_cost, 'unit_cost'),
            material: row.material,
            detalhes: row.detalhes,
            snapshot: row.snapshot,
            criadoEm: row.criado_em,
            atualizadoEm: row.atualizado_em
        };
    }

    async function fetchAllRows(queryFactory) {
        const pageSize = 500;
        const rows = [];
        let offset = 0;

        while (true) {
            const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
            if (error) throw error;
            if (!Array.isArray(data)) {
                throw new Error('Uma consulta ao Supabase não retornou uma lista válida.');
            }
            rows.push(...data);
            if (data.length < pageSize) return rows;
            offset += data.length;
        }
    }

    function clearUserData(message) {
        dataLoaded = false;
        authenticatedUserId = null;
        settings = { ...DEFAULT_SETTINGS };
        printers = [];
        filamentos = [];
        savedPricings = [];
        setCalculatorControlsDisabled(true);
        impressoraSelect.replaceChildren(new Option('Selecione uma impressora', ''));
        materialLinesContainer.replaceChildren();
        materialWarning.textContent = '';
        detailsPanel.replaceChildren();
        detailsPanel.classList.add('is-hidden');
        savedPricingList.textContent = message;
        savedPricingDetail.replaceChildren();
        savedPricingDetail.classList.add('is-hidden');
        costWarnings.replaceChildren();
        const costPurpose = document.querySelector('input[name="finalidade"][value="somente-custo"]');
        if (costPurpose) costPurpose.checked = true;
        resetInputs();
        handlePurposeChange();
        [
            summaryMaterial,
            summaryEnergy,
            summaryDepreciation,
            summaryMaintenance,
            summaryLosses,
            summaryLabor,
            summaryTotalCost,
            summaryUnitCost
        ].forEach((element) => {
            element.textContent = toCurrency(0);
        });
        salesResult.replaceChildren();
        setMessage('');
    }

    async function loadData() {
        clearUserData('Carregando precificações…');
        retryLoadButton.hidden = true;
        setLoadStatus('Carregando dados da sua conta no Supabase…');

        try {
            client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous) {
                throw new Error('Não há uma sessão autenticada válida. Entre novamente no Admin.');
            }
            authenticatedUserId = userData.user.id;
            const userId = authenticatedUserId;

            if (!authSubscription) {
                authSubscription = client.auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_OUT' ||
                        (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) &&
                            authenticatedUserId && session?.user?.id !== authenticatedUserId)) {
                        clearUserData('Sessão alterada. Recarregue para carregar os dados da conta atual.');
                        setLoadStatus('Os dados foram ocultados porque a sessão mudou.', true);
                        retryLoadButton.hidden = false;
                    }
                }).data.subscription;
            }

            const [settingsResult, printersRows, filamentsRows, pricingRows] = await Promise.all([
                client.from('configuracoes_usuario')
                    .select('user_id, tarifa_energia, perda_padrao, mao_obra_padrao')
                    .eq('user_id', userId)
                    .maybeSingle(),
                fetchAllRows(() => client.from('impressoras')
                    .select('id, user_id, nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora, criado_em')
                    .eq('user_id', userId)
                    .order('criado_em', { ascending: true })
                    .order('id', { ascending: true })),
                fetchAllRows(() => client.from('filamentos')
                    .select('id, user_id, material, marca, linha, cor, peso_nominal, quantidade_disponivel, valor_pago, arquivado')
                    .eq('user_id', userId)
                    .eq('arquivado', false)
                    .order('criado_em', { ascending: true })
                    .order('id', { ascending: true })),
                fetchAllRows(() => client.from('precificacoes')
                    .select('id, user_id, nome, data, quantidade, tipo, impressora, total_cost, unit_cost, material, detalhes, snapshot, criado_em, atualizado_em')
                    .eq('user_id', userId)
                    .order('data', { ascending: false })
                    .order('id', { ascending: true }))
            ]);

            if (settingsResult.error) throw settingsResult.error;
            const { data: confirmedUserData, error: confirmedUserError } = await client.auth.getUser();
            if (confirmedUserError) throw confirmedUserError;
            if (!confirmedUserData?.user || confirmedUserData.user.id !== userId) {
                throw new Error('A sessão mudou durante o carregamento. Tente novamente.');
            }

            settings = settingsResult.data
                ? mapSettings(settingsResult.data)
                : { ...DEFAULT_SETTINGS };
            printers = printersRows.map(mapPrinter);
            filamentos = filamentsRows.map(mapFilamento);
            savedPricings = pricingRows.map(mapPricing);

            dataLoaded = true;
            populatePrinterSelect();
            resetInputs();
            handlePurposeChange();
            toggleRepasseUnit();
            renderSavedPricings();
            updateSummary();
            setCalculatorControlsDisabled(false);
            setLoadStatus('Dados carregados do Supabase.');
        } catch (error) {
            console.error('Não foi possível carregar os dados da Calculadora no Supabase:', error);
            clearUserData('Não foi possível carregar o histórico de precificações.');
            setLoadStatus(`Não foi possível carregar os dados da Calculadora. ${getErrorMessage(error)}`, true);
            retryLoadButton.hidden = false;
        }
    }

    function getPrinterById(printerId) {
        return getPrinters().find((printer) => printer.id === printerId) || null;
    }

    function getFilamentoById(filamentoId) {
        return getFilamentos().find((filamento) => filamento.id === filamentoId) || null;
    }

    function calculateCustoPorGrama(filamento) {
        const valorPago = safeNumber(filamento?.valorPago, 0);
        const pesoNominal = safeNumber(filamento?.pesoNominal, 0);

        if (pesoNominal <= 0) {
            return 0;
        }

        return valorPago / pesoNominal;
    }

    function calculateDepreciacaoHora(printer) {
        const valorPago = safeNumber(printer?.valorPago, 0);
        const vidaUtilHoras = safeNumber(printer?.vidaUtilHoras, 0);

        return vidaUtilHoras > 0 ? valorPago / vidaUtilHoras : 0;
    }

    function getMaterialLines() {
        return Array.from(document.querySelectorAll('.material-line'));
    }

    function renderFilamentSelectOptions(selectElement, currentValue = '') {
        const filamentos = getFilamentos();
        const optionList = [{ value: '', label: 'Selecione um filamento' }].concat(
            filamentos.map((filamento) => ({
                value: filamento.id,
                label: `${filamento.material} • ${filamento.marca} • ${filamento.cor}`
            }))
        );

        selectElement.innerHTML = optionList.map((option) => `
            <option value="${escapeHTML(option.value)}" ${option.value === currentValue ? 'selected' : ''}>
                ${escapeHTML(option.label)}
            </option>
        `).join('');
    }

    function addMaterialLine({ filamentId = '', grams = '', focus = false } = {}) {
        const index = materialLinesContainer.children.length + 1;
        const materialLine = document.createElement('div');
        materialLine.className = 'material-line';
        materialLine.dataset.materialIndex = String(index);
        materialLine.innerHTML = `
            <div class="material-line__top">
                <span>Filamento ${index}</span>
                <button type="button" class="material-line__remove">Remover</button>
            </div>
            <div class="material-line__fields">
                <div class="config-field">
                    <label>Filamento</label>
                    <select class="material-line__filamento"></select>
                </div>
                <div class="config-field">
                    <label>Gramagem necessária</label>
                    <div class="config-field__input-row">
                        <input class="material-line__grams" type="number" min="0" step="0.01" value="${grams}" placeholder="0,00">
                        <span class="config-field__unit">g</span>
                    </div>
                </div>
            </div>
            <div class="material-line__cost">Custo estimado: R$ 0,00</div>
            <div class="material-line__warning"></div>
        `;

        const select = materialLine.querySelector('.material-line__filamento');
        renderFilamentSelectOptions(select, filamentId);

        materialLine.querySelector('.material-line__remove').addEventListener('click', () => {
            if (materialLinesContainer.children.length > 1) {
                materialLine.remove();
                updateMaterialLineLabels();
                refreshMaterialCosts();
            }
        });

        materialLine.querySelector('.material-line__filamento').addEventListener('change', refreshMaterialCosts);
        materialLine.querySelector('.material-line__grams').addEventListener('input', refreshMaterialCosts);
        materialLine.querySelectorAll('input, select, button').forEach((control) => {
            control.disabled = !dataLoaded;
        });

        materialLinesContainer.appendChild(materialLine);

        if (focus) {
            setTimeout(() => {
                const gramsInput = materialLine.querySelector('.material-line__grams');
                if (gramsInput) {
                    gramsInput.focus();
                }
            }, 40);
        }

        updateMaterialLineLabels();
        refreshMaterialCosts();
    }

    function updateMaterialLineLabels() {
        const lines = getMaterialLines();
        lines.forEach((line, index) => {
            const label = line.querySelector('.material-line__top span');
            if (label) {
                label.textContent = `Filamento ${index + 1}`;
            }
        });
    }

    function refreshMaterialCosts() {
        if (!dataLoaded) return;
        const lines = getMaterialLines();
        let hasFilament = false;

        lines.forEach((line) => {
            const select = line.querySelector('.material-line__filamento');
            const input = line.querySelector('.material-line__grams');
            const costText = line.querySelector('.material-line__cost');
            const warning = line.querySelector('.material-line__warning');
            const filamentId = select.value;
            const grams = safeNumber(input.value, 0);
            const filament = getFilamentoById(filamentId);

            if (filament) {
                hasFilament = true;
                const custoPorGrama = calculateCustoPorGrama(filament);
                const total = grams * custoPorGrama;
                costText.textContent = `Custo estimado: ${toCurrency(total)}`;

                if (grams <= 0) {
                    warning.textContent = 'Informe a gramagem necessária para esse material.';
                } else if (grams > safeNumber(filament.quantidadeDisponivel, 0)) {
                    warning.textContent = `Atenção: o saldo disponível deste rolo é de ${Number(safeNumber(filament.quantidadeDisponivel, 0)).toLocaleString('pt-BR')} g.`;
                } else {
                    warning.textContent = '';
                }
            } else {
                costText.textContent = 'Custo estimado: R$ 0,00';
                warning.textContent = 'Selecione um filamento cadastrado no módulo de filamentos.';
            }
        });

        if (!hasFilament) {
            materialWarning.textContent = 'Cadastre pelo menos um filamento para iniciar a precificação.';
        } else {
            materialWarning.textContent = '';
        }

        updateSummary();
    }

    function buildSalesResult(totalCost, unitCost) {
        const purpose = document.querySelector('input[name="finalidade"]:checked')?.value || 'somente-custo';
        const markup = safeNumber(markupPercent.value, 0);
        const manualPrice = safeNumber(precoVendaManual.value, 0);
        const consumerPrice = safeNumber(precoConsumidor.value, 0);
        const repasseValue = safeNumber(repasseValor.value, 0);
        const quantity = safeNumber(quantidadeProducao.value, 1);

        salesResult.innerHTML = '';

        if (purpose === 'somente-custo') {
            salesResult.innerHTML = `
                <div class="sales-result__row"><span>Sem finalidade ativa</span><strong>${toCurrency(totalCost)}</strong></div>
            `;
            return {
                purpose,
                salePricePerUnit: null,
                salePriceTotal: null,
                profit: null,
                marginPercent: null,
                consumerPrice: null,
                repasse: null,
                netRevenuePerUnit: null,
                netRevenueTotal: null
            };
        }

        if (purpose === 'venda') {
            const salePrice = manualPrice > 0 ? manualPrice : unitCost * (1 + markup / 100);
            const priceTotal = salePrice * quantity;
            const profit = priceTotal - totalCost;
            const marginPercent = priceTotal > 0 ? (profit / priceTotal) * 100 : 0;

            salesResult.innerHTML = `
                <div class="sales-result__row"><span>Preço por unidade</span><strong>${toCurrency(salePrice)}</strong></div>
                <div class="sales-result__row"><span>Preço total</span><strong>${toCurrency(priceTotal)}</strong></div>
                <div class="sales-result__row"><span>Margem líquida</span><strong>${toCurrency((salePrice - unitCost) * quantity)}</strong></div>
            `;
            return {
                purpose,
                salePricePerUnit: salePrice,
                salePriceTotal: priceTotal,
                profit,
                marginPercent,
                consumerPrice: null,
                repasse: null,
                netRevenuePerUnit: null,
                netRevenueTotal: null
            };
        }

        const repasse = repasseTipo.value === 'fixo'
            ? repasseValue
            : consumerPrice * (repasseValue / 100);

        const receiveValue = Math.max(consumerPrice - repasse, 0);
        const netRevenueTotal = receiveValue * quantity;
        const profit = netRevenueTotal - totalCost;
        const marginPercent = netRevenueTotal > 0 ? (profit / netRevenueTotal) * 100 : 0;

        salesResult.innerHTML = `
            <div class="sales-result__row"><span>Preço ao consumidor</span><strong>${toCurrency(consumerPrice)}</strong></div>
            <div class="sales-result__row"><span>Repasse</span><strong>${toCurrency(repasse)}</strong></div>
            <div class="sales-result__row"><span>Receita líquida</span><strong>${toCurrency(receiveValue)}</strong></div>
        `;

        return {
            purpose,
            salePricePerUnit: consumerPrice,
            salePriceTotal: consumerPrice * quantity,
            profit,
            marginPercent,
            consumerPrice,
            repasse,
            netRevenuePerUnit: receiveValue,
            netRevenueTotal
        };
    }

    function getTotalMaterialCost() {
        return getMaterialLines().reduce((sum, line) => {
            const select = line.querySelector('.material-line__filamento');
            const gramsInput = line.querySelector('.material-line__grams');
            const filamento = getFilamentoById(select.value);
            const grams = safeNumber(gramsInput.value, 0);

            if (!filamento) {
                return sum;
            }

            return sum + (grams * calculateCustoPorGrama(filamento));
        }, 0);
    }

    function parseRuntimeHours() {
        const hours = safeNumber(tempoHoras.value, 0);
        const minutes = safeNumber(tempoMinutos.value, 0);

        return hours + (minutes / 60);
    }

    function parseLaborHours() {
        const hours = safeNumber(laborHoras.value, 0);
        const minutes = safeNumber(laborMinutos.value, 0);

        return hours + (minutes / 60);
    }

    function updateSummary() {
        if (!dataLoaded) return null;
        const settings = getSettings();
        const printer = getPrinterById(impressoraSelect.value);
        renderCostWarnings();
        const totalRuntimeHours = parseRuntimeHours();
        const quantity = safeNumber(quantidadeProducao.value, 1);
        const materialCost = getTotalMaterialCost();
        const energyCost = printer
            ? (safeNumber(printer.consumoWatts, 0) / 1000) * safeNumber(settings.tarifaEnergia, 0) * totalRuntimeHours
            : 0;
        const depreciationHour = printer ? calculateDepreciacaoHora(printer) : 0;
        const depreciationCost = depreciationHour * totalRuntimeHours;
        const maintenanceCost = printer ? safeNumber(printer.manutencaoHora, 0) * totalRuntimeHours : 0;
        const percentualPerdasValue = safeNumber(percentualPerdas.value, 0);
        const subtotalBeforeLosses = materialCost + energyCost + depreciationCost + maintenanceCost;
        const lossesCost = subtotalBeforeLosses * (percentualPerdasValue / 100);

        const laborActive = laborToggle.checked;
        const laborHours = parseLaborHours();
        const laborValue = laborActive ? laborHours * safeNumber(laborRate.value, 0) : 0;
        const totalCost = subtotalBeforeLosses + lossesCost + laborValue;
        const unitCost = quantity > 0 ? totalCost / quantity : 0;

        summaryMaterial.textContent = toCurrency(materialCost);
        summaryEnergy.textContent = toCurrency(energyCost);
        summaryDepreciation.textContent = toCurrency(depreciationCost);
        summaryMaintenance.textContent = toCurrency(maintenanceCost);
        summaryLosses.textContent = toCurrency(lossesCost);
        summaryLabor.textContent = toCurrency(laborValue);
        summaryTotalCost.textContent = toCurrency(totalCost);
        summaryUnitCost.textContent = toCurrency(unitCost);

        const sales = buildSalesResult(totalCost, unitCost);
        const calculation = {
            materialCost,
            energyCost,
            depreciationCost,
            maintenanceCost,
            lossesCost,
            laborValue,
            totalCost,
            unitCost,
            quantity,
            runtime: totalRuntimeHours,
            laborHours,
            printer,
            subtotalBeforeLosses,
            percentualPerdas: percentualPerdasValue,
            laborActive,
            laborRate: laborActive ? safeNumber(laborRate.value, 0) : 0,
            energyTariff: safeNumber(settings.tarifaEnergia, 0),
            sales
        };

        renderDetails(calculation);
        return calculation;
    }

    function renderDetails(details) {
        const detailRows = [];
        const materialRows = getMaterialLines().map((line) => {
            const filamentId = line.querySelector('.material-line__filamento').value;
            const filament = getFilamentoById(filamentId);
            const grams = safeNumber(line.querySelector('.material-line__grams').value, 0);
            const cost = filament ? grams * calculateCustoPorGrama(filament) : 0;

            if (!filament) {
                return null;
            }

            return `${filament.material} • ${filament.marca}: ${Number(grams).toLocaleString('pt-BR')} g × ${toCurrency(calculateCustoPorGrama(filament))}/g = ${toCurrency(cost)}`;
        }).filter(Boolean);

        if (materialRows.length) {
            detailRows.push({
                title: 'Material',
                value: toCurrency(details.materialCost),
                formula: materialRows.join(' + ')
            });
        }

        detailRows.push({
            title: 'Energia',
            value: toCurrency(details.energyCost),
            formula: `(${Number(details.runtime).toFixed(2)} h × ${toCurrency(details.energyCost / Math.max(details.runtime, 1))}/h)`
        });

        detailRows.push({
            title: 'Depreciação',
            value: toCurrency(details.depreciationCost),
            formula: `${toCurrency(details.depreciationCost / Math.max(details.runtime, 1))}/h × ${Number(details.runtime).toFixed(2)} h`
        });

        detailRows.push({
            title: 'Manutenção',
            value: toCurrency(details.maintenanceCost),
            formula: `${toCurrency(details.maintenanceCost / Math.max(details.runtime, 1))}/h × ${Number(details.runtime).toFixed(2)} h`
        });

        detailRows.push({
            title: 'Perdas',
            value: toCurrency(details.lossesCost),
            formula: `${toCurrency(details.subtotalBeforeLosses)} × ${safeNumber(percentualPerdas.value, 0)}%`
        });

        detailRows.push({
            title: 'Mão de obra',
            value: toCurrency(details.laborValue),
            formula: `${Number(details.laborHours).toFixed(2)} h × ${toCurrency(safeNumber(laborRate.value, 0))}/h`
        });

        detailsPanel.innerHTML = detailRows.map((row) => `
            <div class="detail-item">
                <div class="detail-item__title">
                    <span>${escapeHTML(row.title)}</span>
                    <strong>${escapeHTML(row.value)}</strong>
                </div>
                <div class="detail-item__formula">${escapeHTML(row.formula)}</div>
            </div>
        `).join('');
    }

    function populatePrinterSelect() {
        const printers = getPrinters();
        impressoraSelect.innerHTML = '<option value="">Selecione uma impressora</option>' + printers.map((printer) => `
            <option value="${escapeHTML(printer.id)}">${escapeHTML(printer.nome)}</option>
        `).join('');

        if (printers.length) {
            impressoraSelect.value = printers[0].id;
        }
    }

    function resetInputs() {
        projetoNome.value = '';
        quantidadeProducao.value = '1';
        tempoHoras.value = '0';
        tempoMinutos.value = '0';
        percentualPerdas.value = getSettings().perdaPadrao ?? '';
        markupPercent.value = '0';
        precoVendaManual.value = '0';
        precoConsumidor.value = '0';
        repasseTipo.value = 'percentual';
        repasseValor.value = '0';
        laborToggle.checked = false;
        laborPanel.classList.add('is-hidden');
        laborHoras.value = '0';
        laborMinutos.value = '0';
        laborRate.value = getSettings().maoObraPadrao ?? '';
        materialLinesContainer.innerHTML = '';
        addMaterialLine();
        setMessage('');
    }

    function toggleLaborPanel() {
        laborPanel.classList.toggle('is-hidden', !laborToggle.checked);
        updateSummary();
    }

    function toggleRepasseUnit() {
        repasseUnit.textContent = repasseTipo.value === 'percentual' ? '%' : 'R$';
        updateSummary();
    }

    function validateCalculation() {
        const errors = [];
        const projectName = projetoNome.value.trim();
        if (!projectName) {
            errors.push('Nome da peça/projeto: informe um nome que não seja apenas espaços.');
        }

        const quantity = readCalculationInput(quantidadeProducao, 'Quantidade produzida', errors);
        if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) {
            errors.push('Quantidade produzida: informe um número inteiro maior que zero.');
        }

        const hours = readCalculationInput(tempoHoras, 'Tempo de impressão em horas', errors);
        if (hours !== null && (!Number.isInteger(hours) || hours < 0)) {
            errors.push('Tempo de impressão em horas: informe um inteiro não negativo.');
        }
        const minutes = readCalculationInput(tempoMinutos, 'Tempo de impressão em minutos', errors);
        if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 59)) {
            errors.push('Tempo de impressão em minutos: informe um inteiro entre 0 e 59.');
        }
        if (hours !== null && minutes !== null && hours + (minutes / 60) <= 0) {
            errors.push('Tempo total de impressão: informe uma duração maior que zero.');
        }

        const materialLines = getMaterialLines();
        let validMaterialCount = 0;
        materialLines.forEach((line, index) => {
            const lineNumber = index + 1;
            const filamentId = line.querySelector('.material-line__filamento').value;
            const gramsInput = line.querySelector('.material-line__grams');
            const gramsValue = gramsInput.value.trim();

            if (!filamentId && !gramsValue) return;

            const filament = getFilamentoById(filamentId);
            if (!filament) {
                errors.push(`Filamento ${lineNumber}: selecione um filamento válido.`);
            }

            const grams = readCalculationInput(
                gramsInput,
                `Filamento ${lineNumber}, gramagem`,
                errors
            );
            if (grams !== null && grams <= 0) {
                errors.push(`Filamento ${lineNumber}, gramagem: informe uma quantidade maior que zero.`);
            }

            if (filament) {
                const costPerGram = calculateCustoPorGrama(filament);
                if (!Number.isFinite(filament.pesoNominal) || filament.pesoNominal <= 0
                    || !Number.isFinite(filament.valorPago) || filament.valorPago < 0
                    || !Number.isFinite(costPerGram) || costPerGram < 0) {
                    errors.push(`Filamento ${lineNumber}: os dados de peso ou valor cadastrado são inválidos.`);
                } else if (grams !== null && grams > 0) {
                    const materialCost = grams * costPerGram;
                    if (!Number.isFinite(materialCost)) {
                        errors.push(`Filamento ${lineNumber}: o custo calculado é inválido.`);
                    } else {
                        validMaterialCount += 1;
                    }
                }
            }
        });

        if (validMaterialCount === 0) {
            errors.push('Materiais: adicione pelo menos um filamento válido com gramagem maior que zero.');
        }

        const purpose = document.querySelector('input[name="finalidade"]:checked')?.value || 'somente-custo';
        const markup = readCalculationInput(markupPercent, 'Markup', errors, { required: false });
        if (markup !== null && markup < 0) {
            errors.push('Markup: informe um percentual não negativo.');
        }
        const manualPrice = readCalculationInput(precoVendaManual, 'Preço manual', errors, {
            required: false
        });
        if (manualPrice !== null && manualPrice < 0) {
            errors.push('Preço manual: não informe um valor negativo; use zero para o cálculo automático.');
        }

        if (purpose === 'venda') {
            if ((manualPrice === null || manualPrice === 0) && markup === null) {
                errors.push('Markup: informe um percentual para calcular o preço automático.');
            }
        } else if (purpose === 'consignacao') {
            const consumerPrice = readCalculationInput(precoConsumidor, 'Preço ao consumidor', errors);
            if (consumerPrice !== null && consumerPrice < 0) {
                errors.push('Preço ao consumidor: informe um valor não negativo.');
            }

            const transfer = readCalculationInput(repasseValor, 'Valor do repasse', errors);
            if (transfer !== null && transfer < 0) {
                errors.push('Valor do repasse: informe um valor não negativo.');
            }
            if (!['percentual', 'fixo'].includes(repasseTipo.value)) {
                errors.push('Tipo de repasse: selecione uma opção válida.');
            }
        }

        getCostWarnings()
            .filter(({ blocking }) => blocking)
            .forEach(({ message }) => errors.push(message));

        return errors;
    }

    async function saveCurrentPricing() {
        if (!dataLoaded || pricingMutationInProgress) return;
        const validationErrors = validateCalculation();
        if (validationErrors.length) {
            setMessage(`Corrija os dados antes de salvar: ${validationErrors.join(' ')}`, true);
            return;
        }

        const calculation = updateSummary();
        if (!calculation || containsNonFiniteNumber(calculation)
            || calculation.totalCost < 0 || calculation.unitCost < 0) {
            setMessage('Os valores calculados são inválidos ou excedem os limites numéricos. Revise os dados antes de salvar.', true);
            return;
        }

        const printer = calculation.printer;
        const material = getMaterialLines().map((line) => {
            const filament = getFilamentoById(line.querySelector('.material-line__filamento').value);
            const grams = safeNumber(line.querySelector('.material-line__grams').value, 0);
            if (!filament) return null;
            const costPerGram = calculateCustoPorGrama(filament);

            return {
                filamentId: filament.id,
                identificacao: `${filament.material} • ${filament.marca} • ${filament.linha || 'Sem linha'} • ${filament.cor}`,
                nome: `${filament.material} • ${filament.marca} • ${filament.cor}`,
                grams,
                costPerGram,
                materialCost: grams * costPerGram
            };
        }).filter(Boolean);
        const pricing = {
            nome: projetoNome.value.trim(),
            data: new Date().toISOString(),
            quantidade: calculation.quantity,
            tipo: calculation.sales.purpose,
            impressora: printer?.nome || 'Sem impressora',
            totalCost: calculation.totalCost,
            unitCost: calculation.unitCost,
            material,
            detalhes: {
                markup: safeNumber(markupPercent.value, 0),
                precoManual: safeNumber(precoVendaManual.value, 0),
                precoConsumidor: safeNumber(precoConsumidor.value, 0),
                repasseTipo: repasseTipo.value,
                repasseValor: safeNumber(repasseValor.value, 0),
                perdas: safeNumber(percentualPerdas.value, 0),
                maoObra: laborToggle.checked ? safeNumber(laborRate.value, 0) : 0
            },
            snapshot: {
                versao: 2,
                salvoEm: new Date().toISOString(),
                impressora: {
                    id: printer?.id || null,
                    nome: printer?.nome || 'Sem impressora',
                    valorPago: safeNumber(printer?.valorPago, 0),
                    vidaUtilHoras: safeNumber(printer?.vidaUtilHoras, 0),
                    consumoWatts: safeNumber(printer?.consumoWatts, 0),
                    manutencaoHora: safeNumber(printer?.manutencaoHora, 0),
                    depreciacaoHora: printer ? calculateDepreciacaoHora(printer) : 0
                },
                tarifaEnergia: calculation.energyTariff,
                impressao: {
                    horas: safeNumber(tempoHoras.value, 0),
                    minutos: safeNumber(tempoMinutos.value, 0),
                    duracaoHoras: calculation.runtime
                },
                quantidadeProduzida: calculation.quantity,
                filamentos: material,
                custos: {
                    material: calculation.materialCost,
                    energia: calculation.energyCost,
                    depreciacao: calculation.depreciationCost,
                    manutencao: calculation.maintenanceCost,
                    diretos: calculation.subtotalBeforeLosses,
                    perdas: {
                        percentual: calculation.percentualPerdas,
                        valor: calculation.lossesCost
                    },
                    maoDeObra: {
                        ativa: calculation.laborActive,
                        horas: calculation.laborHours,
                        valorHora: calculation.laborRate,
                        valor: calculation.laborValue
                    },
                    total: calculation.totalCost,
                    unitario: calculation.unitCost
                },
                finalidade: calculation.sales.purpose,
                venda: {
                    markupPercentual: safeNumber(markupPercent.value, 0),
                    precoManual: safeNumber(precoVendaManual.value, 0),
                    precoVendaUnitario: calculation.sales.salePricePerUnit,
                    precoVendaTotal: calculation.sales.salePriceTotal,
                    lucro: calculation.sales.profit,
                    margemPercentual: calculation.sales.marginPercent
                },
                consignacao: {
                    precoConsumidor: safeNumber(precoConsumidor.value, 0),
                    repasseTipo: repasseTipo.value,
                    repasseValor: safeNumber(repasseValor.value, 0),
                    repasseCalculado: calculation.sales.repasse,
                    receitaLiquidaUnitario: calculation.sales.netRevenuePerUnit,
                    receitaLiquidaTotal: calculation.sales.netRevenueTotal
                }
            }
        };

        if (containsNonFiniteNumber(pricing)) {
            setMessage('A precificação contém valores numéricos inválidos. Revise os dados antes de salvar.', true);
            return;
        }

        pricingMutationInProgress = true;
        savePriceButton.disabled = true;
        setMessage('Salvando precificação…');
        try {
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de salvar a precificação.');
            }

            const { data, error } = await client.from('precificacoes')
                .insert({
                    user_id: authenticatedUserId,
                    nome: pricing.nome,
                    data: pricing.data,
                    quantidade: pricing.quantidade,
                    tipo: pricing.tipo,
                    impressora: pricing.impressora,
                    total_cost: pricing.totalCost,
                    unit_cost: pricing.unitCost,
                    material: pricing.material,
                    detalhes: pricing.detalhes,
                    snapshot: pricing.snapshot
                })
                .select('id, user_id, nome, data, quantidade, tipo, impressora, total_cost, unit_cost, material, detalhes, snapshot, criado_em, atualizado_em')
                .single();
            if (error) throw error;

            const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
            if (verifiedUserError) throw verifiedUserError;
            if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante o salvamento. Recarregue a página para continuar.');
            }

            const savedPricing = mapPricing(data);
            savedPricings.unshift(savedPricing);
            renderSavedPricings();
            setMessage('Precificação salva com sucesso.');
        } catch (error) {
            console.error('Não foi possível salvar a precificação no Supabase:', error);
            setMessage(`Não foi possível salvar a precificação. ${getErrorMessage(error)}`, true);
        } finally {
            pricingMutationInProgress = false;
            savePriceButton.disabled = !dataLoaded;
        }
    }

    function showPricingDetails(pricing) {
        const snapshotVersion = pricing.snapshot.versao
            ? `versão ${escapeHTML(pricing.snapshot.versao)}`
            : 'versão não identificada';
        const jsonSection = (title, value) => `
            <details>
                <summary>${title}</summary>
                <pre>${escapeHTML(JSON.stringify(value, null, 2))}</pre>
            </details>
        `;

        savedPricingDetail.classList.remove('is-hidden');
        savedPricingDetail.innerHTML = `
            <div class="saved-pricing-detail__content">
                <div><span>Peça</span><strong>${escapeHTML(pricing.nome)}</strong></div>
                <div><span>Impressora</span><strong>${escapeHTML(pricing.impressora)}</strong></div>
                <div><span>Custo total</span><strong>${toCurrency(pricing.totalCost)}</strong></div>
                <div><span>Custo unitário</span><strong>${toCurrency(pricing.unitCost)}</strong></div>
                <div><span>Quantidade</span><strong>${escapeHTML(pricing.quantidade)}</strong></div>
                <div><span>Finalidade</span><strong>${escapeHTML(pricing.tipo)}</strong></div>
                <div><span>Registrada em</span><strong>${escapeHTML(new Date(pricing.data).toLocaleString('pt-BR'))}</strong></div>
            </div>
            ${jsonSection('Materiais registrados', pricing.material)}
            ${jsonSection('Detalhes comerciais', pricing.detalhes)}
            ${jsonSection(`Snapshot completo (${snapshotVersion})`, pricing.snapshot)}
        `;
    }

    async function deleteSavedPricing(pricingId, button) {
        if (!dataLoaded || pricingMutationInProgress) return;
        pricingMutationInProgress = true;
        button.disabled = true;
        setMessage('Excluindo precificação…');

        try {
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de excluir a precificação.');
            }

            const { data, error } = await client.from('precificacoes')
                .delete()
                .eq('id', pricingId)
                .eq('user_id', authenticatedUserId)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('A precificação não foi encontrada ou não pertence a esta conta.');

            const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
            if (verifiedUserError) throw verifiedUserError;
            if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante a exclusão. Recarregue a página para continuar.');
            }

            savedPricings = savedPricings.filter((pricing) => pricing.id !== pricingId);
            savedPricingDetail.classList.add('is-hidden');
            savedPricingDetail.replaceChildren();
            renderSavedPricings();
            setMessage('Precificação excluída com sucesso.');
        } catch (error) {
            console.error('Não foi possível excluir a precificação no Supabase:', error);
            setMessage(`Não foi possível excluir a precificação. ${getErrorMessage(error)}`, true);
        } finally {
            pricingMutationInProgress = false;
            savedPricingList.querySelectorAll('[data-pricing-delete-id]').forEach((deleteButton) => {
                deleteButton.disabled = !dataLoaded;
            });
        }
    }

    function renderSavedPricings() {
        const pricings = getSavedPricings();

        if (!pricings.length) {
            savedPricingList.innerHTML = '<div class="empty-state">Nenhuma precificação salva ainda.</div>';
            savedPricingDetail.classList.add('is-hidden');
            savedPricingDetail.innerHTML = '';
            return;
        }

        savedPricingList.innerHTML = pricings.map((price) => `
            <article class="saved-pricing-card">
                <div>
                    <div class="saved-pricing-card__meta">Peça</div>
                    <div class="saved-pricing-card__value">${escapeHTML(price.nome)}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Tipo</div>
                    <div class="saved-pricing-card__value">${escapeHTML(price.tipo)}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Imp.</div>
                    <div class="saved-pricing-card__value">${escapeHTML(price.impressora)}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Custo total</div>
                    <div class="saved-pricing-card__value">${toCurrency(price.totalCost)}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Unitário</div>
                    <div class="saved-pricing-card__value">${toCurrency(price.unitCost)}</div>
                </div>
                <div class="saved-pricing-card__actions">
                    <button type="button" data-pricing-id="${escapeHTML(price.id)}">Ver</button>
                    <button type="button" data-pricing-delete-id="${escapeHTML(price.id)}">Excluir</button>
                </div>
            </article>
        `).join('');

        savedPricingList.querySelectorAll('[data-pricing-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const pricing = pricings.find((item) => item.id === button.dataset.pricingId);
                if (pricing) showPricingDetails(pricing);
            });
        });

        savedPricingList.querySelectorAll('[data-pricing-delete-id]').forEach((button) => {
            button.addEventListener('click', () => {
                void deleteSavedPricing(button.dataset.pricingDeleteId, button);
            });
        });
    }

    function handlePurposeChange() {
        const purpose = document.querySelector('input[name="finalidade"]:checked')?.value || 'somente-custo';
        const salesPanel = document.getElementById('venda-panel');
        const consignacaoPanel = document.getElementById('consignacao-panel');

        salesPanel.classList.toggle('is-hidden', purpose !== 'venda');
        consignacaoPanel.classList.toggle('is-hidden', purpose !== 'consignacao');
        updateSummary();
    }

    document.querySelectorAll('input[name="finalidade"]').forEach((radio) => {
        radio.addEventListener('change', handlePurposeChange);
    });

    addMaterialButton.addEventListener('click', () => addMaterialLine({ focus: true }));
    savePriceButton.addEventListener('click', () => void saveCurrentPricing());
    newCalculationButton.addEventListener('click', resetInputs);
    toggleDetailsButton.addEventListener('click', () => detailsPanel.classList.toggle('is-hidden'));
    laborToggle.addEventListener('change', toggleLaborPanel);
    repasseTipo.addEventListener('change', toggleRepasseUnit);
    impressoraSelect.addEventListener('change', updateSummary);
    quantidadeProducao.addEventListener('input', updateSummary);
    markupPercent.addEventListener('input', updateSummary);
    precoVendaManual.addEventListener('input', updateSummary);
    precoConsumidor.addEventListener('input', updateSummary);
    repasseValor.addEventListener('input', updateSummary);
    percentualPerdas.addEventListener('input', updateSummary);
    laborRate.addEventListener('input', updateSummary);
    tempoHoras.addEventListener('input', updateSummary);
    tempoMinutos.addEventListener('input', updateSummary);
    laborHoras.addEventListener('input', updateSummary);
    laborMinutos.addEventListener('input', updateSummary);

    retryLoadButton.addEventListener('click', () => void loadData());
    void loadData();
});
