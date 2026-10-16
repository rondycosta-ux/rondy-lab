-- Rondy Lab: edicao e arquivamento transacionais de filamentos.
-- Execute manualmente somente depois de confirmar as verificacoes deste arquivo.

BEGIN;

DO $preflight$
DECLARE
    v_table text;
    v_column text;
    v_expected_type text;
    v_actual_type text;
    v_role text;
    v_relid oid;
    v_archived_attnum smallint;
    v_archived_not_null boolean;
    v_archived_default text;
    v_ledger_relid oid;
BEGIN
    IF to_regclass('public.filamentos') IS NULL
       OR to_regclass('public.filamentos_movimentacoes') IS NULL THEN
        RAISE EXCEPTION 'As tabelas public.filamentos e public.filamentos_movimentacoes devem existir.';
    END IF;

    FOR v_table, v_column, v_expected_type IN
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

        IF NOT FOUND OR v_actual_type IS DISTINCT FROM v_expected_type THEN
            RAISE EXCEPTION 'Estrutura inesperada: public.%.% deveria ser % (encontrado: %).',
                v_table, v_column, v_expected_type, COALESCE(v_actual_type, 'coluna ausente');
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
        RAISE EXCEPTION 'As tabelas devem manter chave primaria simples em id.';
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
        RAISE EXCEPTION 'A FK composta validada de movimentacoes para filamentos com ON DELETE RESTRICT nao foi confirmada.';
    END IF;

    IF to_regprocedure('public.registrar_movimentacao_filamento(text,text,text,numeric,text)') IS NULL
       OR to_regprocedure('public.cadastrar_filamento_com_entrada(text,text,text,text,text,numeric,numeric,numeric,text,text)') IS NULL
       OR to_regprocedure('public.importar_filamentos_locais(jsonb,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'As tres RPCs da migration 001 devem existir antes da migration 002.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger AS t
        WHERE t.tgrelid = 'public.filamentos'::regclass
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'
          AND (t.tgtype & 16) = 16
    ) THEN
        RAISE EXCEPTION 'Nao foi encontrado trigger habilitado de UPDATE em public.filamentos.';
    END IF;

    SELECT a.attnum, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO v_archived_attnum, v_archived_not_null, v_archived_default
    FROM pg_attribute AS a
    LEFT JOIN pg_attrdef AS d
      ON d.adrelid = a.attrelid
     AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.filamentos'::regclass
      AND a.attname = 'arquivado'
      AND NOT a.attisdropped
      AND a.attnum > 0;

    IF FOUND AND (
        (SELECT a.atttypid
         FROM pg_attribute AS a
         WHERE a.attrelid = 'public.filamentos'::regclass
           AND a.attnum = v_archived_attnum) <> 'boolean'::regtype
        OR NOT v_archived_not_null
        OR v_archived_default IS DISTINCT FROM 'false'
    ) THEN
        RAISE EXCEPTION 'A coluna existente public.filamentos.arquivado precisa ser boolean NOT NULL DEFAULT false.';
    END IF;

    v_ledger_relid := to_regclass('public.filamentos_edicoes');
    IF v_ledger_relid IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class AS c
            WHERE c.oid = v_ledger_relid
              AND c.relkind = 'r'
              AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'public.filamentos_edicoes ja existe, mas nao e uma tabela comum com RLS habilitado.';
        END IF;

        FOR v_column, v_expected_type IN
            SELECT *
            FROM (VALUES
                ('id', 'text'),
                ('user_id', 'uuid'),
                ('filamento_id', 'text'),
                ('payload', 'jsonb'),
                ('ajuste_criado', 'boolean'),
                ('dados_alterados', 'boolean'),
                ('criado_em', 'timestamp with time zone')
            ) AS expected(column_name, data_type)
        LOOP
            SELECT c.data_type
            INTO v_actual_type
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = 'filamentos_edicoes'
              AND c.column_name = v_column
              AND c.is_nullable = 'NO';

            IF NOT FOUND OR v_actual_type IS DISTINCT FROM v_expected_type THEN
                RAISE EXCEPTION 'Estrutura inesperada: public.filamentos_edicoes.% deve ser NOT NULL %.',
                    v_column, v_expected_type;
            END IF;
        END LOOP;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint AS c
            WHERE c.contype = 'p'
              AND c.conrelid = v_ledger_relid
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
            WHERE c.contype = 'f'
              AND c.conrelid = v_ledger_relid
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
            RAISE EXCEPTION 'public.filamentos_edicoes deve ter PK em id e FK composta RESTRICT para filamentos(id,user_id).';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE EXCEPTION 'Os roles postgres, authenticated, anon e service_role do Supabase devem existir.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'postgres'
          AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'O role postgres deve ser SUPERUSER ou BYPASSRLS para possuir as RPCs SECURITY DEFINER.';
    END IF;

    IF to_regprocedure('public.editar_filamento(text,text,text,text,text,numeric,numeric,numeric,text,text)') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_proc AS p
           JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
           WHERE p.oid = to_regprocedure('public.editar_filamento(text,text,text,text,text,numeric,numeric,numeric,text,text)')
             AND p.prosecdef
             AND owner_role.rolname = 'postgres'
       ) THEN
        RAISE EXCEPTION 'Ja existe uma funcao editar_filamento com owner ou modo de seguranca inesperado.';
    END IF;

    IF to_regprocedure('public.definir_arquivamento_filamento(text,boolean)') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM pg_proc AS p
           JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
           WHERE p.oid = to_regprocedure('public.definir_arquivamento_filamento(text,boolean)')
             AND p.prosecdef
             AND owner_role.rolname = 'postgres'
       ) THEN
        RAISE EXCEPTION 'Ja existe uma funcao definir_arquivamento_filamento com owner ou modo de seguranca inesperado.';
    END IF;

    IF NOT has_schema_privilege('authenticated', 'public', 'USAGE')
       OR NOT has_table_privilege('authenticated', 'public.filamentos', 'SELECT')
       OR NOT has_table_privilege('authenticated', 'public.filamentos_movimentacoes', 'SELECT') THEN
        RAISE EXCEPTION 'authenticated precisa de USAGE em public e SELECT nas duas tabelas para a aplicacao.';
    END IF;

    IF NOT has_table_privilege('postgres', 'public.filamentos', 'SELECT')
       OR NOT has_table_privilege('postgres', 'public.filamentos', 'UPDATE')
       OR NOT has_table_privilege('postgres', 'public.filamentos_movimentacoes', 'SELECT')
       OR NOT has_table_privilege('postgres', 'public.filamentos_movimentacoes', 'INSERT') THEN
        RAISE EXCEPTION 'postgres precisa de SELECT/UPDATE nos filamentos e SELECT/INSERT nas movimentacoes para executar as RPCs.';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        FOREACH v_table IN ARRAY ARRAY['filamentos', 'filamentos_movimentacoes']
        LOOP
            IF has_table_privilege(v_role, format('public.%I', v_table), 'INSERT')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'UPDATE')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'DELETE')
               OR has_table_privilege(v_role, format('public.%I', v_table), 'TRUNCATE') THEN
                RAISE EXCEPTION 'Role % ainda possui escrita direta em public.%.', v_role, v_table;
            END IF;

            FOR v_column IN
                SELECT c.column_name
                FROM information_schema.columns AS c
                WHERE c.table_schema = 'public'
                  AND c.table_name = v_table
            LOOP
                IF has_column_privilege(v_role, format('public.%I', v_table), v_column, 'INSERT')
                   OR has_column_privilege(v_role, format('public.%I', v_table), v_column, 'UPDATE') THEN
                    RAISE EXCEPTION 'Role % ainda possui escrita por coluna em public.%.%.',
                        v_role, v_table, v_column;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    IF NOT has_table_privilege('service_role', 'public.filamentos', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.filamentos', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.filamentos', 'DELETE')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'UPDATE')
       OR NOT has_table_privilege('service_role', 'public.filamentos_movimentacoes', 'DELETE') THEN
        RAISE EXCEPTION 'service_role nao possui os privilegios administrativos esperados; nenhum grant sera alterado por esta migration.';
    END IF;
END;
$preflight$;

ALTER TABLE public.filamentos
    ADD COLUMN IF NOT EXISTS arquivado boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.filamentos_edicoes (
    id text PRIMARY KEY,
    user_id uuid NOT NULL,
    filamento_id text NOT NULL,
    payload jsonb NOT NULL,
    ajuste_criado boolean NOT NULL,
    dados_alterados boolean NOT NULL,
    criado_em timestamptz NOT NULL,
    CONSTRAINT filamentos_edicoes_payload_object
        CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT filamentos_edicoes_filamento_user_fk
        FOREIGN KEY (filamento_id, user_id)
        REFERENCES public.filamentos (id, user_id)
        ON DELETE RESTRICT
);

ALTER TABLE public.filamentos_edicoes OWNER TO postgres;
ALTER TABLE public.filamentos_edicoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.filamentos_edicoes
    FROM PUBLIC, anon, authenticated;

REVOKE INSERT (arquivado), UPDATE (arquivado)
    ON TABLE public.filamentos
    FROM PUBLIC, anon, authenticated;

-- Mantem a assinatura, defaults, validacoes, comportamento e ACL da RPC 001,
-- acrescentando a verificacao do estado arquivado sob o mesmo lock da linha.
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
    v_arquivado boolean;
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

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:filamentos-operation:' || p_id, 0)
    );

    IF EXISTS (
        SELECT 1
        FROM public.filamentos_edicoes AS e
        WHERE e.id = p_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de movimentacao ja utilizado por uma operacao de edicao.';
    END IF;

    SELECT f.quantidade_disponivel, f.arquivado
    INTO v_saldo_atual, v_arquivado
    FROM public.filamentos AS f
    WHERE f.id = p_filamento_id
      AND f.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Filamento nao encontrado ou sem permissao.';
    END IF;

    IF v_arquivado THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Filamento arquivado nao aceita novas movimentacoes.';
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
      AND user_id = v_user_id
      AND NOT arquivado;

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

CREATE OR REPLACE FUNCTION public.editar_filamento(
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
    v_filamento public.filamentos%ROWTYPE;
    v_existing_edit public.filamentos_edicoes%ROWTYPE;
    v_existing_movement public.filamentos_movimentacoes%ROWTYPE;
    v_operation_payload jsonb;
    v_saldo_alterado boolean;
    v_dados_alterados boolean;
    v_now timestamptz;
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

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:filamentos-operation:' || p_movimentacao_id, 0)
    );

    SELECT f.*
    INTO v_filamento
    FROM public.filamentos AS f
    WHERE f.id = p_id
      AND f.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Filamento nao encontrado ou sem permissao.';
    END IF;

    v_operation_payload := jsonb_build_object(
        'material', p_material,
        'marca', btrim(p_marca),
        'linha', COALESCE(p_linha, ''),
        'cor', btrim(p_cor),
        'peso_nominal', p_peso_nominal,
        'quantidade_disponivel', p_quantidade_disponivel,
        'valor_pago', p_valor_pago,
        'observacoes', COALESCE(p_observacoes, '')
    );

    -- Toda edicao, inclusive sem AJUSTE, reserva uma chave imutavel com o
    -- payload completo. Retry idempotente retorna sem escrever no filamento.
    SELECT e.*
    INTO v_existing_edit
    FROM public.filamentos_edicoes AS e
    WHERE e.id = p_movimentacao_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_edit.user_id = v_user_id
           AND v_existing_edit.filamento_id = p_id
           AND v_existing_edit.payload = v_operation_payload THEN
            RETURN jsonb_build_object(
                'status', 'ja_aplicada',
                'id', p_id,
                'movimentacao_id', CASE
                    WHEN v_existing_edit.ajuste_criado THEN p_movimentacao_id
                    ELSE NULL
                END,
                'saldo', v_filamento.quantidade_disponivel,
                'saldo_solicitado', p_quantidade_disponivel,
                'ajuste_criado', v_existing_edit.ajuste_criado,
                'dados_alterados', v_existing_edit.dados_alterados
            );
        END IF;

        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de operacao de edicao ja utilizado com dados diferentes.';
    END IF;

    -- A repeticao de uma edicao concluida acima continua reconhecivel mesmo se
    -- o rolo foi posteriormente arquivado. Operacoes novas ficam bloqueadas.
    IF v_filamento.arquivado THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Filamento arquivado nao pode ser editado.';
    END IF;

    -- O mesmo ID tambem e usado como ID do AJUSTE quando o saldo muda; nao
    -- aceite uma chave de operacao ja ocupada pelo historico de movimentos.
    SELECT m.*
    INTO v_existing_movement
    FROM public.filamentos_movimentacoes AS m
    WHERE m.id = p_movimentacao_id;

    IF FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de operacao ja utilizado por uma movimentacao.';
    END IF;

    v_saldo_alterado := v_filamento.quantidade_disponivel IS DISTINCT FROM p_quantidade_disponivel;
    v_dados_alterados :=
        v_filamento.material IS DISTINCT FROM p_material
        OR v_filamento.marca IS DISTINCT FROM btrim(p_marca)
        OR v_filamento.linha IS DISTINCT FROM COALESCE(p_linha, '')
        OR v_filamento.cor IS DISTINCT FROM btrim(p_cor)
        OR v_filamento.peso_nominal IS DISTINCT FROM p_peso_nominal
        OR v_saldo_alterado
        OR v_filamento.valor_pago IS DISTINCT FROM p_valor_pago
        OR v_filamento.observacoes IS DISTINCT FROM COALESCE(p_observacoes, '');

    v_now := clock_timestamp();
    INSERT INTO public.filamentos_edicoes (
        id, user_id, filamento_id, payload, ajuste_criado, dados_alterados, criado_em
    )
    VALUES (
        p_movimentacao_id, v_user_id, p_id, v_operation_payload,
        v_saldo_alterado, v_dados_alterados, v_now
    );

    IF v_dados_alterados THEN
        UPDATE public.filamentos
        SET material = p_material,
            marca = btrim(p_marca),
            linha = COALESCE(p_linha, ''),
            cor = btrim(p_cor),
            peso_nominal = p_peso_nominal,
            quantidade_disponivel = p_quantidade_disponivel,
            valor_pago = p_valor_pago,
            observacoes = COALESCE(p_observacoes, '')
        WHERE id = p_id
          AND user_id = v_user_id
          AND NOT arquivado;
    END IF;

    IF v_saldo_alterado THEN
        INSERT INTO public.filamentos_movimentacoes (
            id, user_id, filamento_id, tipo, quantidade, data_hora, observacao
        )
        VALUES (
            p_movimentacao_id, v_user_id, p_id, 'AJUSTE',
            p_quantidade_disponivel, v_now, 'Ajuste de saldo por edicao do filamento.'
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'concluida',
        'id', p_id,
        'movimentacao_id', CASE WHEN v_saldo_alterado THEN p_movimentacao_id ELSE NULL END,
        'saldo', p_quantidade_disponivel,
        'ajuste_criado', v_saldo_alterado,
        'dados_alterados', v_dados_alterados
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_arquivamento_filamento(
    p_filamento_id text,
    p_arquivado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_arquivado_atual boolean;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_filamento_id IS NULL OR btrim(p_filamento_id) = ''
       OR length(p_filamento_id) > 200 OR p_filamento_id ~ '[[:cntrl:]]'
       OR p_arquivado IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ID do filamento ou estado de arquivamento invalido.';
    END IF;

    SELECT f.arquivado
    INTO v_arquivado_atual
    FROM public.filamentos AS f
    WHERE f.id = p_filamento_id
      AND f.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Filamento nao encontrado ou sem permissao.';
    END IF;

    IF v_arquivado_atual IS DISTINCT FROM p_arquivado THEN
        UPDATE public.filamentos
        SET arquivado = p_arquivado
        WHERE id = p_filamento_id
          AND user_id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'id', p_filamento_id,
        'arquivado', p_arquivado,
        'alterado', v_arquivado_atual IS DISTINCT FROM p_arquivado
    );
END;
$function$;

ALTER FUNCTION public.editar_filamento(text, text, text, text, text, numeric, numeric, numeric, text, text)
    OWNER TO postgres;
ALTER FUNCTION public.definir_arquivamento_filamento(text, boolean)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.editar_filamento(text, text, text, text, text, numeric, numeric, numeric, text, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_arquivamento_filamento(text, boolean)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.editar_filamento(text, text, text, text, text, numeric, numeric, numeric, text, text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_arquivamento_filamento(text, boolean)
    TO authenticated;

DO $postflight$
DECLARE
    v_function regprocedure;
    v_role text;
    v_privilege text;
    v_column text;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns AS c
        WHERE c.table_schema = 'public'
          AND c.table_name = 'filamentos'
          AND c.column_name = 'arquivado'
          AND c.data_type = 'boolean'
          AND c.is_nullable = 'NO'
          AND c.column_default = 'false'
    ) THEN
        RAISE EXCEPTION 'A coluna public.filamentos.arquivado nao possui o tipo/default esperado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_roles AS owner_role ON owner_role.oid = c.relowner
        WHERE c.oid = 'public.filamentos_edicoes'::regclass
          AND c.relkind = 'r'
          AND c.relrowsecurity
          AND owner_role.rolname = 'postgres'
    ) THEN
        RAISE EXCEPTION 'O ledger public.filamentos_edicoes deve ser tabela comum com RLS habilitado e owner postgres.';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
        FOREACH v_privilege IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]
        LOOP
            IF has_table_privilege(v_role, 'public.filamentos_edicoes', v_privilege) THEN
                RAISE EXCEPTION 'Role % possui privilegio % direto/efetivo no ledger privado.',
                    v_role, v_privilege;
            END IF;
        END LOOP;

        FOR v_column IN
            SELECT c.column_name
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = 'filamentos_edicoes'
        LOOP
            FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
            LOOP
                IF has_column_privilege(
                    v_role, 'public.filamentos_edicoes', v_column, v_privilege
                ) THEN
                    RAISE EXCEPTION 'Role % possui privilegio % na coluna % do ledger privado.',
                        v_role, v_privilege, v_column;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS c
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS acl
        WHERE c.oid = 'public.filamentos_edicoes'::regclass
          AND acl.grantee = 0
    ) OR EXISTS (
        SELECT 1
        FROM pg_attribute AS a
        CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
        WHERE a.attrelid = 'public.filamentos_edicoes'::regclass
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attacl IS NOT NULL
          AND acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'PUBLIC possui privilegios no ledger privado.';
    END IF;

    FOREACH v_function IN ARRAY ARRAY[
        'public.registrar_movimentacao_filamento(text,text,text,numeric,text)'::regprocedure,
        'public.editar_filamento(text,text,text,text,text,numeric,numeric,numeric,text,text)'::regprocedure,
        'public.definir_arquivamento_filamento(text,boolean)'::regprocedure
    ]
    LOOP
        IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'anon ainda pode executar %.', v_function;
        END IF;

        IF NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'authenticated nao pode executar %.', v_function;
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
            RAISE EXCEPTION 'PUBLIC ainda pode executar %.', v_function;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_proc AS p
            JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
            WHERE p.oid = v_function
              AND p.prosecdef
              AND owner_role.rolname = 'postgres'
              AND p.proconfig @> ARRAY['search_path=""']
        ) THEN
            RAISE EXCEPTION 'A funcao % nao possui SECURITY DEFINER, owner postgres e search_path vazio.', v_function;
        END IF;
    END LOOP;
END;
$postflight$;

-- Verificacoes manuais antes da execucao:
-- 1. Confirme que as politicas SELECT existentes limitam as duas tabelas a
--    auth.uid(); esta migration nao cria nem altera policies ou RLS.
-- 2. Confirme a implementacao do trigger existente de atualizado_em. As RPCs
--    atualizam as linhas de filamentos e deixam a coluna sob responsabilidade
--    desse trigger; nenhum trigger e removido ou substituido.
-- 3. service_role conserva os grants administrativos existentes nas tabelas;
--    esta migration nao concede EXECUTE das novas RPCs a service_role.
-- 4. Filamentos ativos devem ser consultados com arquivado = false; os
--    arquivados permanecem consultaveis pela area propria e podem ser reativados.
-- 5. A RPC editar_filamento requer um novo p_movimentacao_id estavel por envio.
--    Em retry com AJUSTE ja confirmado, reutilizar o mesmo ID retorna o saldo
--    atual como ja_aplicada sem reaplicar o AJUSTE, mesmo apos novos movimentos.
-- 6. registrar_movimentacao_filamento e substituida mantendo sua assinatura,
--    default, validacoes, atomicidade, owner e ACL; apenas passa a rejeitar
--    filamentos arquivados depois de obter o lock da linha.
-- 7. IDs usados por edicoes e movimentacoes compartilham um lock transacional,
--    impedindo colisao concorrente entre a chave idempotente e o historico.

COMMIT;
