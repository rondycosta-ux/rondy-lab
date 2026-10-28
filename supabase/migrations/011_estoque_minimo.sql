-- Limite minimo de estoque por variacao de produto.
-- Aplicar manualmente depois das migrations 006 e 007.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.produto_variacoes') IS NULL THEN
        RAISE EXCEPTION 'A tabela public.produto_variacoes deve existir.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'produto_variacoes' AND column_name = 'estoque_minimo'
    ) THEN
        RAISE EXCEPTION 'A coluna estoque_minimo ja existe; revise antes de continuar.';
    END IF;
END;
$preflight$;

ALTER TABLE public.produto_variacoes
    ADD COLUMN estoque_minimo integer NOT NULL DEFAULT 0
    CONSTRAINT produto_variacoes_estoque_minimo_check CHECK (estoque_minimo >= 0);

GRANT UPDATE (estoque_minimo) ON public.produto_variacoes TO authenticated;

COMMIT;
