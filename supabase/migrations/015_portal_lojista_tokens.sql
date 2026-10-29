-- Tokens de acesso publico e revogavel ao portal de cada estabelecimento.
-- Aplicar manualmente depois das migrations 012, 013 e 014.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.estabelecimentos') IS NULL
       OR to_regclass('public.user_roles') IS NULL THEN
        RAISE EXCEPTION 'A migration 012 de estabelecimentos deve estar aplicada.';
    END IF;

    IF to_regclass('public.portal_estabelecimento_tokens') IS NOT NULL
       OR to_regprocedure('public.substituir_token_portal_estabelecimento(uuid,uuid,text,timestamptz)') IS NOT NULL
       OR to_regprocedure('public.revogar_token_portal_estabelecimento(uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'A estrutura de tokens do portal ja existe; revise antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        RAISE EXCEPTION 'Os roles postgres, anon, authenticated e service_role esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.portal_estabelecimento_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    estabelecimento_id uuid NOT NULL REFERENCES public.estabelecimentos(id) ON DELETE CASCADE,
    token_hash text NOT NULL CONSTRAINT portal_estabelecimento_tokens_hash_check CHECK (
        token_hash ~ '^[0-9a-f]{64}$'
    ),
    ativo boolean NOT NULL DEFAULT true,
    criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    criado_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    expira_em timestamptz NULL,
    revogado_em timestamptz NULL,
    revogado_por uuid NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    ultimo_acesso_em timestamptz NULL,
    CONSTRAINT portal_estabelecimento_tokens_expiracao_check CHECK (
        expira_em IS NULL OR expira_em > criado_em
    ),
    CONSTRAINT portal_estabelecimento_tokens_revogacao_check CHECK (
        (ativo AND revogado_em IS NULL AND revogado_por IS NULL)
        OR (NOT ativo AND revogado_em IS NOT NULL AND revogado_por IS NOT NULL)
    ),
    CONSTRAINT portal_estabelecimento_tokens_hash_key UNIQUE (token_hash)
);

-- Mantem o historico de tokens revogados, mas impede mais de um acesso ativo por loja.
CREATE UNIQUE INDEX portal_estabelecimento_tokens_um_ativo_por_estabelecimento_idx
    ON public.portal_estabelecimento_tokens (estabelecimento_id)
    WHERE ativo;
CREATE INDEX portal_estabelecimento_tokens_ativos_expiracao_idx
    ON public.portal_estabelecimento_tokens (expira_em)
    WHERE ativo AND expira_em IS NOT NULL;

COMMENT ON TABLE public.portal_estabelecimento_tokens IS
    'Somente hashes SHA-256 de tokens bearer do portal. O token puro e gerado e exibido uma unica vez pela Edge Function administrativa.';
COMMENT ON COLUMN public.portal_estabelecimento_tokens.token_hash IS
    'SHA-256 em hexadecimal minusculo do token bruto. Nunca armazena nem devolve o token bruto.';

ALTER TABLE public.portal_estabelecimento_tokens ENABLE ROW LEVEL SECURITY;

-- As policies deixam explicita a propriedade administrativa. A tabela nao recebe
-- privileges diretos para authenticated: gestao ocorre somente pelas RPCs abaixo.
CREATE POLICY portal_estabelecimento_tokens_admin_proprio
    ON public.portal_estabelecimento_tokens
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.estabelecimentos AS e
            JOIN public.user_roles AS r
              ON r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
            WHERE e.id = estabelecimento_id
              AND e.user_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        criado_por = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.estabelecimentos AS e
            JOIN public.user_roles AS r
              ON r.user_id = (SELECT auth.uid()) AND r.role = 'admin'
            WHERE e.id = estabelecimento_id
              AND e.user_id = (SELECT auth.uid())
        )
    );

REVOKE ALL ON TABLE public.portal_estabelecimento_tokens FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.substituir_token_portal_estabelecimento(
    p_admin_user_id uuid,
    p_estabelecimento_id uuid,
    p_token_hash text,
    p_expira_em timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_token_id uuid;
BEGIN
    -- Esta RPC e exclusiva para service_role. A Edge Function administrativa
    -- valida a sessao do administrador e fornece seu id como dado auditavel.
    IF p_admin_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Administrador obrigatorio.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles AS r
        WHERE r.user_id = p_admin_user_id AND r.role = 'admin'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.';
    END IF;
    IF p_estabelecimento_id IS NULL
       OR p_token_hash IS NULL
       OR p_token_hash !~ '^[0-9a-f]{64}$'
       OR (p_expira_em IS NOT NULL AND p_expira_em <= clock_timestamp()) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Dados do token do portal invalidos.';
    END IF;

    -- O lock da loja torna a revogacao do token anterior e a criacao do novo atomicas.
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
    SET ativo = false,
        revogado_em = clock_timestamp(),
        revogado_por = p_admin_user_id
    WHERE estabelecimento_id = p_estabelecimento_id
      AND ativo;

    INSERT INTO public.portal_estabelecimento_tokens (
        estabelecimento_id, token_hash, criado_por, expira_em
    ) VALUES (
        p_estabelecimento_id, p_token_hash, p_admin_user_id, p_expira_em
    )
    RETURNING id INTO v_token_id;

    RETURN jsonb_build_object(
        'token_id', v_token_id,
        'estabelecimento_id', p_estabelecimento_id,
        'expira_em', p_expira_em
    );
END;
$function$;

CREATE FUNCTION public.revogar_token_portal_estabelecimento(
    p_admin_user_id uuid,
    p_estabelecimento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_revogado integer;
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
    SET ativo = false,
        revogado_em = clock_timestamp(),
        revogado_por = p_admin_user_id
    WHERE estabelecimento_id = p_estabelecimento_id
      AND ativo;
    GET DIAGNOSTICS v_revogado = ROW_COUNT;

    RETURN jsonb_build_object(
        'estabelecimento_id', p_estabelecimento_id,
        'revogado', v_revogado = 1
    );
END;
$function$;

ALTER FUNCTION public.substituir_token_portal_estabelecimento(uuid, uuid, text, timestamptz) OWNER TO postgres;
ALTER FUNCTION public.revogar_token_portal_estabelecimento(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.substituir_token_portal_estabelecimento(uuid, uuid, text, timestamptz),
    public.revogar_token_portal_estabelecimento(uuid, uuid)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.substituir_token_portal_estabelecimento(uuid, uuid, text, timestamptz),
    public.revogar_token_portal_estabelecimento(uuid, uuid)
    TO service_role;

DO $postflight$
DECLARE
    v_substituir_function regprocedure := 'public.substituir_token_portal_estabelecimento(uuid,uuid,text,timestamptz)'::regprocedure;
    v_revogar_function regprocedure := 'public.revogar_token_portal_estabelecimento(uuid,uuid)'::regprocedure;
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

    IF NOT has_function_privilege('service_role', v_substituir_function, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_revogar_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_substituir_function, 'EXECUTE')
       OR has_function_privilege('authenticated', v_revogar_function, 'EXECUTE')
       OR has_function_privilege('anon', v_substituir_function, 'EXECUTE')
       OR has_function_privilege('anon', v_revogar_function, 'EXECUTE') THEN
        RAISE EXCEPTION 'As RPCs administrativas de token devem ser exclusivas para service_role.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_proc AS p
        JOIN pg_roles AS r ON r.oid = p.proowner
        WHERE p.oid IN (v_substituir_function, v_revogar_function)
          AND (r.rolname <> 'postgres' OR NOT (r.rolsuper OR r.rolbypassrls)
               OR NOT (p.proconfig @> ARRAY['search_path=""']::text[]))
    ) THEN
        RAISE EXCEPTION 'As RPCs administrativas de token devem pertencer a postgres e usar search_path vazio.';
    END IF;
END;
$postflight$;

COMMIT;
