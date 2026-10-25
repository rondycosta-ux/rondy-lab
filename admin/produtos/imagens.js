document.addEventListener('DOMContentLoaded', async () => {
    if (!window.RondyAuth || !(await window.RondyAuth.ready)) return;

    const panel = document.getElementById('imagens-panel');
    const title = document.getElementById('imagens-produto');
    const message = document.getElementById('imagens-mensagem');
    const gallery = document.getElementById('imagens-galeria');
    const form = document.getElementById('imagens-form');
    const filesInput = document.getElementById('imagens-arquivos');
    const client = window.RondySupabase.getClient();
    const storage = client.storage.from('produto-imagens');
    const maxSize = 5 * 1024 * 1024;
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
    let userId = null;
    let product = null;
    let busy = false;
    let renderVersion = 0;

    function notice(text, error = false) {
        message.textContent = text;
        message.classList.toggle('is-error', error);
        message.setAttribute('role', error ? 'alert' : 'status');
    }

    function setBusy(value) {
        busy = value;
        form.querySelectorAll('input, button').forEach((element) => { element.disabled = value; });
        gallery.querySelectorAll('button').forEach((element) => { element.disabled = value; });
    }

    async function checkUser() {
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        if (!data?.user || data.user.is_anonymous || (userId && data.user.id !== userId)) {
            throw new Error('A sessão mudou. Recarregue a página.');
        }
        userId = data.user.id;
    }

    async function listImages(productId) {
        const { data, error } = await client.from('produto_imagens')
            .select('id, user_id, produto_id, storage_path, capa, variacao_id, criado_em')
            .eq('user_id', userId).eq('produto_id', productId)
            .order('criado_em', { ascending: true }).order('id', { ascending: true });
        if (error) throw error;
        if (!Array.isArray(data) || data.some((row) => row.user_id !== userId || row.produto_id !== productId)) {
            throw new Error('Não foi possível confirmar a propriedade das imagens.');
        }
        return data;
    }

    async function signedUrl(path) {
        const { data, error } = await storage.createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) throw error || new Error('URL da imagem indisponível.');
        return data.signedUrl;
    }

    async function refreshCovers() {
        const version = ++renderVersion;
        const targets = [...document.querySelectorAll('[data-produto-capa]')];
        if (!targets.length) return;
        targets.forEach((target) => { target.classList.add('is-hidden'); target.removeAttribute('src'); });
        try {
            await checkUser();
            const ids = targets.map((element) => element.dataset.produtoCapa);
            const { data, error } = await client.from('produto_imagens').select('produto_id, storage_path')
                .eq('user_id', userId).eq('capa', true).in('produto_id', ids);
            if (error) throw error;
            await Promise.all((data || []).map(async (item) => {
                try {
                    const url = await signedUrl(item.storage_path);
                    if (version !== renderVersion) return;
                    const target = targets.find((element) => element.dataset.produtoCapa === item.produto_id);
                    if (target?.isConnected) { target.src = url; target.classList.remove('is-hidden'); }
                } catch (error) { console.error('Não foi possível carregar a capa:', error); }
            }));
        } catch (error) { console.error('Não foi possível consultar as capas:', error); }
    }

    async function setCover(imageId) {
        const rows = await listImages(product.id);
        const target = rows.find((row) => row.id === imageId && row.variacao_id === null);
        if (!target) throw new Error('Imagem indisponível para capa.');
        const current = rows.find((row) => row.capa);
        if (current?.id === imageId) return;
        if (current) {
            const { data, error } = await client.from('produto_imagens').update({ capa: false })
                .eq('id', current.id).eq('produto_id', product.id).eq('user_id', userId).eq('capa', true).select('id');
            if (error) throw error;
            if (data?.length !== 1) throw new Error('A capa foi alterada em outra operação. Atualize a galeria.');
        }
        const { data, error } = await client.from('produto_imagens').update({ capa: true })
            .eq('id', imageId).eq('produto_id', product.id).eq('user_id', userId).is('variacao_id', null).select('id');
        if (error || data?.length !== 1) {
            if (current) {
                const { error: restoreError } = await client.from('produto_imagens').update({ capa: true })
                    .eq('id', current.id).eq('produto_id', product.id).eq('user_id', userId);
                if (restoreError) console.error('Não foi possível restaurar a capa anterior:', restoreError);
            }
            throw error || new Error('A nova capa não foi confirmada.');
        }
    }

    async function loadGallery(success = '') {
        let rows = await listImages(product.id);
        if (rows.length && !rows.some((row) => row.capa)) {
            const replacement = rows.find((row) => row.variacao_id === null);
            if (replacement) {
                await setCover(replacement.id);
                rows = await listImages(product.id);
                void refreshCovers();
            }
        }
        const fragment = document.createDocumentFragment();
        for (const image of rows) {
            const item = document.createElement('div');
            item.className = 'produto-galeria__item';
            const thumb = document.createElement('img');
            thumb.alt = image.capa ? 'Imagem principal do produto' : 'Imagem do produto';
            try { thumb.src = await signedUrl(image.storage_path); }
            catch (error) { thumb.alt = 'Imagem indisponível; tente recarregar a galeria'; }
            const label = document.createElement('p');
            label.textContent = image.capa ? 'CAPA' : 'Imagem';
            const actions = document.createElement('div');
            actions.className = 'filamento-actions';
            if (!image.capa && image.variacao_id === null) {
                const coverButton = document.createElement('button');
                coverButton.type = 'button'; coverButton.textContent = 'DEFINIR CAPA';
                coverButton.addEventListener('click', () => { void changeCover(image.id); });
                actions.append(coverButton);
            }
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button'; deleteButton.textContent = 'EXCLUIR';
            deleteButton.addEventListener('click', () => { void deleteImage(image); });
            actions.append(deleteButton);
            item.append(thumb, label, actions);
            fragment.append(item);
        }
        gallery.replaceChildren(fragment);
        notice(success || `${rows.length} de 10 imagens cadastradas.`);
    }

    async function changeCover(id) {
        if (busy) return;
        setBusy(true); notice('Alterando capa…');
        try { await checkUser(); await setCover(id); await loadGallery('Capa atualizada.'); void refreshCovers(); }
        catch (error) { notice(`Não foi possível alterar a capa. ${error.message}`, true); }
        finally { setBusy(false); }
    }

    async function deleteImage(image) {
        if (busy || !window.confirm('Excluir esta imagem?')) return;
        setBusy(true); notice('Excluindo imagem…');
        try {
            await checkUser();
            const { error: storageError } = await storage.remove([image.storage_path]);
            if (storageError) throw storageError;
            const parts = image.storage_path.split('/');
            const { data: objects, error: listError } = await storage.list(`${parts[0]}/${parts[1]}`, { search: parts[2], limit: 100 });
            if (listError) throw listError;
            if (!Array.isArray(objects) || objects.some((object) => object.name === parts[2])) {
                throw new Error('Não foi possível confirmar a remoção do arquivo.');
            }
            const { data, error } = await client.from('produto_imagens').delete()
                .eq('id', image.id).eq('user_id', userId).eq('produto_id', product.id).select('id');
            if (error) throw error;
            if (!Array.isArray(data) || data.length > 1) throw new Error('A exclusão dos metadados não foi confirmada.');
            if (!data.length && (await listImages(product.id)).some((row) => row.id === image.id)) {
                throw new Error('A exclusão dos metadados não foi confirmada.');
            }
            const rows = await listImages(product.id);
            const replacement = rows.find((row) => row.variacao_id === null);
            if (image.capa && !rows.some((row) => row.capa) && replacement) await setCover(replacement.id);
            await loadGallery('Imagem excluída.'); void refreshCovers();
        } catch (error) { notice(`Não foi possível concluir a exclusão. ${error.message} Reabra a galeria para conferir e tentar novamente.`, true); }
        finally { setBusy(false); }
    }

    document.addEventListener('rondy:abrir-imagens', async (event) => {
        if (busy) return;
        product = event.detail;
        title.textContent = product.nome;
        panel.classList.remove('is-hidden');
        gallery.replaceChildren(); form.reset(); setBusy(true); notice('Carregando imagens…');
        try { await checkUser(); await loadGallery(); }
        catch (error) { notice(`Não foi possível carregar as imagens. ${error.message}`, true); }
        finally { setBusy(false); }
    });
    document.addEventListener('rondy:produtos-renderizados', () => { void refreshCovers(); });
    document.getElementById('imagens-fechar').addEventListener('click', () => { if (!busy) { panel.classList.add('is-hidden'); product = null; } });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (busy || !product) return;
        const files = [...filesInput.files];
        if (!files.length || files.some((file) => !extensions[file.type] || file.size < 1 || file.size > maxSize)) {
            notice('Selecione arquivos JPG, PNG ou WebP de até 5 MB cada.', true); return;
        }
        setBusy(true); notice('Enviando imagens…');
        let saved = 0;
        try {
            await checkUser();
            const existing = await listImages(product.id);
            if (existing.length + files.length > 10) throw new Error('O produto pode ter até 10 imagens.');
            for (const file of files) {
                const id = crypto.randomUUID();
                const path = `${userId}/${product.id}/${id}.${extensions[file.type]}`;
                const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, upsert: false });
                if (uploadError) throw new Error(`Upload não confirmado. Verifique o Storage no caminho ${path} antes de repetir. ${uploadError.message}`);
                const { data, error } = await client.from('produto_imagens').insert({ id, user_id: userId, produto_id: product.id, storage_path: path }).select('id');
                if (error || data?.length !== 1) {
                    // Uma resposta incerta exige leitura antes de remover o arquivo.
                    const { data: found, error: readError } = await client.from('produto_imagens').select('id, storage_path').eq('id', id).eq('user_id', userId);
                    if (readError) throw new Error('Não foi possível confirmar o cadastro da imagem; verifique o Storage e a galeria antes de repetir.');
                    if (!found?.length) {
                        if (!error || typeof error.code !== 'string' || !/^[235][0-9A-Z]{4}$/.test(error.code)) {
                            throw new Error(`Resultado do cadastro incerto. Verifique a galeria e o arquivo ${path} antes de repetir.`);
                        }
                        const { error: cleanupError } = await storage.remove([path]);
                        if (cleanupError) throw new Error('Falha no cadastro e na limpeza do arquivo; verifique o Storage antes de repetir.');
                        throw error || new Error('Cadastro da imagem não confirmado.');
                    }
                    if (found.length !== 1 || found[0].storage_path !== path) throw new Error('Registro de imagem inconsistente; verifique a galeria.');
                }
                saved += 1;
            }
            const rows = await listImages(product.id);
            if (!rows.some((row) => row.capa)) {
                const first = rows.find((row) => row.variacao_id === null);
                if (first) await setCover(first.id);
            }
            form.reset(); await loadGallery(`${saved} imagem(ns) adicionada(s).`); void refreshCovers();
        } catch (error) {
            try { await loadGallery(); } catch (_) { /* Manter mensagem principal de erro. */ }
            notice(`Envio interrompido após ${saved} imagem(ns). ${error.message}`, true);
            void refreshCovers();
        } finally { setBusy(false); }
    });
    void refreshCovers();
});
