-- Requer migrations 003, 006, 007 e 012, alem de pgTAP em extensions.
-- Execute o arquivo inteiro no SQL Editor de desenvolvimento. Ele sempre termina em ROLLBACK.
BEGIN;

SET LOCAL search_path = "$user", public, extensions;
SELECT extensions.no_plan();

SELECT set_config('rondy.test.admin', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.user', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.admin_product', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.user_product', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.admin_variation', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.user_variation', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.establishment', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.move_send', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.move_restock', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.move_return', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.move_adjust_plus', gen_random_uuid()::text, true);
SELECT set_config('rondy.test.move_adjust_minus', gen_random_uuid()::text, true);

INSERT INTO auth.users (id, aud, role, email) VALUES
 (current_setting('rondy.test.admin')::uuid, 'authenticated', 'authenticated', current_setting('rondy.test.admin') || '@rondy.test'),
 (current_setting('rondy.test.user')::uuid, 'authenticated', 'authenticated', current_setting('rondy.test.user') || '@rondy.test');
INSERT INTO public.user_roles (user_id, role) VALUES
 (current_setting('rondy.test.admin')::uuid, 'admin'),
 (current_setting('rondy.test.user')::uuid, 'user');

INSERT INTO public.produtos (id,user_id,nome,descricao,tipo_atendimento,custo_base,preco_base)
VALUES
 (current_setting('rondy.test.admin_product')::uuid,current_setting('rondy.test.admin')::uuid,'Produto admin','','pronta_entrega',1,10),
 (current_setting('rondy.test.user_product')::uuid,current_setting('rondy.test.user')::uuid,'Produto comum','','pronta_entrega',1,10);
INSERT INTO public.produto_variacoes (id,user_id,produto_id,variacao_padrao,estoque_atual)
VALUES
 (current_setting('rondy.test.admin_variation')::uuid,current_setting('rondy.test.admin')::uuid,current_setting('rondy.test.admin_product')::uuid,true,10),
 (current_setting('rondy.test.user_variation')::uuid,current_setting('rondy.test.user')::uuid,current_setting('rondy.test.user_product')::uuid,true,10);

SET LOCAL ROLE authenticated;
CREATE TEMP TABLE rondy_tap_results (resultado text NOT NULL) ON COMMIT DROP;
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.admin'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('rondy.test.admin'),'role','authenticated')::text, true);

INSERT INTO public.estabelecimentos (id,user_id,nome,responsavel,whatsapp,comissao_percentual)
VALUES (current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin')::uuid,'Loja fixture','Responsavel','11999999999',20);
INSERT INTO rondy_tap_results SELECT extensions.ok(EXISTS(SELECT 1 FROM public.estabelecimentos WHERE id=current_setting('rondy.test.establishment')::uuid),'admin cadastra estabelecimento');

INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_send')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'ENVIO',3,'envio inicial')->>'saldo')::integer,3,'envio aumenta consignado');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT estoque_atual FROM public.produto_variacoes WHERE id=current_setting('rondy.test.admin_variation')::uuid),7,'envio reduz estoque proprio');
INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_send')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'ENVIO',3,'envio inicial')->>'ja_aplicada')::boolean,true,'repeticao identica e idempotente');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT quantidade FROM public.consignacao_saldos WHERE estabelecimento_id=current_setting('rondy.test.establishment')::uuid AND variacao_id=current_setting('rondy.test.admin_variation')::uuid),3,'idempotencia nao duplica saldo');
INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_restock')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'REPOSICAO',2,'reposicao')->>'saldo')::integer,5,'reposicao aumenta consignado');
INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_return')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'DEVOLUCAO',1,'devolucao')->>'saldo')::integer,4,'devolucao reduz consignado');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT estoque_atual FROM public.produto_variacoes WHERE id=current_setting('rondy.test.admin_variation')::uuid),6,'devolucao aumenta estoque proprio');
INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_adjust_plus')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'AJUSTE_POSITIVO',2,'contagem fisica maior')->>'saldo')::integer,6,'ajuste positivo auditavel');
INSERT INTO rondy_tap_results SELECT extensions.is((public.movimentar_consignacao(current_setting('rondy.test.move_adjust_minus')::uuid,current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'AJUSTE_NEGATIVO',1,'avaria')->>'saldo')::integer,5,'ajuste negativo auditavel');
INSERT INTO rondy_tap_results SELECT extensions.throws_ok($$SELECT public.movimentar_consignacao(gen_random_uuid(), current_setting('rondy.test.establishment')::uuid, current_setting('rondy.test.admin_variation')::uuid, 'AJUSTE_NEGATIVO', 6, 'nao permitir negativo')$$,'Ajuste deixa saldo negativo.','bloqueia saldo consignado negativo');
INSERT INTO rondy_tap_results SELECT extensions.throws_ok($$SELECT public.movimentar_consignacao(gen_random_uuid(), current_setting('rondy.test.establishment')::uuid, current_setting('rondy.test.admin_variation')::uuid, 'ENVIO', 7, 'nao permitir negativo proprio')$$,'Estoque proprio insuficiente.','bloqueia estoque proprio negativo');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT count(*)::integer FROM public.consignacao_movimentacoes WHERE estabelecimento_id=current_setting('rondy.test.establishment')::uuid),5,'historico consignado preserva cinco eventos');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT count(*)::integer FROM public.produto_movimentacoes WHERE variacao_id=current_setting('rondy.test.admin_variation')::uuid),3,'historico proprio registra transferencias fisicas');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('rondy.test.user'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('rondy.test.user'),'role','authenticated')::text, true);
INSERT INTO rondy_tap_results SELECT extensions.throws_ok($$INSERT INTO public.estabelecimentos(user_id,nome) VALUES(current_setting('rondy.test.user')::uuid,'Tentativa comum')$$,NULL,'usuario comum nao cadastra estabelecimento');
INSERT INTO rondy_tap_results SELECT extensions.throws_ok($$SELECT public.movimentar_consignacao(gen_random_uuid(),current_setting('rondy.test.establishment')::uuid,current_setting('rondy.test.admin_variation')::uuid,'ENVIO',1,'tentativa comum')$$,'Permissao de administrador obrigatoria.','usuario comum nao movimenta');
INSERT INTO rondy_tap_results SELECT extensions.is((SELECT count(*)::integer FROM public.estabelecimentos WHERE id=current_setting('rondy.test.establishment')::uuid),0,'usuario comum nao consulta estabelecimento alheio');

RESET ROLE;
SELECT * FROM extensions.finish();
SELECT count(*) FILTER (WHERE resultado LIKE 'ok %') AS aprovados, count(*) FILTER (WHERE resultado LIKE 'not ok %') AS reprovados, coalesce(string_agg(resultado, E'\n') FILTER (WHERE resultado LIKE 'not ok %'),'nenhum') AS erros FROM rondy_tap_results;
ROLLBACK;
