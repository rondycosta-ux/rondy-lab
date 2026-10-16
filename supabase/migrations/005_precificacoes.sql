-- Rondy Lab: historico de precificacoes isolado por usuario autenticado.
-- Execute manualmente no SQL Editor somente depois de revisar esta migration.

BEGIN;

DO $preflight$
DECLARE
    v_user_id_type text;
BEGIN
    IF to_regclass('auth.users') IS NULL THEN
        RAISE EXCEPTION 'A tabela auth.users do Supabase Auth deve existir.';
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

    IF to_regclass('public.precificacoes') IS NOT NULL THEN
        RAISE EXCEPTION 'public.precificacoes ja existe; revise a estrutura antes de continuar.';
    END IF;

    IF to_regprocedure('public.atualizar_timestamp_precificacoes()') IS NOT NULL THEN
        RAISE EXCEPTION 'A funcao public.atualizar_timestamp_precificacoes() ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Os roles anon e authenticated esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.precificacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL
        REFERENCES auth.users (id) ON DELETE CASCADE,
    nome text NOT NULL
        CONSTRAINT precificacoes_nome_check
        CHECK (length(btrim(nome)) > 0),
    data timestamptz NOT NULL,
    quantidade numeric NOT NULL
        CONSTRAINT precificacoes_quantidade_check
        CHECK (
            quantidade > 0
            AND quantidade::text NOT IN ('NaN', 'Infinity', '-Infinity')
        ),
    tipo text NOT NULL
        CONSTRAINT precificacoes_tipo_check
        CHECK (tipo IN ('somente-custo', 'venda', 'consignacao')),
    impressora text NOT NULL,
    total_cost numeric NOT NULL
        CONSTRAINT precificacoes_total_cost_check
        CHECK (
            total_cost >= 0
            AND total_cost::text NOT IN ('NaN', 'Infinity', '-Infinity')
        ),
    unit_cost numeric NOT NULL
        CONSTRAINT precificacoes_unit_cost_check
        CHECK (
            unit_cost >= 0
            AND unit_cost::text NOT IN ('NaN', 'Infinity', '-Infinity')
        ),
    material jsonb NOT NULL
        CONSTRAINT precificacoes_material_check
        CHECK (jsonb_typeof(material) = 'array'),
    detalhes jsonb NOT NULL
        CONSTRAINT precificacoes_detalhes_check
        CHECK (jsonb_typeof(detalhes) = 'object'),
    snapshot jsonb NOT NULL
        CONSTRAINT precificacoes_snapshot_check
        CHECK (
            jsonb_typeof(snapshot) = 'object'
            AND snapshot ? 'versao'
        ),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.precificacoes IS
    'Historico imutavel de precificacoes, isolado por usuario; materiais, detalhes e snapshot preservam o registro calculado.';
COMMENT ON COLUMN public.precificacoes.user_id IS
    'UUID do proprietario em auth.users; a politica RLS impede associar registros a outro usuario.';
COMMENT ON COLUMN public.precificacoes.material IS
    'Array JSONB de materiais no formato criado pela Calculadora.';
COMMENT ON COLUMN public.precificacoes.detalhes IS
    'Objeto JSONB com os parametros comerciais da precificacao.';
COMMENT ON COLUMN public.precificacoes.snapshot IS
    'Snapshot JSONB integral dos parametros e custos usados, incluindo snapshots da versao 2.';

CREATE OR REPLACE FUNCTION public.atualizar_timestamp_precificacoes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    NEW.atualizado_em := pg_catalog.now();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_timestamp_precificacoes()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER precificacoes_atualizar_timestamp
    BEFORE UPDATE ON public.precificacoes
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_timestamp_precificacoes();

ALTER TABLE public.precificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY precificacoes_select_own
    ON public.precificacoes
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY precificacoes_insert_own
    ON public.precificacoes
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY precificacoes_delete_own
    ON public.precificacoes
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.precificacoes
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON TABLE public.precificacoes TO authenticated;
GRANT INSERT (
    user_id, nome, data, quantidade, tipo, impressora,
    total_cost, unit_cost, material, detalhes, snapshot
) ON TABLE public.precificacoes TO authenticated;

DO $privilege_check$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        WHERE c.oid = 'public.precificacoes'::regclass
          AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado em public.precificacoes.';
    END IF;

    IF has_table_privilege('anon', 'public.precificacoes', 'SELECT')
       OR has_table_privilege('anon', 'public.precificacoes', 'INSERT')
       OR has_table_privilege('anon', 'public.precificacoes', 'UPDATE')
       OR has_table_privilege('anon', 'public.precificacoes', 'DELETE') THEN
        RAISE EXCEPTION 'anon nao deve ter acesso a public.precificacoes.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS c
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS acl
        WHERE c.oid = 'public.precificacoes'::regclass
          AND acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'PUBLIC nao deve receber privilegios em public.precificacoes.';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.precificacoes', 'SELECT')
       OR NOT has_any_column_privilege('authenticated', 'public.precificacoes', 'INSERT')
       OR NOT has_table_privilege('authenticated', 'public.precificacoes', 'DELETE')
       OR has_table_privilege('authenticated', 'public.precificacoes', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.precificacoes', 'TRUNCATE') THEN
        RAISE EXCEPTION 'authenticated deve poder apenas consultar, inserir e excluir precificacoes.';
    END IF;

    IF has_column_privilege('authenticated', 'public.precificacoes', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.precificacoes', 'id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.precificacoes', 'criado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.precificacoes', 'atualizado_em', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated nao deve poder alterar precificacoes nem seus identificadores ou timestamps.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy AS p
        WHERE p.polrelid = 'public.precificacoes'::regclass
          AND p.polcmd = 'r'
          AND p.polroles @> ARRAY[
              (SELECT r.oid FROM pg_roles AS r WHERE r.rolname = 'authenticated')
          ]::oid[]
          AND p.polqual IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_policy AS p
        WHERE p.polrelid = 'public.precificacoes'::regclass
          AND p.polcmd = 'a'
          AND p.polroles @> ARRAY[
              (SELECT r.oid FROM pg_roles AS r WHERE r.rolname = 'authenticated')
          ]::oid[]
          AND p.polwithcheck IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_policy AS p
        WHERE p.polrelid = 'public.precificacoes'::regclass
          AND p.polcmd = 'd'
          AND p.polroles @> ARRAY[
              (SELECT r.oid FROM pg_roles AS r WHERE r.rolname = 'authenticated')
          ]::oid[]
          AND p.polqual IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'As politicas RLS de leitura, insercao e exclusao por proprietario devem existir.';
    END IF;
END;
$privilege_check$;

COMMIT;
