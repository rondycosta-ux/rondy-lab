document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEYS = {
        settings: 'rondyLabConfiguracoesGerais',
        printers: 'rondyLabConfiguracoesImpressoras'
    };

    const DEFAULT_SETTINGS = {
        tarifaEnergia: 0.85,
        perdaPadrao: 10,
        maoObraPadrao: 45
    };

    const tarifaInput = document.getElementById('tarifa-energia');
    const perdaInput = document.getElementById('perda-padrao');
    const maoObraInput = document.getElementById('mao-obra');
    const printerForm = document.getElementById('printer-form');
    const printerFormPanel = document.getElementById('printer-form-panel');
    const togglePrinterFormButton = document.getElementById('toggle-printer-form');
    const cancelPrinterFormButton = document.getElementById('cancel-printer-form');
    const printerFormMessage = document.getElementById('printer-form-message');
    const printerList = document.getElementById('printer-list');

    let editingPrinterId = null;

    function readStorage(key, fallback) {
        try {
            const rawValue = localStorage.getItem(key);
            if (!rawValue) {
                return fallback;
            }

            const parsedValue = JSON.parse(rawValue);
            return parsedValue ?? fallback;
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

    function normalizaNumero(value) {
        return Number(value.toString().replace(',', '.'));
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function getSettings() {
        const savedSettings = readStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
        return {
            ...DEFAULT_SETTINGS,
            ...savedSettings
        };
    }

    function saveSettings(settings) {
        writeStorage(STORAGE_KEYS.settings, {
            tarifaEnergia: safeNumber(settings.tarifaEnergia, DEFAULT_SETTINGS.tarifaEnergia),
            perdaPadrao: safeNumber(settings.perdaPadrao, DEFAULT_SETTINGS.perdaPadrao),
            maoObraPadrao: safeNumber(settings.maoObraPadrao, DEFAULT_SETTINGS.maoObraPadrao)
        });
    }

    function getPrinters() {
        const savedPrinters = readStorage(STORAGE_KEYS.printers, []);
        return Array.isArray(savedPrinters) ? savedPrinters : [];
    }

    function savePrinters(printers) {
        writeStorage(STORAGE_KEYS.printers, printers);
    }

    function updateSettingsFromInputs() {
        const settings = {
            tarifaEnergia: normalizaNumero(tarifaInput.value || 0),
            perdaPadrao: normalizaNumero(perdaInput.value || 0),
            maoObraPadrao: normalizaNumero(maoObraInput.value || 0)
        };

        saveSettings(settings);
    }

    function setFormMessage(message, isError = false) {
        printerFormMessage.textContent = message;
        printerFormMessage.classList.toggle('is-error', isError);
    }

    function calculateDepreciacaoHora(printer) {
        const tarifa = getSettings().tarifaEnergia;
        const valorPago = safeNumber(printer.valorPago, 0);
        const vidaUtilHoras = safeNumber(printer.vidaUtilHoras, 0);
        const consumoWatts = safeNumber(printer.consumoWatts, 0);
        const manutencaoHora = safeNumber(printer.manutencaoHora, 0);

        const depreciacao = vidaUtilHoras > 0 ? valorPago / vidaUtilHoras : 0;
        const energiaHora = (consumoWatts / 1000) * tarifa;

        return depreciacao + manutencaoHora + energiaHora;
    }

    function renderSettings() {
        const settings = getSettings();
        tarifaInput.value = settings.tarifaEnergia;
        perdaInput.value = settings.perdaPadrao;
        maoObraInput.value = settings.maoObraPadrao;
    }

    function renderPrinters() {
        const printers = getPrinters();

        if (!printers.length) {
            printerList.innerHTML = '<div class="printer-list__empty">Nenhuma impressora cadastrada. Cadastre uma nova máquina para começar a calcular o custo por hora.</div>';
            return;
        }

        printerList.innerHTML = printers.map((printer) => {
            const depreciacaoHora = calculateDepreciacaoHora(printer);

            return `
                <article class="printer-item" data-printer-id="${printer.id}">
                    <div class="printer-item__header">
                        <h3>${printer.nome}</h3>
                        <div class="printer-item__actions">
                            <button type="button" data-action="edit" data-printer-id="${printer.id}">Editar</button>
                            <button type="button" data-action="delete" data-printer-id="${printer.id}">Excluir</button>
                        </div>
                    </div>

                    <dl class="printer-item__meta">
                        <div>
                            <dt>Valor pago</dt>
                            <dd>${formatCurrency(printer.valorPago || 0)}</dd>
                        </div>
                        <div>
                            <dt>Vida útil</dt>
                            <dd>${printer.vidaUtilHoras || 0} horas</dd>
                        </div>
                        <div>
                            <dt>Consumo</dt>
                            <dd>${printer.consumoWatts || 0} W</dd>
                        </div>
                        <div>
                            <dt>Manutenção/h</dt>
                            <dd>${formatCurrency(printer.manutencaoHora || 0)}/h</dd>
                        </div>
                    </dl>

                    <div class="printer-item__depreciacao">
                        <div class="printer-item__depreciacao-label">Depreciação por hora</div>
                        <div class="printer-item__depreciacao-value">${formatCurrency(depreciacaoHora)}/h</div>
                        <p class="printer-item__depreciacao-note">Cálculo com base no valor investido, manutenção e consumo de energia.</p>
                    </div>
                </article>
            `;
        }).join('');
    }

    function resetForm() {
        printerForm.reset();
        editingPrinterId = null;
        setFormMessage('');
        togglePrinterFormButton.textContent = '+ CADASTRAR IMPRESSORA';
        printerFormPanel.classList.add('is-hidden');
    }

    function openForm() {
        printerFormPanel.classList.remove('is-hidden');
        togglePrinterFormButton.textContent = 'NOVA IMPRESSORA';
    }

    function closeForm() {
        resetForm();
    }

    function validatePrinter(values) {
        if (!values.nome || values.nome.trim().length < 2) {
            return 'Informe um nome válido para a impressora.';
        }

        if (values.valorPago <= 0) {
            return 'O valor pago deve ser maior que zero.';
        }

        if (values.vidaUtilHoras <= 0) {
            return 'A vida útil deve ser maior que zero.';
        }

        if (values.consumoWatts <= 0) {
            return 'O consumo de energia deve ser maior que zero.';
        }

        if (values.manutencaoHora < 0) {
            return 'A reserva de manutenção não pode ser negativa.';
        }

        return '';
    }

    function handlePrinterSubmit(event) {
        event.preventDefault();

        const formData = new FormData(printerForm);
        const values = {
            nome: String(formData.get('nome') || '').trim(),
            valorPago: safeNumber(formData.get('valorPago'), 0),
            vidaUtilHoras: safeNumber(formData.get('vidaUtil'), 0),
            consumoWatts: safeNumber(formData.get('consumoEnergia'), 0),
            manutencaoHora: safeNumber(formData.get('manutencao'), 0)
        };

        const validationError = validatePrinter(values);
        if (validationError) {
            setFormMessage(validationError, true);
            return;
        }

        const printers = getPrinters();

        if (editingPrinterId) {
            const index = printers.findIndex((printer) => printer.id === editingPrinterId);
            if (index >= 0) {
                printers[index] = {
                    ...printers[index],
                    nome: values.nome,
                    valorPago: values.valorPago,
                    vidaUtilHoras: values.vidaUtilHoras,
                    consumoWatts: values.consumoWatts,
                    manutencaoHora: values.manutencaoHora
                };
            }
        } else {
            printers.push({
                id: `printer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                nome: values.nome,
                valorPago: values.valorPago,
                vidaUtilHoras: values.vidaUtilHoras,
                consumoWatts: values.consumoWatts,
                manutencaoHora: values.manutencaoHora
            });
        }

        savePrinters(printers);
        renderPrinters();
        closeForm();
    }

    function populatePrinterForm(printerId) {
        const printer = getPrinters().find((item) => item.id === printerId);
        if (!printer) {
            return;
        }

        editingPrinterId = printerId;
        document.getElementById('printer-nome').value = printer.nome;
        document.getElementById('printer-valor').value = printer.valorPago;
        document.getElementById('printer-vida').value = printer.vidaUtilHoras;
        document.getElementById('printer-consumo').value = printer.consumoWatts;
        document.getElementById('printer-manutencao').value = printer.manutencaoHora;
        setFormMessage('Editando impressora selecionada.');
        openForm();
    }

    function deletePrinter(printerId) {
        const printers = getPrinters();
        const printer = printers.find((item) => item.id === printerId);

        if (!printer) {
            return;
        }

        const confirmed = window.confirm(`Excluir a impressora "${printer.nome}"?`);
        if (!confirmed) {
            return;
        }

        const remainingPrinters = printers.filter((item) => item.id !== printerId);
        savePrinters(remainingPrinters);
        renderPrinters();

        if (editingPrinterId === printerId) {
            closeForm();
        }
    }

    tarifaInput.addEventListener('input', updateSettingsFromInputs);
    perdaInput.addEventListener('input', updateSettingsFromInputs);
    maoObraInput.addEventListener('input', updateSettingsFromInputs);

    togglePrinterFormButton.addEventListener('click', () => {
        const isHidden = printerFormPanel.classList.contains('is-hidden');
        if (isHidden) {
            openForm();
            document.getElementById('printer-nome').focus();
        } else {
            closeForm();
        }
    });

    cancelPrinterFormButton.addEventListener('click', closeForm);
    printerForm.addEventListener('submit', handlePrinterSubmit);

    printerList.addEventListener('click', (event) => {
        const target = event.target.closest('button[data-action]');
        if (!target) {
            return;
        }

        const printerId = target.dataset.printerId;
        const action = target.dataset.action;

        if (action === 'edit') {
            populatePrinterForm(printerId);
        }

        if (action === 'delete') {
            deletePrinter(printerId);
        }
    });

    renderSettings();
    renderPrinters();
});
