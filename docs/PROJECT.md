# Rondy Lab — Project Overview

> Atualização — integração inicial com Supabase Auth: o Admin agora possui login por e-mail/senha, verificação de sessão e logout. Os dados operacionais continuam nas cinco chaves locais, sem migração. As afirmações abaixo sobre ausência de autenticação descrevem o levantamento anterior. Consulte `docs/SUPABASE-AUTH.md` para o estado atual e os limites desta etapa. As tabelas remotas existentes e suas políticas não foram alteradas nem auditadas nesta integração.

## 1. Visão geral

A Rondy Lab é uma marca de criação e fabricação de produtos por impressão 3D.

Seu posicionamento é transformar ideias em objetos reais, combinando criatividade, tecnologia, personalização e fabricação digital.

**Assinatura da marca:** IDEIAS GANHAM FORMA.

O projeto digital Rondy Lab é composto por dois ambientes:

1. **Site público:** apresenta a marca, suas linhas de produtos, catálogo e canais de contato.
2. **Admin:** plataforma interna para organizar a operação do negócio, incluindo custos, precificação, produção, produtos, estoque, pedidos e consignação.

A intenção é evoluir gradualmente de um site institucional com ferramentas administrativas locais para uma plataforma integrada de gestão do negócio.

## 2. Objetivos do projeto

### Site público

- Apresentar a Rondy Lab e sua identidade.
- Divulgar produtos e colecionáveis.
- Organizar o catálogo por linhas de produtos.
- Permitir visualizar detalhes de cada produto.
- Direcionar interessados para atendimento e negociação.
- Divulgar projetos personalizados.

O site público não possui checkout ou pagamento online atualmente.

### Admin

- Centralizar informações operacionais.
- Controlar custos de fabricação.
- Cadastrar e acompanhar impressoras.
- Gerenciar filamentos e consumo de materiais.
- Calcular custos e preços de venda.
- Organizar produtos e pedidos.
- Controlar produção e estoque.
- Gerenciar produtos enviados em consignação.
- Acompanhar vendas e resultados financeiros operacionais.

A prioridade é construir uma operação simples, confiável e adequada ao tamanho atual do negócio, preservando possibilidades de crescimento.

## 3. Arquitetura atual

O projeto utiliza HTML5, CSS3 e JavaScript puro, sem frameworks ou processo de build.

O site e o Admin compartilham o mesmo repositório, mas possuem estruturas visuais e arquivos de estilo separados.

**Infraestrutura:**
- Desenvolvimento: VS Code e Live Server.
- Versionamento: Git e GitHub.
- Repositório: `rondycosta-ux/rondy-lab`.
- Hospedagem: Vercel.
- Domínio público: `https://lab.rondy.com.br`.
- Admin: `https://lab.rondy.com.br/admin/`.

O Admin utiliza `localStorage` para persistência dos dados nesta fase.

Não existe atualmente banco de dados remoto, autenticação ou API própria.

O `localStorage` é temporário e não sincroniza informações entre dispositivos ou navegadores.

## 4. Site público

### Home

Página principal de apresentação da marca.

Contém:
- Hero institucional com a assinatura IDEIAS GANHAM FORMA.
- Apresentação das linhas de produtos.
- Produtos em destaque.
- Chamada para projetos personalizados.
- Navegação para as demais páginas.

### Sobre

Apresenta a história, proposta e filosofia da Rondy Lab.

Trabalha os conceitos:
- Criar.
- Produzir.
- Personalizar.

### Catálogo

Organiza produtos por categorias.

Categorias atuais:
- HOME — objetos funcionais e utilidades.
- COLECIONÁVEIS — figuras, peças decorativas e colecionáveis.
- CUSTOM — projetos personalizados.
- PLAY — brinquedos e objetos criativos.
- PETS — produtos relacionados a animais de estimação.
- AUTO — acessórios e soluções automotivas.

O catálogo possui filtros e aceita navegação por categoria através de parâmetros na URL.

Os produtos atuais são demonstrativos e estão definidos diretamente no código.

### Detalhes do produto

Uma página dinâmica apresenta os dados do produto a partir de seu identificador na URL.

Permite:
- Visualizar imagem e descrição.
- Identificar a categoria.
- Demonstrar interesse.
- Seguir para a página de contato com o produto selecionado.

### Contato

Disponibiliza os canais:
- WhatsApp.
- Instagram.
- E-mail.

O WhatsApp recebe uma mensagem contextualizada quando o visitante chega a partir de um produto.

Não existe formulário de contato com backend.

## 5. Admin — visão geral

O Admin é uma área interna destinada à operação da Rondy Lab.

Seus módulos previstos são:

1. Dashboard.
2. Configurações e Impressoras.
3. Filamentos.
4. Calculadora.
5. Produtos.
6. Pedidos.
7. Estoque.
8. Consignação.

O Admin utiliza uma sidebar compartilhada visualmente entre as páginas.

Seu design deve priorizar clareza, produtividade e leitura de dados.

## 6. Estado atual dos módulos

### Dashboard

**Estado:** estrutura visual implementada.

Possui indicadores e atalhos de navegação.

Os indicadores ainda são estáticos e não consultam os dados reais dos módulos.

### Configurações e Impressoras

**Estado:** funcional.

Permite configurar parâmetros financeiros e operacionais, além de cadastrar, editar e excluir impressoras.

Cada impressora possui seus próprios parâmetros de custo e consumo.

As informações são utilizadas pela Calculadora.

### Filamentos

**Estado:** funcional.

Permite:
- Cadastrar rolos individuais.
- Informar material, marca, linha e cor.
- Registrar peso nominal e saldo.
- Registrar custo de aquisição.
- Calcular custo por grama.
- Consultar disponibilidade.
- Registrar entradas, consumos e ajustes.
- Consultar movimentações.

Cada rolo possui identificador próprio, mesmo quando compartilha marca, material e cor com outro.

### Calculadora

**Estado:** funcional.

Permite:
- Selecionar impressora.
- Informar duração da impressão.
- Informar quantidade produzida.
- Utilizar múltiplos filamentos.
- Calcular custos de material, energia, depreciação, manutenção, perdas e mão de obra.
- Simular somente custo, venda ou consignação.
- Calcular preço, lucro e margem.
- Salvar precificações.

As precificações novas utilizam snapshots históricos de parâmetros e resultados.

A Calculadora não movimenta estoque.

O botão de criação de pedidos ainda não está integrado.

### Produtos

**Estado:** placeholder.

Ainda não possui cadastro ou integração com o catálogo público.

### Pedidos

**Estado:** placeholder.

Ainda não possui fluxo operacional implementado.

### Estoque

**Estado:** placeholder.

Ainda não possui controle de produtos acabados.

O controle de saldo de filamentos já existe separadamente no módulo Filamentos.

### Consignação

**Estado:** placeholder.

A Calculadora já permite simular preços e repasses de consignação, mas ainda não existe gestão operacional de lojistas, entregas, vendas ou acertos.

## 7. Fluxo operacional desejado

A visão de longo prazo é conectar os módulos em uma jornada integrada:

**Configurações e Impressoras → Filamentos → Calculadora → Produtos → Pedidos → Produção → Estoque → Venda ou Consignação**

### Configurações

Definem os parâmetros utilizados para calcular os custos.

### Filamentos

Representam os materiais disponíveis para fabricação.

### Calculadora

Utiliza impressoras, filamentos e parâmetros operacionais para calcular custos e simular preços.

Uma simulação não representa consumo real de material.

### Produtos

Deverão representar itens que podem ser produzidos, vendidos ou mantidos em estoque.

A relação entre produtos e precificações deverá ser definida na implementação do módulo.

### Pedidos

Deverão representar demandas de clientes e permitir acompanhar seu andamento.

Estados inicialmente planejados:

Orçamento → Aprovado → Fila de impressão → Em produção → Finalizado → Entregue → Cancelado.

Esses estados são uma proposta inicial, não uma implementação existente.

### Produção

Deverá registrar a fabricação efetiva das peças.

No futuro, poderá conectar pedidos, consumo real de filamentos e entrada de produtos acabados no estoque.

Ainda não existe um módulo de Produção independente.

### Estoque

Deverá controlar quantidades de produtos acabados e suas movimentações.

É importante diferenciar estoque disponível, produtos em produção e itens enviados em consignação.

### Venda

Deverá representar a saída comercial de produtos e permitir acompanhar valores e resultados.

Ainda não existe um módulo independente de Vendas.

### Consignação

Deverá permitir enviar produtos a lojistas, acompanhar quantidades, identificar vendas, calcular repasses, registrar devoluções e controlar acertos financeiros.

## 8. Regras e princípios de negócio

### Custos

O custo de fabricação deve considerar componentes independentes:

- Material.
- Energia.
- Depreciação.
- Manutenção.
- Perdas.
- Mão de obra, quando aplicável.

Os cálculos devem evitar duplicidade de custos.

### Precificação

Diferenciar:
- Custo de fabricação.
- Preço de venda.
- Markup.
- Lucro.
- Margem.
- Repasse de consignação.

### Histórico

Precificações salvas devem preservar os parâmetros utilizados no momento do cálculo.

Alterações futuras de preço de filamentos ou configurações não devem modificar registros históricos.

### Estoque

Simular custos não significa produzir uma peça.

O estoque somente deve ser movimentado em operações reais e explícitas.

### Consignação

Os valores de repasse não devem ser fixos no código.

Cada negociação pode possuir condições comerciais diferentes.

## 9. Evoluções planejadas

### Curto prazo

- Consolidar a Calculadora.
- Desenvolver cadastro e gestão de Produtos.
- Desenvolver gestão de Pedidos.
- Desenvolver controle de Estoque.
- Desenvolver gestão de Consignação.
- Melhorar os indicadores do Dashboard.

### Médio prazo

- Integrar Produtos ao catálogo público.
- Conectar Pedidos à produção e ao estoque.
- Registrar consumo real de materiais.
- Criar histórico de movimentações de produtos.
- Permitir gestão de lojistas.
- Criar visualização específica para lojistas.
- Consolidar informações operacionais e comerciais.

### Evolução futura de infraestrutura

- Avaliar banco de dados remoto.
- Implementar autenticação e controle de acesso.
- Sincronizar informações entre dispositivos.
- Definir permissões administrativas e de lojistas.
- Criar mecanismos de backup e recuperação.
- Reduzir a dependência do `localStorage`.

Supabase é uma possibilidade em avaliação, não uma tecnologia já adotada.

## 10. Experiência e identidade

O site público e o Admin pertencem à mesma marca, mas possuem objetivos diferentes.

**Site público:** editorial, minimalista, visual e orientado à apresentação de produtos.

**Admin:** funcional, organizado, compacto e orientado a dados.

Ambos devem preservar a identidade visual Rondy Lab.

As regras detalhadas de interface ficarão em `docs/DESIGN-SYSTEM.md`.

## 11. Desenvolvimento incremental

O Rondy Lab é desenvolvido por etapas.

Cada nova funcionalidade deve:
- Respeitar a estrutura existente.
- Preservar os módulos já funcionais.
- Evitar dependências desnecessárias.
- Ser testável isoladamente.
- Considerar integrações futuras.
- Manter compatibilidade com dados existentes.

Não considerar funcionalidades planejadas como já implementadas.

O estado real do código prevalece como evidência da implementação atual.

Quando houver divergência entre este documento e o repositório, investigar antes de realizar alterações.

## 12. Documentação do projeto

A documentação persistente será organizada em:

- `AGENTS.md` — regras gerais para agentes.
- `docs/PROJECT.md` — visão geral e evolução do projeto.
- `docs/DESIGN-SYSTEM.md` — identidade visual e padrões de interface.
- `docs/ADMIN.md` — funcionamento e regras dos módulos administrativos.
- `docs/DATA-MODEL.md` — estruturas persistidas, campos, IDs e relacionamentos.

Esses documentos devem ser consultados conforme a natureza da tarefa.
