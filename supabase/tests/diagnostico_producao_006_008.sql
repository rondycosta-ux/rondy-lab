-- Diagnóstico somente leitura para as migrations 006, 007 e 008.
-- Execute no SQL Editor do projeto de produção, sem incluir as migrations.
-- A existência de objetos de 006 pode indicar aplicação anterior: não reaplique cegamente.
WITH
colunas_esperadas(esquema, tabela, coluna) AS (VALUES
    ('auth', 'users', 'id'),
    ('public', 'precificacoes', 'id'),
    ('public', 'precificacoes', 'user_id')
),
objetos(nome) AS (VALUES
    ('produtos'), ('produto_variacoes'), ('produto_movimentacoes'), ('produto_imagens'),
    ('produtos_user_arquivado_criado_idx'), ('produto_variacoes_combinacao_unique'),
    ('produto_variacoes_padrao_unique'), ('produto_variacoes_user_produto_idx'),
    ('produto_movimentacoes_user_variacao_data_idx'), ('produto_imagens_user_produto_posicao_idx'),
    ('produto_imagens_variacao_unique'), ('produto_imagens_capa_unique'), ('produto_imagens_slot_unique')
),
funcoes(nome) AS (VALUES
    ('atualizar_timestamp_produtos'), ('verificar_produto_com_variacao'), ('criar_produto'),
    ('criar_variacao_produto'), ('definir_arquivamento_produto'),
    ('definir_arquivamento_variacao_produto'), ('registrar_movimentacao_produto'),
    ('limitar_imagens_produto')
),
resultado(secao, item, resultado) AS (
    SELECT '01 colunas', e.esquema || '.' || e.tabela || '.' || e.coluna,
           CASE WHEN a.attname IS NULL THEN 'AUSENTE'
                ELSE pg_catalog.format_type(a.atttypid, a.atttypmod) ||
                     CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE ' NULL permitido' END END
    FROM colunas_esperadas e
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = e.esquema
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = e.tabela AND c.relkind IN ('r', 'p')
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = e.coluna AND a.attnum > 0 AND NOT a.attisdropped
    UNION ALL
    SELECT '02 chave', 'public.precificacoes.id única para FK',
           CASE WHEN EXISTS (
               SELECT 1 FROM pg_catalog.pg_index i
               JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped
               WHERE n.nspname = 'public' AND c.relname = 'precificacoes'
                 AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
                 AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 1 AND i.indkey[0] = a.attnum
           ) THEN 'OK' ELSE 'AUSENTE OU INCOMPATÍVEL' END
    UNION ALL
    SELECT '03 objeto public', o.nome,
           CASE WHEN c.oid IS NULL THEN 'AUSENTE' ELSE 'EXISTE: tipo ' || c.relkind::text END
    FROM objetos o
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = o.nome
    UNION ALL
    SELECT '04 função public', f.nome,
           COALESCE(string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text), 'AUSENTE')
    FROM funcoes f
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid AND p.proname = f.nome
    GROUP BY f.nome
    UNION ALL
    SELECT '04a constraints e triggers', n.nspname || '.' || c.relname || '.' || x.conname, 'CONSTRAINT EXISTENTE'
    FROM pg_catalog.pg_constraint x
    JOIN pg_catalog.pg_class c ON c.oid = x.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('produto_variacoes', 'produto_imagens')
      AND x.conname IN ('produto_variacoes_nome_check', 'produto_variacoes_modelo_check', 'produto_variacoes_sku_check',
                        'produto_variacoes_padrao_check', 'produto_imagens_slot_check', 'produto_imagens_slot_unique')
    UNION ALL
    SELECT '04a constraints e triggers', n.nspname || '.' || c.relname || '.' || t.tgname, 'TRIGGER EXISTENTE'
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
      AND c.relname IN ('produtos', 'produto_variacoes', 'produto_imagens')
      AND t.tgname IN ('produtos_atualizar_timestamp', 'produto_variacoes_atualizar_timestamp',
                       'produtos_variacao_minima_insert', 'produto_variacoes_variacao_minima_delete', 'produto_imagens_limite_insert')
    UNION ALL
    SELECT '05 políticas', schemaname || '.' || tablename || '.' || policyname,
           'roles=' || roles::text || '; comando=' || cmd || '; permissiva=' || permissive ||
           '; USING=' || COALESCE(qual, '-') || '; CHECK=' || COALESCE(with_check, '-')
    FROM pg_catalog.pg_policies
    WHERE (schemaname = 'storage' AND tablename = 'objects')
       OR (schemaname = 'public' AND tablename IN ('produtos', 'produto_variacoes', 'produto_movimentacoes', 'produto_imagens'))
    UNION ALL
    SELECT '05 políticas', 'storage.objects', 'NENHUMA POLÍTICA ENCONTRADA'
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'storage' AND tablename = 'objects')
    UNION ALL
    SELECT '06 bucket', 'produto-imagens',
           COALESCE((SELECT 'EXISTE: id=' || id || '; público=' || public::text || '; limite=' || COALESCE(file_size_limit::text, 'não definido')
                     FROM storage.buckets WHERE id = 'produto-imagens' OR name = 'produto-imagens' LIMIT 1), 'AUSENTE')
    UNION ALL
    SELECT '07 roles', r.nome,
           CASE WHEN p.oid IS NULL THEN 'AUSENTE' ELSE 'EXISTE; superuser=' || p.rolsuper::text || '; bypassrls=' || p.rolbypassrls::text END
    FROM (VALUES ('postgres'), ('anon'), ('authenticated'), ('service_role')) AS r(nome)
    LEFT JOIN pg_catalog.pg_roles p ON p.rolname = r.nome
    UNION ALL
    SELECT '08 executor', 'usuário atual', current_user::text
    UNION ALL
    SELECT '08 executor', 'CREATE no schema public',
           pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')::text
    UNION ALL
    SELECT '08 executor', 'pode assumir role postgres',
           CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres')
                THEN pg_catalog.pg_has_role(current_user, 'postgres', 'MEMBER')::text ELSE 'role ausente' END
    UNION ALL
    SELECT '08 executor', 'owner ou superuser de storage.objects para criar políticas',
           CASE WHEN c.oid IS NULL THEN 'storage.objects ausente'
                ELSE (pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') OR r.rolsuper)::text END
    FROM (SELECT 1) x
    LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = 'storage'
    LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = 'objects'
    LEFT JOIN pg_catalog.pg_roles r ON r.rolname = current_user
    UNION ALL
    SELECT '08 executor', 'INSERT em storage.buckets',
           CASE WHEN pg_catalog.to_regclass('storage.buckets') IS NULL THEN 'tabela ausente'
                ELSE pg_catalog.has_table_privilege(current_user, pg_catalog.to_regclass('storage.buckets'), 'INSERT')::text END
    UNION ALL
    SELECT '08 executor', 'REFERENCES em public.precificacoes.id',
           CASE WHEN pg_catalog.to_regclass('public.precificacoes') IS NULL THEN 'tabela ausente'
                WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = pg_catalog.to_regclass('public.precificacoes') AND attname = 'id' AND NOT attisdropped) THEN 'coluna ausente'
                ELSE pg_catalog.has_column_privilege(current_user, pg_catalog.to_regclass('public.precificacoes'), 'id', 'REFERENCES')::text END
    UNION ALL
    SELECT '08 executor', 'REFERENCES em auth.users.id',
           CASE WHEN pg_catalog.to_regclass('auth.users') IS NULL THEN 'tabela ausente'
                WHEN NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = pg_catalog.to_regclass('auth.users') AND attname = 'id' AND NOT attisdropped) THEN 'coluna ausente'
                ELSE pg_catalog.has_column_privilege(current_user, pg_catalog.to_regclass('auth.users'), 'id', 'REFERENCES')::text END
    UNION ALL
    SELECT '09 grants herdados', membro.rolname || ' → ' || concedido.rolname,
           'membership direto; inherit=' || membro.rolinherit::text
    FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles membro ON membro.oid = m.member
    JOIN pg_catalog.pg_roles concedido ON concedido.oid = m.roleid
    WHERE membro.rolname IN ('anon', 'authenticated', 'service_role')
    UNION ALL
    SELECT '10 privilégios padrão', pg_catalog.pg_get_userbyid(d.defaclrole) || ' / ' || COALESCE(n.nspname, '*') || ' / ' || d.defaclobjtype::text,
           d.defaclacl::text
    FROM pg_catalog.pg_default_acl d
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclobjtype IN ('r', 'f') AND (n.nspname = 'public' OR d.defaclnamespace = 0)
)
SELECT secao, item, resultado FROM resultado ORDER BY secao, item;
