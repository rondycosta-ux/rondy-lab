-- Evolução compatível das variações de produtos. Executar após a migration 006.
BEGIN;

ALTER TABLE public.produto_variacoes
    ADD COLUMN nome text,
    ADD COLUMN modelo text,
    ADD COLUMN sku text,
    ADD CONSTRAINT produto_variacoes_nome_check CHECK (nome IS NULL OR length(btrim(nome)) BETWEEN 1 AND 100),
    ADD CONSTRAINT produto_variacoes_modelo_check CHECK (modelo IS NULL OR length(btrim(modelo)) BETWEEN 1 AND 100),
    ADD CONSTRAINT produto_variacoes_sku_check CHECK (sku IS NULL OR length(btrim(sku)) BETWEEN 1 AND 100);

ALTER TABLE public.produto_variacoes DROP CONSTRAINT produto_variacoes_padrao_check;
ALTER TABLE public.produto_variacoes ADD CONSTRAINT produto_variacoes_padrao_check CHECK (
    variacao_padrao = (nome IS NULL AND modelo IS NULL AND sku IS NULL AND cor IS NULL AND tamanho IS NULL)
);

DROP INDEX public.produto_variacoes_combinacao_unique;
CREATE UNIQUE INDEX produto_variacoes_combinacao_unique ON public.produto_variacoes (
    produto_id, lower(COALESCE(btrim(nome), '')), lower(COALESCE(btrim(modelo), '')),
    lower(COALESCE(btrim(sku), '')), lower(COALESCE(btrim(cor), '')), lower(COALESCE(btrim(tamanho), ''))
);

GRANT UPDATE (nome, modelo, sku) ON public.produto_variacoes TO authenticated;

-- Nova assinatura sem defaults mantém a RPC anterior disponível para clientes existentes.
CREATE FUNCTION public.criar_variacao_produto(
    p_id uuid, p_produto_id uuid, p_nome text, p_modelo text, p_sku text,
    p_cor text, p_tamanho text, p_custo_unitario numeric, p_preco_unitario numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_nome text := NULLIF(btrim(p_nome), '');
    v_modelo text := NULLIF(btrim(p_modelo), '');
    v_sku text := NULLIF(btrim(p_sku), '');
    v_cor text := NULLIF(btrim(p_cor), '');
    v_tamanho text := NULLIF(btrim(p_tamanho), '');
    v_produto_arquivado boolean;
    v_padrao_id uuid;
    v_estoque_padrao integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF p_id IS NULL OR p_produto_id IS NULL OR v_nome IS NULL
       OR length(v_nome) > 100 OR length(v_modelo) > 100 OR length(v_sku) > 100
       OR length(v_cor) > 100 OR length(v_tamanho) > 100
       OR (p_custo_unitario IS NOT NULL AND (p_custo_unitario < 0 OR p_custo_unitario::text IN ('NaN', 'Infinity', '-Infinity')))
       OR (p_preco_unitario IS NOT NULL AND (p_preco_unitario < 0 OR p_preco_unitario::text IN ('NaN', 'Infinity', '-Infinity'))) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados da variacao invalidos.';
    END IF;
    SELECT p.arquivado INTO v_produto_arquivado FROM public.produtos AS p
        WHERE p.id = p_produto_id AND p.user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Produto nao encontrado ou sem permissao.';
    END IF;
    IF v_produto_arquivado THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Produto arquivado nao aceita novas variacoes.';
    END IF;
    INSERT INTO public.produto_variacoes (id, user_id, produto_id, nome, modelo, sku, cor, tamanho, variacao_padrao, custo_unitario, preco_unitario)
        VALUES (p_id, v_user_id, p_produto_id, v_nome, v_modelo, v_sku, v_cor, v_tamanho, false, p_custo_unitario, p_preco_unitario);
    SELECT v.id, v.estoque_atual INTO v_padrao_id, v_estoque_padrao FROM public.produto_variacoes AS v
        WHERE v.produto_id = p_produto_id AND v.user_id = v_user_id AND v.variacao_padrao FOR UPDATE;
    IF FOUND AND v_estoque_padrao = 0 THEN
        UPDATE public.produto_variacoes SET arquivado = true WHERE id = v_padrao_id AND user_id = v_user_id;
    END IF;
    RETURN pg_catalog.jsonb_build_object('variacao_id', p_id, 'produto_id', p_produto_id);
END;
$function$;
ALTER FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, text, text, text, numeric, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, text, text, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, text, text, text, numeric, numeric) TO authenticated;
COMMIT;
