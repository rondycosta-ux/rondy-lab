-- Galeria publica restrita aos produtos presentes em vitrines ativas.
-- Execute manualmente no Supabase DEV antes de publicar a interface publica.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.vitrines') IS NULL
       OR to_regclass('public.vitrine_produtos') IS NULL
       OR to_regclass('public.produtos') IS NULL
       OR to_regclass('public.produto_imagens') IS NULL
       OR to_regprocedure('public.consultar_vitrine_publica(text)') IS NULL
       OR to_regprocedure('public.imagem_vitrine_publica_disponivel(text,text)') IS NULL THEN
        RAISE EXCEPTION 'As estruturas e funcoes de vitrines publicas devem existir.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy
        WHERE polrelid = 'storage.objects'::regclass
          AND polname = 'produto_imagens_storage_select_vitrine_publica'
          AND polcmd = 'r'
    ) THEN
        RAISE EXCEPTION 'A policy existente de leitura publica restrita de imagens deve existir.';
    END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.consultar_vitrine_publica(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_result jsonb; v_slug text;
BEGIN
    v_slug := lower(btrim(p_slug));
    IF v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 3 AND 120 THEN RETURN NULL; END IF;

    SELECT jsonb_build_object(
        'slug', v.slug, 'nome', v.nome, 'descricao', v.descricao, 'cliente_nome', v.cliente_nome,
        'produtos', COALESCE(jsonb_agg(jsonb_build_object(
            'nome', p.nome, 'descricao', p.descricao, 'preco', COALESCE(pv.preco_unitario, p.preco_base),
            'imagens', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('bucket_id', i.bucket_id, 'storage_path', i.storage_path)
                    ORDER BY CASE WHEN i.capa THEN 0 ELSE 1 END, i.criado_em, i.id)
                FROM public.produto_imagens AS i
                WHERE i.produto_id = p.id AND i.variacao_id IS NULL
            ), '[]'::jsonb)
        ) ORDER BY vp.ordem) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb)
    ) INTO v_result
    FROM public.vitrines AS v
    LEFT JOIN public.vitrine_produtos AS vp ON vp.vitrine_id = v.id
    LEFT JOIN public.produtos AS p ON p.id = vp.produto_id AND NOT p.arquivado
    LEFT JOIN public.produto_variacoes AS pv ON pv.produto_id = p.id AND pv.variacao_padrao
    WHERE v.slug = v_slug AND v.ativa
    GROUP BY v.id, v.slug, v.nome, v.descricao, v.cliente_nome;
    RETURN v_result;
END;
$function$;

-- A leitura anonima continua limitada a imagens de produtos em vitrines ativas.
-- A RPC acima so revela caminhos para os produtos da vitrine consultada.
CREATE OR REPLACE FUNCTION public.imagem_vitrine_publica_disponivel(p_bucket_id text, p_storage_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.produto_imagens AS i
        JOIN public.produtos AS p ON p.id = i.produto_id
        JOIN public.vitrine_produtos AS vp ON vp.produto_id = p.id
        JOIN public.vitrines AS v ON v.id = vp.vitrine_id
        WHERE i.bucket_id = p_bucket_id AND i.storage_path = p_storage_path
          AND i.variacao_id IS NULL AND NOT p.arquivado AND v.ativa
    );
$function$;

ALTER FUNCTION public.consultar_vitrine_publica(text) OWNER TO postgres;
ALTER FUNCTION public.imagem_vitrine_publica_disponivel(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.consultar_vitrine_publica(text), public.imagem_vitrine_publica_disponivel(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_vitrine_publica(text), public.imagem_vitrine_publica_disponivel(text, text) TO anon, authenticated;

COMMIT;
