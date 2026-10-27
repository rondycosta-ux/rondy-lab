-- Rondy Lab: vitrines publicas com produtos dinamicos e imagens privadas.
-- Aplicar manualmente depois das migrations 006, 007 e 008.

BEGIN;

DO $preflight$
DECLARE
    v_user_id_type text;
BEGIN
    IF to_regclass('auth.users') IS NULL
       OR to_regclass('public.produtos') IS NULL
       OR to_regclass('public.produto_variacoes') IS NULL
       OR to_regclass('public.produto_imagens') IS NULL THEN
        RAISE EXCEPTION 'As tabelas auth.users, produtos, produto_variacoes e produto_imagens devem existir.';
    END IF;

    SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
    INTO v_user_id_type
    FROM pg_catalog.pg_attribute AS a
    WHERE a.attrelid = 'auth.users'::pg_catalog.regclass
      AND a.attname = 'id'
      AND NOT a.attisdropped;

    IF v_user_id_type IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'auth.users.id deve ser uuid (encontrado: %).', COALESCE(v_user_id_type, 'coluna ausente');
    END IF;

    IF to_regclass('public.vitrines') IS NOT NULL
       OR to_regclass('public.vitrine_produtos') IS NOT NULL
       OR to_regprocedure('public.consultar_vitrine_publica(text)') IS NOT NULL THEN
        RAISE EXCEPTION 'A estrutura de vitrines ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        RAISE EXCEPTION 'Os roles postgres, anon e authenticated esperados pelo Supabase devem existir.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'postgres' AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION 'O role postgres deve ser SUPERUSER ou BYPASSRLS para a RPC publica.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'produto-imagens' AND public = false) THEN
        RAISE EXCEPTION 'O bucket privado produto-imagens da migration 008 deve existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.vitrines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    nome text NOT NULL CONSTRAINT vitrines_nome_check CHECK (length(btrim(nome)) BETWEEN 1 AND 200),
    descricao text NOT NULL DEFAULT '' CONSTRAINT vitrines_descricao_check CHECK (length(descricao) <= 2000),
    cliente_nome text NOT NULL CONSTRAINT vitrines_cliente_nome_check CHECK (length(btrim(cliente_nome)) BETWEEN 1 AND 200),
    slug text NOT NULL CONSTRAINT vitrines_slug_check CHECK (
        slug = lower(btrim(slug))
        AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        AND length(slug) BETWEEN 3 AND 120
    ),
    ativa boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT vitrines_slug_key UNIQUE (slug),
    CONSTRAINT vitrines_id_user_id_key UNIQUE (id, user_id)
);

CREATE TABLE public.vitrine_produtos (
    vitrine_id uuid NOT NULL REFERENCES public.vitrines (id) ON DELETE CASCADE,
    produto_id uuid NOT NULL REFERENCES public.produtos (id) ON DELETE RESTRICT,
    ordem integer NOT NULL CONSTRAINT vitrine_produtos_ordem_check CHECK (ordem >= 0),
    PRIMARY KEY (vitrine_id, produto_id),
    CONSTRAINT vitrine_produtos_ordem_unique UNIQUE (vitrine_id, ordem)
);

CREATE INDEX vitrines_user_ativa_criada_idx
    ON public.vitrines (user_id, ativa, criado_em DESC);
CREATE INDEX vitrine_produtos_produto_idx ON public.vitrine_produtos (produto_id);

COMMENT ON TABLE public.vitrines IS
    'Paginas publicas personalizadas; dados dos produtos permanecem na origem e sao resolvidos dinamicamente.';
COMMENT ON TABLE public.vitrine_produtos IS
    'Produtos selecionados para uma vitrine. A ordem e local a cada vitrine e nao duplica dados comerciais.';
COMMENT ON COLUMN public.vitrines.slug IS
    'Identificador publico unico usado na rota /v/<slug>.';

CREATE TRIGGER vitrines_atualizar_timestamp
    BEFORE UPDATE ON public.vitrines
    FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp_produtos();

ALTER TABLE public.vitrines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitrine_produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY vitrines_select_own ON public.vitrines
    FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
CREATE POLICY vitrines_insert_own ON public.vitrines
    FOR INSERT TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY vitrines_update_own ON public.vitrines
    FOR UPDATE TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY vitrines_delete_own ON public.vitrines
    FOR DELETE TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY vitrine_produtos_select_own ON public.vitrine_produtos
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.vitrines AS v
        WHERE v.id = vitrine_produtos.vitrine_id
          AND v.user_id = (SELECT auth.uid())
    ));
CREATE POLICY vitrine_produtos_insert_own ON public.vitrine_produtos
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vitrines AS v
            WHERE v.id = vitrine_produtos.vitrine_id
              AND v.user_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.produtos AS p
            WHERE p.id = vitrine_produtos.produto_id
              AND p.user_id = (SELECT auth.uid())
        )
    );
CREATE POLICY vitrine_produtos_update_own ON public.vitrine_produtos
    FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.vitrines AS v
        WHERE v.id = vitrine_produtos.vitrine_id
          AND v.user_id = (SELECT auth.uid())
    ))
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.vitrines AS v
            WHERE v.id = vitrine_produtos.vitrine_id
              AND v.user_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.produtos AS p
            WHERE p.id = vitrine_produtos.produto_id
              AND p.user_id = (SELECT auth.uid())
        )
    );
CREATE POLICY vitrine_produtos_delete_own ON public.vitrine_produtos
    FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.vitrines AS v
        WHERE v.id = vitrine_produtos.vitrine_id
          AND v.user_id = (SELECT auth.uid())
    ));

REVOKE ALL ON TABLE public.vitrines, public.vitrine_produtos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vitrines, public.vitrine_produtos TO authenticated;

CREATE OR REPLACE FUNCTION public.consultar_vitrine_publica(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_result jsonb;
    v_slug text;
BEGIN
    v_slug := lower(btrim(p_slug));
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 3 AND 120 THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'slug', v.slug,
        'nome', v.nome,
        'descricao', v.descricao,
        'produtos', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'nome', p.nome,
                    'descricao', p.descricao,
                    'preco', COALESCE(pv.preco_unitario, p.preco_base),
                    'imagem_bucket_id', i.bucket_id,
                    'imagem_storage_path', i.storage_path
                ) ORDER BY vp.ordem
            ) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
        )
    )
    INTO v_result
    FROM public.vitrines AS v
    LEFT JOIN public.vitrine_produtos AS vp ON vp.vitrine_id = v.id
    LEFT JOIN public.produtos AS p ON p.id = vp.produto_id AND NOT p.arquivado
    LEFT JOIN public.produto_variacoes AS pv
        ON pv.produto_id = p.id AND pv.variacao_padrao
    LEFT JOIN public.produto_imagens AS i
        ON i.produto_id = p.id AND i.capa AND i.variacao_id IS NULL
    WHERE v.slug = v_slug AND v.ativa
    GROUP BY v.id, v.slug, v.nome, v.descricao;

    RETURN v_result;
END;
$function$;

ALTER FUNCTION public.consultar_vitrine_publica(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consultar_vitrine_publica(text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.consultar_vitrine_publica(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.imagem_vitrine_publica_disponivel(
    p_bucket_id text,
    p_storage_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.produto_imagens AS i
        JOIN public.produtos AS p ON p.id = i.produto_id
        JOIN public.vitrine_produtos AS vp ON vp.produto_id = p.id
        JOIN public.vitrines AS v ON v.id = vp.vitrine_id
        WHERE i.bucket_id = p_bucket_id
          AND i.storage_path = p_storage_path
          AND i.capa
          AND i.variacao_id IS NULL
          AND NOT p.arquivado
          AND v.ativa
    );
$function$;

ALTER FUNCTION public.imagem_vitrine_publica_disponivel(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.imagem_vitrine_publica_disponivel(text, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.imagem_vitrine_publica_disponivel(text, text) TO anon, authenticated;

-- O bucket continua privado. Esta politica permite ao cliente anonimo solicitar uma
-- URL assinada somente para a imagem de capa de um produto visivel em alguma vitrine ativa.
CREATE POLICY produto_imagens_storage_select_vitrine_publica ON storage.objects
    FOR SELECT TO anon
    USING (
        bucket_id = 'produto-imagens'
        AND name ~ '^[^/]+/[^/]+/[^/]+$'
        AND position('..' IN name) = 0
        AND public.imagem_vitrine_publica_disponivel(bucket_id, name)
    );

DO $postflight$
DECLARE
    v_function regprocedure := 'public.consultar_vitrine_publica(text)'::regprocedure;
    v_image_function regprocedure := 'public.imagem_vitrine_publica_disponivel(text,text)'::regprocedure;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vitrines'::regclass)
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vitrine_produtos'::regclass) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado nas tabelas de vitrines.';
    END IF;

    IF has_table_privilege('anon', 'public.vitrines', 'SELECT')
       OR has_table_privilege('anon', 'public.vitrine_produtos', 'SELECT')
       OR has_table_privilege('anon', 'public.vitrines', 'INSERT')
       OR has_table_privilege('anon', 'public.vitrine_produtos', 'INSERT') THEN
        RAISE EXCEPTION 'anon nao deve acessar diretamente as tabelas de vitrines.';
    END IF;

    IF NOT has_function_privilege('anon', v_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'A RPC publica deve ser executavel por anon e authenticated.';
    END IF;
    IF NOT has_function_privilege('anon', v_image_function, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_image_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'A verificacao de imagem publica deve ser executavel por anon e authenticated.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc AS p
        JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid IN (v_function, v_image_function)
          AND (r.rolname <> 'postgres' OR NOT (r.rolsuper OR r.rolbypassrls)
               OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))
    ) THEN
        RAISE EXCEPTION 'A RPC publica deve pertencer a postgres e usar search_path vazio.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'storage.objects'::regclass
          AND polname = 'produto_imagens_storage_select_vitrine_publica'
          AND polcmd = 'r'
    ) THEN
        RAISE EXCEPTION 'A politica de imagens assinadas para vitrines esta ausente.';
    END IF;
END;
$postflight$;

COMMIT;
