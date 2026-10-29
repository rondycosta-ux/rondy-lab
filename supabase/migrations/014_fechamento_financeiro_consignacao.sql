-- Fechamentos financeiros de consignacao: snapshots de conferencias e pagamentos auditaveis.
-- Aplicar manualmente depois das migrations 012 e 013.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.estabelecimentos') IS NULL
       OR to_regclass('public.consignacao_conferencias') IS NULL
       OR to_regclass('public.consignacao_conferencia_itens') IS NULL
       OR to_regclass('public.user_roles') IS NULL
       OR to_regprocedure('public.confirmar_conferencia_consignacao(uuid,uuid,date,text,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'As migrations 012 e 013 devem estar aplicadas.';
    END IF;
    IF to_regclass('public.consignacao_fechamentos') IS NOT NULL
       OR to_regclass('public.consignacao_fechamento_conferencias') IS NOT NULL
       OR to_regclass('public.consignacao_pagamentos') IS NOT NULL
       OR to_regprocedure('public.criar_fechamento_consignacao(uuid,uuid,uuid[],text)') IS NOT NULL
       OR to_regprocedure('public.registrar_pagamento_consignacao(uuid,uuid,date,numeric,text,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'A estrutura financeira de consignacao ja existe; revise antes de continuar.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Os roles postgres e authenticated esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.consignacao_fechamentos (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE RESTRICT,
    observacao text NOT NULL CHECK (length(btrim(observacao)) BETWEEN 1 AND 1000),
    valor_bruto numeric(14,2) NOT NULL CHECK (valor_bruto >= 0 AND valor_bruto::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    valor_comissao numeric(14,2) NOT NULL CHECK (valor_comissao >= 0 AND valor_comissao::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    valor_liquido numeric(14,2) NOT NULL CHECK (valor_liquido >= 0 AND valor_liquido::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    total_pago numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_pago >= 0 AND total_pago::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    saldo_pendente numeric(14,2) NOT NULL CHECK (saldo_pendente >= 0 AND saldo_pendente::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    status text NOT NULL CHECK (status IN ('PENDENTE', 'PARCIAL', 'PAGO')),
    solicitacao jsonb NOT NULL CHECK (jsonb_typeof(solicitacao) = 'object'),
    criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT consignacao_fechamentos_valores_check CHECK (
        valor_comissao <= valor_bruto
        AND valor_liquido = valor_bruto - valor_comissao
        AND total_pago + saldo_pendente = valor_liquido
        AND (
            (status = 'PENDENTE' AND total_pago = 0 AND saldo_pendente > 0)
            OR (status = 'PARCIAL' AND total_pago > 0 AND saldo_pendente > 0)
            OR (status = 'PAGO' AND saldo_pendente = 0 AND total_pago = valor_liquido)
        )
    )
);

CREATE TABLE public.consignacao_fechamento_conferencias (
    fechamento_id uuid NOT NULL REFERENCES public.consignacao_fechamentos(id) ON DELETE RESTRICT,
    conferencia_id uuid NOT NULL REFERENCES public.consignacao_conferencias(id) ON DELETE RESTRICT,
    valor_bruto numeric(14,2) NOT NULL CHECK (valor_bruto >= 0),
    valor_comissao numeric(14,2) NOT NULL CHECK (valor_comissao >= 0),
    valor_liquido numeric(14,2) NOT NULL CHECK (valor_liquido >= 0),
    PRIMARY KEY (fechamento_id, conferencia_id),
    CONSTRAINT consignacao_fechamento_conferencias_conferencia_key UNIQUE (conferencia_id),
    CONSTRAINT consignacao_fechamento_conferencias_valores_check CHECK (
        valor_comissao <= valor_bruto
        AND valor_liquido = valor_bruto - valor_comissao
    )
);

CREATE TABLE public.consignacao_pagamentos (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    fechamento_id uuid NOT NULL REFERENCES public.consignacao_fechamentos(id) ON DELETE RESTRICT,
    data_pagamento date NOT NULL CHECK (data_pagamento <= CURRENT_DATE),
    valor numeric(14,2) NOT NULL CHECK (valor > 0 AND valor::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('PIX', 'DINHEIRO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OUTRO')),
    observacao text NOT NULL CHECK (length(btrim(observacao)) BETWEEN 1 AND 1000),
    solicitacao jsonb NOT NULL CHECK (jsonb_typeof(solicitacao) = 'object'),
    registrado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX consignacao_fechamentos_estabelecimento_criado_idx
    ON public.consignacao_fechamentos(estabelecimento_id, criado_em DESC);
CREATE INDEX consignacao_pagamentos_fechamento_data_idx
    ON public.consignacao_pagamentos(fechamento_id, data_pagamento DESC, registrado_em DESC);

COMMENT ON TABLE public.consignacao_fechamentos IS
    'Resumo financeiro imutavel de uma ou mais conferencias de consignacao.';
COMMENT ON TABLE public.consignacao_fechamento_conferencias IS
    'Vinculo unico de conferencias a um fechamento, com seus totais financeiros snapshot.';
COMMENT ON TABLE public.consignacao_pagamentos IS
    'Pagamentos imutaveis, inclusive parciais, recebidos para um fechamento consignado.';

ALTER TABLE public.consignacao_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignacao_fechamento_conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignacao_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY consignacao_fechamentos_select_admin_proprio
    ON public.consignacao_fechamentos FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) AND EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
    ));

CREATE POLICY consignacao_fechamento_conferencias_select_admin_proprio
    ON public.consignacao_fechamento_conferencias FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.consignacao_fechamentos AS f
        JOIN public.user_roles AS r ON r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
        WHERE f.id = fechamento_id AND f.user_id = (SELECT auth.uid())
    ));

CREATE POLICY consignacao_pagamentos_select_admin_proprio
    ON public.consignacao_pagamentos FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()) AND EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
    ));

REVOKE ALL ON TABLE public.consignacao_fechamentos, public.consignacao_fechamento_conferencias, public.consignacao_pagamentos
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.consignacao_fechamentos, public.consignacao_fechamento_conferencias, public.consignacao_pagamentos
    TO authenticated;

CREATE FUNCTION public.criar_fechamento_consignacao(
    p_id uuid,
    p_estabelecimento_id uuid,
    p_conferencia_ids uuid[],
    p_observacao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_existente public.consignacao_fechamentos%ROWTYPE;
    v_estabelecimento public.estabelecimentos%ROWTYPE;
    v_solicitacao jsonb;
    v_recebidas integer;
    v_distintas integer;
    v_conferencia record;
    v_bruto_conferencia numeric(14,2);
    v_comissao_conferencia numeric(14,2);
    v_liquido_conferencia numeric(14,2);
    v_bruto_total numeric(14,2) := 0;
    v_comissao_total numeric(14,2) := 0;
    v_liquido_total numeric(14,2) := 0;
    v_status text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles AS r WHERE r.user_id = v_user_id AND r.role = 'admin') THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_id IS NULL OR p_estabelecimento_id IS NULL
       OR p_conferencia_ids IS NULL OR cardinality(p_conferencia_ids) = 0
       OR p_observacao IS NULL OR length(btrim(p_observacao)) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do fechamento invalidos.';
    END IF;

    v_solicitacao := jsonb_build_object(
        'estabelecimento_id', p_estabelecimento_id,
        'conferencia_ids', to_jsonb(p_conferencia_ids),
        'observacao', btrim(p_observacao)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:fechamento-consignacao:' || p_id::text, 0)
    );
    SELECT * INTO v_existente FROM public.consignacao_fechamentos WHERE id = p_id;
    IF FOUND THEN
        IF v_existente.user_id = v_user_id AND v_existente.solicitacao = v_solicitacao THEN
            RETURN jsonb_build_object('fechamento_id', v_existente.id, 'status', v_existente.status, 'saldo_pendente', v_existente.saldo_pendente, 'ja_criado', true);
        END IF;
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de fechamento ja utilizado com dados diferentes.';
    END IF;

    SELECT * INTO v_estabelecimento
    FROM public.estabelecimentos
    WHERE id = p_estabelecimento_id AND user_id = v_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento indisponivel.';
    END IF;

    SELECT count(*), count(DISTINCT conferencia_id)
    INTO v_recebidas, v_distintas
    FROM unnest(p_conferencia_ids) AS ids(conferencia_id);
    IF v_recebidas <> v_distintas THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Uma conferencia nao pode aparecer mais de uma vez no fechamento.';
    END IF;

    -- O lock do estabelecimento serializa fechamentos do mesmo parceiro; os locks das conferencias protegem o vinculo unico.
    PERFORM 1
    FROM public.consignacao_conferencias AS c
    WHERE c.id = ANY(p_conferencia_ids)
      AND c.user_id = v_user_id
      AND c.estabelecimento_id = p_estabelecimento_id
    ORDER BY c.id
    FOR UPDATE;

    SELECT count(*) INTO v_recebidas
    FROM public.consignacao_conferencias AS c
    WHERE c.id = ANY(p_conferencia_ids)
      AND c.user_id = v_user_id
      AND c.estabelecimento_id = p_estabelecimento_id;
    IF v_recebidas <> cardinality(p_conferencia_ids) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Uma ou mais conferencias nao pertencem ao estabelecimento ou ao administrador.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.consignacao_fechamento_conferencias AS fc
        WHERE fc.conferencia_id = ANY(p_conferencia_ids)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Uma ou mais conferencias ja pertencem a outro fechamento.';
    END IF;

    FOR v_conferencia IN
        SELECT c.id
        FROM public.consignacao_conferencias AS c
        WHERE c.id = ANY(p_conferencia_ids)
        ORDER BY c.id
    LOOP
        SELECT
            round(COALESCE(sum(i.quantidade_vendida * i.preco_unitario), 0), 2),
            round(COALESCE(sum(i.quantidade_vendida * i.preco_unitario * i.comissao_percentual / 100), 0), 2)
        INTO v_bruto_conferencia, v_comissao_conferencia
        FROM public.consignacao_conferencia_itens AS i
        WHERE i.conferencia_id = v_conferencia.id;
        v_liquido_conferencia := round(v_bruto_conferencia - v_comissao_conferencia, 2);
        v_bruto_total := round(v_bruto_total + v_bruto_conferencia, 2);
        v_comissao_total := round(v_comissao_total + v_comissao_conferencia, 2);
        v_liquido_total := round(v_liquido_total + v_liquido_conferencia, 2);

    END LOOP;

    v_status := CASE WHEN v_liquido_total = 0 THEN 'PAGO' ELSE 'PENDENTE' END;
    INSERT INTO public.consignacao_fechamentos (
        id, user_id, estabelecimento_id, observacao, valor_bruto, valor_comissao,
        valor_liquido, total_pago, saldo_pendente, status, solicitacao
    ) VALUES (
        p_id, v_user_id, p_estabelecimento_id, btrim(p_observacao), v_bruto_total, v_comissao_total,
        v_liquido_total, 0, v_liquido_total, v_status, v_solicitacao
    );
    FOR v_conferencia IN
        SELECT c.id
        FROM public.consignacao_conferencias AS c
        WHERE c.id = ANY(p_conferencia_ids)
        ORDER BY c.id
    LOOP
        SELECT
            round(COALESCE(sum(i.quantidade_vendida * i.preco_unitario), 0), 2),
            round(COALESCE(sum(i.quantidade_vendida * i.preco_unitario * i.comissao_percentual / 100), 0), 2)
        INTO v_bruto_conferencia, v_comissao_conferencia
        FROM public.consignacao_conferencia_itens AS i
        WHERE i.conferencia_id = v_conferencia.id;
        v_liquido_conferencia := round(v_bruto_conferencia - v_comissao_conferencia, 2);
        INSERT INTO public.consignacao_fechamento_conferencias (
            fechamento_id, conferencia_id, valor_bruto, valor_comissao, valor_liquido
        ) VALUES (
            p_id, v_conferencia.id, v_bruto_conferencia, v_comissao_conferencia, v_liquido_conferencia
        );
    END LOOP;
    RETURN jsonb_build_object('fechamento_id', p_id, 'valor_liquido', v_liquido_total, 'status', v_status, 'ja_criado', false);
END;
$function$;

CREATE FUNCTION public.registrar_pagamento_consignacao(
    p_id uuid,
    p_fechamento_id uuid,
    p_data_pagamento date,
    p_valor numeric,
    p_forma_pagamento text,
    p_observacao text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_fechamento public.consignacao_fechamentos%ROWTYPE;
    v_existente public.consignacao_pagamentos%ROWTYPE;
    v_solicitacao jsonb;
    v_total_pago numeric(14,2);
    v_saldo_pendente numeric(14,2);
    v_status text;
    v_forma_pagamento text := upper(btrim(p_forma_pagamento));
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles AS r WHERE r.user_id = v_user_id AND r.role = 'admin') THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_id IS NULL OR p_fechamento_id IS NULL OR p_data_pagamento IS NULL OR p_data_pagamento > CURRENT_DATE
       OR p_valor IS NULL OR p_valor <= 0 OR p_valor::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_valor <> round(p_valor, 2)
       OR v_forma_pagamento IS NULL
       OR v_forma_pagamento NOT IN ('PIX', 'DINHEIRO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'OUTRO')
       OR p_observacao IS NULL OR length(btrim(p_observacao)) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do pagamento invalidos.';
    END IF;

    v_solicitacao := jsonb_build_object(
        'fechamento_id', p_fechamento_id,
        'data_pagamento', p_data_pagamento,
        'valor', p_valor,
        'forma_pagamento', v_forma_pagamento,
        'observacao', btrim(p_observacao)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:pagamento-consignacao:' || p_id::text, 0)
    );
    SELECT * INTO v_existente FROM public.consignacao_pagamentos WHERE id = p_id;
    IF FOUND THEN
        IF v_existente.user_id = v_user_id AND v_existente.solicitacao = v_solicitacao THEN
            SELECT status, saldo_pendente INTO v_status, v_saldo_pendente
            FROM public.consignacao_fechamentos WHERE id = v_existente.fechamento_id;
            RETURN jsonb_build_object('pagamento_id', v_existente.id, 'status', v_status, 'saldo_pendente', v_saldo_pendente, 'ja_registrado', true);
        END IF;
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de pagamento ja utilizado com dados diferentes.';
    END IF;

    SELECT f.* INTO v_fechamento
    FROM public.consignacao_fechamentos AS f
    JOIN public.estabelecimentos AS e
        ON e.id = f.estabelecimento_id AND e.user_id = v_user_id
    WHERE f.id = p_fechamento_id AND f.user_id = v_user_id
    FOR UPDATE OF f;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Fechamento indisponivel.';
    END IF;
    IF p_valor > v_fechamento.saldo_pendente THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Pagamento superior ao saldo pendente.';
    END IF;

    v_total_pago := round(v_fechamento.total_pago + p_valor, 2);
    v_saldo_pendente := round(v_fechamento.valor_liquido - v_total_pago, 2);
    v_status := CASE WHEN v_saldo_pendente = 0 THEN 'PAGO' WHEN v_total_pago = 0 THEN 'PENDENTE' ELSE 'PARCIAL' END;
    INSERT INTO public.consignacao_pagamentos (
        id, user_id, fechamento_id, data_pagamento, valor, forma_pagamento, observacao, solicitacao
    ) VALUES (
        p_id, v_user_id, p_fechamento_id, p_data_pagamento, p_valor, v_forma_pagamento, btrim(p_observacao), v_solicitacao
    );
    UPDATE public.consignacao_fechamentos
    SET total_pago = v_total_pago, saldo_pendente = v_saldo_pendente, status = v_status
    WHERE id = p_fechamento_id;
    RETURN jsonb_build_object('pagamento_id', p_id, 'status', v_status, 'saldo_pendente', v_saldo_pendente, 'ja_registrado', false);
END;
$function$;

ALTER FUNCTION public.criar_fechamento_consignacao(uuid, uuid, uuid[], text) OWNER TO postgres;
ALTER FUNCTION public.registrar_pagamento_consignacao(uuid, uuid, date, numeric, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.criar_fechamento_consignacao(uuid, uuid, uuid[], text), public.registrar_pagamento_consignacao(uuid, uuid, date, numeric, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_fechamento_consignacao(uuid, uuid, uuid[], text), public.registrar_pagamento_consignacao(uuid, uuid, date, numeric, text, text)
    TO authenticated;

DO $postflight$
DECLARE
    v_fechamento_function regprocedure := 'public.criar_fechamento_consignacao(uuid,uuid,uuid[],text)'::regprocedure;
    v_pagamento_function regprocedure := 'public.registrar_pagamento_consignacao(uuid,uuid,date,numeric,text,text)'::regprocedure;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consignacao_fechamentos'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consignacao_fechamento_conferencias'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.consignacao_pagamentos'::regclass) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado nas tabelas financeiras.';
    END IF;
    IF has_table_privilege('anon', 'public.consignacao_fechamentos', 'SELECT')
       OR has_table_privilege('anon', 'public.consignacao_pagamentos', 'SELECT')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamentos', 'INSERT')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamento_conferencias', 'INSERT')
       OR has_table_privilege('authenticated', 'public.consignacao_pagamentos', 'INSERT')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamentos', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamento_conferencias', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.consignacao_pagamentos', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamentos', 'DELETE')
       OR has_table_privilege('authenticated', 'public.consignacao_fechamento_conferencias', 'DELETE')
       OR has_table_privilege('authenticated', 'public.consignacao_pagamentos', 'DELETE') THEN
        RAISE EXCEPTION 'Fechamentos e pagamentos devem ser gravados somente pelas RPCs.';
    END IF;
    IF NOT has_function_privilege('authenticated', v_fechamento_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_pagamento_function, 'EXECUTE')
       OR has_function_privilege('anon', v_fechamento_function, 'EXECUTE')
       OR has_function_privilege('anon', v_pagamento_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'As RPCs financeiras devem ser exclusivas para authenticated.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_proc AS p JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid IN (v_fechamento_function, v_pagamento_function)
          AND (r.rolname <> 'postgres' OR NOT (r.rolsuper OR r.rolbypassrls)
               OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))
    ) THEN
        RAISE EXCEPTION 'As RPCs financeiras devem pertencer a postgres e usar search_path vazio.';
    END IF;
END;
$postflight$;

COMMIT;
