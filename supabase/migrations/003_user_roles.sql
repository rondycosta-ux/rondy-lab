-- Rondy Lab: perfis de acesso vinculados ao UUID do Supabase Auth.
-- Execute manualmente no SQL Editor; esta migration nao atribui nenhum papel.

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

    IF to_regclass('public.user_roles') IS NOT NULL THEN
        RAISE EXCEPTION 'public.user_roles ja existe; revise a estrutura antes de continuar.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
       OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        RAISE EXCEPTION 'Os roles anon e authenticated esperados pelo Supabase devem existir.';
    END IF;
END;
$preflight$;

CREATE TABLE public.user_roles (
    user_id uuid PRIMARY KEY
        REFERENCES auth.users (id) ON DELETE CASCADE,
    role text NOT NULL
        CONSTRAINT user_roles_role_check CHECK (role IN ('admin', 'user')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_roles IS
    'Papel de cada conta Supabase Auth. A atribuicao inicial e feita manualmente pelo proprietario do projeto.';
COMMENT ON COLUMN public.user_roles.user_id IS
    'UUID da conta em auth.users; nao utilizar email como identificador.';
COMMENT ON COLUMN public.user_roles.role IS
    'Papel de acesso: admin ou user. Contas autenticadas nao podem inserir nem alterar papeis.';

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_roles_select_own
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

DO $privilege_check$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        WHERE c.oid = 'public.user_roles'::regclass
          AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'RLS deve permanecer habilitado em public.user_roles.';
    END IF;

    IF has_table_privilege('anon', 'public.user_roles', 'SELECT')
       OR has_table_privilege('anon', 'public.user_roles', 'INSERT')
       OR has_table_privilege('anon', 'public.user_roles', 'UPDATE')
       OR has_table_privilege('anon', 'public.user_roles', 'DELETE') THEN
        RAISE EXCEPTION 'anon nao deve ter acesso a public.user_roles.';
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
       OR has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
       OR has_table_privilege('authenticated', 'public.user_roles', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.user_roles', 'DELETE')
       OR has_table_privilege('authenticated', 'public.user_roles', 'TRUNCATE') THEN
        RAISE EXCEPTION 'authenticated deve poder apenas consultar public.user_roles.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_class AS c
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS acl
        WHERE c.oid = 'public.user_roles'::regclass
          AND acl.grantee = 0
    ) THEN
        RAISE EXCEPTION 'PUBLIC nao deve receber privilegios em public.user_roles.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy AS p
        WHERE p.polrelid = 'public.user_roles'::regclass
          AND p.polcmd = 'r'
          AND p.polroles @> ARRAY[
              (SELECT r.oid FROM pg_roles AS r WHERE r.rolname = 'authenticated')
          ]::oid[]
          AND p.polqual IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'A politica de leitura propria para authenticated esta ausente.';
    END IF;
END;
$privilege_check$;

COMMIT;
