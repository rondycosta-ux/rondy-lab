-- Exclusao segura de produtos: remove somente registros sem estoque, vinculos ou historico.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.produtos') IS NULL
       OR to_regclass('public.produto_variacoes') IS NULL
       OR to_regclass('public.produto_movimentacoes') IS NULL
       OR to_regclass('public.produto_imagens') IS NULL
       OR to_regclass('public.vitrine_produtos') IS NULL
       OR to_regclass('public.pedido_itens') IS NULL
       OR to_regclass('public.pedido_reservas') IS NULL
       OR to_regclass('public.estabelecimento_comissoes') IS NULL
       OR to_regclass('public.consignacao_saldos') IS NULL
       OR to_regclass('public.consignacao_movimentacoes') IS NULL
       OR to_regclass('public.consignacao_conferencia_itens') IS NULL
       OR to_regclass('public.user_roles') IS NULL
       OR to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'As estruturas de produtos, pedidos, consignacao, vitrines, galeria e perfis devem existir.';
    END IF;

    IF to_regprocedure('public.excluir_ou_arquivar_produto(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'A RPC excluir_ou_arquivar_produto ja existe; revise antes de continuar.';
    END IF;
END;
$preflight$;

CREATE FUNCTION public.excluir_ou_arquivar_produto(p_produto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_arquivado boolean;
    v_tem_dependencia boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_produto_id IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM public.user_roles AS r
           WHERE r.user_id = v_user_id AND r.role = 'admin'
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:produto-exclusao:' || p_produto_id::text, 0)
    );

    SELECT p.arquivado
    INTO v_arquivado
    FROM public.produtos AS p
    WHERE p.id = p_produto_id AND p.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Produto nao encontrado ou sem permissao.';
    END IF;

    -- Mantem a mesma ordem de lock usada pelos fluxos de estoque e pedidos.
    PERFORM 1
    FROM public.produto_variacoes AS pv
    WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
    ORDER BY pv.id
    FOR UPDATE;

    SELECT EXISTS (
        SELECT 1 FROM public.produto_variacoes AS pv
        WHERE pv.produto_id = p_produto_id
          AND pv.user_id = v_user_id
          AND pv.estoque_atual <> 0
    )
    OR EXISTS (
        SELECT 1 FROM public.produto_movimentacoes AS pm
        JOIN public.produto_variacoes AS pv ON pv.id = pm.variacao_id
        WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
    )
    OR EXISTS (
        SELECT 1 FROM public.pedido_itens AS pi
        WHERE pi.produto_id = p_produto_id
           OR pi.variacao_id IN (
               SELECT pv.id FROM public.produto_variacoes AS pv
               WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
           )
    )
    OR EXISTS (
        SELECT 1 FROM public.pedido_reservas AS pr
        WHERE pr.variacao_id IN (
            SELECT pv.id FROM public.produto_variacoes AS pv
            WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.vitrine_produtos AS vp WHERE vp.produto_id = p_produto_id
    )
    OR EXISTS (
        SELECT 1 FROM public.produto_imagens AS pi
        WHERE pi.produto_id = p_produto_id AND pi.user_id = v_user_id
    )
    OR EXISTS (
        SELECT 1 FROM storage.objects AS so
        WHERE so.bucket_id = 'produto-imagens'
          AND so.name LIKE v_user_id::text || '/' || p_produto_id::text || '/%'
    )
    OR EXISTS (
        SELECT 1 FROM public.estabelecimento_comissoes AS ec
        WHERE ec.variacao_id IN (
            SELECT pv.id FROM public.produto_variacoes AS pv
            WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.consignacao_saldos AS cs
        WHERE cs.variacao_id IN (
            SELECT pv.id FROM public.produto_variacoes AS pv
            WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.consignacao_movimentacoes AS cm
        WHERE cm.variacao_id IN (
            SELECT pv.id FROM public.produto_variacoes AS pv
            WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.consignacao_conferencia_itens AS ci
        WHERE ci.variacao_id IN (
            SELECT pv.id FROM public.produto_variacoes AS pv
            WHERE pv.produto_id = p_produto_id AND pv.user_id = v_user_id
        )
    )
    INTO v_tem_dependencia;

    IF v_tem_dependencia THEN
        IF NOT v_arquivado THEN
            UPDATE public.produtos
            SET arquivado = true
            WHERE id = p_produto_id AND user_id = v_user_id;
        END IF;

        RETURN pg_catalog.jsonb_build_object(
            'produto_id', p_produto_id,
            'acao', 'ARQUIVADO',
            'alterado', NOT v_arquivado
        );
    END IF;

    DELETE FROM public.produtos
    WHERE id = p_produto_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'O produto foi alterado por outra operacao; atualize a lista.';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'produto_id', p_produto_id,
        'acao', 'EXCLUIDO',
        'alterado', true
    );
END;
$function$;

ALTER FUNCTION public.excluir_ou_arquivar_produto(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.excluir_ou_arquivar_produto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_ou_arquivar_produto(uuid) TO authenticated;

COMMIT;
