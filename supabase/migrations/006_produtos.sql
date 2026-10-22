-- Rondy Lab: produtos, variacoes, estoque e referencias de imagens.
-- Execute manualmente no SQL Editor somente depois de revisar esta migration.

BEGIN;

DO $preflight$
DECLARE
    v_user_id_type text;
BEGIN
    IF to_regclass('auth.users') IS NULL
       OR to_regclass('public.precificacoes') IS NULL THEN
        RAISE EXCEPTION 'As tabelas auth.users e public.precificacoes devem existir (migration 005).';
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_user_id_type
    FROM pg_attribute AS a
    WHERE a.attrelid = 'auth.users'::regclass
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF v_user_id_type IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'auth.users.id deve ser uuid (encontrado: %).',
            COALESCE(v_user_id_type, 'coluna ausente');
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_user_id_type
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.precificacoes'::regclass
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF v_user_id_type IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'public.precificacoes.id deve ser uuid (encontrado: %).',
            COALESCE(v_user_id_type, 'coluna ausente');
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod)
    INTO v_user_id_type
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.precificacoes'::regclass
      AND a.attname = 'user_id'
      AND NOT a.attisdropped;

    IF v_user_id_type IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'public.precificacoes.user_id deve ser uuid (encontrado: %).',
            COALESCE(v_user_id_type, 'coluna ausente');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
            'produtos',
            'produto_variacoes',
            'produto_movimentacoes',
            'produto_imagens'
        ]) AS expected(table_name)
        WHERE to_regclass(format('public.%I', expected.table_name)) IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Uma ou mais tabelas da migration 006 ja existem; revise a estrutura antes de continuar.';
    END IF;

    IF to_regprocedure('public.atualizar_timestamp_produtos()') IS NOT NULL
       OR to_regprocedure('public.verificar_produto_com_variacao()') IS NOT NULL
       OR to_regprocedure('public.criar_produto(uuid,text,text,text,numeric,numeric,uuid)') IS NOT NULL
       OR to_regprocedure('public.criar_variacao_produto(uuid,uuid,text,text,numeric,numeric)') IS NOT NULL
       OR to_regprocedure('public.definir_arquivamento_produto(uuid,boolean)') IS NOT NULL
       OR to_regprocedure('public.definir_arquivamento_variacao_produto(uuid,boolean)') IS NOT NULL
       OR to_regprocedure('public.registrar_movimentacao_produto(uuid,uuid,text,integer,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'Uma ou mais funcoes da migration 006 ja existem; revise a estrutura antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        RAISE EXCEPTION 'Os roles postgres, anon e authenticated esperados pelo Supabase devem existir.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'postgres'
          AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'O role postgres deve ser SUPERUSER ou BYPASSRLS para possuir as RPCs SECURITY DEFINER.';
    END IF;
END;
$preflight$;

CREATE TABLE public.produtos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL
        REFERENCES auth.users (id) ON DELETE CASCADE,
    nome text NOT NULL
        CONSTRAINT produtos_nome_check
        CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
    descricao text NOT NULL DEFAULT '',
    tipo_atendimento text NOT NULL
        CONSTRAINT produtos_tipo_atendimento_check
        CHECK (tipo_atendimento IN ('pronta_entrega', 'sob_encomenda')),
    custo_base numeric(12, 2) NOT NULL
        CONSTRAINT produtos_custo_base_check
        CHECK (custo_base >= 0 AND custo_base::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    preco_base numeric(12, 2) NOT NULL
        CONSTRAINT produtos_preco_base_check
        CHECK (preco_base >= 0 AND preco_base::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    precificacao_origem_id uuid
        REFERENCES public.precificacoes (id) ON DELETE SET NULL,
    arquivado boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT produtos_id_user_id_key UNIQUE (id, user_id)
);

CREATE INDEX produtos_user_arquivado_criado_idx
    ON public.produtos (user_id, arquivado, criado_em DESC);

CREATE TABLE public.produto_variacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    cor text,
    tamanho text,
    variacao_padrao boolean NOT NULL DEFAULT false,
    custo_unitario numeric(12, 2)
        CONSTRAINT produto_variacoes_custo_check
        CHECK (
            custo_unitario IS NULL
            OR (custo_unitario >= 0 AND custo_unitario::text NOT IN ('NaN', 'Infinity', '-Infinity'))
        ),
    preco_unitario numeric(12, 2)
        CONSTRAINT produto_variacoes_preco_check
        CHECK (
            preco_unitario IS NULL
            OR (preco_unitario >= 0 AND preco_unitario::text NOT IN ('NaN', 'Infinity', '-Infinity'))
        ),
    estoque_atual integer NOT NULL DEFAULT 0
        CONSTRAINT produto_variacoes_estoque_check
        CHECK (estoque_atual >= 0),
    arquivado boolean NOT NULL DEFAULT false,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT produto_variacoes_produto_user_fk
        FOREIGN KEY (produto_id, user_id)
        REFERENCES public.produtos (id, user_id) ON DELETE CASCADE,
    CONSTRAINT produto_variacoes_id_produto_user_key
        UNIQUE (id, produto_id, user_id),
    CONSTRAINT produto_variacoes_id_user_key
        UNIQUE (id, user_id),
    CONSTRAINT produto_variacoes_cor_check
        CHECK (cor IS NULL OR length(btrim(cor)) BETWEEN 1 AND 100),
    CONSTRAINT produto_variacoes_tamanho_check
        CHECK (tamanho IS NULL OR length(btrim(tamanho)) BETWEEN 1 AND 100),
    CONSTRAINT produto_variacoes_padrao_check
        CHECK (variacao_padrao = (cor IS NULL AND tamanho IS NULL))
);

CREATE UNIQUE INDEX produto_variacoes_combinacao_unique
    ON public.produto_variacoes (
        produto_id,
        lower(COALESCE(btrim(cor), '')),
        lower(COALESCE(btrim(tamanho), ''))
    );

CREATE UNIQUE INDEX produto_variacoes_padrao_unique
    ON public.produto_variacoes (produto_id)
    WHERE variacao_padrao;

CREATE INDEX produto_variacoes_user_produto_idx
    ON public.produto_variacoes (user_id, produto_id);

CREATE TABLE public.produto_movimentacoes (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    variacao_id uuid NOT NULL,
    tipo text NOT NULL
        CONSTRAINT produto_movimentacoes_tipo_check
        CHECK (tipo IN ('ENTRADA', 'SAIDA', 'AJUSTE')),
    quantidade integer NOT NULL
        CONSTRAINT produto_movimentacoes_quantidade_check
        CHECK (
            quantidade >= 0
            AND (tipo = 'AJUSTE' OR quantidade > 0)
        ),
    saldo_anterior integer NOT NULL
        CONSTRAINT produto_movimentacoes_saldo_anterior_check
        CHECK (saldo_anterior >= 0),
    saldo_resultante integer NOT NULL
        CONSTRAINT produto_movimentacoes_saldo_resultante_check
        CHECK (saldo_resultante >= 0),
        CONSTRAINT produto_movimentacoes_saldos_coerentes_check
            CHECK (
                (tipo = 'ENTRADA'
                    AND saldo_resultante::bigint = saldo_anterior::bigint + quantidade::bigint)
                OR (tipo = 'SAIDA'
                    AND quantidade <= saldo_anterior
                    AND saldo_resultante::bigint = saldo_anterior::bigint - quantidade::bigint)
                OR (tipo = 'AJUSTE' AND saldo_resultante = quantidade)
            ),
    movimentado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    observacao text NOT NULL DEFAULT '',
    CONSTRAINT produto_movimentacoes_variacao_user_fk
        FOREIGN KEY (variacao_id, user_id)
        REFERENCES public.produto_variacoes (id, user_id) ON DELETE CASCADE
);

CREATE INDEX produto_movimentacoes_user_variacao_data_idx
    ON public.produto_movimentacoes (user_id, variacao_id, movimentado_em DESC);

CREATE TABLE public.produto_imagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    produto_id uuid NOT NULL,
    variacao_id uuid,
    bucket_id text NOT NULL DEFAULT 'produto-imagens'
        CONSTRAINT produto_imagens_bucket_check
        CHECK (bucket_id = 'produto-imagens'),
    storage_path text NOT NULL
        CONSTRAINT produto_imagens_storage_path_check
        CHECK (
            length(storage_path) BETWEEN 1 AND 1024
            AND position(user_id::text || '/' || produto_id::text || '/' IN storage_path) = 1
            AND length(storage_path) > length(user_id::text || '/' || produto_id::text || '/')
            AND position('..' IN storage_path) = 0
        ),
    posicao integer NOT NULL DEFAULT 0
        CONSTRAINT produto_imagens_posicao_check
        CHECK (posicao >= 0),
    capa boolean NOT NULL DEFAULT false,
    texto_alternativo text NOT NULL DEFAULT '',
    criado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT produto_imagens_produto_user_fk
        FOREIGN KEY (produto_id, user_id)
        REFERENCES public.produtos (id, user_id) ON DELETE CASCADE,
    CONSTRAINT produto_imagens_variacao_produto_user_fk
        FOREIGN KEY (variacao_id, produto_id, user_id)
        REFERENCES public.produto_variacoes (id, produto_id, user_id) ON DELETE CASCADE,
    CONSTRAINT produto_imagens_bucket_path_key UNIQUE (bucket_id, storage_path),
    CONSTRAINT produto_imagens_capa_sem_variacao_check
        CHECK (NOT capa OR variacao_id IS NULL)
);

CREATE INDEX produto_imagens_user_produto_posicao_idx
    ON public.produto_imagens (user_id, produto_id, posicao, criado_em);

CREATE UNIQUE INDEX produto_imagens_variacao_unique
    ON public.produto_imagens (variacao_id)
    WHERE variacao_id IS NOT NULL;

CREATE UNIQUE INDEX produto_imagens_capa_unique
    ON public.produto_imagens (user_id, produto_id)
    WHERE capa;

COMMENT ON TABLE public.produtos IS
    'Cadastro principal isolado por usuario; custos e precos sao copias independentes da precificacao de origem.';
COMMENT ON COLUMN public.produtos.precificacao_origem_id IS
    'Referencia informativa a precificacao propria no momento do cadastro; nao sincroniza custos nem precos.';
COMMENT ON TABLE public.produto_variacoes IS
    'Variacoes e saldo atual por unidade; NULL em custo/preco significa herdar do produto.';
COMMENT ON COLUMN public.produto_variacoes.variacao_padrao IS
    'Variacao interna sem cor/tamanho, criada atomicamente pelo cadastro do produto.';
COMMENT ON COLUMN public.produto_variacoes.estoque_atual IS
    'Saldo controlado exclusivamente pela RPC registrar_movimentacao_produto.';
COMMENT ON TABLE public.produto_movimentacoes IS
    'Historico imutavel de entradas, saidas e ajustes absolutos de saldo.';
COMMENT ON TABLE public.produto_imagens IS
    'Metadados de imagens no Storage; bucket e upload nao sao criados por esta migration.';
COMMENT ON COLUMN public.produto_imagens.storage_path IS
    'Caminho relativo user_id/produto_id/... no bucket privado futuro produto-imagens.';

CREATE OR REPLACE FUNCTION public.atualizar_timestamp_produtos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    NEW.atualizado_em := pg_catalog.now();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_timestamp_produtos()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER produtos_atualizar_timestamp
    BEFORE UPDATE ON public.produtos
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_timestamp_produtos();

CREATE TRIGGER produto_variacoes_atualizar_timestamp
    BEFORE UPDATE ON public.produto_variacoes
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_timestamp_produtos();

CREATE OR REPLACE FUNCTION public.verificar_produto_com_variacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_produto_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'produtos' THEN
        v_produto_id := NEW.id;
    ELSE
        v_produto_id := OLD.produto_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.produtos AS p
        WHERE p.id = v_produto_id
    ) AND NOT EXISTS (
        SELECT 1
        FROM public.produto_variacoes AS v
        WHERE v.produto_id = v_produto_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Todo produto deve possuir ao menos uma variacao.';
    END IF;

    RETURN NULL;
END;
$function$;

ALTER FUNCTION public.verificar_produto_com_variacao() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.verificar_produto_com_variacao()
    FROM PUBLIC, anon, authenticated;

CREATE CONSTRAINT TRIGGER produtos_variacao_minima_insert
    AFTER INSERT ON public.produtos
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verificar_produto_com_variacao();

CREATE CONSTRAINT TRIGGER produto_variacoes_variacao_minima_delete
    AFTER DELETE ON public.produto_variacoes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.verificar_produto_com_variacao();

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_variacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_imagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY produtos_select_own
    ON public.produtos
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY produtos_update_own
    ON public.produtos
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY produto_variacoes_select_own
    ON public.produto_variacoes
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY produto_variacoes_update_own
    ON public.produto_variacoes
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY produto_movimentacoes_select_own
    ON public.produto_movimentacoes
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY produto_imagens_select_own
    ON public.produto_imagens
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY produto_imagens_insert_own
    ON public.produto_imagens
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY produto_imagens_update_own
    ON public.produto_imagens
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY produto_imagens_delete_own
    ON public.produto_imagens
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
    public.produtos,
    public.produto_variacoes,
    public.produto_movimentacoes,
    public.produto_imagens
    FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON TABLE
    public.produtos,
    public.produto_variacoes,
    public.produto_movimentacoes,
    public.produto_imagens
    TO authenticated;

GRANT UPDATE (nome, descricao, tipo_atendimento, custo_base, preco_base)
    ON TABLE public.produtos TO authenticated;

GRANT UPDATE (cor, tamanho, custo_unitario, preco_unitario)
    ON TABLE public.produto_variacoes TO authenticated;

GRANT INSERT (id, user_id, produto_id, variacao_id, bucket_id, storage_path, posicao, capa, texto_alternativo)
    ON TABLE public.produto_imagens TO authenticated;
GRANT UPDATE (variacao_id, bucket_id, storage_path, posicao, capa, texto_alternativo)
    ON TABLE public.produto_imagens TO authenticated;
GRANT DELETE ON TABLE public.produto_imagens TO authenticated;

CREATE OR REPLACE FUNCTION public.criar_produto(
    p_id uuid,
    p_nome text,
    p_descricao text,
    p_tipo_atendimento text,
    p_custo_base numeric,
    p_preco_base numeric,
    p_precificacao_origem_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_variacao_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_id IS NULL
       OR p_nome IS NULL OR length(btrim(p_nome)) NOT BETWEEN 1 AND 200
       OR p_descricao IS NULL
       OR p_tipo_atendimento IS NULL
       OR p_tipo_atendimento NOT IN ('pronta_entrega', 'sob_encomenda')
       OR p_custo_base IS NULL
       OR p_custo_base::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_custo_base < 0
       OR p_preco_base IS NULL
       OR p_preco_base::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_preco_base < 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do produto invalidos.';
    END IF;

    IF p_precificacao_origem_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM public.precificacoes AS pr
           WHERE pr.id = p_precificacao_origem_id
             AND pr.user_id = v_user_id
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Precificacao de origem nao encontrada para este usuario.';
    END IF;

    INSERT INTO public.produtos (
        id, user_id, nome, descricao, tipo_atendimento,
        custo_base, preco_base, precificacao_origem_id
    )
    VALUES (
        p_id, v_user_id, btrim(p_nome), p_descricao, p_tipo_atendimento,
        p_custo_base, p_preco_base, p_precificacao_origem_id
    );

    INSERT INTO public.produto_variacoes (
        user_id, produto_id, cor, tamanho, variacao_padrao
    )
    VALUES (v_user_id, p_id, NULL, NULL, true)
    RETURNING id INTO v_variacao_id;

    RETURN pg_catalog.jsonb_build_object(
        'produto_id', p_id,
        'variacao_padrao_id', v_variacao_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_variacao_produto(
    p_id uuid,
    p_produto_id uuid,
    p_cor text,
    p_tamanho text,
    p_custo_unitario numeric DEFAULT NULL,
    p_preco_unitario numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_produto_arquivado boolean;
    v_cor text;
    v_tamanho text;
    v_variacao_padrao_id uuid;
    v_estoque_padrao integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    v_cor := NULLIF(btrim(p_cor), '');
    v_tamanho := NULLIF(btrim(p_tamanho), '');
    IF p_id IS NULL OR p_produto_id IS NULL
       OR (v_cor IS NULL AND v_tamanho IS NULL)
       OR (v_cor IS NOT NULL AND length(v_cor) > 100)
       OR (v_tamanho IS NOT NULL AND length(v_tamanho) > 100)
       OR (p_custo_unitario IS NOT NULL AND (
           p_custo_unitario::text IN ('NaN', 'Infinity', '-Infinity')
           OR p_custo_unitario < 0
       ))
       OR (p_preco_unitario IS NOT NULL AND (
           p_preco_unitario::text IN ('NaN', 'Infinity', '-Infinity')
           OR p_preco_unitario < 0
       )) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados da variacao invalidos.';
    END IF;

    SELECT p.arquivado
    INTO v_produto_arquivado
    FROM public.produtos AS p
    WHERE p.id = p_produto_id
      AND p.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Produto nao encontrado ou sem permissao.';
    END IF;
    IF v_produto_arquivado THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Produto arquivado nao aceita novas variacoes.';
    END IF;

    INSERT INTO public.produto_variacoes (
        id, user_id, produto_id, cor, tamanho, variacao_padrao,
        custo_unitario, preco_unitario
    )
    VALUES (
        p_id, v_user_id, p_produto_id, v_cor, v_tamanho, false,
        p_custo_unitario, p_preco_unitario
    );

    SELECT v.id, v.estoque_atual
    INTO v_variacao_padrao_id, v_estoque_padrao
    FROM public.produto_variacoes AS v
    WHERE v.produto_id = p_produto_id
      AND v.user_id = v_user_id
      AND v.variacao_padrao
    FOR UPDATE;

    IF FOUND AND v_estoque_padrao = 0 THEN
        UPDATE public.produto_variacoes
        SET arquivado = true
        WHERE id = v_variacao_padrao_id
          AND user_id = v_user_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'variacao_id', p_id,
        'produto_id', p_produto_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_arquivamento_produto(
    p_produto_id uuid,
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
    IF p_produto_id IS NULL OR p_arquivado IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Produto ou estado de arquivamento invalido.';
    END IF;

    SELECT p.arquivado
    INTO v_arquivado_atual
    FROM public.produtos AS p
    WHERE p.id = p_produto_id
      AND p.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Produto nao encontrado ou sem permissao.';
    END IF;

    IF NOT p_arquivado
       AND NOT EXISTS (
           SELECT 1
           FROM public.produto_variacoes AS v
           WHERE v.produto_id = p_produto_id
             AND v.user_id = v_user_id
             AND NOT v.arquivado
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Reative uma variacao antes de desarquivar o produto.';
    END IF;

    IF v_arquivado_atual IS DISTINCT FROM p_arquivado THEN
        UPDATE public.produtos
        SET arquivado = p_arquivado
        WHERE id = p_produto_id
          AND user_id = v_user_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'produto_id', p_produto_id,
        'arquivado', p_arquivado,
        'alterado', v_arquivado_atual IS DISTINCT FROM p_arquivado
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.definir_arquivamento_variacao_produto(
    p_variacao_id uuid,
    p_arquivado boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_produto_id uuid;
    v_produto_arquivado boolean;
    v_arquivado_atual boolean;
    v_variacao_padrao boolean;
    v_estoque integer;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF p_variacao_id IS NULL OR p_arquivado IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Variacao ou estado de arquivamento invalido.';
    END IF;

    SELECT p.id, p.arquivado
    INTO v_produto_id, v_produto_arquivado
    FROM public.produtos AS p
    JOIN public.produto_variacoes AS v
      ON v.produto_id = p.id
     AND v.user_id = p.user_id
    WHERE v.id = p_variacao_id
      AND p.user_id = v_user_id
    FOR UPDATE OF p;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Variacao nao encontrada ou sem permissao.';
    END IF;

    SELECT v.arquivado, v.variacao_padrao, v.estoque_atual
    INTO v_arquivado_atual, v_variacao_padrao, v_estoque
    FROM public.produto_variacoes AS v
    WHERE v.id = p_variacao_id
      AND v.produto_id = v_produto_id
      AND v.user_id = v_user_id
    FOR UPDATE;

    IF p_arquivado AND v_estoque <> 0 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Zere o estoque antes de arquivar uma variacao.';
    END IF;

    IF p_arquivado AND NOT v_produto_arquivado
       AND NOT EXISTS (
           SELECT 1
           FROM public.produto_variacoes AS v
           WHERE v.produto_id = v_produto_id
             AND v.user_id = v_user_id
             AND v.id <> p_variacao_id
             AND NOT v.arquivado
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Todo produto ativo deve possuir uma variacao ativa.';
    END IF;

    IF NOT p_arquivado AND v_variacao_padrao
       AND EXISTS (
           SELECT 1
           FROM public.produto_variacoes AS v
           WHERE v.produto_id = v_produto_id
             AND v.user_id = v_user_id
             AND v.id <> p_variacao_id
             AND NOT v.arquivado
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'A variacao padrao nao pode ser reativada enquanto houver outra variacao ativa.';
    END IF;

    IF v_arquivado_atual IS DISTINCT FROM p_arquivado THEN
        UPDATE public.produto_variacoes
        SET arquivado = p_arquivado
        WHERE id = p_variacao_id
          AND produto_id = v_produto_id
          AND user_id = v_user_id;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'variacao_id', p_variacao_id,
        'arquivado', p_arquivado,
        'alterado', v_arquivado_atual IS DISTINCT FROM p_arquivado
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_produto(
    p_id uuid,
    p_variacao_id uuid,
    p_tipo text,
    p_quantidade integer,
    p_observacao text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
    v_produto_id uuid;
    v_produto_arquivado boolean;
    v_variacao_arquivada boolean;
    v_saldo_atual integer;
    v_novo_saldo integer;
    v_existente public.produto_movimentacoes%ROWTYPE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;

    IF p_id IS NULL OR p_variacao_id IS NULL
       OR p_tipo IS NULL OR p_tipo NOT IN ('ENTRADA', 'SAIDA', 'AJUSTE')
       OR p_quantidade IS NULL OR p_quantidade < 0
       OR (p_tipo IN ('ENTRADA', 'SAIDA') AND p_quantidade = 0)
       OR p_observacao IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados da movimentacao invalidos.';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('rondy:produto-movimentacao:' || p_id::text, 0)
    );

    SELECT m.*
    INTO v_existente
    FROM public.produto_movimentacoes AS m
    WHERE m.id = p_id;

    IF FOUND THEN
        IF v_existente.user_id = v_user_id
           AND v_existente.variacao_id = p_variacao_id
           AND v_existente.tipo = p_tipo
           AND v_existente.quantidade = p_quantidade
           AND v_existente.observacao = p_observacao THEN
            RETURN pg_catalog.jsonb_build_object(
                'id', p_id,
                'variacao_id', p_variacao_id,
                'tipo', p_tipo,
                'quantidade', p_quantidade,
                'saldo', v_existente.saldo_resultante,
                'ja_aplicada', true
            );
        END IF;
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'ID de movimentacao ja utilizado.';
    END IF;

    SELECT p.id, p.arquivado
    INTO v_produto_id, v_produto_arquivado
    FROM public.produtos AS p
    JOIN public.produto_variacoes AS v
      ON v.produto_id = p.id
     AND v.user_id = p.user_id
    WHERE v.id = p_variacao_id
      AND p.user_id = v_user_id
    FOR UPDATE OF p;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Variacao nao encontrada ou sem permissao.';
    END IF;

    SELECT v.estoque_atual, v.arquivado
    INTO v_saldo_atual, v_variacao_arquivada
    FROM public.produto_variacoes AS v
    WHERE v.id = p_variacao_id
      AND v.produto_id = v_produto_id
      AND v.user_id = v_user_id
    FOR UPDATE;

    IF v_produto_arquivado OR v_variacao_arquivada THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Produto ou variacao arquivada nao aceita movimentacoes.';
    END IF;

    IF p_tipo = 'ENTRADA' THEN
        v_novo_saldo := v_saldo_atual + p_quantidade;
    ELSIF p_tipo = 'SAIDA' THEN
        v_novo_saldo := v_saldo_atual - p_quantidade;
    ELSE
        v_novo_saldo := p_quantidade;
    END IF;

    IF v_novo_saldo < 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O saldo resultante nao pode ser negativo.';
    END IF;

    INSERT INTO public.produto_movimentacoes (
        id, user_id, variacao_id, tipo, quantidade,
        saldo_anterior, saldo_resultante, movimentado_em, observacao
    )
    VALUES (
        p_id, v_user_id, p_variacao_id, p_tipo, p_quantidade,
        v_saldo_atual, v_novo_saldo, pg_catalog.clock_timestamp(), p_observacao
    );

    UPDATE public.produto_variacoes
    SET estoque_atual = v_novo_saldo
    WHERE id = p_variacao_id
      AND produto_id = v_produto_id
      AND user_id = v_user_id;

    RETURN pg_catalog.jsonb_build_object(
        'id', p_id,
        'variacao_id', p_variacao_id,
        'tipo', p_tipo,
        'quantidade', p_quantidade,
        'saldo', v_novo_saldo,
        'ja_aplicada', false
    );
END;
$function$;

ALTER FUNCTION public.criar_produto(uuid, text, text, text, numeric, numeric, uuid)
    OWNER TO postgres;
ALTER FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, numeric, numeric)
    OWNER TO postgres;
ALTER FUNCTION public.definir_arquivamento_produto(uuid, boolean)
    OWNER TO postgres;
ALTER FUNCTION public.definir_arquivamento_variacao_produto(uuid, boolean)
    OWNER TO postgres;
ALTER FUNCTION public.registrar_movimentacao_produto(uuid, uuid, text, integer, text)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.criar_produto(uuid, text, text, text, numeric, numeric, uuid)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, numeric, numeric)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_arquivamento_produto(uuid, boolean)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.definir_arquivamento_variacao_produto(uuid, boolean)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_movimentacao_produto(uuid, uuid, text, integer, text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.criar_produto(uuid, text, text, text, numeric, numeric, uuid)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_variacao_produto(uuid, uuid, text, text, numeric, numeric)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_arquivamento_produto(uuid, boolean)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.definir_arquivamento_variacao_produto(uuid, boolean)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_produto(uuid, uuid, text, integer, text)
    TO authenticated;

DO $postflight$
DECLARE
    v_table text;
    v_privilege text;
    v_column text;
    v_function regprocedure;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'produtos',
        'produto_variacoes',
        'produto_movimentacoes',
        'produto_imagens'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class AS c
            WHERE c.oid = to_regclass(format('public.%I', v_table))
              AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'RLS deve permanecer habilitado em public.%.', v_table;
        END IF;

        FOREACH v_privilege IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]
        LOOP
            IF has_table_privilege('anon', format('public.%I', v_table), v_privilege) THEN
                RAISE EXCEPTION 'anon possui privilegio % em public.%.', v_privilege, v_table;
            END IF;
        END LOOP;

        FOREACH v_privilege IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']
        LOOP
            IF has_table_privilege('authenticated', format('public.%I', v_table), v_privilege) THEN
                RAISE EXCEPTION 'authenticated possui privilegio efetivo % em public.%.', v_privilege, v_table;
            END IF;
        END LOOP;

        IF has_any_column_privilege('anon', format('public.%I', v_table), 'SELECT')
           OR has_any_column_privilege('anon', format('public.%I', v_table), 'INSERT')
           OR has_any_column_privilege('anon', format('public.%I', v_table), 'UPDATE')
           OR has_any_column_privilege('anon', format('public.%I', v_table), 'REFERENCES') THEN
            RAISE EXCEPTION 'anon possui privilegio efetivo por coluna em public.%.', v_table;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_class AS c
            CROSS JOIN LATERAL aclexplode(
                COALESCE(c.relacl, acldefault('r', c.relowner))
            ) AS acl
            WHERE c.oid = to_regclass(format('public.%I', v_table))
              AND acl.grantee = 0
        ) THEN
            RAISE EXCEPTION 'PUBLIC nao deve receber privilegios em public.%.', v_table;
        END IF;

        FOR v_column IN
            SELECT c.column_name
            FROM information_schema.columns AS c
            WHERE c.table_schema = 'public'
              AND c.table_name = v_table
        LOOP
            IF has_column_privilege('anon', format('public.%I', v_table), v_column, 'SELECT')
               OR has_column_privilege('anon', format('public.%I', v_table), v_column, 'INSERT')
               OR has_column_privilege('anon', format('public.%I', v_table), v_column, 'UPDATE')
               OR has_column_privilege('anon', format('public.%I', v_table), v_column, 'REFERENCES') THEN
                RAISE EXCEPTION 'anon possui privilegio por coluna em public.%.%.', v_table, v_column;
            END IF;
        END LOOP;
    END LOOP;

    FOREACH v_function IN ARRAY ARRAY[
        'public.criar_produto(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure,
        'public.criar_variacao_produto(uuid,uuid,text,text,numeric,numeric)'::regprocedure,
        'public.definir_arquivamento_produto(uuid,boolean)'::regprocedure,
        'public.definir_arquivamento_variacao_produto(uuid,boolean)'::regprocedure,
        'public.registrar_movimentacao_produto(uuid,uuid,text,integer,text)'::regprocedure
    ]
    LOOP
        IF has_function_privilege('anon', v_function, 'EXECUTE')
           OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'ACL inesperada na RPC %.', v_function;
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
            RAISE EXCEPTION 'PUBLIC possui EXECUTE na RPC %.', v_function;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
        WHERE p.oid IN (
            'public.verificar_produto_com_variacao()'::regprocedure,
            'public.criar_produto(uuid,text,text,text,numeric,numeric,uuid)'::regprocedure,
            'public.criar_variacao_produto(uuid,uuid,text,text,numeric,numeric)'::regprocedure,
            'public.definir_arquivamento_produto(uuid,boolean)'::regprocedure,
            'public.definir_arquivamento_variacao_produto(uuid,boolean)'::regprocedure,
            'public.registrar_movimentacao_produto(uuid,uuid,text,integer,text)'::regprocedure
        )
          AND (
              owner_role.rolname <> 'postgres'
              OR NOT (owner_role.rolsuper OR owner_role.rolbypassrls)
              OR NOT p.prosecdef
              OR p.proconfig IS NULL
              OR NOT (p.proconfig @> ARRAY['search_path=""']::text[])
          )
    ) THEN
        RAISE EXCEPTION 'Funcoes SECURITY DEFINER devem pertencer a postgres com BYPASSRLS e search_path vazio.';
    END IF;

    -- has_*_privilege evaluates the role's effective privileges, including
    -- privileges inherited through role membership, not just direct ACL entries.
    IF has_any_column_privilege('authenticated', 'public.produtos', 'INSERT')
       OR has_any_column_privilege('authenticated', 'public.produto_variacoes', 'INSERT')
       OR has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'INSERT')
       OR has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'UPDATE')
       OR has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'REFERENCES')
       OR has_any_column_privilege('authenticated', 'public.produtos', 'REFERENCES')
       OR has_any_column_privilege('authenticated', 'public.produto_variacoes', 'REFERENCES')
       OR has_table_privilege('authenticated', 'public.produto_movimentacoes', 'INSERT')
       OR has_table_privilege('authenticated', 'public.produto_movimentacoes', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.produto_movimentacoes', 'DELETE')
       OR has_table_privilege('authenticated', 'public.produtos', 'INSERT')
       OR has_table_privilege('authenticated', 'public.produtos', 'DELETE')
       OR has_table_privilege('authenticated', 'public.produto_variacoes', 'INSERT')
       OR has_table_privilege('authenticated', 'public.produto_variacoes', 'DELETE') THEN
        RAISE EXCEPTION 'authenticated possui privilegio efetivo de escrita direta nao autorizado em tabelas operacionais.';
    END IF;

    IF has_column_privilege('authenticated', 'public.produtos', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produtos', 'arquivado', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produtos', 'criado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produtos', 'atualizado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produtos', 'precificacao_origem_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'produto_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'estoque_atual', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'arquivado', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'criado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_variacoes', 'atualizado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_imagens', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_imagens', 'produto_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.produto_imagens', 'criado_em', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated pode alterar campos protegidos de propriedade, estoque ou auditoria.';
    END IF;
END;
$postflight$;

-- Revisao operacional antes de executar:
-- 1. A ordem esperada e migrations 003 a 005 aplicadas; 001 e 002 sao
--    especificas de Filamentos e nao sao alteradas por esta migration.
-- 2. O estoque e inteiro (unidades). ENTRADA/SAIDA recebem quantidade positiva;
--    AJUSTE recebe o saldo final desejado, inclusive zero, como em Filamentos.
-- 3. A criacao do produto e da variacao padrao ocorre na RPC criar_produto.
--    A primeira variacao identificada arquiva o padrao somente se seu saldo
--    estiver zerado; o saldo anterior e mantido quando ainda houver unidades.
-- 4. Movimentacoes bloqueiam produto e variacao por FOR UPDATE, escrevem o
--    historico imutavel e atualizam o saldo na mesma transacao. Reutilizar o
--    mesmo ID e payload retorna a operacao anterior sem reaplicar o saldo.
-- 5. Produtos arquivados preservam saldos e historicos, mas bloqueiam novas
--    variacoes e movimentacoes. Variacoes so podem ser arquivadas com saldo
--    zero; um produto ativo deve manter uma variacao ativa.
-- 6. precificacao_origem_id e validado pela RPC contra auth.uid(); os valores
--    de custo/preco do produto sao copias independentes. Excluir a precificacao
--    apenas limpa a referencia, sem alterar esses valores.
-- 7. produto_imagens armazena metadados no caminho user_id/produto_id/...;
--    bucket, politicas de storage.objects e upload ficam para etapa futura.
--    Remover metadados nao remove o objeto do Storage automaticamente.

COMMIT;
