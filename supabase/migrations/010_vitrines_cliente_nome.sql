-- Inclui o destinatario da vitrine no contrato publico existente.
-- Aplicar manualmente depois da migration 009.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.vitrines') IS NULL
       OR to_regprocedure('public.consultar_vitrine_publica(text)') IS NULL THEN
        RAISE EXCEPTION 'A migration 009 de vitrines deve estar aplicada.';
    END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.consultar_vitrine_publica(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_result jsonb;
    v_slug text;
BEGIN
    v_slug := lower(btrim(p_slug));
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 3 AND 120 THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'slug', v.slug,
        'nome', v.nome,
        'descricao', v.descricao,
        'cliente_nome', v.cliente_nome,
        'produtos', COALESCE(
            jsonb_agg(jsonb_build_object(
                'nome', p.nome,
                'descricao', p.descricao,
                'preco', COALESCE(pv.preco_unitario, p.preco_base),
                'imagem_bucket_id', i.bucket_id,
                'imagem_storage_path', i.storage_path
            ) ORDER BY vp.ordem) FILTER (WHERE p.id IS NOT NULL),
            '[]'::jsonb
        )
    ) INTO v_result
    FROM public.vitrines AS v
    LEFT JOIN public.vitrine_produtos AS vp ON vp.vitrine_id = v.id
    LEFT JOIN public.produtos AS p ON p.id = vp.produto_id AND NOT p.arquivado
    LEFT JOIN public.produto_variacoes AS pv ON pv.produto_id = p.id AND pv.variacao_padrao
    LEFT JOIN public.produto_imagens AS i ON i.produto_id = p.id AND i.capa AND i.variacao_id IS NULL
    WHERE v.slug = v_slug AND v.ativa
    GROUP BY v.id, v.slug, v.nome, v.descricao, v.cliente_nome;
    RETURN v_result;
END;
$function$;

ALTER FUNCTION public.consultar_vitrine_publica(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consultar_vitrine_publica(text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.consultar_vitrine_publica(text) TO anon, authenticated;

COMMIT;
