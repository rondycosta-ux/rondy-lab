-- Conferencias de consignacao: apuracao imutavel, transacional e auditavel.
-- Aplicar manualmente depois da migration 012.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.estabelecimentos') IS NULL
       OR to_regclass('public.estabelecimento_comissoes') IS NULL
       OR to_regclass('public.consignacao_saldos') IS NULL
       OR to_regclass('public.consignacao_movimentacoes') IS NULL
       OR to_regclass('public.produtos') IS NULL
       OR to_regclass('public.produto_variacoes') IS NULL
       OR to_regclass('public.user_roles') IS NULL
       OR to_regprocedure('public.movimentar_consignacao(uuid,uuid,uuid,text,integer,text)') IS NULL THEN
        RAISE EXCEPTION 'A migration 012 e as tabelas de produtos devem estar aplicadas.';
    END IF;

    IF to_regclass('public.consignacao_conferencias') IS NOT NULL
       OR to_regclass('public.consignacao_conferencia_itens') IS NOT NULL
       OR to_regprocedure('public.confirmar_conferencia_consignacao(uuid,uuid,date,text,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'A estrutura de conferencias de consignacao ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Os roles postgres e authenticated esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.consignacao_conferencias (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
    data_visita date NOT NULL CHECK (data_visita <= CURRENT_DATE),
    observacao text NOT NULL CHECK (length(btrim(observacao)) BETWEEN 1 AND 1000),
    solicitacao jsonb NOT NULL,
    confirmada_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT consignacao_conferencias_solicitacao_check CHECK (jsonb_typeof(solicitacao) = 'object')
);

CREATE TABLE public.consignacao_conferencia_itens (
    conferencia_id uuid NOT NULL REFERENCES public.consignacao_conferencias(id) ON DELETE RESTRICT,
    variacao_id uuid NOT NULL REFERENCES public.produto_variacoes(id) ON DELETE RESTRICT,
    saldo_anterior integer NOT NULL CHECK (saldo_anterior > 0),
    quantidade_encontrada integer NOT NULL CHECK (quantidade_encontrada >= 0),
    quantidade_vendida integer NOT NULL CHECK (quantidade_vendida >= 0),
    quantidade_perdida integer NOT NULL DEFAULT 0 CHECK (quantidade_perdida >= 0),
    quantidade_quebrada integer NOT NULL DEFAULT 0 CHECK (quantidade_quebrada >= 0),
    quantidade_extraviada integer NOT NULL DEFAULT 0 CHECK (quantidade_extraviada >= 0),
    saldo_resultante integer NOT NULL CHECK (saldo_resultante >= 0),
    preco_unitario numeric(12,2) NOT NULL CHECK (preco_unitario >= 0 AND preco_unitario::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    comissao_percentual numeric(5,2) NOT NULL CHECK (comissao_percentual BETWEEN 0 AND 100),
    PRIMARY KEY (conferencia_id, variacao_id),
    CONSTRAINT consignacao_conferencia_itens_apuracao_check CHECK (
        quantidade_encontrada = saldo_resultante
        AND quantidade_encontrada <= saldo_anterior
        AND quantidade_vendida + quantidade_perdida + quantidade_quebrada + quantidade_extraviada
            = saldo_anterior - quantidade_encontrada
    )
);

CREATE INDEX consignacao_conferencias_estabelecimento_data_idx
    ON public.consignacao_conferencias(estabelecimento_id, data_visita DESC);
CREATE INDEX consignacao_conferencia_itens_variacao_idx
    ON public.consignacao_conferencia_itens(variacao_id);

COMMENT ON TABLE public.consignacao_conferencias IS
    'Conferencias confirmadas de estoque consignado. Sao imutaveis e registram o payload para idempotencia.';
COMMENT ON TABLE public.consignacao_conferencia_itens IS
    'Apuracao por variacao, incluindo saldos e snapshots comerciais usados no futuro fechamento financeiro.';
COMMENT ON COLUMN public.consignacao_conferencia_itens.preco_unitario IS
    'Preco praticado informado na conferencia; quando ausente, preco da variacao ou preco base do produto.';
COMMENT ON COLUMN public.consignacao_conferencia_itens.comissao_percentual IS
    'Comissao resolvida na confirmacao: especifica da variacao no estabelecimento, ou padrao do estabelecimento.';

ALTER TABLE public.consignacao_conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignacao_conferencia_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY consignacao_conferencias_select_admin_propria
    ON public.consignacao_conferencias
    FOR SELECT TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.user_roles AS r
            WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
        )
    );

CREATE POLICY consignacao_conferencia_itens_select_admin_propria
    ON public.consignacao_conferencia_itens
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.consignacao_conferencias AS c
            JOIN public.user_roles AS r ON r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
            WHERE c.id = conferencia_id AND c.user_id = (SELECT auth.uid())
        )
    );

REVOKE ALL ON TABLE public.consignacao_conferencias, public.consignacao_conferencia_itens
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.consignacao_conferencias, public.consignacao_conferencia_itens TO authenticated;

CREATE FUNCTION public.confirmar_conferencia_consignacao(
    p_id uuid,
    p_estabelecimento_id uuid,
    p_data_visita date,
    p_observacao text,
    p_itens jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_estabelecimento public.estabelecimentos%ROWTYPE;
    v_existente public.consignacao_conferencias%ROWTYPE;
    v_solicitacao jsonb;
    v_item record;
    v_saldo integer;
    v_preco numeric(12,2);
    v_comissao numeric(5,2);
    v_esperados integer;
    v_recebidos integer;
    v_total_vendido integer := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = v_user_id AND r.role = 'admin'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_id IS NULL OR p_estabelecimento_id IS NULL OR p_data_visita IS NULL
       OR p_data_visita > CURRENT_DATE
       OR p_observacao IS NULL OR length(btrim(p_observacao)) NOT BETWEEN 1 AND 1000
       OR jsonb_typeof(p_itens) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_itens) = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados da conferencia invalidos.';
    END IF;

    v_solicitacao := jsonb_build_object(
        'estabelecimento_id', p_estabelecimento_id,
        'data_visita', p_data_visita,
        'observacao', btrim(p_observacao),
        'itens', p_itens
    );

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:conferencia-consignacao:' || p_id::text, 0)
    );

    SELECT * INTO v_existente
    FROM public.consignacao_conferencias
    WHERE id = p_id;
    IF FOUND THEN
        IF v_existente.user_id = v_user_id AND v_existente.solicitacao = v_solicitacao THEN
            RETURN jsonb_build_object(
                'conferencia_id', v_existente.id,
                'confirmada_em', v_existente.confirmada_em,
                'ja_confirmada', true
            );
        END IF;
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de conferencia ja utilizado com dados diferentes.';
    END IF;

    SELECT * INTO v_estabelecimento
    FROM public.estabelecimentos
    WHERE id = p_estabelecimento_id AND user_id = v_user_id AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento indisponivel.';
    END IF;

    BEGIN
        SELECT count(*), count(DISTINCT item.variacao_id)
        INTO v_recebidos, v_esperados
        FROM jsonb_to_recordset(p_itens) AS item(
            variacao_id uuid,
            quantidade_encontrada integer,
            quantidade_vendida integer,
            quantidade_perdida integer,
            quantidade_quebrada integer,
            quantidade_extraviada integer,
            preco_unitario numeric
        );
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Itens da conferencia invalidos.';
    END;
    IF v_recebidos <> v_esperados THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Uma variacao nao pode aparecer mais de uma vez na conferencia.';
    END IF;

    -- A mesma ordem de locks da RPC da migration 012 evita corrida entre conferencia e movimentacao.
    PERFORM 1
    FROM public.produto_variacoes AS v
    JOIN public.produtos AS p ON p.id = v.produto_id AND p.user_id = v_user_id
    JOIN public.consignacao_saldos AS s ON s.variacao_id = v.id
    WHERE s.estabelecimento_id = p_estabelecimento_id
      AND s.quantidade > 0
      AND v.user_id = v_user_id
    ORDER BY v.id
    FOR UPDATE OF v, s, p;

    SELECT count(*) INTO v_esperados
    FROM public.consignacao_saldos AS s
    JOIN public.produto_variacoes AS v ON v.id = s.variacao_id AND v.user_id = v_user_id
    WHERE s.estabelecimento_id = p_estabelecimento_id AND s.quantidade > 0;

    IF v_esperados = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'O estabelecimento nao possui saldo consignado para conferir.';
    END IF;
    IF v_recebidos <> v_esperados
       OR EXISTS (
            (SELECT s.variacao_id
             FROM public.consignacao_saldos AS s
             JOIN public.produto_variacoes AS v ON v.id = s.variacao_id AND v.user_id = v_user_id
             WHERE s.estabelecimento_id = p_estabelecimento_id AND s.quantidade > 0)
            EXCEPT
            (SELECT item.variacao_id
             FROM jsonb_to_recordset(p_itens) AS item(
                 variacao_id uuid,
                 quantidade_encontrada integer,
                 quantidade_vendida integer,
                 quantidade_perdida integer,
                 quantidade_quebrada integer,
                 quantidade_extraviada integer,
                 preco_unitario numeric
             ))
       )
       OR EXISTS (
            (SELECT item.variacao_id
             FROM jsonb_to_recordset(p_itens) AS item(
                 variacao_id uuid,
                 quantidade_encontrada integer,
                 quantidade_vendida integer,
                 quantidade_perdida integer,
                 quantidade_quebrada integer,
                 quantidade_extraviada integer,
                 preco_unitario numeric
             ))
            EXCEPT
            (SELECT s.variacao_id
             FROM public.consignacao_saldos AS s
             JOIN public.produto_variacoes AS v ON v.id = s.variacao_id AND v.user_id = v_user_id
             WHERE s.estabelecimento_id = p_estabelecimento_id AND s.quantidade > 0)
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A conferencia deve informar exatamente todas as variacoes com saldo positivo.';
    END IF;

    INSERT INTO public.consignacao_conferencias (
        id, user_id, estabelecimento_id, data_visita, observacao, solicitacao
    ) VALUES (
        p_id, v_user_id, p_estabelecimento_id, p_data_visita, btrim(p_observacao), v_solicitacao
    );

    FOR v_item IN
        SELECT *
        FROM jsonb_to_recordset(p_itens) AS item(
            variacao_id uuid,
            quantidade_encontrada integer,
            quantidade_vendida integer,
            quantidade_perdida integer,
            quantidade_quebrada integer,
            quantidade_extraviada integer,
            preco_unitario numeric
        )
        ORDER BY variacao_id
    LOOP
        IF v_item.variacao_id IS NULL
           OR v_item.quantidade_encontrada IS NULL OR v_item.quantidade_encontrada < 0
           OR v_item.quantidade_vendida IS NULL OR v_item.quantidade_vendida < 0
           OR v_item.quantidade_perdida IS NULL OR v_item.quantidade_perdida < 0
           OR v_item.quantidade_quebrada IS NULL OR v_item.quantidade_quebrada < 0
           OR v_item.quantidade_extraviada IS NULL OR v_item.quantidade_extraviada < 0 THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quantidades da conferencia devem ser inteiras e nao negativas.';
        END IF;

        SELECT s.quantidade, COALESCE(v.preco_unitario, p.preco_base), COALESCE(ec.percentual, v_estabelecimento.comissao_percentual)
        INTO v_saldo, v_preco, v_comissao
        FROM public.consignacao_saldos AS s
        JOIN public.produto_variacoes AS v ON v.id = s.variacao_id AND v.user_id = v_user_id
        JOIN public.produtos AS p ON p.id = v.produto_id AND p.user_id = v_user_id
        LEFT JOIN public.estabelecimento_comissoes AS ec
            ON ec.estabelecimento_id = p_estabelecimento_id AND ec.variacao_id = v.id
        WHERE s.estabelecimento_id = p_estabelecimento_id AND s.variacao_id = v_item.variacao_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Variacao indisponivel para esta conferencia.';
        END IF;
        IF v_item.preco_unitario IS NOT NULL THEN
            IF v_item.preco_unitario < 0
               OR v_item.preco_unitario::text IN ('NaN', 'Infinity', '-Infinity')
               OR v_item.preco_unitario <> round(v_item.preco_unitario, 2) THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Preco unitario da conferencia invalido.';
            END IF;
            v_preco := v_item.preco_unitario;
        END IF;
        IF v_item.quantidade_encontrada > v_saldo
           OR v_item.quantidade_vendida + v_item.quantidade_perdida + v_item.quantidade_quebrada + v_item.quantidade_extraviada
                <> v_saldo - v_item.quantidade_encontrada THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A apuracao deve explicar integralmente a diferenca entre saldo e contagem fisica.';
        END IF;

        UPDATE public.consignacao_saldos
        SET quantidade = v_item.quantidade_encontrada,
            atualizado_em = clock_timestamp()
        WHERE estabelecimento_id = p_estabelecimento_id AND variacao_id = v_item.variacao_id;

        INSERT INTO public.consignacao_conferencia_itens (
            conferencia_id, variacao_id, saldo_anterior, quantidade_encontrada,
            quantidade_vendida, quantidade_perdida, quantidade_quebrada, quantidade_extraviada,
            saldo_resultante, preco_unitario, comissao_percentual
        ) VALUES (
            p_id, v_item.variacao_id, v_saldo, v_item.quantidade_encontrada,
            v_item.quantidade_vendida, v_item.quantidade_perdida, v_item.quantidade_quebrada, v_item.quantidade_extraviada,
            v_item.quantidade_encontrada, v_preco, v_comissao
        );
        v_total_vendido := v_total_vendido + v_item.quantidade_vendida;
    END LOOP;

    RETURN jsonb_build_object(
        'conferencia_id', p_id,
        'itens', v_recebidos,
        'unidades_vendidas', v_total_vendido,
        'ja_confirmada', false
    );
END;
$function$;

ALTER FUNCTION public.confirmar_conferencia_consignacao(uuid, uuid, date, text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.confirmar_conferencia_consignacao(uuid, uuid, date, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_conferencia_consignacao(uuid, uuid, date, text, jsonb)
    TO authenticated;

DO $postflight$
DECLARE
    v_function regprocedure := 'public.confirmar_conferencia_consignacao(uuid,uuid,date,text,jsonb)'::regprocedure;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consignacao_conferencias'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consignacao_conferencia_itens'::regclass) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado nas tabelas de conferencias.';
    END IF;
    IF has_table_privilege('anon', 'public.consignacao_conferencias', 'SELECT')
       OR has_table_privilege('anon', 'public.consignacao_conferencia_itens', 'SELECT')
       OR has_table_privilege('authenticated', 'public.consignacao_conferencias', 'INSERT')
       OR has_table_privilege('authenticated', 'public.consignacao_conferencia_itens', 'INSERT') THEN
        RAISE EXCEPTION 'As conferencias devem ser gravadas somente pela RPC.';
    END IF;
    IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
       OR has_function_privilege('anon', v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'A RPC de conferencia deve ser exclusiva para authenticated.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid = v_function
          AND (r.rolname <> 'postgres' OR NOT (r.rolsuper OR r.rolbypassrls)
               OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))
    ) THEN
        RAISE EXCEPTION 'A RPC de conferencia deve pertencer a postgres e usar search_path vazio.';
    END IF;
END;
$postflight$;

COMMIT;
