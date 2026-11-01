-- Estados e exclusao segura de estabelecimentos de consignacao.
BEGIN;

DO $preflight$
BEGIN
    IF to_regclass('public.estabelecimentos') IS NULL
       OR to_regclass('public.estabelecimento_comissoes') IS NULL
       OR to_regclass('public.consignacao_saldos') IS NULL
       OR to_regclass('public.consignacao_movimentacoes') IS NULL
       OR to_regclass('public.consignacao_conferencias') IS NULL
       OR to_regclass('public.consignacao_fechamentos') IS NULL
       OR to_regclass('public.consignacao_pagamentos') IS NULL
       OR to_regclass('public.portal_estabelecimento_tokens') IS NULL
       OR to_regclass('public.user_roles') IS NULL THEN
        RAISE EXCEPTION 'As estruturas de consignacao, portal e perfis devem existir.';
    END IF;
END;
$preflight$;

ALTER TABLE public.estabelecimentos
    ADD COLUMN arquivado boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT estabelecimentos_arquivado_inativo_check CHECK (NOT arquivado OR NOT ativo);

CREATE INDEX estabelecimentos_usuario_status_criado_idx
    ON public.estabelecimentos (user_id, arquivado, ativo, criado_em DESC);

CREATE FUNCTION public.validar_estabelecimento_operacional_consignacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
    PERFORM 1 FROM public.estabelecimentos AS e
    WHERE e.id = NEW.estabelecimento_id AND e.ativo AND NOT e.arquivado
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Estabelecimento inativo ou arquivado nao aceita operacoes de consignacao.';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER consignacao_saldos_estabelecimento_operacional
BEFORE INSERT OR UPDATE OF quantidade ON public.consignacao_saldos
FOR EACH ROW EXECUTE FUNCTION public.validar_estabelecimento_operacional_consignacao();

CREATE FUNCTION public.definir_status_estabelecimento(p_estabelecimento_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user_id uuid := auth.uid(); v_estabelecimento public.estabelecimentos%ROWTYPE; v_tokens integer := 0;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.'; END IF;
    IF p_estabelecimento_id IS NULL OR p_status NOT IN ('ATIVAR', 'INATIVAR', 'ARQUIVAR', 'REATIVAR') THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Status de estabelecimento invalido.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin') THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.'; END IF;
    SELECT * INTO v_estabelecimento FROM public.estabelecimentos WHERE id = p_estabelecimento_id AND user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento nao encontrado ou sem permissao.'; END IF;
    IF p_status = 'ARQUIVAR' AND EXISTS (SELECT 1 FROM public.consignacao_saldos WHERE estabelecimento_id = p_estabelecimento_id AND quantidade > 0) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Nao e possivel arquivar estabelecimento com saldo consignado positivo.';
    END IF;
    IF p_status = 'ATIVAR' AND v_estabelecimento.arquivado THEN RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Reative o estabelecimento arquivado antes de ativa-lo.'; END IF;
    UPDATE public.estabelecimentos SET ativo = CASE WHEN p_status IN ('ATIVAR', 'REATIVAR') THEN true ELSE false END, arquivado = CASE WHEN p_status = 'ARQUIVAR' THEN true WHEN p_status = 'REATIVAR' THEN false ELSE arquivado END, atualizado_em = clock_timestamp() WHERE id = p_estabelecimento_id;
    IF p_status IN ('INATIVAR', 'ARQUIVAR') THEN
        UPDATE public.portal_estabelecimento_tokens SET ativo = false, revogado_em = clock_timestamp(), revogado_por = v_user_id WHERE estabelecimento_id = p_estabelecimento_id AND ativo;
        GET DIAGNOSTICS v_tokens = ROW_COUNT;
    END IF;
    RETURN jsonb_build_object('estabelecimento_id', p_estabelecimento_id, 'status', p_status, 'tokens_invalidados', v_tokens);
END;
$function$;

CREATE FUNCTION public.excluir_estabelecimento(p_estabelecimento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Autenticacao obrigatoria.'; END IF;
    IF p_estabelecimento_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = 'admin') THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Permissao de administrador obrigatoria.'; END IF;
    PERFORM 1 FROM public.estabelecimentos WHERE id = p_estabelecimento_id AND user_id = v_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Estabelecimento nao encontrado ou sem permissao.'; END IF;
    IF EXISTS (SELECT 1 FROM public.estabelecimento_comissoes WHERE estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.consignacao_saldos WHERE estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.consignacao_movimentacoes WHERE estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.consignacao_conferencias WHERE estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.consignacao_fechamentos WHERE estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.consignacao_pagamentos AS p JOIN public.consignacao_fechamentos AS f ON f.id = p.fechamento_id WHERE f.estabelecimento_id = p_estabelecimento_id)
       OR EXISTS (SELECT 1 FROM public.portal_estabelecimento_tokens WHERE estabelecimento_id = p_estabelecimento_id) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Nao e possivel excluir estabelecimento com historico ou dependencias.';
    END IF;
    DELETE FROM public.estabelecimentos WHERE id = p_estabelecimento_id AND user_id = v_user_id;
    RETURN jsonb_build_object('estabelecimento_id', p_estabelecimento_id, 'acao', 'EXCLUIDO');
END;
$function$;

ALTER FUNCTION public.definir_status_estabelecimento(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.excluir_estabelecimento(uuid) OWNER TO postgres;
ALTER FUNCTION public.validar_estabelecimento_operacional_consignacao() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.definir_status_estabelecimento(uuid, text), public.excluir_estabelecimento(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_status_estabelecimento(uuid, text), public.excluir_estabelecimento(uuid) TO authenticated;
REVOKE DELETE ON TABLE public.estabelecimentos FROM authenticated;
REVOKE INSERT ON TABLE public.estabelecimentos FROM authenticated;
GRANT INSERT (user_id, nome, responsavel, whatsapp, comissao_percentual, ativo) ON TABLE public.estabelecimentos TO authenticated;
REVOKE UPDATE ON TABLE public.estabelecimentos FROM authenticated;
GRANT UPDATE (nome, responsavel, whatsapp, comissao_percentual) ON TABLE public.estabelecimentos TO authenticated;

COMMIT;
