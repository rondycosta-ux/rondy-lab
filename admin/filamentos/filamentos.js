document.addEventListener('DOMContentLoaded', async () => {
    const unavailableControls = document.querySelectorAll(
        '#open-filamento-form, #filamento-form input, #filamento-form select, #filamento-form textarea, #filamento-form button[type="submit"], #movimentacao-form input, #movimentacao-form select, #movimentacao-form textarea, #movimentacao-form button[type="submit"]'
    );
    unavailableControls.forEach((control) => { control.disabled = true; });

    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;

    const MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Outro'];
    const LOW_STOCK_THRESHOLD = 0.2;

    const form = document.getElementById('filamento-form');
    const formPanel = document.getElementById('filamento-form-panel');
    const openFormButton = document.getElementById('open-filamento-form');
    const cancelFormButton = document.getElementById('cancel-filamento-form');
    const submitFormButton = form.querySelector('button[type="submit"]');
    const formTitle = document.getElementById('filamento-form-title');
    const formMessage = document.getElementById('filamento-form-message');
    const tableBody = document.getElementById('filamentos-table-body');
    const searchInput = document.getElementById('filamento-search');
    const statusFilter = document.getElementById('status-filter');
    const metricTotalRolos = document.getElementById('metric-total-rolos');
    const metricTotalDisponivel = document.getElementById('metric-total-disponivel');
    const metricEstoqueBaixo = document.getElementById('metric-estoque-baixo');
    const loadStatus = document.getElementById('filamentos-load-status');
    const retryLoadButton = document.getElementById('retry-filamentos-load');

    const movimentacoesPanel = document.getElementById('movimentacoes-panel');
    const movimentacoesList = document.getElementById('movimentacoes-list');
    const movimentacaoForm = document.getElementById('movimentacao-form');
    const movimentacaoMessage = document.getElementById('movimento-form-message');
    const movementFilamentInfo = document.getElementById('movimentacao-filamento-info');
    const movementTypeSelect = document.getElementById('movimento-tipo');
    const movementQuantityField = movimentacaoForm.querySelector('.movimentacao-quantity-field');
    const movementQuantityInput = document.getElementById('movimento-quantidade');
    const movementAdjustmentField = movimentacaoForm.querySelector('.movimentacao-adjust-field');
    const movementAdjustmentInput = document.getElementById('movimento-saldo-ajuste');
    const movementObservationInput = document.getElementById('movimento-observacao');
    const movementSubmitButton = movimentacaoForm.querySelector('button[type="submit"]');
    const closeMovimentacoesButton = document.getElementById('close-movimentacoes');

    let selectedFilamentoId = null;
    let filamentos = [];
    let authenticatedUserId = null;
    let pendingRegistration = null;
    let editingFilamentoId = null;
    let pendingEdit = null;
    const archivingFilamentoIds = new Set();
    let pendingMovement = null;
    let movementInProgress = false;

    function safeNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
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

    function mapFilamento(row) {
        if (!row || row.user_id !== authenticatedUserId) {
            throw new Error('A consulta retornou um filamento sem propriedade válida.');
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
            observacoes: row.observacoes ?? '',
            criadoEm: row.criado_em,
            atualizadoEm: row.atualizado_em,
            arquivado: row.arquivado
        };
    }

    function mapMovimentacao(row) {
        if (!row || row.user_id !== authenticatedUserId) {
            throw new Error('A consulta retornou uma movimentação sem propriedade válida.');
        }
        return {
            id: String(row.id),
            userId: row.user_id,
            filamentoId: String(row.filamento_id),
            tipo: String(row.tipo),
            quantidade: databaseNumber(row.quantidade, 'quantidade'),
            dataHora: row.data_hora,
            observacao: row.observacao ?? ''
        };
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        }).format(value);
    }

    function getFilamentos() {
        return filamentos;
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

    function renderTableMessage(message) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 8;
        cell.className = 'empty-state';
        cell.textContent = message;
        row.append(cell);
        tableBody.replaceChildren(row);
    }

    function getErrorMessage(error) {
        return error && typeof error.message === 'string' && error.message
            ? error.message
            : 'Verifique a conexão e tente novamente.';
    }

    function isDefinitiveRpcError(error) {
        return typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
    }

    function isDefinitiveMovementError(error) {
        const code = error?.code;
        return isDefinitiveRpcError(error)
            && !code.startsWith('08')
            && !code.startsWith('57')
            && !code.startsWith('XX');
    }

    function setFormMessage(message, isError = false) {
        formMessage.textContent = message;
        formMessage.classList.toggle('is-error', isError);
        formMessage.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setLoadStatus(message, isError = false) {
        loadStatus.textContent = message;
        loadStatus.classList.toggle('is-error', isError);
        loadStatus.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setMovementMessage(message, isError = false) {
        movimentacaoMessage.textContent = message;
        movimentacaoMessage.classList.toggle('is-error', isError);
        movimentacaoMessage.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setMovementControlsDisabled(disabled) {
        movimentacaoForm.querySelectorAll('select, input, textarea').forEach((control) => {
            control.disabled = disabled || movementInProgress || Boolean(pendingMovement);
        });
        movementSubmitButton.disabled = disabled || movementInProgress;
        closeMovimentacoesButton.disabled = movementInProgress || Boolean(pendingMovement);
    }

    function updateMovementFields() {
        const adjustmentMode = movementTypeSelect.value === 'AJUSTE';
        movementQuantityField.classList.toggle('is-hidden', adjustmentMode);
        movementAdjustmentField.classList.toggle('is-hidden', !adjustmentMode);
        movementQuantityInput.required = !adjustmentMode;
        movementAdjustmentInput.required = adjustmentMode;
        movementQuantityInput.min = '1';
        movementAdjustmentInput.min = '0';
        movementQuantityInput.placeholder = adjustmentMode ? '' : 'Quantidade em gramas';
        movementAdjustmentInput.placeholder = adjustmentMode ? 'Saldo final em gramas' : '';
        if (adjustmentMode) {
            movementQuantityInput.value = '';
        } else {
            movementAdjustmentInput.value = '';
        }
    }

    function renderMovementFilamentInfo(filamento) {
        movementFilamentInfo.textContent = filamento
            ? `${filamento.material} • ${filamento.marca} • ${filamento.linha || 'Sem linha'} • ${filamento.cor} — Saldo atual: ${filamento.quantidadeDisponivel} g`
            : 'Filamento não disponível na lista de ativos.';
    }

    function setRegistrationInputsDisabled(disabled) {
        form.querySelectorAll('input, select, textarea').forEach((control) => {
            control.disabled = disabled;
        });
    }

    function enableRegistration() {
        openFormButton.disabled = false;
        setRegistrationInputsDisabled(false);
        cancelFormButton.disabled = false;
        submitFormButton.disabled = false;
        setFormMessage(editingFilamentoId
            ? 'Edite os dados do filamento selecionado.'
            : 'Preencha os dados para cadastrar um novo filamento.');
        document.getElementById('filamentos-write-status').textContent =
            'Cadastro e edição de filamentos estão disponíveis. Arquivamento e movimentações permanecem temporariamente indisponíveis.';
    }

    function createUniqueId(prefix) {
        const cryptoApi = window.crypto;
        let suffix;
        if (typeof cryptoApi?.randomUUID === 'function') {
            suffix = cryptoApi.randomUUID();
        } else if (typeof cryptoApi?.getRandomValues === 'function') {
            const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
            suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        } else {
            throw new Error('Este navegador não oferece geração segura de identificadores. Atualize o navegador e tente novamente.');
        }
        return `${prefix}-${suffix}`;
    }

    function getFormValues() {
        const formData = new FormData(form);
        return {
            material: String(formData.get('material') || '').trim(),
            marca: String(formData.get('marca') || '').trim(),
            linha: String(formData.get('linha') || '').trim(),
            cor: String(formData.get('cor') || '').trim(),
            pesoNominal: Number(formData.get('pesoNominal') || 0),
            quantidadeDisponivel: Number(formData.get('quantidadeDisponivel') || 0),
            valorPago: Number(formData.get('valorPago') || 0),
            observacoes: String(formData.get('observacoes') || '').trim()
        };
    }

    function validateRegistration(values) {
        if (!MATERIALS.includes(values.material)) return 'Selecione um material válido.';
        if (values.marca.length < 2) return 'Informe a marca do filamento.';
        if (values.cor.length < 2) return 'Informe a cor do filamento.';
        if (!Number.isFinite(values.pesoNominal) || values.pesoNominal <= 0) {
            return 'O peso nominal do rolo deve ser maior que zero.';
        }
        if (!Number.isFinite(values.quantidadeDisponivel) || values.quantidadeDisponivel < 0) {
            return 'O saldo inicial não pode ser negativo.';
        }
        if (values.quantidadeDisponivel > values.pesoNominal) {
            return 'O saldo inicial não pode ser maior que o peso nominal.';
        }
        if (!Number.isFinite(values.valorPago) || values.valorPago < 0) {
            return 'O valor pago não pode ser negativo.';
        }
        return '';
    }

    function sameRegistrationFilament(row, registration) {
        const values = registration.values;
        return row.id === registration.filamentoId
            && row.user_id === authenticatedUserId
            && row.material === values.material
            && row.marca === values.marca
            && (row.linha ?? '') === values.linha
            && row.cor === values.cor
            && Number(row.peso_nominal) === values.pesoNominal
            && Number(row.quantidade_disponivel) === values.quantidadeDisponivel
            && Number(row.valor_pago) === values.valorPago
            && (row.observacoes ?? '') === values.observacoes;
    }

    function sameInitialMovement(row, registration) {
        return row.id === registration.movimentacaoId
            && row.user_id === authenticatedUserId
            && row.filamento_id === registration.filamentoId
            && row.tipo === 'ENTRADA'
            && Number(row.quantidade) === registration.values.quantidadeDisponivel
            && row.observacao === 'Cadastro inicial do rolo.';
    }

    async function verifyRegistration(registration) {
        const client = window.RondySupabase.getClient();
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError) throw userError;
        if (!userData?.user || userData.user.is_anonymous
            || userData.user.id !== authenticatedUserId) {
            throw new Error('Não foi possível confirmar a sessão do proprietário original desta tentativa.');
        }

        const [filamentResult, movementResult] = await Promise.all([
            client.from('filamentos')
                .select('id, user_id, material, marca, linha, cor, peso_nominal, quantidade_disponivel, valor_pago, observacoes')
                .eq('id', registration.filamentoId)
                .eq('user_id', authenticatedUserId)
                .maybeSingle(),
            client.from('filamentos_movimentacoes')
                .select('id, user_id, filamento_id, tipo, quantidade, observacao')
                .eq('id', registration.movimentacaoId)
                .eq('user_id', authenticatedUserId)
                .maybeSingle()
        ]);

        if (filamentResult.error) throw filamentResult.error;
        if (movementResult.error) throw movementResult.error;

        if (!filamentResult.data && !movementResult.data) return 'absent';
        if (filamentResult.data && movementResult.data
            && sameRegistrationFilament(filamentResult.data, registration)
            && sameInitialMovement(movementResult.data, registration)) {
            return 'complete';
        }
        return 'conflict';
    }

    function closeRegistrationForm() {
        form.reset();
        formPanel.classList.add('is-hidden');
        setFormMode(false);
        setFormMessage('Preencha os dados para cadastrar um novo filamento.');
        openFormButton.textContent = '+ CADASTRAR FILAMENTO';
    }

    function setFormMode(isEditing) {
        formTitle.textContent = isEditing ? 'EDITAR FILAMENTO' : 'NOVO FILAMENTO';
        submitFormButton.textContent = isEditing ? 'SALVAR EDIÇÃO' : 'SALVAR FILAMENTO';
        openFormButton.disabled = isEditing || Boolean(pendingRegistration) || Boolean(pendingEdit);
    }

    function startEditingFilamento(filamentoId) {
        if (pendingRegistration || pendingEdit || editingFilamentoId || pendingMovement || movementInProgress) {
            setFormMessage('Salve ou cancele a edição atual antes de iniciar outra operação.', true);
            return;
        }

        const filamento = getFilamentoById(filamentoId);
        if (!filamento || filamento.userId !== authenticatedUserId || filamento.arquivado) {
            setFormMessage('O filamento selecionado não está disponível para edição nesta conta.', true);
            return;
        }

        editingFilamentoId = filamento.id;
        form.elements.material.value = filamento.material;
        form.elements.marca.value = filamento.marca;
        form.elements.linha.value = filamento.linha;
        form.elements.cor.value = filamento.cor;
        form.elements.pesoNominal.value = String(filamento.pesoNominal);
        form.elements.quantidadeDisponivel.value = String(filamento.quantidadeDisponivel);
        form.elements.valorPago.value = String(filamento.valorPago);
        form.elements.observacoes.value = filamento.observacoes;
        setFormMode(true);
        setFormMessage('Altere os campos desejados e salve a edição.');
        formPanel.classList.remove('is-hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function completeEdit() {
        pendingEdit = null;
        editingFilamentoId = null;
        setRegistrationInputsDisabled(false);
        submitFormButton.disabled = false;
        cancelFormButton.disabled = false;
        closeRegistrationForm();

        const refreshed = await loadFilamentos();
        loadStatus.textContent = refreshed
            ? 'Filamento atualizado com sucesso e lista atualizada.'
            : 'Filamento atualizado com sucesso. Não foi possível atualizar a lista; use “Tentar novamente”.';
        loadStatus.classList.toggle('is-error', !refreshed);
        loadStatus.setAttribute('role', refreshed ? 'status' : 'alert');
        retryLoadButton.hidden = refreshed;
    }

    async function archiveFilamento(filamentoId, button) {
        if (archivingFilamentoIds.has(filamentoId)) return;
        if (pendingRegistration || pendingEdit || pendingMovement || movementInProgress) {
            setLoadStatus('Conclua ou confirme a operação pendente antes de arquivar um filamento.', true);
            return;
        }

        const filamento = getFilamentoById(filamentoId);
        if (!filamento || filamento.userId !== authenticatedUserId || filamento.arquivado) {
            setLoadStatus('O filamento selecionado não está disponível para arquivamento nesta conta.', true);
            return;
        }
        if (editingFilamentoId === filamentoId) {
            setFormMessage('Cancele ou salve a edição antes de arquivar este filamento.', true);
            return;
        }

        const confirmed = window.confirm(
            `Arquivar ${filamento.material} • ${filamento.marca} • ${filamento.cor}?\n\n` +
            'O filamento deixará de aparecer entre os ativos, mas não será excluído permanentemente. ' +
            'O saldo e o histórico de movimentações serão preservados.'
        );
        if (!confirmed) return;

        archivingFilamentoIds.add(filamentoId);
        button.disabled = true;
        setLoadStatus('Arquivando filamento no Supabase…');

        try {
            const client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous
                || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de arquivar este filamento.');
            }

            const { data, error } = await client.rpc('definir_arquivamento_filamento', {
                p_filamento_id: filamentoId,
                p_arquivado: true
            });
            if (error) throw error;
            if (!data
                || data.id !== filamentoId
                || data.arquivado !== true
                || typeof data.alterado !== 'boolean') {
                throw new Error('A resposta do Supabase não confirmou o arquivamento.');
            }

            const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
            if (verifiedUserError) throw verifiedUserError;
            if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante o arquivamento. Verifique o estado do filamento antes de repetir.');
            }

            filamento.arquivado = true;
            filamentos = filamentos.filter((item) => item.id !== filamentoId);
            renderIndicators();
            renderFilamentos();
            setLoadStatus(data.alterado
                ? 'Filamento arquivado com sucesso. O saldo e o histórico foram preservados.'
                : 'O filamento já estava arquivado. A lista de ativos foi atualizada.');
        } catch (error) {
            console.error('Falha ao arquivar filamento no Supabase:', error);
            setLoadStatus(`Não foi possível confirmar o arquivamento. Nenhum dado foi removido da lista. ${getErrorMessage(error)}`, true);
        } finally {
            archivingFilamentoIds.delete(filamentoId);
            if (button.isConnected) button.disabled = false;
        }
    }

    async function handleEditSubmit(event) {
        event.preventDefault();
        if (submitFormButton.disabled) return;

        const filamento = getFilamentoById(editingFilamentoId);
        if (!filamento || filamento.userId !== authenticatedUserId || filamento.arquivado) {
            setFormMessage('O filamento selecionado não está disponível para edição nesta conta.', true);
            return;
        }

        if (!pendingEdit) {
            const values = getFormValues();
            const validationError = validateRegistration(values);
            if (validationError) {
                setFormMessage(validationError, true);
                return;
            }

            try {
                pendingEdit = {
                    filamentoId: filamento.id,
                    movimentacaoId: createUniqueId('edit'),
                    values,
                    needsVerification: false
                };
            } catch (error) {
                setFormMessage(getErrorMessage(error), true);
                return;
            }
        }

        const edit = pendingEdit;
        const wasNeedsVerification = edit.needsVerification;
        setRegistrationInputsDisabled(true);
        submitFormButton.disabled = true;
        cancelFormButton.disabled = true;
        submitFormButton.textContent = edit.needsVerification
            ? 'CONFIRMANDO EDIÇÃO…'
            : 'SALVANDO EDIÇÃO…';
        setFormMessage(edit.needsVerification
            ? 'Confirmando a tentativa anterior com o mesmo identificador…'
            : 'Salvando edição no Supabase…');

        let rpcStarted = false;
        try {
            const client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous
                || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de editar este filamento.');
            }

            rpcStarted = true;
            const { data, error } = await client.rpc('editar_filamento', {
                p_id: edit.filamentoId,
                p_material: edit.values.material,
                p_marca: edit.values.marca,
                p_linha: edit.values.linha,
                p_cor: edit.values.cor,
                p_peso_nominal: edit.values.pesoNominal,
                p_quantidade_disponivel: edit.values.quantidadeDisponivel,
                p_valor_pago: edit.values.valorPago,
                p_observacoes: edit.values.observacoes,
                p_movimentacao_id: edit.movimentacaoId
            });

            if (error) {
                if (isDefinitiveRpcError(error)) throw error;
                edit.needsVerification = true;
                throw error;
            }
            const validCommonResponse = data
                && data.id === edit.filamentoId
                && typeof data.ajuste_criado === 'boolean'
                && typeof data.dados_alterados === 'boolean'
                && (data.ajuste_criado
                    ? data.movimentacao_id === edit.movimentacaoId
                    : data.movimentacao_id === null);
            const validNewEditResponse = data?.status === 'concluida'
                && Number(data.saldo) === edit.values.quantidadeDisponivel;
            const validIdempotentResponse = data?.status === 'ja_aplicada'
                && Number(data.saldo_solicitado) === edit.values.quantidadeDisponivel
                && Number.isFinite(Number(data.saldo))
                && Number(data.saldo) >= 0;

            if (!validCommonResponse || (!validNewEditResponse && !validIdempotentResponse)) {
                edit.needsVerification = true;
                throw new Error('A resposta do Supabase não confirmou os dados e o ajuste da edição.');
            }

            const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
            if (verifiedUserError) throw verifiedUserError;
            if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                edit.needsVerification = true;
                throw new Error('A sessão mudou durante a edição. A tentativa será mantida para confirmação segura.');
            }

            await completeEdit();
        } catch (error) {
            console.error('Falha ou resposta incerta ao editar filamento no Supabase:', error);
            if ((!rpcStarted && !wasNeedsVerification)
                || (isDefinitiveRpcError(error) && !wasNeedsVerification)) {
                pendingEdit = null;
                setRegistrationInputsDisabled(false);
                setFormMode(true);
                setFormMessage(`A edição não foi confirmada pelo Supabase. ${getErrorMessage(error)}`, true);
            } else {
                edit.needsVerification = true;
                setRegistrationInputsDisabled(true);
                setFormMessage(`Não foi possível confirmar se a edição foi concluída. Os campos e o identificador foram preservados; tente novamente para confirmar sem duplicar o ajuste. ${getErrorMessage(error)}`, true);
            }
        } finally {
            if (pendingEdit) {
                submitFormButton.disabled = false;
                cancelFormButton.disabled = true;
                submitFormButton.textContent = 'VERIFICAR / TENTAR NOVAMENTE';
            } else {
                submitFormButton.disabled = false;
                cancelFormButton.disabled = false;
                submitFormButton.textContent = editingFilamentoId ? 'SALVAR EDIÇÃO' : 'SALVAR FILAMENTO';
            }
        }
    }

    async function completeRegistration() {
        pendingRegistration = null;
        setRegistrationInputsDisabled(false);
        submitFormButton.disabled = false;
        cancelFormButton.disabled = false;
        submitFormButton.textContent = 'SALVAR FILAMENTO';
        closeRegistrationForm();

        const refreshed = await loadFilamentos();
        loadStatus.textContent = refreshed
            ? 'Filamento cadastrado com sucesso e lista atualizada.'
            : 'Filamento cadastrado com sucesso. Não foi possível atualizar a lista; use “Tentar novamente”.';
        loadStatus.classList.toggle('is-error', !refreshed);
        loadStatus.setAttribute('role', refreshed ? 'status' : 'alert');
        retryLoadButton.hidden = refreshed;
    }

    async function handleRegistrationSubmit(event) {
        event.preventDefault();
        if (submitFormButton.disabled) return;

        if (!pendingRegistration) {
            const values = getFormValues();
            const validationError = validateRegistration(values);
            if (validationError) {
                setFormMessage(validationError, true);
                return;
            }

            try {
                pendingRegistration = {
                    filamentoId: createUniqueId('filamento'),
                    movimentacaoId: createUniqueId('mov'),
                    values,
                    needsVerification: false
                };
            } catch (error) {
                setFormMessage(getErrorMessage(error), true);
                return;
            }
        }

        const registration = pendingRegistration;
        if (registration.needsVerification) {
            submitFormButton.disabled = true;
            cancelFormButton.disabled = true;
            try {
                const verification = await verifyRegistration(registration);
                if (verification === 'complete') {
                    await completeRegistration();
                    return;
                }
                if (verification === 'conflict') {
                    setFormMessage('Foi encontrada uma divergência para os identificadores desta tentativa. Os campos permanecem bloqueados para evitar duplicidade ou sobrescrita. Contate o suporte antes de continuar.', true);
                    return;
                }
                registration.needsVerification = false;
            } catch (error) {
                setFormMessage(`Não foi possível verificar o resultado da tentativa. Os mesmos IDs continuam reservados. ${getErrorMessage(error)}`, true);
                return;
            } finally {
                if (pendingRegistration) {
                    submitFormButton.disabled = false;
                    cancelFormButton.disabled = false;
                }
            }
        }

        setRegistrationInputsDisabled(true);
        submitFormButton.disabled = true;
        cancelFormButton.disabled = true;
        setFormMessage('Cadastrando filamento e entrada inicial no Supabase…');

        try {
            const client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous) {
                throw new Error('Sua sessão não está autenticada. Entre novamente antes de cadastrar.');
            }
            if (userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou durante o cadastro. Recarregue a página para confirmar o proprietário antes de continuar.');
            }

            const values = registration.values;
            const { data, error } = await client.rpc('cadastrar_filamento_com_entrada', {
                p_id: registration.filamentoId,
                p_material: values.material,
                p_marca: values.marca,
                p_linha: values.linha,
                p_cor: values.cor,
                p_peso_nominal: values.pesoNominal,
                p_quantidade_disponivel: values.quantidadeDisponivel,
                p_valor_pago: values.valorPago,
                p_observacoes: values.observacoes,
                p_movimentacao_id: registration.movimentacaoId
            });

            if (error) {
                if (isDefinitiveRpcError(error)) throw error;
                registration.needsVerification = true;
                throw new Error(getErrorMessage(error));
            }
            if (!data || data.id !== registration.filamentoId
                || data.movimentacao_id !== registration.movimentacaoId) {
                throw new Error('A resposta do Supabase não confirmou os IDs enviados.');
            }

            await completeRegistration();
        } catch (error) {
            console.error('Falha ou resposta incerta no cadastro de filamento:', error);
            try {
                const result = await verifyRegistration(registration);
                if (result === 'complete') {
                    await completeRegistration();
                    return;
                }
                if (result === 'absent') {
                    if (isDefinitiveRpcError(error)) {
                        pendingRegistration = null;
                        setRegistrationInputsDisabled(false);
                        setFormMessage(`O Supabase confirmou que o cadastro não foi gravado. ${getErrorMessage(error)} Corrija os dados ou tente novamente.`, true);
                    } else {
                        registration.needsVerification = true;
                        setRegistrationInputsDisabled(true);
                        setFormMessage('Ainda não foi possível confirmar o resultado desta tentativa. Os dados e IDs foram preservados; verifique ou repita somente com os mesmos IDs.', true);
                    }
                    return;
                }

                registration.needsVerification = true;
                setRegistrationInputsDisabled(true);
                setFormMessage('Foi encontrada uma divergência para os identificadores desta tentativa. Os campos permanecem bloqueados para evitar duplicidade ou sobrescrita. Contate o suporte antes de continuar.', true);
            } catch (verificationError) {
                console.error('Não foi possível verificar o resultado do cadastro no Supabase:', verificationError);
                registration.needsVerification = true;
                setRegistrationInputsDisabled(true);
                setFormMessage('Não foi possível confirmar se o cadastro foi concluído. Os dados e identificadores desta tentativa foram preservados; tente enviar novamente para verificar usando os mesmos IDs.', true);
            }
        } finally {
            if (pendingRegistration) {
                submitFormButton.disabled = false;
                cancelFormButton.disabled = false;
                submitFormButton.textContent = 'VERIFICAR / TENTAR NOVAMENTE';
            } else {
                submitFormButton.disabled = false;
                cancelFormButton.disabled = false;
                submitFormButton.textContent = 'SALVAR FILAMENTO';
            }
        }
    }

    async function fetchAllRows(queryFactory) {
        const pageSize = 500;
        const rows = [];
        let offset = 0;

        while (true) {
            const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
            if (error) throw error;
            if (!Array.isArray(data)) {
                throw new Error('A consulta ao Supabase não retornou uma lista válida.');
            }
            const page = data;
            rows.push(...page);
            if (page.length < pageSize) return rows;
            offset += page.length;
        }
    }

    async function loadFilamentos() {
        retryLoadButton.hidden = true;
        retryLoadButton.disabled = true;
        loadStatus.classList.remove('is-error');
        loadStatus.setAttribute('role', 'status');
        loadStatus.textContent = 'Carregando filamentos do Supabase…';
        renderTableMessage('Carregando…');

        try {
            const client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous) {
                throw new Error('Não há uma sessão autenticada válida. Entre novamente no Admin.');
            }
            authenticatedUserId = userData.user.id;
            if (!pendingRegistration) enableRegistration();

            const rows = await fetchAllRows(() => client
                .from('filamentos')
                .select('id, user_id, material, marca, linha, cor, peso_nominal, quantidade_disponivel, valor_pago, observacoes, criado_em, atualizado_em, arquivado')
                .eq('user_id', authenticatedUserId)
                .eq('arquivado', false)
                .order('criado_em', { ascending: false })
                .order('id', { ascending: true }));

            filamentos = rows.map(mapFilamento);
            renderIndicators();
            renderFilamentos();
            if (selectedFilamentoId) {
                renderMovementFilamentInfo(getFilamentoById(selectedFilamentoId));
            }
            setMovementControlsDisabled(false);
            updateMovementFields();
            loadStatus.textContent = `Consulta concluída. ${filamentos.length} filamento(s) ativo(s).`;
            loadStatus.setAttribute('role', 'status');
            return true;
        } catch (error) {
            console.error('Falha ao consultar filamentos no Supabase:', error);
            filamentos = [];
            renderIndicators();
            renderTableMessage('A lista não está disponível porque a consulta ao Supabase falhou.');
            loadStatus.textContent = `Não foi possível carregar os filamentos do Supabase. ${getErrorMessage(error)}`;
            loadStatus.classList.add('is-error');
            loadStatus.setAttribute('role', 'alert');
            retryLoadButton.hidden = false;
            return false;
        } finally {
            retryLoadButton.disabled = false;
        }
    }

    function renderFilamentos() {
        const filamentos = getFilamentos();
        const searchTerm = searchInput.value.trim().toLowerCase();
        const filterStatus = statusFilter.value;

        if (!filamentos.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum filamento ativo foi encontrado no Supabase. Os dados locais não foram importados nem alterados.</td></tr>';
            return;
        }

        const filtered = filamentos.filter((filamento) => {
            const searchableText = `${filamento.material} ${filamento.marca} ${filamento.linha || ''} ${filamento.cor}`.toLowerCase();
            const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
            const status = getStatusBySaldo(filamento);
            const normalizedStatus = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
            const matchesStatus = filterStatus === 'todos' || normalizedStatus === filterStatus;
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
                <tr data-filamento-id="${escapeHTML(filamento.id)}">
                    <td>
                        <div class="filamento-info">
                            <span class="filamento-info__material">${escapeHTML(filamento.material)}</span>
                        </div>
                    </td>
                    <td>${escapeHTML(filamento.marca)}</td>
                    <td>${escapeHTML(filamento.linha || '—')}</td>
                    <td>${escapeHTML(filamento.cor)}</td>
                    <td>${saldoText}</td>
                    <td>${formatCurrency(custoPorGrama)}/g</td>
                    <td><span class="filamento-tag ${labelClass}">${status}</span></td>
                    <td>
                        <div class="filamento-actions">
                            <button type="button" data-action="edit" data-id="${escapeHTML(filamento.id)}">EDITAR</button>
                            <button type="button" data-action="movimentacoes" data-id="${escapeHTML(filamento.id)}">MOVIMENTAÇÕES</button>
                            <button type="button" data-action="archive" data-id="${escapeHTML(filamento.id)}" ${archivingFilamentoIds.has(filamento.id) ? 'disabled' : ''}>EXCLUIR</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function getFilamentoById(filamentoId) {
        return getFilamentos().find((item) => item.id === filamentoId) || null;
    }

    function renderMovimentacoes(movimentacoes) {
        if (!movimentacoes.length) {
            movimentacoesList.innerHTML = '<div class="empty-state">Nenhuma movimentação registrada para este rolo.</div>';
            return;
        }

        movimentacoesList.innerHTML = movimentacoes.map((movimento) => {
            const date = new Date(movimento.dataHora);
            const quantity = safeNumber(movimento.quantidade, 0).toLocaleString('pt-BR', {
                maximumFractionDigits: 2
            });
            return `
                <article class="movimento-item">
                    <div class="movimento-item__top">
                        <span class="movimento-item__tipo">${escapeHTML(movimento.tipo)}</span>
                        <strong class="movimento-item__quantidade">${movimento.tipo === 'AJUSTE' ? `Saldo final: ${quantity} g` : `${movimento.tipo === 'ENTRADA' ? '+' : '−'}${quantity} g`}</strong>
                    </div>
                    <div class="movimento-item__meta">
                        <div>${escapeHTML(date.toLocaleString('pt-BR'))}</div>
                        ${movimento.observacao ? `<div>${escapeHTML(movimento.observacao)}</div>` : ''}
                    </div>
                </article>
            `;
        }).join('');
    }

    async function loadMovimentacoes(filamentoId) {
        const filamento = getFilamentoById(filamentoId);
        if (!filamento) {
            return false;
        }

        const title = `${filamento.material} • ${filamento.marca} • ${filamento.linha || 'Sem linha'} • ${filamento.cor}`;
        document.getElementById('movimentacoes-title').textContent = title;
        movimentacoesList.textContent = 'Carregando histórico do Supabase…';
        movimentacoesList.setAttribute('role', 'status');

        try {
            const client = window.RondySupabase.getClient();
            const rows = await fetchAllRows(() => client
                .from('filamentos_movimentacoes')
                .select('id, user_id, filamento_id, tipo, quantidade, data_hora, observacao')
                .eq('user_id', authenticatedUserId)
                .eq('filamento_id', filamentoId)
                .order('data_hora', { ascending: false })
                .order('id', { ascending: true }));

            const movimentacoes = rows.map(mapMovimentacao);
            if (selectedFilamentoId === filamentoId) {
                renderMovimentacoes(movimentacoes);
                movimentacoesList.setAttribute('role', 'status');
            }
            return true;
        } catch (error) {
            console.error('Falha ao consultar movimentações de filamento no Supabase:', error);
            if (selectedFilamentoId === filamentoId) {
                movimentacoesList.textContent = `Não foi possível carregar o histórico do Supabase. ${getErrorMessage(error)}`;
                movimentacoesList.setAttribute('role', 'alert');
            }
            return false;
        }
    }

    async function findPendingMovement(operation) {
        const client = window.RondySupabase.getClient();
        const { data, error } = await client.from('filamentos_movimentacoes')
            .select('id, user_id, filamento_id, tipo, quantidade, data_hora, observacao')
            .eq('id', operation.id)
            .eq('user_id', authenticatedUserId)
            .maybeSingle();
        if (error) throw error;
        if (!data) return 'absent';

        const movement = mapMovimentacao(data);
        const matchesOperation = movement.id === operation.id
            && movement.filamentoId === operation.filamentoId
            && movement.tipo === operation.tipo
            && movement.quantidade === operation.quantidade
            && movement.observacao === operation.observacao;
        return matchesOperation ? 'confirmed' : 'conflict';
    }

    async function completeMovement(operation, saldo) {
        const filamento = getFilamentoById(operation.filamentoId);
        if (filamento && filamento.userId === authenticatedUserId && Number.isFinite(saldo)) {
            filamento.quantidadeDisponivel = saldo;
            renderIndicators();
            renderFilamentos();
        }

        pendingMovement = null;
        movementQuantityInput.value = '';
        movementAdjustmentInput.value = '';
        movementObservationInput.value = '';
        movementTypeSelect.value = 'ENTRADA';
        updateMovementFields();
        setMovementMessage('Movimentação confirmada. Atualizando saldo e histórico…');

        const listUpdated = await loadFilamentos();
        const historyUpdated = await loadMovimentacoes(operation.filamentoId);
        movementInProgress = false;
        setMovementControlsDisabled(false);
        if (listUpdated && historyUpdated) {
            setMovementMessage('Movimentação registrada com sucesso. Saldo e histórico atualizados.');
        } else {
            setMovementMessage('Movimentação registrada com sucesso, mas não foi possível atualizar o saldo ou o histórico. Recarregue a lista ou feche e reabra o painel para consultar novamente.', true);
        }
    }

    async function submitMovement(event) {
        event.preventDefault();
        if (movementInProgress) return;

        const filamentoId = pendingMovement?.filamentoId || selectedFilamentoId;
        const filamento = getFilamentoById(filamentoId);
        if (!filamento || filamento.userId !== authenticatedUserId || filamento.arquivado) {
            setMovementMessage('Selecione um filamento ativo pertencente à sua conta.', true);
            return;
        }

        let operation = pendingMovement;
        const wasNeedsVerification = Boolean(operation?.needsVerification);
        let rpcStarted = false;
        let definitiveFailure = false;
        if (!operation) {
            const tipo = movementTypeSelect.value;
            if (!['ENTRADA', 'CONSUMO', 'AJUSTE'].includes(tipo)) {
                setMovementMessage('Selecione um tipo de movimentação válido.', true);
                return;
            }
            const rawQuantity = tipo === 'AJUSTE'
                ? movementAdjustmentInput.value
                : movementQuantityInput.value;
            const quantidade = Number(rawQuantity);
            if (rawQuantity === '' || !Number.isFinite(quantidade)
                || quantidade < 0 || (tipo !== 'AJUSTE' && quantidade <= 0)) {
                setMovementMessage(tipo === 'AJUSTE'
                    ? 'Informe um saldo final válido, igual ou maior que zero.'
                    : 'Informe uma quantidade maior que zero.', true);
                return;
            }
            if (tipo === 'CONSUMO' && quantidade > filamento.quantidadeDisponivel) {
                setMovementMessage('O consumo informado excede o saldo disponível e deixaria o estoque negativo.', true);
                return;
            }

            try {
                operation = {
                    id: createUniqueId('mov'),
                    filamentoId,
                    tipo,
                    quantidade,
                    observacao: movementObservationInput.value.trim(),
                    needsVerification: false
                };
            } catch (error) {
                setMovementMessage(getErrorMessage(error), true);
                return;
            }
        }

        movementInProgress = true;
        setMovementControlsDisabled(true);
        movementSubmitButton.disabled = true;
        setMovementMessage(operation.needsVerification
            ? 'Confirmando a tentativa anterior pelo histórico…'
            : 'Registrando movimentação no Supabase…');

        try {
            const client = window.RondySupabase.getClient();
            const { data: userData, error: userError } = await client.auth.getUser();
            if (userError) throw userError;
            if (!userData?.user || userData.user.is_anonymous
                || userData.user.id !== authenticatedUserId) {
                throw new Error('A sessão mudou. Recarregue a página antes de registrar a movimentação.');
            }

            if (operation.needsVerification) {
                const verification = await findPendingMovement(operation);
                if (verification === 'confirmed') {
                    const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
                    if (verifiedUserError) throw verifiedUserError;
                    if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                        throw new Error('A sessão mudou durante a confirmação da movimentação.');
                    }
                    await completeMovement(operation, NaN);
                    return;
                }
                if (verification === 'conflict') {
                    definitiveFailure = true;
                    throw new Error('O identificador da tentativa já está associado a outra movimentação. A operação foi mantida bloqueada para evitar duplicidade.');
                }
            }

            rpcStarted = true;
            const { data, error } = await client.rpc('registrar_movimentacao_filamento', {
                p_id: operation.id,
                p_filamento_id: operation.filamentoId,
                p_tipo: operation.tipo,
                p_quantidade: operation.quantidade,
                p_observacao: operation.observacao
            });
            if (error) {
                if (operation.needsVerification && isDefinitiveMovementError(error)) {
                    const verification = await findPendingMovement(operation);
                    if (verification === 'confirmed') {
                        const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
                        if (verifiedUserError) throw verifiedUserError;
                        if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                            throw new Error('A sessão mudou durante a confirmação da movimentação.');
                        }
                        await completeMovement(operation, NaN);
                        return;
                    }
                    if (verification === 'conflict') {
                        definitiveFailure = true;
                        throw new Error('O identificador da tentativa já está associado a outra movimentação.');
                    }
                    pendingMovement = null;
                    setMovementControlsDisabled(false);
                    definitiveFailure = true;
                    throw error;
                }
                if (isDefinitiveMovementError(error) && !operation.needsVerification) {
                    definitiveFailure = true;
                    throw error;
                }
                operation.needsVerification = true;
                pendingMovement = operation;
                throw error;
            }

            const validResponse = data
                && data.id === operation.id
                && data.filamento_id === operation.filamentoId
                && data.tipo === operation.tipo
                && Number(data.quantidade) === operation.quantidade
                && Number.isFinite(Number(data.saldo))
                && Number(data.saldo) >= 0
                && (operation.tipo !== 'AJUSTE' || Number(data.saldo) === operation.quantidade);
            if (!validResponse) {
                operation.needsVerification = true;
                pendingMovement = operation;
                throw new Error('A resposta do Supabase não confirmou os dados da movimentação; a tentativa foi preservada para verificação.');
            }

            const { data: verifiedUserData, error: verifiedUserError } = await client.auth.getUser();
            if (verifiedUserError) throw verifiedUserError;
            if (!verifiedUserData?.user || verifiedUserData.user.id !== authenticatedUserId) {
                operation.needsVerification = true;
                pendingMovement = operation;
                throw new Error('A sessão mudou após o registro. A tentativa foi preservada para confirmação segura.');
            }

            await completeMovement(operation, Number(data.saldo));
        } catch (error) {
            console.error('Falha ou resposta incerta ao registrar movimentação:', error);
            if (definitiveFailure) {
                pendingMovement = null;
                operation.needsVerification = false;
                setMovementMessage(`A movimentação não foi registrada. ${getErrorMessage(error)}`, true);
            } else if (!rpcStarted && !wasNeedsVerification) {
                pendingMovement = null;
                operation.needsVerification = false;
                setMovementMessage(`A movimentação não foi enviada. ${getErrorMessage(error)}`, true);
            } else if (!pendingMovement && operation.needsVerification) {
                pendingMovement = operation;
                setMovementMessage(`Não foi possível confirmar se a movimentação foi registrada. Os dados e o identificador foram preservados; envie novamente para verificar sem duplicar o registro. ${getErrorMessage(error)}`, true);
            } else if (!operation.needsVerification && isDefinitiveMovementError(error)) {
                pendingMovement = null;
                setMovementMessage(`A movimentação não foi registrada. ${getErrorMessage(error)}`, true);
            } else {
                operation.needsVerification = true;
                pendingMovement = operation;
                setMovementMessage(`Não foi possível confirmar se a movimentação foi registrada. Os dados e o identificador foram preservados; envie novamente para verificar sem duplicar o registro. ${getErrorMessage(error)}`, true);
            }
        } finally {
            movementInProgress = false;
            setMovementControlsDisabled(false);
            if (pendingMovement) {
                movementSubmitButton.textContent = 'VERIFICAR / TENTAR NOVAMENTE';
                movementSubmitButton.disabled = false;
            } else {
                movementSubmitButton.textContent = 'REGISTRAR MOVIMENTAÇÃO';
                movementSubmitButton.disabled = !authenticatedUserId;
            }
        }
    }

    function openMovimentacoes(filamentoId) {
        if (movementInProgress) {
            setMovementMessage('Aguarde a confirmação da movimentação em andamento.', true);
            return;
        }
        if (pendingMovement && selectedFilamentoId !== filamentoId) {
            setMovementMessage('Confirme a movimentação pendente antes de selecionar outro filamento.', true);
            return;
        }
        selectedFilamentoId = filamentoId;
        const filamento = getFilamentoById(filamentoId);
        renderMovementFilamentInfo(filamento);
        if (!pendingMovement) {
            movimentacaoForm.reset();
            movementTypeSelect.value = 'ENTRADA';
            updateMovementFields();
            setMovementMessage('Informe a movimentação de estoque.');
        }
        movimentacoesPanel.classList.remove('is-hidden');
        void loadMovimentacoes(filamentoId);
    }

    function closeMovimentacoes() {
        if (movementInProgress || pendingMovement) {
            setMovementMessage('Conclua ou confirme a movimentação antes de fechar este painel.', true);
            return;
        }
        movimentacoesPanel.classList.add('is-hidden');
        selectedFilamentoId = null;
    }

    formMessage.textContent = 'Cadastre ou edite filamentos pelo formulário.';
    movimentacaoMessage.textContent = 'Informe a movimentação de estoque.';
    openFormButton.addEventListener('click', () => {
        if (!pendingRegistration) {
            editingFilamentoId = null;
            form.reset();
            setFormMode(false);
            setFormMessage('Preencha os dados para cadastrar um novo filamento.');
        }
        formPanel.classList.remove('is-hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        openFormButton.textContent = '+ CADASTRAR FILAMENTO';
    });
    cancelFormButton.addEventListener('click', () => {
        if (pendingRegistration || pendingEdit) {
            formPanel.classList.add('is-hidden');
            return;
        }
        editingFilamentoId = null;
        form.reset();
        setFormMode(false);
        formPanel.classList.add('is-hidden');
        setFormMessage('Preencha os dados para cadastrar um novo filamento.');
    });
    form.addEventListener('submit', (event) => {
        if (editingFilamentoId || pendingEdit) {
            void handleEditSubmit(event);
        } else {
            void handleRegistrationSubmit(event);
        }
    });
    movementTypeSelect.addEventListener('change', updateMovementFields);
    movimentacaoForm.addEventListener('submit', (event) => { void submitMovement(event); });

    searchInput.addEventListener('input', renderFilamentos);
    statusFilter.addEventListener('change', renderFilamentos);
    retryLoadButton.addEventListener('click', () => { void loadFilamentos(); });

    tableBody.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) {
            return;
        }

        if (button.dataset.action === 'movimentacoes') {
            openMovimentacoes(button.dataset.id);
        } else if (button.dataset.action === 'edit') {
            startEditingFilamento(button.dataset.id);
        } else if (button.dataset.action === 'archive') {
            void archiveFilamento(button.dataset.id, button);
        }
    });

    closeMovimentacoesButton.addEventListener('click', closeMovimentacoes);

    updateMovementFields();
    renderIndicators();
    void loadFilamentos();
});
