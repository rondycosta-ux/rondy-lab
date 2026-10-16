-- Rondy Lab: configuracoes gerais e impressoras por usuario autenticado.
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

    IF to_regclass('public.configuracoes_usuario') IS NOT NULL
       OR to_regclass('public.impressoras') IS NOT NULL THEN
        RAISE EXCEPTION 'Uma ou mais tabelas da migration 004 ja existem; revise a estrutura antes de continuar.';
    END IF;

    IF to_regprocedure('public.atualizar_timestamp_configuracoes_impressoras()') IS NOT NULL THEN
        RAISE EXCEPTION 'A funcao public.atualizar_timestamp_configuracoes_impressoras() ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Os roles anon e authenticated esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.configuracoes_usuario (
    user_id uuid PRIMARY KEY
        REFERENCES auth.users (id) ON DELETE CASCADE,
    tarifa_energia numeric(12, 4)
        CONSTRAINT configuracoes_usuario_tarifa_energia_check
        CHECK (tarifa_energia IS NULL OR tarifa_energia >= 0),
    perda_padrao numeric(5, 2)
        CONSTRAINT configuracoes_usuario_perda_padrao_check
        CHECK (perda_padrao IS NULL OR perda_padrao BETWEEN 0 AND 100),
    mao_obra_padrao numeric(12, 2)
        CONSTRAINT configuracoes_usuario_mao_obra_check
        CHECK (mao_obra_padrao IS NULL OR mao_obra_padrao >= 0),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.impressoras (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL
        REFERENCES auth.users (id) ON DELETE CASCADE,
    nome text NOT NULL
        CONSTRAINT impressoras_nome_check
        CHECK (length(btrim(nome)) >= 2),
    valor_pago numeric(12, 2) NOT NULL
        CONSTRAINT impressoras_valor_pago_check
        CHECK (valor_pago > 0),
    vida_util_horas numeric(12, 2) NOT NULL
        CONSTRAINT impressoras_vida_util_check
        CHECK (vida_util_horas > 0),
    consumo_watts numeric(12, 2) NOT NULL
        CONSTRAINT impressoras_consumo_check
        CHECK (consumo_watts > 0),
    manutencao_hora numeric(12, 2) NOT NULL
        CONSTRAINT impressoras_manutencao_check
        CHECK (manutencao_hora >= 0),
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.configuracoes_usuario IS
    'Parametros gerais de custos opcionais, isolados por usuario autenticado.';
COMMENT ON COLUMN public.configuracoes_usuario.user_id IS
    'UUID do proprietario em auth.users; cada usuario possui no maximo uma linha.';
COMMENT ON TABLE public.impressoras IS
    'Impressoras e parametros de custo pertencentes a cada usuario autenticado.';
COMMENT ON COLUMN public.impressoras.user_id IS
    'UUID do proprietario em auth.users; nao pode ser alterado pelo cliente.';

CREATE OR REPLACE FUNCTION public.atualizar_timestamp_configuracoes_impressoras()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    NEW.atualizado_em := pg_catalog.now();
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.atualizar_timestamp_configuracoes_impressoras()
    FROM PUBLIC, anon, authenticated;

CREATE TRIGGER configuracoes_usuario_atualizar_timestamp
    BEFORE UPDATE ON public.configuracoes_usuario
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_timestamp_configuracoes_impressoras();

CREATE TRIGGER impressoras_atualizar_timestamp
    BEFORE UPDATE ON public.impressoras
    FOR EACH ROW
    EXECUTE FUNCTION public.atualizar_timestamp_configuracoes_impressoras();

ALTER TABLE public.configuracoes_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impressoras ENABLE ROW LEVEL SECURITY;

CREATE POLICY configuracoes_usuario_select_own
    ON public.configuracoes_usuario
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY configuracoes_usuario_insert_own
    ON public.configuracoes_usuario
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY configuracoes_usuario_update_own
    ON public.configuracoes_usuario
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY configuracoes_usuario_delete_own
    ON public.configuracoes_usuario
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY impressoras_select_own
    ON public.impressoras
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE POLICY impressoras_insert_own
    ON public.impressoras
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY impressoras_update_own
    ON public.impressoras
    FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY impressoras_delete_own
    ON public.impressoras
    FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.configuracoes_usuario
    FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.impressoras
    FROM PUBLIC, anon, authenticated;

GRANT SELECT, DELETE ON TABLE public.configuracoes_usuario, public.impressoras
    TO authenticated;
GRANT INSERT (user_id, tarifa_energia, perda_padrao, mao_obra_padrao)
    ON TABLE public.configuracoes_usuario TO authenticated;
GRANT UPDATE (tarifa_energia, perda_padrao, mao_obra_padrao)
    ON TABLE public.configuracoes_usuario TO authenticated;
GRANT INSERT (user_id, nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora)
    ON TABLE public.impressoras TO authenticated;
GRANT UPDATE (nome, valor_pago, vida_util_horas, consumo_watts, manutencao_hora)
    ON TABLE public.impressoras TO authenticated;

DO $privilege_check$
DECLARE
    v_table text;
    v_command "char";
BEGIN
    FOREACH v_table IN ARRAY ARRAY['configuracoes_usuario', 'impressoras']
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class AS c
            WHERE c.oid = to_regclass(format('public.%I', v_table))
              AND c.relrowsecurity
        ) THEN
            RAISE EXCEPTION 'RLS deve permanecer habilitado em public.%.', v_table;
        END IF;

        IF has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
           OR has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
           OR has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
           OR has_table_privilege('anon', format('public.%I', v_table), 'DELETE') THEN
            RAISE EXCEPTION 'anon nao deve ter acesso a public.%.', v_table;
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

        FOREACH v_command IN ARRAY ARRAY['r'::"char", 'a'::"char", 'w'::"char", 'd'::"char"]
        LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM pg_policy AS p
                WHERE p.polrelid = to_regclass(format('public.%I', v_table))
                  AND p.polcmd = v_command
                  AND p.polroles @> ARRAY[
                      (SELECT r.oid FROM pg_roles AS r WHERE r.rolname = 'authenticated')
                  ]::oid[]
                  AND (p.polqual IS NOT NULL OR p.polwithcheck IS NOT NULL)
            ) THEN
                RAISE EXCEPTION 'Politica RLS propria para comando % ausente em public.%.',
                    v_command, v_table;
            END IF;
        END LOOP;
    END LOOP;

    IF has_column_privilege('authenticated', 'public.configuracoes_usuario', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.configuracoes_usuario', 'criado_em', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.impressoras', 'user_id', 'UPDATE')
       OR has_column_privilege('authenticated', 'public.impressoras', 'criado_em', 'UPDATE') THEN
        RAISE EXCEPTION 'authenticated nao deve poder alterar proprietario ou timestamp de criacao.';
    END IF;
END;
$privilege_check$;

COMMIT;
