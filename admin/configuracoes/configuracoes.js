document.addEventListener('DOMContentLoaded', async () => {
    const DEFAULT_SETTINGS = {
        tarifaEnergia: null,
        perdaPadrao: null,
        maoObraPadrao: null
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
    const loadStatus = document.getElementById('config-load-status');
    const retryLoadButton = document.getElementById('retry-config-load');
    const settingsInputs = [tarifaInput, perdaInput, maoObraInput];
    const printerControls = [
        togglePrinterFormButton,
        ...printerForm.querySelectorAll('input, button')
    ];

    let client;
    let authenticatedUserId = null;
    let settings = { ...DEFAULT_SETTINGS };
    let printers = [];
    let loaded = false;
    let editingPrinterId = null;
    let pendingSettings = null;
    let savingSettings = false;
    let printerMutationInProgress = false;

    settingsInputs.forEach((input) => { input.disabled = true; });
    printerControls.forEach((control) => { control.disabled = true; });
    retryLoadButton.hidden = true;
    loadStatus.textContent = 'Aguardando verificação da sessão…';

    function safeNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizaNumero(value) {
        if (value === '' || value === null || value === undefined) {
            return null;
        }

        const parsed = Number(value.toString().replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function getErrorMessage(error) {
        return error && typeof error.message === 'string' && error.message
            ? error.message
            : 'Verifique a conexão e tente novamente.';
    }

    function databaseNumber(value, fieldName) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            throw new Error(`O campo ${fieldName} retornado pelo Supabase não contém um número válido.`);
        }
        return parsed;
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

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function settingsFromInputs() {
        return {
            tarifaEnergia: normalizaNumero(tarifaInput.value),
            perdaPadrao: normalizaNumero(perdaInput.value),
            maoObraPadrao: normalizaNumero(maoObraInput.value)
        };
    }

    function setFormMessage(message, isError = false) {
        printerFormMessage.textContent = message;
        printerFormMessage.classList.toggle('is-error', isError);
        printerFormMessage.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setLoadStatus(message, isError = false) {
        loadStatus.textContent = message;
        loadStatus.classList.toggle('is-error', isError);
        loadStatus.setAttribute('role', isError ? 'alert' : 'status');
    }

    function calculateDepreciacaoHora(printer) {
        const valorPago = safeNumber(printer.valorPago, 0);
        const vidaUtilHoras = safeNumber(printer.vidaUtilHoras, 0);

        return vidaUtilHoras > 0 ? valorPago / vidaUtilHoras : 0;
    }

    function renderSettings() {
        tarifaInput.value = settings.tarifaEnergia ?? '';
        perdaInput.value = settings.perdaPadrao ?? '';
        maoObraInput.value = settings.maoObraPadrao ?? '';
    }

    function renderPrinters() {
        if (!printers.length) {
            printerList.innerHTML = '<div class="printer-list__empty">Nenhuma impressora cadastrada. Cadastre uma nova máquina para começar a calcular o custo por hora.</div>';
            return;
        }

        printerList.innerHTML = printers.map((printer) => {
            const depreciacaoHora = calculateDepreciacaoHora(printer);

            return `
                <article class="printer-item" data-printer-id="${escapeHTML(printer.id)}">
                    <div class="printer-item__header">
                        <h3>${escapeHTML(printer.nome)}</h3>
                        <div class="printer-item__actions">
                            <button type="button" data-action="edit" data-printer-id="${escapeHTML(printer.id)}">Editar</button>
                            <button type="button" data-action="delete" data-printer-id="${escapeHTML(printer.id)}">Excluir</button>
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

        return {
            id: String(row.id),
            nome: String(row.nome),
            valorPago: databaseNumber(row.valor_pago, 'valor_pago'),
            vidaUtilHoras: databaseNumber(row.vida_util_horas, 'vida_util_horas'),
            consumoWatts: databaseNumber(row.consumo_watts, 'consumo_watts'),
            manutencaoHora: databaseNumber(row.manutencao_hora, 'manutencao_hora')
        };
    }

    function setDataControlsDisabled(disabled) {
        settingsInputs.forEach((input) => { input.disabled = disabled; });
        printerControls.forEach((control) => { control.disabled = disabled; });
    }

    function showPrinterListMessage(message, className = '') {
        const item = document.createElement('div');
        item.className = className;
        item.textContent = message;
        printerList.replaceChildren(item);
    }

    async function loadData() {
        loaded = false;
        settings = { ...DEFAULT_SETTINGS };
        printers = [];
        authenticatedUserId = null;
        pendingSettings = null;
        editingPrinterId = null;
        renderSettings();
        setDataControlsDisabled(true);
        retryLoadButton.hidden = true;
        setLoadStatus('Carregando configurações e impressoras do Supabase…');
        showPrinterListMessage('Carregando…');

        try {
            client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous) {
                throw new Error('Não foi possível confirmar o usuário autenticado.');
            }

            authenticatedUserId = userData.user.id;
            const [settingsResult, printersResult] = await Promise.all([
                client.from('configuracoes_usuario')
                    .select('user_id, tarifa_energia, perda_padrao, mao_obra_padrao')
                    .eq('user_id', authenticatedUserId)
                    .maybeSingle(),
                client.from('impressoras')
                    .select('id, user_id, nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora')
                    .eq('user_id', authenticatedUserId)
                    .order('criado_em', { ascending: true })
            ]);

            if (settingsResult.error) throw settingsResult.error;
            if (printersResult.error) throw printersResult.error;
            if (!Array.isArray(printersResult.data)) {
                throw new Error('A consulta ao Supabase não retornou uma lista válida de impressoras.');
            }

            const loadedSettings = settingsResult.data
                ? mapSettings(settingsResult.data)
                : { ...DEFAULT_SETTINGS };
            const loadedPrinters = printersResult.data.map(mapPrinter);

            settings = loadedSettings;
            printers = loadedPrinters;
            renderSettings();
            renderPrinters();
            loaded = true;
            setDataControlsDisabled(false);
            setLoadStatus('Configurações e impressoras carregadas.');
        } catch (error) {
            console.error('Não foi possível carregar configurações e impressoras do Supabase:', error);
            authenticatedUserId = null;
            settings = { ...DEFAULT_SETTINGS };
            printers = [];
            renderSettings();
            showPrinterListMessage('Não foi possível carregar as impressoras. Tente novamente.', 'printer-list__empty');
            setDataControlsDisabled(true);
            setLoadStatus(`Não foi possível carregar as configurações e impressoras. ${getErrorMessage(error)}`, true);
            retryLoadButton.hidden = false;
        }
    }

    async function writeSettings(nextSettings) {
        const settingsValues = {
            tarifa_energia: nextSettings.tarifaEnergia,
            perda_padrao: nextSettings.perdaPadrao,
            mao_obra_padrao: nextSettings.maoObraPadrao
        };

        async function updateExistingSettings() {
            const { data, error } = await client.from('configuracoes_usuario')
                .update(settingsValues)
                .eq('user_id', authenticatedUserId)
                .select('user_id')
                .maybeSingle();
            if (error) throw error;
            if (data && data.user_id !== authenticatedUserId) {
                throw new Error('A resposta do Supabase retornou configurações de outro usuário.');
            }
            return Boolean(data);
        }

        if (await updateExistingSettings()) return;

        const { error } = await client.from('configuracoes_usuario')
            .insert({ ...settingsValues, user_id: authenticatedUserId });
        if (!error) return;
        if (error.code !== '23505') throw error;

        if (!(await updateExistingSettings())) {
            throw new Error('Não foi possível confirmar a linha de configurações após um conflito de gravação.');
        }
    }

    async function flushSettingsSaves() {
        savingSettings = true;
        try {
            while (pendingSettings) {
                const nextSettings = pendingSettings;
                pendingSettings = null;
                setLoadStatus('Salvando configurações…');

                try {
                    await writeSettings(nextSettings);
                    if (!pendingSettings) setLoadStatus('Configurações salvas.');
                } catch (error) {
                    console.error('Não foi possível salvar as configurações no Supabase:', error);
                    setLoadStatus(`Não foi possível salvar as configurações. ${getErrorMessage(error)}`, true);
                }
            }
        } finally {
            savingSettings = false;
            if (pendingSettings) void flushSettingsSaves();
        }
    }

    function queueSettingsSave() {
        if (!loaded) return;
        pendingSettings = settingsFromInputs();
        if (!savingSettings) void flushSettingsSaves();
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

    async function handlePrinterSubmit(event) {
        event.preventDefault();
        if (!loaded || printerMutationInProgress) return;

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

        printerMutationInProgress = true;
        printerControls.forEach((control) => { control.disabled = true; });
        setFormMessage('Salvando impressora…');
        const payload = {
            nome: values.nome,
            valor_pago: values.valorPago,
            vida_util_horas: values.vidaUtilHoras,
            consumo_watts: values.consumoWatts,
            manutencao_hora: values.manutencaoHora
        };

        try {
            if (editingPrinterId) {
                const { data, error } = await client.from('impressoras')
                    .update(payload)
                    .eq('id', editingPrinterId)
                    .eq('user_id', authenticatedUserId)
                    .select('id, user_id, nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora')
                    .maybeSingle();
                if (error) throw error;
                if (!data) throw new Error('A impressora não foi encontrada para este usuário.');

                const updatedPrinter = mapPrinter(data);
                printers = printers.map((printer) => (
                    printer.id === updatedPrinter.id ? updatedPrinter : printer
                ));
            } else {
                const { data, error } = await client.from('impressoras')
                    .insert({ ...payload, user_id: authenticatedUserId })
                    .select('id, user_id, nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora')
                    .single();
                if (error) throw error;

                printers.push(mapPrinter(data));
            }

            renderPrinters();
            closeForm();
        } catch (error) {
            console.error('Não foi possível salvar a impressora no Supabase:', error);
            setFormMessage(`Não foi possível salvar a impressora. ${getErrorMessage(error)}`, true);
        } finally {
            printerMutationInProgress = false;
            if (loaded) printerControls.forEach((control) => { control.disabled = false; });
        }
    }

    function populatePrinterForm(printerId) {
        const printer = printers.find((item) => item.id === printerId);
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

    async function deletePrinter(printerId) {
        if (!loaded || printerMutationInProgress) return;
        const printer = printers.find((item) => item.id === printerId);

        if (!printer) {
            return;
        }

        const confirmed = window.confirm(`Excluir a impressora "${printer.nome}"?`);
        if (!confirmed) {
            return;
        }

        printerMutationInProgress = true;
        printerControls.forEach((control) => { control.disabled = true; });
        setFormMessage('Excluindo impressora…');
        try {
            const { data, error } = await client.from('impressoras')
                .delete()
                .eq('id', printerId)
                .eq('user_id', authenticatedUserId)
                .select('id')
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('A impressora não foi encontrada para este usuário.');

            printers = printers.filter((item) => item.id !== printerId);
            renderPrinters();
            if (editingPrinterId === printerId) closeForm();
        } catch (error) {
            console.error('Não foi possível excluir a impressora no Supabase:', error);
            setFormMessage(`Não foi possível excluir a impressora. ${getErrorMessage(error)}`, true);
        } finally {
            printerMutationInProgress = false;
            if (loaded) printerControls.forEach((control) => { control.disabled = false; });
        }
    }

    settingsInputs.forEach((input) => {
        input.addEventListener('input', queueSettingsSave);
    });

    togglePrinterFormButton.addEventListener('click', () => {
        if (!loaded || printerMutationInProgress) return;
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
        if (!target || !loaded || printerMutationInProgress) {
            return;
        }

        const printerId = target.dataset.printerId;
        const action = target.dataset.action;

        if (action === 'edit') {
            populatePrinterForm(printerId);
        }

        if (action === 'delete') {
            void deletePrinter(printerId);
        }
    });

    retryLoadButton.addEventListener('click', () => { void loadData(); });

    if (!window.RondyAuth || !(await window.RondyAuth.ready)) {
        setLoadStatus('Não foi possível confirmar a sessão. Verifique o acesso e tente novamente.', true);
        retryLoadButton.hidden = false;
        return;
    }

    await loadData();
});
