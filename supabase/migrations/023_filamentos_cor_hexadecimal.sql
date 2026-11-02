-- Cor hexadecimal opcional para a visualizacao de filamentos.
-- Execute manualmente apenas no Supabase DEV; esta migration nao preenche nem altera cores existentes.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.filamentos') IS NULL THEN
        RAISE EXCEPTION 'A tabela public.filamentos deve existir.';
    END IF;
END;
$preflight$;

ALTER TABLE public.filamentos
    ADD COLUMN IF NOT EXISTS cor_hexadecimal text;

ALTER TABLE public.filamentos
    ADD CONSTRAINT filamentos_cor_hexadecimal_check
    CHECK (cor_hexadecimal IS NULL OR cor_hexadecimal ~ '^#[0-9A-Fa-f]{6}$');

CREATE OR REPLACE FUNCTION public.definir_cor_hexadecimal_filamento(
    p_filamento_id text,
    p_cor_hexadecimal text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_cor_hexadecimal text := NULLIF(upper(btrim(p_cor_hexadecimal)), '');
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.';
    END IF;
    IF p_filamento_id IS NULL OR btrim(p_filamento_id) = '' OR length(p_filamento_id) > 200
       OR p_filamento_id ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ID de filamento invalido.';
    END IF;
    IF v_cor_hexadecimal IS NOT NULL AND v_cor_hexadecimal !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Cor hexadecimal invalida. Use #RRGGBB.';
    END IF;

    UPDATE public.filamentos
       SET cor_hexadecimal = v_cor_hexadecimal
     WHERE id = p_filamento_id
       AND user_id = v_user_id
       AND NOT arquivado;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Filamento nao encontrado, arquivado ou sem permissao.';
    END IF;

    RETURN jsonb_build_object('id', p_filamento_id, 'cor_hexadecimal', v_cor_hexadecimal);
END;
$function$;

ALTER FUNCTION public.definir_cor_hexadecimal_filamento(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.definir_cor_hexadecimal_filamento(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_cor_hexadecimal_filamento(text, text) TO authenticated;

COMMIT;
