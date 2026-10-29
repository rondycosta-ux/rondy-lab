-- Pausa reversivel dos links do portal, sem alterar ou expor o token.
-- Aplicar manualmente depois da migration 015.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.portal_estabelecimento_tokens') IS NULL
       OR to_regclass('public.estabelecimentos') IS NULL
       OR to_regclass('public.user_roles') IS NULL
       OR to_regprocedure('public.substituir_token_portal_estabelecimento(uuid,uuid,text,timestamptz)') IS NULL
       OR to_regprocedure('public.revogar_token_portal_estabelecimento(uuid,uuid)') IS NULL THEN
        RAISE EXCEPTION 'A migration 015 de tokens do portal deve estar aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'portal_estabelecimento_tokens'
          AND column_name IN ('pausado_em', 'pausado_por')
    )
       OR to_regprocedure('public.pausar_token_portal_estabelecimento(uuid,uuid)') IS NOT NULL
       OR to_regprocedure('public.reativar_token_portal_estabelecimento(uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'A estrutura de pausa do portal ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE EXCEPTION 'Os roles postgres, anon, authenticated e service_role esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

ALTER TABLE public.portal_estabelecimento_tokens
    ADD COLUMN pausado_em timestamptz NULL,
    ADD COLUMN pausado_por uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.portal_estabelecimento_tokens
    DROP CONSTRAINT portal_estabelecimento_tokens_revogacao_check,
    ADD CONSTRAINT portal_estabelecimento_tokens_estado_check CHECK (
        ((ativo AND revogado_em IS NULL AND revogado_por IS NULL)
         OR (NOT ativo AND revogado_em IS NOT NULL AND revogado_por IS NOT NULL))
        AND ((pausado_em IS NULL AND pausado_por IS NULL)
             OR (pausado_em IS NOT NULL AND pausado_por IS NOT NULL))
    );

-- A chave service_role fica somente nas Edge Functions. Estes grants permitem
-- consultar status e registrar o ultimo acesso sem liberar a tabela ao cliente.
GRANT SELECT, UPDATE (ultimo_acesso_em)
    ON TABLE public.portal_estabelecimento_tokens TO service_role;

COMMENT ON COLUMN public.portal_estabelecimento_tokens.pausado_em IS
    'Quando preenchido, bloqueia temporariamente o acesso sem revogar nem trocar o token.';

CREATE FUNCTION public.pausar_token_portal_estabelecimento(
    p_admin_user_id uuid,
    p_estabelecimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_pausado integer;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Administrador obrigatorio.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = p_admin_user_id AND r.role = 'admin'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_estabelecimento_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estabelecimento obrigatorio.';
    END IF;

    PERFORM 1
    FROM public.estabelecimentos AS e
    WHERE e.id = p_estabelecimento_id
      AND e.user_id = p_admin_user_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento indisponivel.';
    END IF;

    UPDATE public.portal_estabelecimento_tokens
    SET pausado_em = clock_timestamp(),
        pausado_por = p_admin_user_id
    WHERE estabelecimento_id = p_estabelecimento_id
      AND ativo
      AND pausado_em IS NULL;
    GET DIAGNOSTICS v_pausado = ROW_COUNT;

    RETURN jsonb_build_object(
        'estabelecimento_id', p_estabelecimento_id,
        'pausado', v_pausado = 1
    );
END;
$function$;

CREATE FUNCTION public.reativar_token_portal_estabelecimento(
    p_admin_user_id uuid,
    p_estabelecimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_reativado integer;
BEGIN
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Administrador obrigatorio.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = p_admin_user_id AND r.role = 'admin'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_estabelecimento_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Estabelecimento obrigatorio.';
    END IF;

    PERFORM 1
    FROM public.estabelecimentos AS e
    WHERE e.id = p_estabelecimento_id
      AND e.user_id = p_admin_user_id
      AND e.ativo
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento indisponivel.';
    END IF;

    UPDATE public.portal_estabelecimento_tokens
    SET pausado_em = NULL,
        pausado_por = NULL
    WHERE estabelecimento_id = p_estabelecimento_id
      AND ativo
      AND pausado_em IS NOT NULL;
    GET DIAGNOSTICS v_reativado = ROW_COUNT;

    RETURN jsonb_build_object(
        'estabelecimento_id', p_estabelecimento_id,
        'reativado', v_reativado = 1
    );
END;
$function$;

ALTER FUNCTION public.pausar_token_portal_estabelecimento(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.reativar_token_portal_estabelecimento(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pausar_token_portal_estabelecimento(uuid, uuid),
    public.reativar_token_portal_estabelecimento(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pausar_token_portal_estabelecimento(uuid, uuid),
    public.reativar_token_portal_estabelecimento(uuid, uuid)
    TO service_role;

DO $postflight$
DECLARE
    v_pausar_function regprocedure := 'public.pausar_token_portal_estabelecimento(uuid,uuid)'::regprocedure;
    v_reativar_function regprocedure := 'public.reativar_token_portal_estabelecimento(uuid,uuid)'::regprocedure;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.portal_estabelecimento_tokens'::regclass) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado na tabela de tokens do portal.';
    END IF;

    IF has_table_privilege('anon', 'public.portal_estabelecimento_tokens', 'SELECT')
       OR has_table_privilege('anon', 'public.portal_estabelecimento_tokens', 'INSERT')
       OR has_table_privilege('anon', 'public.portal_estabelecimento_tokens', 'UPDATE')
       OR has_table_privilege('anon', 'public.portal_estabelecimento_tokens', 'DELETE')
       OR has_table_privilege('authenticated', 'public.portal_estabelecimento_tokens', 'SELECT')
       OR has_table_privilege('authenticated', 'public.portal_estabelecimento_tokens', 'INSERT')
       OR has_table_privilege('authenticated', 'public.portal_estabelecimento_tokens', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.portal_estabelecimento_tokens', 'DELETE') THEN
        RAISE EXCEPTION 'Tokens do portal nao podem ter acesso direto por API.';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.portal_estabelecimento_tokens', 'SELECT')
       OR NOT has_column_privilege('service_role', 'public.portal_estabelecimento_tokens', 'ultimo_acesso_em', 'UPDATE') THEN
        RAISE EXCEPTION 'service_role deve poder consultar status e registrar o ultimo acesso do token.';
    END IF;

    IF NOT has_function_privilege('service_role', v_pausar_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_reativar_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_pausar_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_reativar_function, 'EXECUTE')
       OR has_function_privilege('anon', v_pausar_function, 'EXECUTE')
       OR has_function_privilege('anon', v_reativar_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'As RPCs de pausa devem ser exclusivas para service_role.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid IN (v_pausar_function, v_reativar_function)
          AND (r.rolname <> 'postgres' OR NOT (r.rolsuper OR r.rolbypassrls)
               OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))
    ) THEN
        RAISE EXCEPTION 'As RPCs de pausa devem pertencer a postgres e usar search_path vazio.';
    END IF;
END;
$postflight$;

COMMIT;
