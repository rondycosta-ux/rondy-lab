-- Limite persistente de consultas publicas do Portal do Lojista.
-- Aplicar manualmente depois da migration 016.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.portal_estabelecimento_tokens') IS NULL THEN
        RAISE EXCEPTION 'A migration 015 de tokens do portal deve estar aplicada.';
    END IF;
    IF to_regclass('public.portal_loja_rate_limits') IS NOT NULL
       OR to_regprocedure('public.consumir_limite_portal(text,integer,integer)') IS NOT NULL THEN
        RAISE EXCEPTION 'O limite de requisicoes do portal ja existe; revise antes de continuar.';
    END IF;
END;
$preflight$;

CREATE TABLE public.portal_loja_rate_limits (
    chave text PRIMARY KEY CHECK (chave ~ '^[0-9a-f]{64}$'),
    inicio_janela timestamptz NOT NULL,
    requisicoes integer NOT NULL CHECK (requisicoes >= 1),
    atualizado_em timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.portal_loja_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portal_loja_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.portal_loja_rate_limits TO service_role;

CREATE FUNCTION public.consumir_limite_portal(
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
    v_linha public.portal_loja_rate_limits%ROWTYPE;
BEGIN
    IF p_chave IS NULL OR p_chave !~ '^[0-9a-f]{64}$'
       OR p_limite NOT BETWEEN 1 AND 1000
       OR p_janela_segundos NOT BETWEEN 1 AND 3600 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Parametros de limite invalidos.';
    END IF;

    SELECT * INTO v_linha
    FROM public.portal_loja_rate_limits
    WHERE chave = p_chave
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.portal_loja_rate_limits (chave, inicio_janela, requisicoes, atualizado_em)
        VALUES (p_chave, v_agora, 1, v_agora);
        RETURN true;
    END IF;

    IF v_linha.inicio_janela <= v_agora - make_interval(secs => p_janela_segundos) THEN
        UPDATE public.portal_loja_rate_limits
        SET inicio_janela = v_agora, requisicoes = 1, atualizado_em = v_agora
        WHERE chave = p_chave;
        RETURN true;
    END IF;

    IF v_linha.requisicoes >= p_limite THEN
        RETURN false;
    END IF;

    UPDATE public.portal_loja_rate_limits
    SET requisicoes = requisicoes + 1, atualizado_em = v_agora
    WHERE chave = p_chave;
    RETURN true;
END;
$function$;

ALTER FUNCTION public.consumir_limite_portal(text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consumir_limite_portal(text, integer, integer)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consumir_limite_portal(text, integer, integer) TO service_role;

COMMIT;
