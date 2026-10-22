-- Requer migrations 003, 005 e 006, pgTAP em extensions e roles Supabase.
-- Executar o arquivo inteiro no SQL Editor de homologacao; nunca selecionar trechos.
-- Se uma falha interromper o script antes do ROLLBACK, execute ROLLBACK na mesma sessao.
-- O relatorio TAP completo e retornado no painel Results antes do ROLLBACK.
BEGIN;

SET LOCAL search_path = "$user", public, extensions;

SELECT extensions.no_plan();

SELECT extensions.ok(
    (SELECT c.relrowsecurity FROM pg_class AS c WHERE c.oid = 'public.produtos'::regclass),
    'RLS habilitado em produtos'
);
SELECT extensions.ok(
    (SELECT c.relrowsecurity FROM pg_class AS c WHERE c.oid = 'public.produto_variacoes'::regclass),
    'RLS habilitado em produto_variacoes'
);
SELECT extensions.ok(
    (SELECT c.relrowsecurity FROM pg_class AS c WHERE c.oid = 'public.produto_movimentacoes'::regclass),
    'RLS habilitado em produto_movimentacoes'
);
SELECT extensions.ok(
    (SELECT c.relrowsecurity FROM pg_class AS c WHERE c.oid = 'public.produto_imagens'::regclass),
    'RLS habilitado em produto_imagens'
);

SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.produtos', 'SELECT'),
    'authenticated pode consultar produtos'
);
SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.produto_variacoes', 'SELECT'),
    'authenticated pode consultar variacoes'
);
SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.produto_movimentacoes', 'SELECT'),
    'authenticated pode consultar movimentacoes'
);
SELECT extensions.ok(
    has_table_privilege('authenticated', 'public.produto_imagens', 'SELECT'),
    'authenticated pode consultar imagens'
);

SELECT extensions.ok(
    NOT has_table_privilege('anon', 'public.produtos', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.produtos', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.produtos', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.produtos', 'DELETE'),
    'anon nao acessa produtos'
);
SELECT extensions.ok(
    NOT has_table_privilege('anon', 'public.produto_variacoes', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.produto_variacoes', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.produto_variacoes', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.produto_variacoes', 'DELETE'),
    'anon nao acessa variacoes'
);
SELECT extensions.ok(
    NOT has_table_privilege('anon', 'public.produto_movimentacoes', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.produto_movimentacoes', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.produto_movimentacoes', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.produto_movimentacoes', 'DELETE'),
    'anon nao acessa movimentacoes'
);
SELECT extensions.ok(
    NOT has_table_privilege('anon', 'public.produto_imagens', 'SELECT')
    AND NOT has_table_privilege('anon', 'public.produto_imagens', 'INSERT')
    AND NOT has_table_privilege('anon', 'public.produto_imagens', 'UPDATE')
    AND NOT has_table_privilege('anon', 'public.produto_imagens', 'DELETE'),
    'anon nao acessa metadados de imagens'
);

SELECT extensions.ok(
    NOT EXISTS (
        SELECT 1
        FROM pg_class AS c
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS acl
        WHERE c.oid IN (
            'public.produtos'::regclass,
            'public.produto_variacoes'::regclass,
            'public.produto_movimentacoes'::regclass,
            'public.produto_imagens'::regclass
        )
          AND acl.grantee = 0
    ),
    'PUBLIC nao recebeu grants diretos nas tabelas'
);

SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.produtos', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.produtos', 'DELETE'),
    'produtos so sao criados pela RPC e nao sao excluidos diretamente'
);
SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.produto_variacoes', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.produto_variacoes', 'DELETE'),
    'variacoes so sao criadas pela RPC e nao sao excluidas diretamente'
);
SELECT extensions.ok(
    NOT has_table_privilege('authenticated', 'public.produto_movimentacoes', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.produto_movimentacoes', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.produto_movimentacoes', 'DELETE'),
    'historico de movimentacoes e imutavel para authenticated'
);

SELECT extensions.ok(
    has_column_privilege('authenticated', 'public.produtos', 'nome', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produtos', 'user_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produtos', 'arquivado', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produtos', 'precificacao_origem_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produtos', 'atualizado_em', 'UPDATE'),
    'campos de propriedade, arquivamento, origem e auditoria do produto sao protegidos'
);
SELECT extensions.ok(
    has_column_privilege('authenticated', 'public.produto_variacoes', 'cor', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_variacoes', 'user_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_variacoes', 'produto_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_variacoes', 'estoque_atual', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_variacoes', 'arquivado', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_variacoes', 'atualizado_em', 'UPDATE'),
    'propriedade, estoque, arquivamento e auditoria da variacao sao protegidos'
);
SELECT extensions.ok(
    has_column_privilege('authenticated', 'public.produto_imagens', 'storage_path', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_imagens', 'user_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_imagens', 'produto_id', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.produto_imagens', 'criado_em', 'UPDATE'),
    'propriedade e auditoria dos metadados de imagem sao protegidas'
);

SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produtos'
          AND policyname = 'produtos_select_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%'
    ),
    'politica de produtos restringe leitura ao usuario autenticado'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_variacoes'
          AND policyname = 'produto_variacoes_select_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%'
    ),
    'politica de variacoes restringe leitura ao usuario autenticado'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_movimentacoes'
          AND policyname = 'produto_movimentacoes_select_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%'
    ),
    'politica de movimentacoes restringe leitura ao usuario autenticado'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_imagens'
          AND policyname = 'produto_imagens_select_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%'
    ),
    'politica de imagens restringe leitura ao usuario autenticado'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produtos'
          AND policyname = 'produtos_update_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%' AND with_check ILIKE '%auth.uid%'
    )
    AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_variacoes'
          AND policyname = 'produto_variacoes_update_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%' AND with_check ILIKE '%auth.uid%'
    ),
    'politicas de atualizacao preservam o proprietario em produtos e variacoes'
);
SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_imagens'
          AND policyname = 'produto_imagens_insert_own' AND roles = ARRAY['authenticated']::name[]
          AND with_check ILIKE '%auth.uid%'
    )
    AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_imagens'
          AND policyname = 'produto_imagens_update_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%' AND with_check ILIKE '%auth.uid%'
    )
    AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'produto_imagens'
          AND policyname = 'produto_imagens_delete_own' AND roles = ARRAY['authenticated']::name[]
          AND qual ILIKE '%auth.uid%'
    ),
    'politicas de escrita dos metadados de imagem verificam o proprietario'
);

SELECT extensions.ok(
    has_function_privilege(
        'authenticated',
        'public.criar_produto(uuid,text,text,text,numeric,numeric,uuid)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.criar_produto(uuid,text,text,text,numeric,numeric,uuid)',
        'EXECUTE'
    ),
    'RPC de criacao so e executavel por authenticated'
);
SELECT extensions.ok(
    has_function_privilege(
        'authenticated',
        'public.criar_variacao_produto(uuid,uuid,text,text,numeric,numeric)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.criar_variacao_produto(uuid,uuid,text,text,numeric,numeric)',
        'EXECUTE'
    ),
    'RPC de variacao so e executavel por authenticated'
);
SELECT extensions.ok(
    has_function_privilege(
        'authenticated',
        'public.registrar_movimentacao_produto(uuid,uuid,text,integer,text)',
        'EXECUTE'
    )
    AND NOT has_function_privilege(
        'anon',
        'public.registrar_movimentacao_produto(uuid,uuid,text,integer,text)',
        'EXECUTE'
    ),
    'RPC de estoque so e executavel por authenticated'
);

SELECT extensions.ok(
    EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.produto_variacoes'::regclass
          AND conname = 'produto_variacoes_produto_user_fk'
          AND contype = 'f'
    )
    AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.produto_movimentacoes'::regclass
          AND conname = 'produto_movimentacoes_variacao_user_fk'
          AND contype = 'f'
    )
    AND EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.produto_imagens'::regclass
          AND conname = 'produto_imagens_variacao_produto_user_fk'
          AND contype = 'f'
    ),
    'relacionamentos incluem o proprietario para impedir referencias cruzadas'
);

SELECT extensions.ok(
    NOT has_table_privilege('authenticated', table_name, 'TRUNCATE')
    AND NOT has_table_privilege('authenticated', table_name, 'REFERENCES')
    AND NOT has_table_privilege('authenticated', table_name, 'TRIGGER'),
    'authenticated nao recebe TRUNCATE, REFERENCES ou TRIGGER, inclusive por memberships efetivas'
)
FROM unnest(ARRAY[
    'public.produtos',
    'public.produto_variacoes',
    'public.produto_movimentacoes',
    'public.produto_imagens'
]) AS tables(table_name);

SELECT extensions.ok(
    NOT has_any_column_privilege('authenticated', 'public.produtos', 'INSERT')
    AND NOT has_any_column_privilege('authenticated', 'public.produto_variacoes', 'INSERT')
    AND NOT has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'INSERT')
    AND NOT has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'UPDATE')
    AND NOT has_any_column_privilege('authenticated', 'public.produtos', 'REFERENCES')
    AND NOT has_any_column_privilege('authenticated', 'public.produto_variacoes', 'REFERENCES')
    AND NOT has_any_column_privilege('authenticated', 'public.produto_movimentacoes', 'REFERENCES'),
    'authenticated nao recebe escrita efetiva direta em produtos, variacoes ou historico'
);

SELECT set_config('rondy.test.user1', pg_catalog.gen_random_uuid()::text, true);
SELECT set_config('rondy.test.user2', pg_catalog.gen_random_uuid()::text, true);
SELECT set_config('rondy.test.precificacao2', pg_catalog.gen_random_uuid()::text, true);

INSERT INTO auth.users (id, aud, role, email)
VALUES
    (current_setting('rondy.test.user1')::uuid, 'authenticated', 'authenticated',
     current_setting('rondy.test.user1') || '@rondy.test'),
    (current_setting('rondy.test.user2')::uuid, 'authenticated', 'authenticated',
     current_setting('rondy.test.user2') || '@rondy.test');

INSERT INTO public.user_roles (user_id, role)
VALUES
    (current_setting('rondy.test.user1')::uuid, 'admin'),
    (current_setting('rondy.test.user2')::uuid, 'user');

INSERT INTO public.precificacoes (
    id, user_id, nome, data, quantidade, tipo, impressora,
    total_cost, unit_cost, material, detalhes, snapshot
)
VALUES (
    current_setting('rondy.test.precificacao2')::uuid,
    current_setting('rondy.test.user2')::uuid,
    'Fixture de integracao',
    pg_catalog.now(),
    1,
    'venda',
    'fixture',
    0,
    0,
    '[]'::jsonb,
    '{}'::jsonb,
    '{"versao":1}'::jsonb
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user1'), true);
SELECT set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
        'sub', current_setting('rondy.test.user1'),
        'role', 'authenticated'
    )::text,
    true
);
SELECT set_config(
    'rondy.test.product1',
    (
        public.criar_produto(
            pg_catalog.gen_random_uuid(),
            'Produto fixture usuario 1',
            '',
            'pronta_entrega',
            10,
            20
        )->>'produto_id'
    ),
    true
);
SELECT set_config(
    'rondy.test.variacao_padrao1',
    (
        SELECT v.id::text
        FROM public.produto_variacoes AS v
        WHERE v.produto_id = current_setting('rondy.test.product1')::uuid
          AND v.variacao_padrao
    ),
    true
);

SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user2'), true);
SELECT set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
        'sub', current_setting('rondy.test.user2'),
        'role', 'authenticated'
    )::text,
    true
);
SELECT set_config(
    'rondy.test.product2',
    (
        public.criar_produto(
            pg_catalog.gen_random_uuid(),
            'Produto fixture usuario 2',
            '',
            'sob_encomenda',
            0,
            0,
            current_setting('rondy.test.precificacao2')::uuid
        )->>'produto_id'
    ),
    true
);
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user1'), true);
SELECT set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
        'sub', current_setting('rondy.test.user1'),
        'role', 'authenticated'
    )::text,
    true
);

SELECT extensions.is(
    (SELECT count(*)::integer FROM public.produtos
     WHERE id = current_setting('rondy.test.product1')::uuid),
    1,
    'usuario 1 le o proprio produto'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.produtos
     WHERE id = current_setting('rondy.test.product2')::uuid),
    0,
    'usuario 1 nao le produto do usuario 2'
);
SELECT extensions.is(
    (SELECT role FROM public.user_roles
     WHERE user_id = current_setting('rondy.test.user1')::uuid),
    'admin',
    'perfil admin continua limitado aos proprios dados'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.user_roles
     WHERE user_id = current_setting('rondy.test.user2')::uuid),
    0,
    'perfil admin nao le o perfil de outro usuario'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.produto_variacoes
     WHERE produto_id = current_setting('rondy.test.product1')::uuid),
    1,
    'criar_produto cria a variacao padrao atomicamente'
);
SELECT extensions.ok(
    (SELECT v.variacao_padrao AND v.cor IS NULL AND v.tamanho IS NULL
     FROM public.produto_variacoes AS v
     WHERE v.id = current_setting('rondy.test.variacao_padrao1')::uuid),
    'variacao padrao e interna e nao exige cor ou tamanho'
);
SELECT extensions.is(
    (
        SELECT COALESCE(v.custo_unitario, p.custo_base)
        FROM public.produto_variacoes AS v
        JOIN public.produtos AS p
          ON p.id = v.produto_id
         AND p.user_id = v.user_id
        WHERE v.id = current_setting('rondy.test.variacao_padrao1')::uuid
    ),
    10::numeric,
    'custo NULL da variacao herda custo base do produto'
);

SELECT extensions.throws_ok(
    $$INSERT INTO public.produtos (user_id, nome, descricao, tipo_atendimento, custo_base, preco_base)
      VALUES (current_setting('rondy.test.user1')::uuid, 'Insercao direta', '', 'pronta_entrega', 0, 0)$$,
    '42501',
    NULL,
    'authenticated nao cria produtos diretamente'
);
SELECT extensions.throws_ok(
    $$UPDATE public.produto_variacoes
      SET estoque_atual = 99
      WHERE id = current_setting('rondy.test.variacao_padrao1')::uuid$$,
    '42501',
    NULL,
    'authenticated nao altera saldo diretamente'
);
SELECT extensions.throws_ok(
    $$INSERT INTO public.produto_movimentacoes
        (id, user_id, variacao_id, tipo, quantidade, saldo_anterior, saldo_resultante)
      VALUES
        (pg_catalog.gen_random_uuid(), current_setting('rondy.test.user1')::uuid,
         current_setting('rondy.test.variacao_padrao1')::uuid, 'ENTRADA', 1, 0, 1)$$,
    '42501',
    NULL,
    'authenticated nao insere historico diretamente'
);
SELECT extensions.throws_ok(
    $$UPDATE public.produto_movimentacoes SET observacao = 'alterada'$$,
    '42501',
    NULL,
    'authenticated nao altera historico diretamente'
);
SELECT extensions.throws_ok(
    $$DELETE FROM public.produto_movimentacoes$$,
    '42501',
    NULL,
    'authenticated nao exclui historico diretamente'
);
SELECT extensions.throws_ok(
    $$SELECT public.criar_variacao_produto(
        pg_catalog.gen_random_uuid(),
        current_setting('rondy.test.product2')::uuid,
        'Azul',
        NULL
    )$$,
    '42501',
    NULL,
    'RPC rejeita variacao vinculada a produto de outro usuario'
);
SELECT extensions.throws_ok(
    $$SELECT public.criar_produto(
        pg_catalog.gen_random_uuid(),
        'Produto com origem alheia',
        '',
        'pronta_entrega',
        0,
        0,
        current_setting('rondy.test.precificacao2')::uuid
    )$$,
    '42501',
    NULL,
    'RPC rejeita precificacao de outro usuario'
);
SELECT extensions.throws_ok(
    $$INSERT INTO public.produto_imagens (user_id, produto_id, storage_path)
      VALUES (
        current_setting('rondy.test.user1')::uuid,
        current_setting('rondy.test.product2')::uuid,
        current_setting('rondy.test.user1') || '/' ||
          current_setting('rondy.test.product2') || '/imagem.png'
      )$$,
    '23503',
    NULL,
    'FK composta rejeita imagem vinculada a produto de outro usuario'
);

SET LOCAL ROLE anon;
SELECT extensions.throws_ok(
    $$SELECT count(*) FROM public.produtos$$,
    '42501',
    NULL,
    'anon nao consulta produtos'
);
SELECT extensions.throws_ok(
    $$SELECT public.criar_produto(
        pg_catalog.gen_random_uuid(), 'Anonimo', '', 'pronta_entrega', 0, 0
    )$$,
    '42501',
    NULL,
    'anon nao executa RPC de criacao'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user1'), true);
SELECT set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
        'sub', current_setting('rondy.test.user1'),
        'role', 'authenticated'
    )::text,
    true
);

SELECT set_config('rondy.test.movimentacao_entrada', pg_catalog.gen_random_uuid()::text, true);
SELECT extensions.is(
    (
        public.registrar_movimentacao_produto(
            current_setting('rondy.test.movimentacao_entrada')::uuid,
            current_setting('rondy.test.variacao_padrao1')::uuid,
            'ENTRADA',
            10
        )->>'saldo'
    ),
    '10',
    'entrada atualiza saldo e retorna resultado'
);
SELECT extensions.ok(
    (
        public.registrar_movimentacao_produto(
            current_setting('rondy.test.movimentacao_entrada')::uuid,
            current_setting('rondy.test.variacao_padrao1')::uuid,
            'ENTRADA',
            10
        )->>'ja_aplicada'
    )::boolean,
    'repeticao idempotente retorna sem reaplicar entrada'
);
SELECT extensions.throws_ok(
    $$SELECT public.registrar_movimentacao_produto(
        current_setting('rondy.test.movimentacao_entrada')::uuid,
        current_setting('rondy.test.variacao_padrao1')::uuid,
        'ENTRADA',
        9
    )$$,
    '23505',
    NULL,
    'mesmo ID de movimentacao com payload diferente e rejeitado'
);
SELECT extensions.is(
    (SELECT estoque_atual::text FROM public.produto_variacoes
     WHERE id = current_setting('rondy.test.variacao_padrao1')::uuid),
    '10',
    'repeticao idempotente nao duplica saldo'
);
SELECT extensions.is(
    (
        public.registrar_movimentacao_produto(
            pg_catalog.gen_random_uuid(),
            current_setting('rondy.test.variacao_padrao1')::uuid,
            'SAIDA',
            3
        )->>'saldo'
    ),
    '7',
    'saida reduz saldo'
);
SELECT extensions.is(
    (
        public.registrar_movimentacao_produto(
            pg_catalog.gen_random_uuid(),
            current_setting('rondy.test.variacao_padrao1')::uuid,
            'AJUSTE',
            4
        )->>'saldo'
    ),
    '4',
    'ajuste define saldo absoluto'
);
SELECT extensions.throws_ok(
    $$SELECT public.registrar_movimentacao_produto(
        pg_catalog.gen_random_uuid(),
        current_setting('rondy.test.variacao_padrao1')::uuid,
        'SAIDA',
        5
    )$$,
    '22023',
    NULL,
    'saida que geraria saldo negativo e rejeitada'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.produto_movimentacoes
     WHERE variacao_id = current_setting('rondy.test.variacao_padrao1')::uuid),
    3,
    'somente as tres movimentacoes validas foram registradas'
);

SELECT set_config(
    'rondy.test.variacao_identificada1',
    (
        public.criar_variacao_produto(
            pg_catalog.gen_random_uuid(),
            current_setting('rondy.test.product1')::uuid,
            'Azul',
            'M'
        )->>'variacao_id'
    ),
    true
);
UPDATE public.produto_variacoes
SET custo_unitario = 0
WHERE id = current_setting('rondy.test.variacao_identificada1')::uuid;
SELECT extensions.is(
    (
        SELECT COALESCE(v.custo_unitario, p.custo_base)
        FROM public.produto_variacoes AS v
        JOIN public.produtos AS p
          ON p.id = v.produto_id
         AND p.user_id = v.user_id
        WHERE v.id = current_setting('rondy.test.variacao_identificada1')::uuid
    ),
    0::numeric,
    'zero explicito de variacao nao herda custo base'
);
SELECT extensions.ok(
    (SELECT NOT arquivado AND estoque_atual = 4
     FROM public.produto_variacoes
     WHERE id = current_setting('rondy.test.variacao_padrao1')::uuid),
    'variacao padrao ativa e preserva saldo ao adicionar variacao identificada'
);
SELECT extensions.throws_ok(
    $$SELECT public.definir_arquivamento_variacao_produto(
        current_setting('rondy.test.variacao_padrao1')::uuid,
        true
    )$$,
    '55000',
    NULL,
    'variacao com saldo positivo nao pode ser arquivada'
);
SELECT extensions.ok(
    (
        public.definir_arquivamento_produto(
            current_setting('rondy.test.product1')::uuid,
            true
        )->>'arquivado'
    )::boolean,
    'produto com saldo positivo pode ser arquivado'
);
SELECT extensions.is(
    (SELECT estoque_atual::text FROM public.produto_variacoes
     WHERE id = current_setting('rondy.test.variacao_padrao1')::uuid),
    '4',
    'arquivamento preserva saldo'
);
SELECT extensions.throws_ok(
    $$SELECT public.registrar_movimentacao_produto(
        pg_catalog.gen_random_uuid(),
        current_setting('rondy.test.variacao_padrao1')::uuid,
        'ENTRADA',
        1
    )$$,
    '55000',
    NULL,
    'produto arquivado nao aceita movimentacoes'
);
SELECT extensions.ok(
    (
        public.definir_arquivamento_produto(
            current_setting('rondy.test.product1')::uuid,
            false
        )->>'arquivado'
    )::boolean = false,
    'produto pode ser desarquivado'
);
SELECT extensions.is(
    (
        public.registrar_movimentacao_produto(
            pg_catalog.gen_random_uuid(),
            current_setting('rondy.test.variacao_padrao1')::uuid,
            'AJUSTE',
            0
        )->>'saldo'
    ),
    '0',
    'ajuste pode zerar saldo'
);
SELECT extensions.ok(
    (
        public.definir_arquivamento_variacao_produto(
            current_setting('rondy.test.variacao_padrao1')::uuid,
            true
        )->>'arquivado'
    )::boolean,
    'variacao sem saldo pode ser arquivada quando outra permanece ativa'
);
SELECT extensions.throws_ok(
    $$SELECT public.definir_arquivamento_variacao_produto(
        current_setting('rondy.test.variacao_identificada1')::uuid,
        true
    )$$,
    '55000',
    NULL,
    'produto ativo nao pode ficar sem variacoes ativas'
);
SELECT extensions.throws_ok(
    $$SELECT public.definir_arquivamento_variacao_produto(
        current_setting('rondy.test.variacao_padrao1')::uuid,
        false
    )$$,
    '55000',
    NULL,
    'reativacao da variacao padrao e proibida enquanto outra variacao estiver ativa'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user2'), true);
SELECT set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
        'sub', current_setting('rondy.test.user2'),
        'role', 'authenticated'
    )::text,
    true
);
SELECT extensions.is(
    (SELECT role FROM public.user_roles
     WHERE user_id = current_setting('rondy.test.user2')::uuid),
    'user',
    'perfil user consulta o proprio papel'
);
SELECT extensions.is(
    (SELECT count(*)::integer FROM public.user_roles
     WHERE user_id = current_setting('rondy.test.user1')::uuid),
    0,
    'perfil user nao le o papel admin de outro usuario'
);
SELECT set_config(
    'rondy.test.variacao_padrao2',
    (
        SELECT v.id::text
        FROM public.produto_variacoes AS v
        WHERE v.produto_id = current_setting('rondy.test.product2')::uuid
          AND v.variacao_padrao
    ),
    true
);
SELECT extensions.is(
    (
        public.registrar_movimentacao_produto(
            pg_catalog.gen_random_uuid(),
            current_setting('rondy.test.variacao_padrao2')::uuid,
            'ENTRADA',
            2
        )->>'saldo'
    ),
    '2',
    'usuario 2 movimenta somente a propria variacao'
);
SELECT extensions.ok(
    (
        public.definir_arquivamento_produto(
            current_setting('rondy.test.product2')::uuid,
            true
        )->>'arquivado'
    )::boolean,
    'usuario 2 pode arquivar seu produto'
);
SELECT extensions.throws_ok(
    $$SELECT public.registrar_movimentacao_produto(
        pg_catalog.gen_random_uuid(),
        current_setting('rondy.test.variacao_padrao2')::uuid,
        'SAIDA',
        1
    )$$,
    '55000',
    NULL,
    'produto arquivado por usuario 2 bloqueia movimentacao'
);
SELECT extensions.is(
    (SELECT estoque_atual::text FROM public.produto_variacoes
     WHERE id = current_setting('rondy.test.variacao_padrao2')::uuid),
    '2',
    'arquivamento por usuario 2 preserva estoque'
);

RESET ROLE;
DO $tap_assertions$
DECLARE
    v_failed integer := extensions.num_failed();
BEGIN
    IF v_failed > 0 THEN
        RAISE EXCEPTION 'pgTAP detectou % assercao(oes) not ok entre as 76 verificacoes.',
            v_failed;
    END IF;

    PERFORM extensions.finish(true);
END;
$tap_assertions$;

SELECT 'PASS: todas as 76 assercoes pgTAP passaram.' AS test_result;
ROLLBACK;
