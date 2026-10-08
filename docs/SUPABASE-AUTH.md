# Supabase Auth — integração inicial

## Configuração

Preencha `projectUrl` e `publishableKey` em `admin/js/supabase-config.js`, com a Project URL HTTPS do projeto `rondy-lab` e sua chave `sb_publishable_...`. São parâmetros públicos enviados ao navegador. O cliente recusa chaves que não tenham esse formato; não inserir service_role, secret key, senha do banco ou senha de usuário. Variáveis de ambiente da Vercel não são injetadas automaticamente em arquivos JavaScript estáticos.

O SDK `@supabase/supabase-js` UMD, versão fixa `2.57.4`, é carregado por jsDelivr com `defer`, seguido de configuração, cliente central, autenticação e scripts antigos. Não há framework, bundler ou necessidade de Node para executar o site. O SDK e o Supabase precisam estar acessíveis pela rede.

## Fluxo implementado

- `/admin/login/` permite entrar por e-mail/senha com `signInWithPassword`. Não oferece cadastro, recuperação de senha ou OAuth nesta etapa. A senha não é registrada em logs, URL ou armazenamento pela aplicação; o campo é limpo após a tentativa.
- Nas páginas privadas, o CSS oculta o conteúdo até `auth.getUser()` confirmar um usuário não anônimo. Sem sessão válida, redireciona ao login. Falha de configuração mantém o conteúdo oculto e informa o problema.
- Os inicializadores dos módulos aguardam `RondyAuth.ready` antes de consultar ou renderizar dados locais. O corpo dos cálculos e as operações de persistência anteriores não foram alterados.
- O SDK persiste e renova a sessão. Eventos de logout em outra aba fecham o Admin. Ao retornar à aba ou restaurar a página pelo histórico, a sessão é conferida novamente. Destinos de login/logout são fixos e internos, sem parâmetro de redirecionamento externo.
- O botão Sair fica na sidebar de todas as páginas protegidas; usa `signOut({ scope: 'local' })`, encerrando a sessão atual, não todas as sessões em outros dispositivos. Falha de logout é informada e permite tentar novamente.

Rotas protegidas: `/admin/`, `/admin/configuracoes/`, `/admin/filamentos/`, `/admin/calculadora/`, `/admin/produtos/`, `/admin/pedidos/`, `/admin/estoque/` e `/admin/consignacao/`, incluindo seus `index.html`.

Para uma nova página administrativa, repetir o carregamento e o atributo `data-auth-page="protected"`, incluir o estado de verificação e aguardar `RondyAuth.ready` antes de inicializar o módulo. Login não usa o bloqueio de página privada, evitando loop.

## Persistência e limites

As cinco chaves `rondyLab...` permanecem intactas. O SDK usa sua chave padrão de sessão `sb-<project-ref>-auth-token` em localStorage e pode administrar chaves auxiliares de seu próprio fluxo. Não há `localStorage.clear()`, migração, leitura/escrita de tabelas ou mudanças nas políticas RLS.

Os dados operacionais locais **não pertencem a um usuário autenticado específico**: contas diferentes no mesmo navegador/origem ainda veem a mesma base local. Login não cifra nem isola esses dados. Não usar esta etapa como solução multiusuário para a base local. O isolamento por `user_id` só se aplica às futuras operações remotas protegidas por RLS.

O HTML e JavaScript continuam sendo arquivos públicos da hospedagem estática. O guard é uma proteção de navegação/interface, não autorização de banco. A autorização real de futuras consultas deve depender do JWT da sessão e das políticas RLS, nunca de IDs enviados pelo frontend sem validação no banco. O código não atribui papel administrativo: admite qualquer usuário autenticado não anônimo do projeto. Revisar a política de criação de contas antes de uso real.

## Teste local

1. Configurar URL e publishable key; iniciar Live Server **na raiz do repositório**, usando sempre a mesma origem/porta. Não abrir por `file://`.
2. Sem sessão, abrir cada rota protegida: deve ir para `/admin/login/` sem mostrar conteúdo administrativo.
3. Testar e-mail/senha inválidos e indisponibilidade de rede: erro legível, sem revelar se a conta existe; botão disponível para nova tentativa.
4. Entrar com o usuário já criado no Authentication. Deve abrir o Dashboard; navegar pelos oito módulos e recarregar para verificar persistência da sessão.
5. Clicar Sair e tentar voltar pelo histórico ou digitar URL privada. Testar também logout com duas abas abertas e retorno a uma aba em segundo plano.
6. Comparar as cinco chaves de negócio antes/depois: login/logout não devem modificá-las. Não realizar edição de cadastros durante essa comparação.
7. Testar configuração vazia, SDK bloqueado e JavaScript desativado: conteúdo privado permanece oculto. Sem JavaScript o login fica indisponível e há mensagem explicativa.
8. Conferir login, botão Sair e mensagens em desktop, tablet e mobile, com teclado e zoom.

O login por senha não utiliza callback de redirecionamento nesta etapa. Revisar Site URL/Redirect URLs no painel Supabase para desenvolvimento e produção antes de adicionar convites, confirmação ou recuperação por link. Não foram alteradas configurações do painel.

Testes automatizados sem dependências: `node tests/auth.test.cjs` (Node apenas para desenvolvimento/testes). Os testes simulam Auth e cobrem bloqueio, login, logout, erros, eventos entre abas, restrições de configuração e cobertura das rotas; não substituem teste com projeto real.

## Verificações pendentes antes do uso real

- Configurar e testar com URL/chave reais e o usuário existente; nenhum segredo ou credencial foi fornecido nesta implementação.
- Auditar RLS de `filamentos` e `filamentos_movimentacoes` com requisições anônimas e dois usuários: leitura, inserção, atualização e exclusão devem respeitar `user_id`, incluindo `WITH CHECK` e vínculo entre movimento e rolo. As políticas informadas pelo usuário não foram inspecionadas.
- Restringir cadastro público no Authentication se somente usuários convidados puderem acessar; definir papéis se nem todo usuário autenticado for administrador. Ausência de botão de cadastro não impede chamadas diretas ao Auth.
- Corrigir os usos existentes de `innerHTML` com conteúdo de usuário antes de confiar dados sensíveis ou sessões reais ao Admin. XSS na mesma origem pode comprometer tokens do SDK. Esses problemas prévios estão registrados em `ADMIN.md` e `DATA-MODEL.md` e não foram refatorados nesta etapa.
- Revisar políticas de senha, recuperação, limitação de tentativas, MFA conforme necessidade, HTTPS, CSP e atualização/integridade do SDK. A versão foi fixada; não houve auditoria de dependência nem configuração de CSP.
- Testar expiração/revogação e falhas de rede no projeto real. Logout revoga a sessão/refresh token conforme o escopo; um access token já emitido pode continuar válido até expirar. RLS deve sempre permanecer habilitado.

Nenhum deploy, migração ou alteração no banco foi realizado.

Referências: [SDK via CDN](https://supabase.com/docs/reference/javascript/installing), [login por senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [validação do usuário](https://supabase.com/docs/reference/javascript/auth-getuser), [logout](https://supabase.com/docs/reference/javascript/auth-signout).
