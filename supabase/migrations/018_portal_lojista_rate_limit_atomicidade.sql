-- Corrige a corrida na primeira requisicao concorrente do limitador do portal.
-- Aplicar manualmente depois da migration 017.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.portal_loja_rate_limits') IS NULL
       OR to_regprocedure('public.consumir_limite_portal(text,integer,integer)') IS NULL THEN
        RAISE EXCEPTION 'A migration 017 de limite do portal deve estar aplicada.';
    END IF;
END;
$preflight$;

CREATE INDEX IF NOT EXISTS portal_loja_rate_limits_atualizado_em_idx
    ON public.portal_loja_rate_limits (atualizado_em);

CREATE OR REPLACE FUNCTION public.consumir_limite_portal(
    p_chave text,
    p_limite integer,
    p_janela_segundos integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_agora timestamptz := clock_timestamp();
    v_permitido boolean;
BEGIN
    IF p_chave IS NULL OR p_chave !~ '^[0-9a-f]{64}$'
       OR p_limite NOT BETWEEN 1 AND 1000
       OR p_janela_segundos NOT BETWEEN 1 AND 3600 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Parametros de limite invalidos.';
    END IF;

    WITH tentativa AS (
        INSERT INTO public.portal_loja_rate_limits AS limite (
            chave, inicio_janela, requisicoes, atualizado_em
        ) VALUES (
            p_chave, v_agora, 1, v_agora
        )
        ON CONFLICT (chave) DO UPDATE
        SET inicio_janela = CASE
                WHEN limite.inicio_janela <= v_agora - make_interval(secs => p_janela_segundos)
                    THEN v_agora
                ELSE limite.inicio_janela
            END,
            requisicoes = CASE
                WHEN limite.inicio_janela <= v_agora - make_interval(secs => p_janela_segundos)
                    THEN 1
                ELSE limite.requisicoes + 1
            END,
            atualizado_em = v_agora
        WHERE limite.inicio_janela <= v_agora - make_interval(secs => p_janela_segundos)
           OR limite.requisicoes < p_limite
        RETURNING true
    )
    SELECT COALESCE((SELECT true FROM tentativa), false) INTO v_permitido;

    RETURN v_permitido;
END;
$function$;

ALTER FUNCTION public.consumir_limite_portal(text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consumir_limite_portal(text, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_limite_portal(text, integer, integer) TO service_role;

COMMENT ON TABLE public.portal_loja_rate_limits IS
    'Limitador persistente do portal. Remover periodicamente linhas com atualizado_em antigo em tarefa administrativa.';

COMMIT;
