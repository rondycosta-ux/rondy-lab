-- Imagens privadas de produtos. Aplicar depois das migrations 006 e 007.
BEGIN;

DO $preflight$
BEGIN
    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'produto-imagens' OR name = 'produto-imagens') THEN
        RAISE EXCEPTION 'O bucket produto-imagens já existe; revise sua configuração antes de aplicar a migration.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.produto_imagens
        GROUP BY user_id, produto_id HAVING count(*) > 10
    ) THEN
        RAISE EXCEPTION 'Há produto com mais de 10 imagens; revise os registros existentes antes de aplicar a migration.';
    END IF;
    IF to_regclass('public.produto_imagens_capa_unique') IS NULL THEN
        RAISE EXCEPTION 'Índice de capa única da migration 006 não encontrado.';
    END IF;
END;
$preflight$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('produto-imagens', 'produto-imagens', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Caminhos: UUID do usuário / UUID do produto / nome do arquivo, sem subpastas.
-- A existência e a propriedade do produto são verificadas em cada operação.
CREATE POLICY produto_imagens_storage_select ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'produto-imagens'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND name ~ '^[^/]+/[^/]+/[^/]+$'
    AND position('..' IN name) = 0
    AND EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.user_id = (SELECT auth.uid()) AND p.id::text = split_part(name, '/', 2))
);

CREATE POLICY produto_imagens_storage_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'produto-imagens'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND name ~ '^[^/]+/[^/]+/[^/]+$'
    AND position('..' IN name) = 0
    AND EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.user_id = (SELECT auth.uid()) AND p.id::text = split_part(name, '/', 2))
);

CREATE POLICY produto_imagens_storage_delete ON storage.objects
FOR DELETE TO authenticated USING (
    bucket_id = 'produto-imagens'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND name ~ '^[^/]+/[^/]+/[^/]+$'
    AND position('..' IN name) = 0
    AND EXISTS (SELECT 1 FROM public.produtos p
                WHERE p.user_id = (SELECT auth.uid()) AND p.id::text = split_part(name, '/', 2))
);

-- Slots únicos protegem também transações concorrentes com snapshots antigos.
ALTER TABLE public.produto_imagens ADD COLUMN slot smallint;
WITH numeradas AS (
    SELECT id, row_number() OVER (PARTITION BY user_id, produto_id ORDER BY criado_em, id) AS numero
    FROM public.produto_imagens
)
UPDATE public.produto_imagens i SET slot = n.numero::smallint FROM numeradas n WHERE n.id = i.id;
ALTER TABLE public.produto_imagens ALTER COLUMN slot SET NOT NULL;
ALTER TABLE public.produto_imagens ADD CONSTRAINT produto_imagens_slot_check CHECK (slot BETWEEN 1 AND 10);
ALTER TABLE public.produto_imagens ADD CONSTRAINT produto_imagens_slot_unique UNIQUE (user_id, produto_id, slot);

-- Serializa inserções por produto; o índice da migration 006 garante no máximo uma capa.
CREATE FUNCTION public.limitar_imagens_produto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
    PERFORM 1 FROM public.produtos p
    WHERE p.id = NEW.produto_id AND p.user_id = NEW.user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Produto não encontrado para o usuário.';
    END IF;
    SELECT s.numero INTO NEW.slot FROM pg_catalog.generate_series(1, 10) AS s(numero)
    WHERE NOT EXISTS (SELECT 1 FROM public.produto_imagens i
                      WHERE i.produto_id = NEW.produto_id AND i.user_id = NEW.user_id AND i.slot = s.numero)
    ORDER BY s.numero LIMIT 1;
    IF NEW.slot IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'O produto pode ter no máximo 10 imagens.';
    END IF;
    RETURN NEW;
END;
$function$;
ALTER FUNCTION public.limitar_imagens_produto() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.limitar_imagens_produto() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER produto_imagens_limite_insert
BEFORE INSERT ON public.produto_imagens
FOR EACH ROW EXECUTE FUNCTION public.limitar_imagens_produto();

COMMIT;
