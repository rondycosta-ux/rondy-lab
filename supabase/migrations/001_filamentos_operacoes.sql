-- Rondy Lab: operacoes transacionais para filamentos.
-- Execute manualmente no SQL Editor do Supabase somente depois das verificacoes
-- listadas no final deste arquivo.

BEGIN;

DO $preflight$
DECLARE
    v_table text;
    v_column text;
    v_type text;
    v_actual_type text;
    v_relid oid;
BEGIN
    IF to_regclass('public.filamentos') IS NULL
       OR to_regclass('public.filamentos_movimentacoes') IS NULL THEN
        RAISE EXCEPTION 'As tabelas public.filamentos e public.filamentos_movimentacoes devem existir.';
    END IF;

    FOR v_table, v_column, v_type IN
        SELECT *
        FROM (VALUES
            ('filamentos', 'id', 'text'),
            ('filamentos', 'user_id', 'uuid'),
            ('filamentos', 'material', 'text'),
            ('filamentos', 'marca', 'text'),
            ('filamentos', 'linha', 'text'),
            ('filamentos', 'cor', 'text'),
            ('filamentos', 'peso_nominal', 'numeric'),
            ('filamentos', 'quantidade_disponivel', 'numeric'),
            ('filamentos', 'valor_pago', 'numeric'),
            ('filamentos', 'observacoes', 'text'),
            ('filamentos', 'criado_em', 'timestamp with time zone'),
            ('filamentos', 'atualizado_em', 'timestamp with time zone'),
            ('filamentos_movimentacoes', 'id', 'text'),
            ('filamentos_movimentacoes', 'user_id', 'uuid'),
            ('filamentos_movimentacoes', 'filamento_id', 'text'),
            ('filamentos_movimentacoes', 'tipo', 'text'),
            ('filamentos_movimentacoes', 'quantidade', 'numeric'),
            ('filamentos_movimentacoes', 'data_hora', 'timestamp with time zone'),
            ('filamentos_movimentacoes', 'observacao', 'text')
        ) AS expected(table_name, column_name, data_type)
    LOOP
        SELECT c.data_type
        INTO v_actual_type
        FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND c.table_name = v_table
          AND c.column_name = v_column;

        IF NOT FOUND OR v_actual_type IS DISTINCT FROM v_type THEN
            RAISE EXCEPTION 'Estrutura inesperada: public.%.% deveria ser % (encontrado: %).',
                v_table, v_column, v_type, COALESCE(v_actual_type, 'coluna ausente');
        END IF;
    END LOOP;

    FOR v_table, v_column IN
        SELECT *
        FROM (VALUES
            ('filamentos', 'id'),
            ('filamentos', 'user_id'),
            ('filamentos', 'material'),
            ('filamentos', 'marca'),
            ('filamentos', 'cor'),
            ('filamentos', 'peso_nominal'),
            ('filamentos', 'quantidade_disponivel'),
            ('filamentos', 'valor_pago'),
            ('filamentos', 'criado_em'),
            ('filamentos', 'atualizado_em'),
            ('filamentos_movimentacoes', 'id'),
            ('filamentos_movimentacoes', 'user_id'),
            ('filamentos_movimentacoes', 'filamento_id'),
            ('filamentos_movimentacoes', 'tipo'),
            ('filamentos_movimentacoes', 'quantidade'),
            ('filamentos_movimentacoes', 'data_hora')
        ) AS required(table_name, column_name)
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
              AND c.column_name = v_column
              AND c.is_nullable = 'NO'
        ) THEN
            RAISE EXCEPTION 'Coluna obrigatoria public.%.% deve ser NOT NULL.', v_table, v_column;
        END IF;
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY['filamentos', 'filamentos_movimentacoes']
    LOOP
        v_relid := to_regclass(format('public.%I', v_table));

        IF NOT EXISTS (
            SELECT 1
            FROM pg_class AS c
            WHERE c.oid = v_relid
              AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'RLS deve permanecer habilitado em public.%.', v_table;
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.contype = 'p'
          AND c.conrelid = 'public.filamentos'::regclass
          AND c.conkey = ARRAY[
              (SELECT a.attnum
               FROM pg_attribute AS a
               WHERE a.attrelid = c.conrelid
                 AND a.attname = 'id'
                 AND NOT a.attisdropped)
          ]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.contype = 'p'
          AND c.conrelid = 'public.filamentos_movimentacoes'::regclass
          AND c.conkey = ARRAY[
              (SELECT a.attnum
               FROM pg_attribute AS a
               WHERE a.attrelid = c.conrelid
                 AND a.attname = 'id'
                 AND NOT a.attisdropped)
          ]::smallint[]
    ) THEN
        RAISE EXCEPTION 'Cada tabela deve ter uma chave primaria simples na coluna id.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.contype = 'f'
          AND c.conrelid = 'public.filamentos_movimentacoes'::regclass
          AND c.confrelid = 'public.filamentos'::regclass
          AND c.convalidated
          AND ARRAY(
              SELECT a.attname
              FROM unnest(c.conkey) WITH ORDINALITY AS key_col(attnum, ordinality)
              JOIN pg_attribute AS a
                ON a.attrelid = c.conrelid
               AND a.attnum = key_col.attnum
              ORDER BY key_col.ordinality
          ) = ARRAY['filamento_id', 'user_id']::name[]
          AND ARRAY(
              SELECT a.attname
              FROM unnest(c.confkey) WITH ORDINALITY AS key_col(attnum, ordinality)
              JOIN pg_attribute AS a
                ON a.attrelid = c.confrelid
               AND a.attnum = key_col.attnum
              ORDER BY key_col.ordinality
          ) = ARRAY['id', 'user_id']::name[]
          AND c.confdeltype = 'r'
    ) THEN
        RAISE EXCEPTION 'A FK composta validada (filamento_id, user_id) -> filamentos(id, user_id) com ON DELETE RESTRICT nao foi confirmada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.contype IN ('p', 'u')
          AND c.conrelid = 'public.filamentos'::regclass
          AND ARRAY(
              SELECT a.attname
              FROM unnest(c.conkey) WITH ORDINALITY AS key_col(attnum, ordinality)
              JOIN pg_attribute AS a
                ON a.attrelid = c.conrelid
               AND a.attnum = key_col.attnum
              ORDER BY key_col.ordinality
          ) = ARRAY['id', 'user_id']::name[]
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_index AS i
        WHERE i.indrelid = 'public.filamentos'::regclass
          AND i.indisunique
          AND i.indisvalid
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indnkeyatts = 2
          AND ARRAY(
              SELECT a.attname
              FROM unnest(i.indkey) WITH ORDINALITY AS key_col(attnum, ordinality)
              JOIN pg_attribute AS a
                ON a.attrelid = i.indrelid
               AND a.attnum = key_col.attnum
              WHERE key_col.ordinality <= i.indnkeyatts
              ORDER BY key_col.ordinality
          ) = ARRAY['id', 'user_id']::name[]
    ) THEN
        RAISE EXCEPTION 'A tabela public.filamentos deve ter constraint UNIQUE/PRIMARY KEY ou indice unico valido em (id, user_id) para sustentar a FK composta.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger AS t
        WHERE t.tgrelid = 'public.filamentos'::regclass
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'
          AND (t.tgtype & 16) = 16
    ) THEN
        RAISE EXCEPTION 'Nao foi encontrado trigger habilitado de UPDATE em public.filamentos; nenhum trigger foi alterado.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        RAISE EXCEPTION 'Os roles authenticated, anon, service_role e postgres do Supabase devem existir.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'postgres'
          AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'O role postgres deve ser superuser ou ter BYPASSRLS para ser owner seguro das RPCs SECURITY DEFINER.';
    END IF;
END;
$preflight$;

-- As escritas relacionadas ao saldo/historico somente podem ocorrer pelas RPCs
-- SECURITY DEFINER abaixo. RLS e mantida habilitada para as consultas diretas.
-- As RPCs validam auth.uid() e ownership explicitamente; suas escritas usam
-- user_id autenticado, nunca um proprietario informado pelo cliente.
REVOKE ALL PRIVILEGES ON TABLE public.filamentos
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.filamentos_movimentacoes
    FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, user_id, material, marca, linha, cor, peso_nominal,
               quantidade_disponivel, valor_pago, observacoes, criado_em, atualizado_em),
       UPDATE (id, user_id, material, marca, linha, cor, peso_nominal,
               quantidade_disponivel, valor_pago, observacoes, criado_em, atualizado_em)
    ON TABLE public.filamentos
    FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, user_id, filamento_id, tipo, quantidade, data_hora, observacao),
       UPDATE (id, user_id, filamento_id, tipo, quantidade, data_hora, observacao)
    ON TABLE public.filamentos_movimentacoes
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.filamentos, public.filamentos_movimentacoes TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
-- Keep the trusted backend role's administrative table access explicit.
GRANT ALL PRIVILEGES ON TABLE public.filamentos, public.filamentos_movimentacoes
    TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_filamento(
    p_id text,
    p_filamento_id text,
    p_tipo text,
    p_quantidade numeric,
    p_observacao text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_saldo_atual numeric;
    v_novo_saldo numeric;
    v_rows integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_id IS NULL OR btrim(p_id) = '' OR length(p_id) > 200
       OR p_id ~ '[[:cntrl:]]'
       OR p_filamento_id IS NULL OR btrim(p_filamento_id) = ''
       OR length(p_filamento_id) > 200 OR p_filamento_id ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ID de movimentacao ou filamento invalido.';
    END IF;

    IF p_tipo IS NULL OR p_tipo NOT IN ('ENTRADA', 'CONSUMO', 'AJUSTE') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Tipo de movimentacao invalido.';
    END IF;

    IF p_quantidade IS NULL
       OR p_quantidade::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_quantidade < 0
       OR (p_tipo IN ('ENTRADA', 'CONSUMO') AND p_quantidade = 0) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Quantidade invalida para o tipo de movimentacao.';
    END IF;

    SELECT f.quantidade_disponivel
    INTO v_saldo_atual
    FROM public.filamentos AS f
    WHERE f.id = p_filamento_id
      AND f.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Filamento nao encontrado ou sem permissao.';
    END IF;

    IF p_tipo = 'ENTRADA' THEN
        v_novo_saldo := v_saldo_atual + p_quantidade;
    ELSIF p_tipo = 'CONSUMO' THEN
        v_novo_saldo := v_saldo_atual - p_quantidade;
    ELSE
        v_novo_saldo := p_quantidade;
    END IF;

    IF v_novo_saldo < 0 OR v_novo_saldo::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O saldo resultante nao pode ser negativo nem invalido.';
    END IF;

    INSERT INTO public.filamentos_movimentacoes (
        id, user_id, filamento_id, tipo, quantidade, data_hora, observacao
    )
    VALUES (
        p_id, v_user_id, p_filamento_id, p_tipo, p_quantidade, clock_timestamp(), COALESCE(p_observacao, '')
    )
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de movimentacao ja utilizado.';
    END IF;

    UPDATE public.filamentos
    SET quantidade_disponivel = v_novo_saldo
    WHERE id = p_filamento_id
      AND user_id = v_user_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Nao foi possivel atualizar o saldo do filamento.';
    END IF;

    -- O trigger existente continua responsavel por atualizado_em.
    RETURN jsonb_build_object(
        'id', p_id,
        'filamento_id', p_filamento_id,
        'tipo', p_tipo,
        'quantidade', p_quantidade,
        'saldo', v_novo_saldo
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cadastrar_filamento_com_entrada(
    p_id text,
    p_material text,
    p_marca text,
    p_linha text,
    p_cor text,
    p_peso_nominal numeric,
    p_quantidade_disponivel numeric,
    p_valor_pago numeric,
    p_observacoes text,
    p_movimentacao_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_now timestamptz := clock_timestamp();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_id IS NULL OR btrim(p_id) = '' OR length(p_id) > 200 OR p_id ~ '[[:cntrl:]]'
       OR p_movimentacao_id IS NULL OR btrim(p_movimentacao_id) = ''
       OR length(p_movimentacao_id) > 200 OR p_movimentacao_id ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ID de filamento ou movimentacao invalido.';
    END IF;

    IF p_material IS NULL OR p_material NOT IN ('PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Outro')
       OR p_marca IS NULL OR length(btrim(p_marca)) < 2
       OR p_cor IS NULL OR length(btrim(p_cor)) < 2
       OR p_peso_nominal IS NULL OR p_peso_nominal::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_peso_nominal <= 0
       OR p_quantidade_disponivel IS NULL
       OR p_quantidade_disponivel::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_quantidade_disponivel < 0
       OR p_quantidade_disponivel > p_peso_nominal
       OR p_valor_pago IS NULL OR p_valor_pago::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_valor_pago < 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do filamento invalidos.';
    END IF;

    INSERT INTO public.filamentos (
        id, user_id, material, marca, linha, cor, peso_nominal,
        quantidade_disponivel, valor_pago, observacoes, criado_em, atualizado_em
    )
    VALUES (
        p_id, v_user_id, p_material, btrim(p_marca), COALESCE(p_linha, ''),
        btrim(p_cor), p_peso_nominal, p_quantidade_disponivel, p_valor_pago,
        COALESCE(p_observacoes, ''), v_now, v_now
    );

    INSERT INTO public.filamentos_movimentacoes (
        id, user_id, filamento_id, tipo, quantidade, data_hora, observacao
    )
    VALUES (
        p_movimentacao_id, v_user_id, p_id, 'ENTRADA',
        p_quantidade_disponivel, v_now, 'Cadastro inicial do rolo.'
    );

    RETURN jsonb_build_object(
        'id', p_id,
        'movimentacao_id', p_movimentacao_id,
        'saldo', p_quantidade_disponivel
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.importar_filamentos_locais(
    p_filamentos jsonb,
    p_movimentacoes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_item jsonb;
    v_id text;
    v_filamento_id text;
    v_material text;
    v_marca text;
    v_linha text;
    v_cor text;
    v_peso numeric;
    v_saldo numeric;
    v_valor numeric;
    v_observacoes text;
    v_criado_em timestamptz;
    v_atualizado_em timestamptz;
    v_tipo text;
    v_quantidade numeric;
    v_data_hora timestamptz;
    v_observacao text;
    v_existing public.filamentos%ROWTYPE;
    v_existing_movement public.filamentos_movimentacoes%ROWTYPE;
    v_rows integer;
    v_importados_filamentos text[] := ARRAY[]::text[];
    v_importadas_movimentacoes text[] := ARRAY[]::text[];
    v_existentes_filamentos text[] := ARRAY[]::text[];
    v_existentes_movimentacoes text[] := ARRAY[]::text[];
    v_existentes_divergentes_filamentos text[] := ARRAY[]::text[];
    v_existentes_divergentes_movimentacoes text[] := ARRAY[]::text[];
    v_conflitos_filamentos text[] := ARRAY[]::text[];
    v_conflitos_movimentacoes text[] := ARRAY[]::text[];
    v_reconciliacao_filamentos text[] := ARRAY[]::text[];
    v_reconciliacao_movimentacoes text[] := ARRAY[]::text[];
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_filamentos IS NULL OR jsonb_typeof(p_filamentos) <> 'array'
       OR p_movimentacoes IS NULL OR jsonb_typeof(p_movimentacoes) <> 'array' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Filamentos e movimentacoes devem ser arrays JSON.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_filamentos) AS e(value)
        GROUP BY e.value->>'id'
        HAVING count(*) > 1
    ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_movimentacoes) AS e(value)
        GROUP BY e.value->>'id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A importacao contem IDs duplicados.';
    END IF;

    -- Valida integralmente os rolos antes de iniciar qualquer escrita.
    FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_filamentos) AS e(value)
    LOOP
        IF jsonb_typeof(v_item) <> 'object'
           OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'material') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'marca') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'cor') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'pesoNominal') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_item->'quantidadeDisponivel') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_item->'valorPago') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_item->'criadoEm') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'atualizadoEm') IS DISTINCT FROM 'string'
           OR (v_item ? 'linha' AND jsonb_typeof(v_item->'linha') NOT IN ('string', 'null'))
           OR (v_item ? 'observacoes' AND jsonb_typeof(v_item->'observacoes') NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Registro de filamento local tem formato invalido.';
        END IF;

        v_id := v_item->>'id';
        v_material := v_item->>'material';
        v_marca := v_item->>'marca';
        v_cor := v_item->>'cor';
        v_linha := COALESCE(v_item->>'linha', '');
        v_observacoes := COALESCE(v_item->>'observacoes', '');
        v_peso := (v_item->>'pesoNominal')::numeric;
        v_saldo := (v_item->>'quantidadeDisponivel')::numeric;
        v_valor := (v_item->>'valorPago')::numeric;

        IF v_id IS NULL OR btrim(v_id) = '' OR length(v_id) > 200 OR v_id ~ '[[:cntrl:]]'
           OR v_material IS NULL OR v_material NOT IN ('PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Outro')
           OR length(btrim(v_marca)) < 2 OR length(btrim(v_cor)) < 2
           OR v_peso IS NULL OR v_peso::text IN ('NaN', 'Infinity', '-Infinity') OR v_peso <= 0
           OR v_saldo IS NULL OR v_saldo::text IN ('NaN', 'Infinity', '-Infinity') OR v_saldo < 0
           OR v_valor IS NULL OR v_valor::text IN ('NaN', 'Infinity', '-Infinity') OR v_valor < 0
           OR (v_item->>'criadoEm') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
           OR (v_item->>'atualizadoEm') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Filamento local contem ID, valores, campos ou datas invalidos.';
        END IF;

        v_criado_em := (v_item->>'criadoEm')::timestamptz;
        v_atualizado_em := (v_item->>'atualizadoEm')::timestamptz;
    END LOOP;

    -- Valida movimentos e vinculos. O saldo recebido permanece sendo a fonte
    -- atual; o historico nao e somado nem usado para recalcula-lo.
    FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_movimentacoes) AS e(value)
    LOOP
        IF jsonb_typeof(v_item) <> 'object'
           OR jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'filamentoId') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'tipo') IS DISTINCT FROM 'string'
           OR jsonb_typeof(v_item->'quantidade') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_item->'dataHora') IS DISTINCT FROM 'string'
           OR (v_item ? 'observacao' AND jsonb_typeof(v_item->'observacao') NOT IN ('string', 'null')) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Registro de movimentacao local tem formato invalido.';
        END IF;

        v_id := v_item->>'id';
        v_filamento_id := v_item->>'filamentoId';
        v_tipo := v_item->>'tipo';
        v_quantidade := (v_item->>'quantidade')::numeric;
        v_observacao := COALESCE(v_item->>'observacao', '');

        IF v_id IS NULL OR btrim(v_id) = '' OR length(v_id) > 200 OR v_id ~ '[[:cntrl:]]'
           OR v_filamento_id IS NULL OR btrim(v_filamento_id) = ''
           OR length(v_filamento_id) > 200 OR v_filamento_id ~ '[[:cntrl:]]'
           OR v_tipo IS NULL OR v_tipo NOT IN ('ENTRADA', 'CONSUMO', 'AJUSTE')
           OR v_quantidade IS NULL
           OR v_quantidade::text IN ('NaN', 'Infinity', '-Infinity')
           OR v_quantidade < 0
           OR (v_tipo IN ('CONSUMO') AND v_quantidade = 0)
           OR (v_tipo = 'ENTRADA' AND v_quantidade = 0
               AND v_observacao <> 'Cadastro inicial do rolo.')
           OR (v_item->>'dataHora') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Movimentacao local contem ID, tipo, valor ou data invalido.';
        END IF;

        v_data_hora := (v_item->>'dataHora')::timestamptz;

        IF NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(p_filamentos) AS f(value)
            WHERE f.value->>'id' = v_filamento_id
        ) AND NOT EXISTS (
            SELECT 1
            FROM public.filamentos AS f
            WHERE f.id = v_filamento_id
              AND f.user_id = v_user_id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Movimentacao referencia filamento ausente ou sem permissao.';
        END IF;
    END LOOP;

    -- Serialize this import against movement RPCs, which lock the same parent
    -- filament row. Sorting by ID keeps concurrent batch lock order stable.
    FOR v_filamento_id IN
        SELECT DISTINCT requested.filamento_id
        FROM (
            SELECT e.value->>'id' AS filamento_id
            FROM jsonb_array_elements(p_filamentos) AS e(value)
            UNION
            SELECT e.value->>'filamentoId' AS filamento_id
            FROM jsonb_array_elements(p_movimentacoes) AS e(value)
        ) AS requested
        ORDER BY requested.filamento_id
    LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtextextended(v_user_id::text || ':' || v_filamento_id, 0)
        );
    END LOOP;

    PERFORM f.id
    FROM public.filamentos AS f
    WHERE f.user_id = v_user_id
      AND f.id IN (
          SELECT e.value->>'id'
          FROM jsonb_array_elements(p_filamentos) AS e(value)
          UNION
          SELECT e.value->>'filamentoId'
          FROM jsonb_array_elements(p_movimentacoes) AS e(value)
      )
    ORDER BY f.id
    FOR UPDATE;

    -- Never append missing local history to an already-remote filament. This also
    -- covers a remote filament with no movements yet: missing events require a
    -- separate, explicitly reviewed reconciliation procedure. A replay is allowed
    -- when that exact movement ID already exists.
    FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_movimentacoes) AS e(value)
    LOOP
        v_id := v_item->>'id';
        v_filamento_id := v_item->>'filamentoId';

        IF NOT EXISTS (
            SELECT 1
            FROM public.filamentos_movimentacoes AS m
            WHERE m.id = v_id
              AND m.user_id = v_user_id
        ) AND (
            EXISTS (
                SELECT 1
                FROM public.filamentos_movimentacoes AS m
                WHERE m.filamento_id = v_filamento_id
                  AND m.user_id = v_user_id
            )
            OR EXISTS (
                SELECT 1
                FROM public.filamentos AS f
                WHERE f.id = v_filamento_id
                  AND f.user_id = v_user_id
            )
        ) THEN
            v_reconciliacao_movimentacoes := array_append(v_reconciliacao_movimentacoes, v_id);
            v_reconciliacao_filamentos := array_append(v_reconciliacao_filamentos, v_filamento_id);
        END IF;
    END LOOP;

    IF cardinality(v_reconciliacao_movimentacoes) > 0 THEN
        RETURN jsonb_build_object(
            'status', 'reconciliacao_necessaria',
            'importados', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
            'ja_existentes', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
            'ja_existentes_divergentes', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
            'conflitos', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
            'reconciliacao_necessaria', jsonb_build_object(
                'filamentos', to_jsonb(v_reconciliacao_filamentos),
                'movimentacoes', to_jsonb(v_reconciliacao_movimentacoes)
            )
        );
    END IF;

    -- Toda a fase de escrita fica em um sub-bloco. IDs existentes do mesmo usuario
    -- nunca sao sobrescritos, mesmo quando os dados locais divergem de edicoes
    -- remotas posteriores. IDs ocupados globalmente por outro usuario sao conflitos.
    BEGIN
        FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_filamentos) AS e(value)
        LOOP
            v_id := v_item->>'id';
            v_material := v_item->>'material';
            v_marca := v_item->>'marca';
            v_linha := COALESCE(v_item->>'linha', '');
            v_cor := v_item->>'cor';
            v_peso := (v_item->>'pesoNominal')::numeric;
            v_saldo := (v_item->>'quantidadeDisponivel')::numeric;
            v_valor := (v_item->>'valorPago')::numeric;
            v_observacoes := COALESCE(v_item->>'observacoes', '');
            v_criado_em := (v_item->>'criadoEm')::timestamptz;
            v_atualizado_em := (v_item->>'atualizadoEm')::timestamptz;

            SELECT f.*
            INTO v_existing
            FROM public.filamentos AS f
            WHERE f.id = v_id
              AND f.user_id = v_user_id;

            IF FOUND THEN
                IF v_existing.material IS NOT DISTINCT FROM v_material
                   AND v_existing.marca IS NOT DISTINCT FROM v_marca
                   AND v_existing.linha IS NOT DISTINCT FROM v_linha
                   AND v_existing.cor IS NOT DISTINCT FROM v_cor
                   AND v_existing.peso_nominal IS NOT DISTINCT FROM v_peso
                   AND v_existing.quantidade_disponivel IS NOT DISTINCT FROM v_saldo
                   AND v_existing.valor_pago IS NOT DISTINCT FROM v_valor
                   AND v_existing.observacoes IS NOT DISTINCT FROM v_observacoes
                   AND v_existing.criado_em IS NOT DISTINCT FROM v_criado_em
                   AND v_existing.atualizado_em IS NOT DISTINCT FROM v_atualizado_em THEN
                    v_existentes_filamentos := array_append(v_existentes_filamentos, v_id);
                ELSE
                    v_existentes_filamentos := array_append(v_existentes_filamentos, v_id);
                    v_existentes_divergentes_filamentos := array_append(v_existentes_divergentes_filamentos, v_id);
                END IF;
            ELSE
                INSERT INTO public.filamentos (
                    id, user_id, material, marca, linha, cor, peso_nominal,
                    quantidade_disponivel, valor_pago, observacoes, criado_em, atualizado_em
                )
                VALUES (
                    v_id, v_user_id, v_material, v_marca, v_linha, v_cor, v_peso,
                    v_saldo, v_valor, v_observacoes, v_criado_em, v_atualizado_em
                )
                ON CONFLICT (id) DO NOTHING;

                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows = 1 THEN
                    v_importados_filamentos := array_append(v_importados_filamentos, v_id);
                ELSE
                    SELECT f.*
                    INTO v_existing
                    FROM public.filamentos AS f
                    WHERE f.id = v_id
                      AND f.user_id = v_user_id;

                    IF FOUND
                       AND v_existing.material IS NOT DISTINCT FROM v_material
                       AND v_existing.marca IS NOT DISTINCT FROM v_marca
                       AND v_existing.linha IS NOT DISTINCT FROM v_linha
                       AND v_existing.cor IS NOT DISTINCT FROM v_cor
                       AND v_existing.peso_nominal IS NOT DISTINCT FROM v_peso
                       AND v_existing.quantidade_disponivel IS NOT DISTINCT FROM v_saldo
                       AND v_existing.valor_pago IS NOT DISTINCT FROM v_valor
                       AND v_existing.observacoes IS NOT DISTINCT FROM v_observacoes
                       AND v_existing.criado_em IS NOT DISTINCT FROM v_criado_em
                       AND v_existing.atualizado_em IS NOT DISTINCT FROM v_atualizado_em THEN
                        v_existentes_filamentos := array_append(v_existentes_filamentos, v_id);
                    ELSIF FOUND THEN
                        v_existentes_filamentos := array_append(v_existentes_filamentos, v_id);
                        v_existentes_divergentes_filamentos := array_append(v_existentes_divergentes_filamentos, v_id);
                    ELSE
                        v_conflitos_filamentos := array_append(v_conflitos_filamentos, v_id);
                    END IF;
                END IF;
            END IF;
        END LOOP;

        FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_movimentacoes) AS e(value)
        LOOP
            v_id := v_item->>'id';
            v_filamento_id := v_item->>'filamentoId';
            v_tipo := v_item->>'tipo';
            v_quantidade := (v_item->>'quantidade')::numeric;
            v_data_hora := (v_item->>'dataHora')::timestamptz;
            v_observacao := COALESCE(v_item->>'observacao', '');

            SELECT m.*
            INTO v_existing_movement
            FROM public.filamentos_movimentacoes AS m
            WHERE m.id = v_id
              AND m.user_id = v_user_id;

            IF FOUND THEN
                IF v_existing_movement.filamento_id IS NOT DISTINCT FROM v_filamento_id
                   AND v_existing_movement.tipo IS NOT DISTINCT FROM v_tipo
                   AND v_existing_movement.quantidade IS NOT DISTINCT FROM v_quantidade
                   AND v_existing_movement.data_hora IS NOT DISTINCT FROM v_data_hora
                   AND v_existing_movement.observacao IS NOT DISTINCT FROM v_observacao THEN
                    v_existentes_movimentacoes := array_append(v_existentes_movimentacoes, v_id);
                ELSE
                    v_existentes_movimentacoes := array_append(v_existentes_movimentacoes, v_id);
                    v_existentes_divergentes_movimentacoes := array_append(v_existentes_divergentes_movimentacoes, v_id);
                END IF;
            ELSE
                INSERT INTO public.filamentos_movimentacoes (
                    id, user_id, filamento_id, tipo, quantidade, data_hora, observacao
                )
                VALUES (
                    v_id, v_user_id, v_filamento_id, v_tipo, v_quantidade, v_data_hora, v_observacao
                )
                ON CONFLICT (id) DO NOTHING;

                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows = 1 THEN
                    v_importadas_movimentacoes := array_append(v_importadas_movimentacoes, v_id);
                ELSE
                    SELECT m.*
                    INTO v_existing_movement
                    FROM public.filamentos_movimentacoes AS m
                    WHERE m.id = v_id
                      AND m.user_id = v_user_id;

                    IF FOUND
                       AND v_existing_movement.filamento_id IS NOT DISTINCT FROM v_filamento_id
                       AND v_existing_movement.tipo IS NOT DISTINCT FROM v_tipo
                       AND v_existing_movement.quantidade IS NOT DISTINCT FROM v_quantidade
                       AND v_existing_movement.data_hora IS NOT DISTINCT FROM v_data_hora
                       AND v_existing_movement.observacao IS NOT DISTINCT FROM v_observacao THEN
                        v_existentes_movimentacoes := array_append(v_existentes_movimentacoes, v_id);
                    ELSIF FOUND THEN
                        v_existentes_movimentacoes := array_append(v_existentes_movimentacoes, v_id);
                        v_existentes_divergentes_movimentacoes := array_append(v_existentes_divergentes_movimentacoes, v_id);
                    ELSE
                        v_conflitos_movimentacoes := array_append(v_conflitos_movimentacoes, v_id);
                    END IF;
                END IF;
            END IF;
        END LOOP;

        IF cardinality(v_conflitos_filamentos) > 0
           OR cardinality(v_conflitos_movimentacoes) > 0 THEN
            RAISE EXCEPTION USING ERRCODE = 'PZ001', MESSAGE = 'Conflitos de IDs encontrados; importacao cancelada.';
        END IF;
    EXCEPTION
        WHEN SQLSTATE 'PZ001' THEN
            RETURN jsonb_build_object(
                'status', 'conflito',
                'importados', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
                'ja_existentes', jsonb_build_object(
                    'filamentos', to_jsonb(v_existentes_filamentos),
                    'movimentacoes', to_jsonb(v_existentes_movimentacoes)
                ),
                'ja_existentes_divergentes', jsonb_build_object(
                    'filamentos', to_jsonb(v_existentes_divergentes_filamentos),
                    'movimentacoes', to_jsonb(v_existentes_divergentes_movimentacoes)
                ),
                'conflitos', jsonb_build_object(
                    'filamentos', to_jsonb(v_conflitos_filamentos),
                    'movimentacoes', to_jsonb(v_conflitos_movimentacoes)
                )
            );
        WHEN foreign_key_violation THEN
            IF v_id IS NOT NULL
               AND array_position(v_conflitos_movimentacoes, v_id) IS NULL THEN
                v_conflitos_movimentacoes := array_append(v_conflitos_movimentacoes, v_id);
            END IF;
            RETURN jsonb_build_object(
                'status', 'conflito',
                'importados', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb),
                'ja_existentes', jsonb_build_object(
                    'filamentos', to_jsonb(v_existentes_filamentos),
                    'movimentacoes', to_jsonb(v_existentes_movimentacoes)
                ),
                'ja_existentes_divergentes', jsonb_build_object(
                    'filamentos', to_jsonb(v_existentes_divergentes_filamentos),
                    'movimentacoes', to_jsonb(v_existentes_divergentes_movimentacoes)
                ),
                'conflitos', jsonb_build_object(
                    'filamentos', to_jsonb(v_conflitos_filamentos),
                    'movimentacoes', to_jsonb(v_conflitos_movimentacoes)
                )
            );
    END;

    RETURN jsonb_build_object(
        'status', 'concluida',
        'importados', jsonb_build_object(
            'filamentos', to_jsonb(v_importados_filamentos),
            'movimentacoes', to_jsonb(v_importadas_movimentacoes)
        ),
        'ja_existentes', jsonb_build_object(
            'filamentos', to_jsonb(v_existentes_filamentos),
            'movimentacoes', to_jsonb(v_existentes_movimentacoes)
        ),
        'ja_existentes_divergentes', jsonb_build_object(
            'filamentos', to_jsonb(v_existentes_divergentes_filamentos),
            'movimentacoes', to_jsonb(v_existentes_divergentes_movimentacoes)
        ),
        'conflitos', jsonb_build_object('filamentos', '[]'::jsonb, 'movimentacoes', '[]'::jsonb)
    );
END;
$function$;

ALTER FUNCTION public.registrar_movimentacao_filamento(text, text, text, numeric, text)
    OWNER TO postgres;
ALTER FUNCTION public.cadastrar_filamento_com_entrada(text, text, text, text, text, numeric, numeric, numeric, text, text)
    OWNER TO postgres;
ALTER FUNCTION public.importar_filamentos_locais(jsonb, jsonb)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_filamento(text, text, text, numeric, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cadastrar_filamento_com_entrada(text, text, text, text, text, numeric, numeric, numeric, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.importar_filamentos_locais(jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_filamento(text, text, text, numeric, text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.cadastrar_filamento_com_entrada(text, text, text, text, text, numeric, numeric, numeric, text, text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_filamentos_locais(jsonb, jsonb)
    TO authenticated;

DO $privilege_check$
DECLARE
    v_role text;
    v_table text;
    v_column text;
    v_function regprocedure;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        FOREACH v_table IN ARRAY ARRAY['filamentos', 'filamentos_movimentacoes']
        LOOP
            IF has_table_privilege(v_role, format('public.%I', v_table), 'INSERT')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'UPDATE')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'DELETE')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'TRUNCATE') THEN
                RAISE EXCEPTION 'Role % ainda tem privilegio de escrita direta em public.%. Verifique grants herdados.', v_role, v_table;
            END IF;

            FOR v_column IN
                SELECT c.column_name
                FROM information_schema.columns AS c
                WHERE c.table_schema = 'public'
                  AND c.table_name = v_table
            LOOP
                IF has_column_privilege(v_role, format('public.%I', v_table), v_column, 'INSERT')
                   OR has_column_privilege(v_role, format('public.%I', v_table), v_column, 'UPDATE') THEN
                    RAISE EXCEPTION 'Role % ainda tem privilegio por coluna em public.%.%. Verifique grants herdados.',
                        v_role, v_table, v_column;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    FOREACH v_function IN ARRAY ARRAY[
        'public.registrar_movimentacao_filamento(text,text,text,numeric,text)'::regprocedure,
        'public.cadastrar_filamento_com_entrada(text,text,text,text,text,numeric,numeric,numeric,text,text)'::regprocedure,
        'public.importar_filamentos_locais(jsonb,jsonb)'::regprocedure
    ]
    LOOP
        IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'Role anon ainda pode executar % por privilegio direto ou herdado.', v_function;
        END IF;

        IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'Role authenticated nao pode executar a RPC %.', v_function;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_proc AS p
            CROSS JOIN LATERAL aclexplode(
                COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE p.oid = v_function
              AND acl.grantee = 0
              AND acl.privilege_type = 'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'PUBLIC ainda pode executar a RPC %.', v_function;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_proc AS p
            CROSS JOIN LATERAL aclexplode(
                COALESCE(p.proacl, acldefault('f', p.proowner))
            ) AS acl
            WHERE p.oid = v_function
              AND acl.privilege_type = 'EXECUTE'
              AND acl.grantee NOT IN (
                  p.proowner,
                  (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
                  (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
              )
        ) THEN
            RAISE EXCEPTION 'A RPC % possui EXECUTE concedido a um role fora da allowlist (owner, authenticated e service_role); revise grants.', v_function;
        END IF;
    END LOOP;

    IF NOT has_table_privilege('service_role', 'public.filamentos', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.filamentos', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.filamentos', 'DELETE')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'DELETE') THEN
        RAISE EXCEPTION 'service_role perdeu privilegios administrativos esperados nas tabelas de filamentos.';
    END IF;
END;
$privilege_check$;

-- Verificacoes manuais obrigatorias antes de executar este arquivo:
-- 1. Confira em Table Editor / pg_policies que SELECT nas duas tabelas restringe
--    leitura ao auth.uid() do proprietario. O preflight confirma RLS ativo e a
--    FK composta, mas nao consegue provar a semantica das politicas. As funcoes
--    SECURITY DEFINER pertencem a postgres e bypassam RLS; por isso cada uma
--    exige auth.uid() e filtra/verifica ownership em cada escrita e referencia.
-- 2. Confira grants diretos e herdados de roles personalizadas acessiveis a
--    usuarios. A verificacao acima cobre anon e authenticated; service_role
--    conserva DML administrativo explicito e nunca pode ser usado no frontend.
-- 3. Confira constraints CHECK adicionais, especialmente se permitem ENTRADA
--    inicial com quantidade zero, AJUSTE com zero e valores numericos validos.
-- 4. Confira que o trigger de UPDATE habilitado realmente atualiza atualizado_em;
--    o preflight apenas confirma a existencia de algum trigger de UPDATE.
--    Confirme tambem que ele nao sobrescreve atualizado_em durante INSERT, pois
--    a importacao deve preservar as datas locais.
-- 5. Confira regras adicionais das colunas e privilegios concedidos a roles
--    personalizadas. Como id e chave primaria global em cada tabela, IDs nao
--    podem se repetir entre usuarios.
--    Colisao global gera conflito/rollback; cadastros novos devem gerar outro ID
--    apenas em uma nova tentativa, nunca substituir IDs importados ou repetir
--    IDs de operacoes ja submetidas.

COMMIT;
