document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEYS = {
        settings: 'rondyLabConfiguracoesGerais',
        printers: 'rondyLabConfiguracoesImpressoras',
        filamentos: 'rondyLabFilamentos',
        precificacoes: 'rondyLabPrecificacoesSalvas'
    };

    const DEFAULT_SETTINGS = {
        tarifaEnergia: 0.85,
        perdaPadrao: 10,
        maoObraPadrao: 45
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

    const summaryMaterial = document.getElementById('summary-material');
    const summaryEnergy = document.getElementById('summary-energy');
    const summaryDepreciation = document.getElementById('summary-depreciation');
    const summaryMaintenance = document.getElementById('summary-maintenance');
    const summaryLosses = document.getElementById('summary-losses');
    const summaryLabor = document.getElementById('summary-labor');
    const summaryTotalCost = document.getElementById('summary-total-cost');
    const summaryUnitCost = document.getElementById('summary-unit-cost');
    const salesResult = document.getElementById('sales-result');

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

    function uniqueId(prefix = 'id') {
        return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    }

    function getSettings() {
        const settings = readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
        return {
            ...DEFAULT_SETTINGS,
            ...settings
        };
    }

    function getPrinters() {
        const printers = readStorage(STORAGE_KEYS.printers, []);
        return Array.isArray(printers) ? printers : [];
    }

    function getFilamentos() {
        const filamentos = readStorage(STORAGE_KEYS.filamentos, []);
        return Array.isArray(filamentos) ? filamentos : [];
    }

    function getSavedPricings() {
        const pricings = readStorage(STORAGE_KEYS.precificacoes, []);
        return Array.isArray(pricings) ? pricings : [];
    }

    function saveSavedPricings(pricings) {
        writeStorage(STORAGE_KEYS.precificacoes, pricings);
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
        const settings = getSettings();
        const tarifa = safeNumber(settings.tarifaEnergia, DEFAULT_SETTINGS.tarifaEnergia);
        const valorPago = safeNumber(printer?.valorPago, 0);
        const vidaUtilHoras = safeNumber(printer?.vidaUtilHoras, 0);
        const consumoWatts = safeNumber(printer?.consumoWatts, 0);
        const manutencaoHora = safeNumber(printer?.manutencaoHora, 0);

        const depreciacao = vidaUtilHoras > 0 ? valorPago / vidaUtilHoras : 0;
        const energiaHora = (consumoWatts / 1000) * tarifa;

        return depreciacao + manutencaoHora + energiaHora;
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
            <option value="${option.value}" ${option.value === currentValue ? 'selected' : ''}>
                ${option.label}
            </option>
        `).join('');
    }

    function setMessage(message, isError = false) {
        calculatorMessage.textContent = message;
        calculatorMessage.classList.toggle('is-error', isError);
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
                } else if (grams > safeNumber(filamento.quantidadeDisponivel, 0)) {
                    warning.textContent = `Atenção: o saldo disponível deste rolo é de ${Number(safeNumber(filamento.quantidadeDisponivel, 0)).toLocaleString('pt-BR')} g.`;
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
            return;
        }

        if (purpose === 'venda') {
            const salePrice = manualPrice > 0 ? manualPrice : totalCost * (1 + markup / 100);
            const priceTotal = salePrice * quantity;

            salesResult.innerHTML = `
                <div class="sales-result__row"><span>Preço por unidade</span><strong>${toCurrency(salePrice)}</strong></div>
                <div class="sales-result__row"><span>Preço total</span><strong>${toCurrency(priceTotal)}</strong></div>
                <div class="sales-result__row"><span>Margem líquida</span><strong>${toCurrency((salePrice - unitCost) * quantity)}</strong></div>
            `;
            return;
        }

        const repasse = repasseTipo.value === 'fixo'
            ? repasseValue
            : consumerPrice * (repasseValue / 100);

        const receiveValue = Math.max(consumerPrice - repasse, 0);

        salesResult.innerHTML = `
            <div class="sales-result__row"><span>Preço ao consumidor</span><strong>${toCurrency(consumerPrice)}</strong></div>
            <div class="sales-result__row"><span>Repasse</span><strong>${toCurrency(repasse)}</strong></div>
            <div class="sales-result__row"><span>Receita líquida</span><strong>${toCurrency(receiveValue)}</strong></div>
        `;
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
        const settings = getSettings();
        const printer = getPrinterById(impressoraSelect.value);
        const totalRuntimeHours = parseRuntimeHours();
        const quantity = safeNumber(quantidadeProducao.value, 1);
        const materialCost = getTotalMaterialCost();
        const energyCost = printer
            ? (safeNumber(printer.consumoWatts, 0) / 1000) * safeNumber(settings.tarifaEnergia, DEFAULT_SETTINGS.tarifaEnergia) * totalRuntimeHours
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

        buildSalesResult(totalCost, unitCost);
        renderDetails({
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
            subtotalBeforeLosses
        });
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
                    <span>${row.title}</span>
                    <strong>${row.value}</strong>
                </div>
                <div class="detail-item__formula">${row.formula}</div>
            </div>
        `).join('');
    }

    function populatePrinterSelect() {
        const printers = getPrinters();
        impressoraSelect.innerHTML = '<option value="">Selecione uma impressora</option>' + printers.map((printer) => `
            <option value="${printer.id}">${printer.nome}</option>
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
        percentualPerdas.value = String(getSettings().perdaPadrao || 0);
        markupPercent.value = '0';
        precoVendaManual.value = '0';
        precoConsumidor.value = '0';
        repasseTipo.value = 'percentual';
        repasseValor.value = '0';
        laborToggle.checked = false;
        laborPanel.classList.add('is-hidden');
        laborHoras.value = '0';
        laborMinutos.value = '0';
        laborRate.value = String(getSettings().maoObraPadrao || 0);
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
        const projectName = projetoNome.value.trim();
        const selectedPrinter = impressoraSelect.value;
        const materialList = getMaterialLines();
        const validMaterial = materialList.some((line) => {
            const filament = getFilamentoById(line.querySelector('.material-line__filamento').value);
            const grams = safeNumber(line.querySelector('.material-line__grams').value, 0);
            return Boolean(filament) && grams > 0;
        });

        if (!projectName) {
            return 'Informe o nome do projeto ou peça antes de salvar.';
        }

        if (!selectedPrinter) {
            return 'Selecione uma impressora cadastrada nos parâmetros.';
        }

        if (!validMaterial) {
            return 'Adicione pelo menos um filamento com gramagem válida.';
        }

        if (safeNumber(quantidadeProducao.value, 0) <= 0) {
            return 'A quantidade produzida deve ser maior que zero.';
        }

        return '';
    }

    function saveCurrentPricing() {
        const validationError = validateCalculation();
        if (validationError) {
            setMessage(validationError, true);
            return;
        }

        const pricing = {
            id: uniqueId('precificacao'),
            nome: projetoNome.value.trim(),
            data: new Date().toISOString(),
            quantidade: safeNumber(quantidadeProducao.value, 1),
            tipo: document.querySelector('input[name="finalidade"]:checked')?.value || 'somente-custo',
            impressora: getPrinterById(impressoraSelect.value)?.nome || 'Sem impressora',
            totalCost: Number(summaryTotalCost.textContent.replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
            unitCost: Number(summaryUnitCost.textContent.replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
            material: getMaterialLines().map((line) => {
                const filament = getFilamentoById(line.querySelector('.material-line__filamento').value);
                const grams = safeNumber(line.querySelector('.material-line__grams').value, 0);
                return {
                    filamentId: filament?.id || null,
                    nome: filament ? `${filament.material} • ${filament.marca} • ${filament.cor}` : 'Filamento não selecionado',
                    grams
                };
            }),
            detalhes: {
                markup: safeNumber(markupPercent.value, 0),
                precoManual: safeNumber(precoVendaManual.value, 0),
                precoConsumidor: safeNumber(precoConsumidor.value, 0),
                repasseTipo: repasseTipo.value,
                repasseValor: safeNumber(repasseValor.value, 0),
                perdas: safeNumber(percentualPerdas.value, 0),
                maoObra: laborToggle.checked ? safeNumber(laborRate.value, 0) : 0
            }
        };

        const allPricings = getSavedPricings();
        allPricings.unshift(pricing);
        saveSavedPricings(allPricings);
        renderSavedPricings();
        setMessage('Precificação salva com sucesso.');
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
                    <div class="saved-pricing-card__value">${price.nome}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Tipo</div>
                    <div class="saved-pricing-card__value">${price.tipo}</div>
                </div>
                <div>
                    <div class="saved-pricing-card__meta">Imp.</div>
                    <div class="saved-pricing-card__value">${price.impressora}</div>
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
                    <button type="button" data-pricing-id="${price.id}">Ver</button>
                    <button type="button" data-pricing-delete-id="${price.id}">Excluir</button>
                </div>
            </article>
        `).join('');

        savedPricingList.querySelectorAll('[data-pricing-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const pricing = pricings.find((item) => item.id === button.dataset.pricingId);
                if (!pricing) {
                    return;
                }

                savedPricingDetail.classList.remove('is-hidden');
                savedPricingDetail.innerHTML = `
                    <div class="saved-pricing-detail__content">
                        <div>
                            <span>Peça</span>
                            <strong>${pricing.nome}</strong>
                        </div>
                        <div>
                            <span>Impressora</span>
                            <strong>${pricing.impressora}</strong>
                        </div>
                        <div>
                            <span>Custo total</span>
                            <strong>${toCurrency(pricing.totalCost)}</strong>
                        </div>
                        <div>
                            <span>Custo unitário</span>
                            <strong>${toCurrency(pricing.unitCost)}</strong>
                        </div>
                        <div>
                            <span>Quantidade</span>
                            <strong>${pricing.quantidade}</strong>
                        </div>
                        <div>
                            <span>Finalidade</span>
                            <strong>${pricing.tipo}</strong>
                        </div>
                    </div>
                `;
            });
        });

        savedPricingList.querySelectorAll('[data-pricing-delete-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const next = getSavedPricings().filter((item) => item.id !== button.dataset.pricingDeleteId);
                saveSavedPricings(next);
                renderSavedPricings();
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
    savePriceButton.addEventListener('click', saveCurrentPricing);
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

    populatePrinterSelect();
    resetInputs();
    handlePurposeChange();
    toggleRepasseUnit();
    renderSavedPricings();
    updateSummary();
});
