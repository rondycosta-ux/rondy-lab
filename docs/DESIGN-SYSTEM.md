# Rondy Lab — Design System

> Atualização de autenticação: `admin/css/auth.css` adiciona a tela `/admin/login/`, o estado de verificação e a ação Sair na sidebar. Reutiliza tokens e formulários do Admin, com foco visível e layout fluido limitado a 480px. Consulte `docs/SUPABASE-AUTH.md` para fluxo, configuração e limites; os demais componentes descritos abaixo permanecem como no levantamento original.

Referência do design existente, levantada em 7 de outubro de 2026 por leitura do código. As seções 1 a 8 descrevem a implementação; as seções 9 e 10 orientam novas interfaces; a seção 11 registra limitações e oportunidades, sem representar correções implementadas. Não houve validação visual em navegador nesta etapa.

Fontes consultadas:

- `AGENTS.md` e `docs/PROJECT.md`.
- `css/style.css`, `js/main.js` e `index.html`.
- `sobre/index.html`, `catalogo/index.html`, `produto/index.html`, `produto/product.js` e `contato/index.html`.
- `admin/css/admin.css`, `admin/js/admin.js` e `admin/index.html`.
- `admin/configuracoes/index.html` e `admin/configuracoes/configuracoes.js`.
- `admin/filamentos/index.html` e `admin/filamentos/filamentos.js`.
- `admin/calculadora/index.html` e `admin/calculadora/calculadora.js`.
- `admin/produtos/index.html`, `admin/pedidos/index.html`, `admin/estoque/index.html` e `admin/consignacao/index.html`.

Os nomes de classes abaixo são referências ao código, não uma biblioteca de componentes independente. Os caminhos são relativos à raiz do repositório.

## 1. Identidade visual

A Rondy Lab atua com impressão 3D, fabricação digital e criatividade. Sua direção visual é moderna, tecnológica, minimalista e premium. A assinatura é **IDEIAS GANHAM FORMA.**

O design combina fundos escuros, texto branco, laranja como destaque, títulos grandes com espaçamento entre letras reduzido, divisores discretos e imagens de produtos. As categorias possuem cores próprias já definidas.

O site público tem linguagem editorial: títulos expressivos, áreas de respiro, imagens grandes e chamadas para catálogo e contato. O Admin mantém a marca, mas prioriza produtividade, formulários, leitura de custos, tabelas e navegação persistente. Cada ambiente possui CSS e JavaScript próprios; não há biblioteca visual externa ou fonte web importada.

Predominam superfícies retangulares e bordas de 1px. Os botões de menu são circulares. As sombras existentes ficam concentradas nos painéis laterais; não há gradientes no CSS analisado.

## 2. Paleta de cores

### Tokens do site público

Declarados em `:root` de `css/style.css`.

| Nome | Valor | Aplicação |
| --- | --- | --- |
| `--bg` | `#111111` | Fundo da página e header |
| `--bg-soft` | `#171717` | Declarado; sem referência por `var()` no CSS atual |
| `--accent` | `#FF6A00` | Marca, CTAs, navegação ativa e HOME |
| `--muted` | `#777777` | Eyebrows e textos de identificação |
| `--text` | `#FFFFFF` | Texto principal |
| `--line` | `rgba(255, 255, 255, 0.08)` | Bordas e divisores |
| `--purple` | `#9E69D6` | COLECIONÁVEIS |
| `--yellow` | `#E6BE3A` | CUSTOM |
| `--turquoise` | `#3ECFCF` | PLAY |
| `--green` | `#71C56A` | PETS |
| `--blue` | `#4B8DFF` | AUTO |

### Categorias

| Categoria | Cor | Classes de referência |
| --- | --- | --- |
| HOME | `#FF6A00` | `.line-card--home`, `.catalog-product__category--home`, `.product-category--home` |
| COLECIONÁVEIS | `#9E69D6` | `.line-card--collectibles`, `.catalog-product__category--colecionaveis`, `.product-category--colecionaveis` |
| CUSTOM | `#E6BE3A` | `.line-card--custom`, `.catalog-product__category--custom`, `.product-category--custom` |
| PLAY | `#3ECFCF` | `.line-card--play`, `.catalog-product__category--play`, `.product-category--play` |
| PETS | `#71C56A` | `.line-card--pets`, `.catalog-product__category--pets`, `.product-category--pets` |
| AUTO | `#4B8DFF` | `.line-card--auto`, `.catalog-product__category--auto`, `.product-category--auto` |

Os cards de linhas definem a variável local `--card-accent`, usada no topo e no CTA. Os destaques da Home usam `.featured-product__category--home`, `--collectibles`, `--custom` e `--play`; não há destaques PETS e AUTO nessa grade atual.

### Tokens do Admin

Declarados em `:root` de `admin/css/admin.css`.

| Nome | Valor | Aplicação |
| --- | --- | --- |
| `--admin-bg` | `#111111` | Página e shell |
| `--admin-panel` | `#171717` | Sidebar e painel de movimentações |
| `--admin-panel-alt` | `#1d1d1d` | Indicadores do Dashboard, atalhos e módulos placeholder |
| `--admin-line` | `rgba(255, 255, 255, 0.08)` | Bordas e divisores |
| `--admin-muted` | `#777777` | Labels de indicadores, seções e metadados |
| `--admin-accent` | `#FF6A00` | Ação primária, seleção e mensagens |
| `--admin-text` | `#FFFFFF` | Texto principal |
| `--admin-text-soft` | `rgba(255, 255, 255, 0.76)` | Texto secundário, labels e resumos |
| `--admin-shadow` | `rgba(0, 0, 0, 0.18)` | Sombra da sidebar em telas menores |

### Valores locais de superfícies e estados

Estes valores existem diretamente em regras; não são tokens globais.

| Nome descritivo | Valor | Aplicação |
| --- | --- | --- |
| Fundo de imagens | `#1a1a1a` | Destaques e imagem do detalhe do produto |
| Faixa de personalizados | `#141414` | `.custom-projects` |
| Superfície discreta | `rgba(255, 255, 255, 0.01)` | Cards de linhas, produto selecionado no contato e vários painéis do Admin |
| Realce de superfície | `rgba(255, 255, 255, 0.02)` | Hover das linhas, navegação do Admin e cabeçalho da tabela |
| Borda no hover público | `rgba(255, 255, 255, 0.18)` | `.line-card:hover` e `:focus-visible` |
| Fundo da navegação ativa | `rgba(255, 106, 0, 0.06)` | `.admin-nav__item.is-active` |
| Borda interativa laranja | `rgba(255, 106, 0, 0.5)` | Botões e atalhos do Admin |
| Primário em hover/foco | `#e66300` | `.admin-button--primary` |
| Erro e aviso | `#ff8a65` | `.admin-form-message.is-error`, avisos da Calculadora |
| Disponível | `#9ae6b4` / `rgba(70, 200, 130, 0.5)` | Texto / borda de `.filamento-tag--disponivel` |
| Estoque baixo | `#f7c66a` / `rgba(255, 166, 0, 0.5)` | Texto / borda de `.filamento-tag--estoque-baixo` |
| Esgotado | `#ff8a8a` / `rgba(255, 94, 94, 0.5)` | Texto / borda de `.filamento-tag--esgotado` |
| Placeholder | `rgba(255, 255, 255, 0.35)` | Busca e textarea; regra inicial também inclui inputs |
| Placeholder de input | `rgba(255, 255, 255, 0.3)` | Regra posterior de `.config-field input::placeholder` |
| Sombra de movimentações | `rgba(0, 0, 0, 0.28)` | Painel lateral de Filamentos |

Os textos públicos também usam branco com opacidade local, sem token próprio:

| Valor | Exemplos de aplicação |
| --- | --- |
| `rgba(255, 255, 255, 0.8)` | Hero, Sobre, personalizados, descrição de produto |
| `rgba(255, 255, 255, 0.78)` | Introdução do contato |
| `rgba(255, 255, 255, 0.76)` | Descrição dos cards de linhas |
| `rgba(255, 255, 255, 0.75)` | Introdução e vazio do catálogo, produto não encontrado |
| `rgba(255, 255, 255, 0.74)` | Introduções de linhas e destaques |
| `rgba(255, 255, 255, 0.72)` | Voltar ao catálogo e títulos do footer |
| `rgba(255, 255, 255, 0.7)` | Filtros e base do footer |
| `rgba(255, 255, 255, 0.64)` | Label do produto no contato |
| `rgba(255, 255, 255, 0.62)` | Nome dos canais de contato |
| `rgba(255, 255, 255, 0.34)` | Numeração dos princípios em Sobre |

`transparent` é usado em botões secundários, inputs internos e bordas de base. Não substituir as cores das categorias pelas cores de status de estoque: possuem aplicações diferentes.

## 3. Tipografia

Ambos os ambientes usam `Arial, Helvetica, sans-serif` no `body`. Não existe escala tipográfica declarada como tokens. Tamanhos em `rem`, `vw` e `clamp()` são definidos por componente. Pesos recorrentes: 700 em títulos, labels e ações; 600 em nomes de produtos e navegação administrativa; textos corridos usam o peso normal herdado.

### Site público

| Seletor / função | Tamanho | Entrelinha / espaçamento entre letras |
| --- | --- | --- |
| `.hero__title` | `clamp(3rem, 7vw, 7rem)` | `0.9` / `-0.07em` |
| `.line-showcase__title`, `.featured-products__title` | `clamp(2.2rem, 4vw, 4rem)` | `0.96` / `-0.06em` |
| `.custom-projects__title` | `clamp(2.8rem, 5vw, 6rem)` | `0.9` / `-0.07em` |
| `.page-title` | `clamp(2.25rem, 5vw, 4rem)` | `1.05` / `-0.05em` |
| `.about-title` | `clamp(3rem, 6vw, 6rem)` | `0.9` / `-0.07em` |
| `.catalog-title` | `clamp(3rem, 5vw, 5.5rem)` | `0.9` / `-0.07em` |
| `.contact-title` | `clamp(2.7rem, 5vw, 5.5rem)` | `0.94` / `-0.07em` |
| `.product-detail__title` | `clamp(2.5rem, 4vw, 5rem)` | `0.95` / `-0.06em` |
| `.featured-product__name` | `clamp(1.15rem, 1.8vw, 1.5rem)` | `1.3` / `-0.04em` |
| `.catalog-product__name` | `clamp(1.45rem, 2vw, 2.1rem)` | `1.2` / `-0.05em` |
| `.hero__text` | `1.18rem` | `1.7` |
| Introduções de linhas e catálogo | `1.08rem` | `1.7` |
| Sobre / introdução de contato | `1.12rem` | `1.8` |
| `.product-detail__description` | `1.1rem` | `1.8` |
| `.hero__eyebrow`, `.page-kicker` | `0.75rem`, `0.76rem` | Letras `0.18em`, caixa alta |
| `.btn`, CTA de produto e personalizados | `0.78rem` | Letras `0.12em`, peso 700, caixa alta |
| `.catalog-filter` | `0.78rem` | Letras `0.12em`, peso 700, caixa alta |

Caixa alta é aplicada por CSS em várias seções e ações, mas também aparece diretamente no HTML dos títulos institucionais. Nem todo título tem `text-transform: uppercase`; o detalhe de produto preserva o nome cadastrado no array atual.

### Admin

| Seletor / função | Valores |
| --- | --- |
| `.admin-header__title` | `clamp(2.2rem, 4vw, 3.3rem)`, entrelinha `1`, letras `-0.06em`, caixa alta |
| `.admin-header__subtitle` | `1.05rem`, entrelinha `1.7`, texto suave |
| `.admin-header__eyebrow` | `0.72rem`, letras `0.18em`, peso 700, caixa alta |
| `.admin-nav__item` | `0.92rem`, peso 600 |
| `.metric-card__value` | `clamp(2.4rem, 5vw, 4rem)`, entrelinha `1`, letras `-0.06em`, peso 700 |
| `.compact-indicator__value` | `clamp(1.4rem, 2.4vw, 2.2rem)`, entrelinha `1.1`, letras `-0.05em` |
| Títulos de seção da Calculadora e Configurações | `0.8rem`, letras `0.18em`, peso 700, caixa alta |
| `.config-field label` | `0.82rem`, letras `0.12em`, peso 700, caixa alta; margem inferior `0.7rem` |
| `.config-field input` | `1rem`, família herdada |
| `.config-field__description` | `0.96rem`, entrelinha `1.7` |
| `.admin-button` | `0.74rem`, letras `0.12em`, peso 700, caixa alta |
| `.filamentos-table th` | `0.7rem`, letras `0.14em`, peso 700, caixa alta |
| `.filamentos-table td` | `0.96rem`, entrelinha `1.6` |
| `.admin-form-message` | `0.86rem`, entrelinha `1.6` |
| `.summary-line` | `0.92rem` |
| `.summary-highlight strong` | `clamp(1.4rem, 2vw, 2rem)`, letras `-0.05em` |

Labels de indicadores e metadados costumam usar `0.7rem`; ações compactas de filamentos e precificações usam `0.68rem`. Esses tamanhos são locais, não uma escala obrigatória para todas as telas.

## 4. Layout e espaçamento

### Site público

Containers principais têm `max-width: 1200px` e `margin: 0 auto`. O padding lateral usual é `2rem`, reduzido a `1.25rem` nas regras mobile. O reset usa `box-sizing: border-box`; a largura máxima inclui padding.

| Área | Layout e espaçamento implementados |
| --- | --- |
| Header | Flex alinhado ao centro, `space-between`, gap `2rem`, padding `1.1rem 2rem` |
| Hero | Colunas `1.15fr 0.85fr`, gap `2rem`, padding `4.75rem 2rem 3.5rem`, altura mínima `calc(100vh - 84px)` |
| Linhas | 3 colunas, gap `1.25rem`, seção com padding `2.5rem 2rem 5rem` |
| Destaques | 4 colunas, gap `1.35rem`, seção com padding `0 2rem 5rem` |
| Personalizados | Colunas `1fr 1.05fr`, gap `2.5rem`, faixa com padding `6rem 2rem` |
| `.page-shell` | Padding `4rem 2rem 3rem` |
| Sobre | História em `1.1fr 0.9fr`, gap `2.5rem`; princípios em 3 colunas, gap `2rem` |
| Catálogo | 3 colunas, gap `2rem`; filtros flex sem quebra, gap `1.3rem` |
| Produto | Colunas `1.15fr 0.85fr`, gap `3rem`, alinhamento central |
| Contato | 3 colunas iguais, sem gap, separadas por bordas; margem superior `3rem` |
| Footer | Colunas `1.3fr 1fr 1fr`, gap `2.5rem`, padding `4rem 2rem 3rem` |

Textos têm limites próprios: hero `540px`, introdução do catálogo `620px`, descrição de produto `500px`. Os alinhamentos editoriais são predominantemente à esquerda; estados vazios públicos são centralizados.

### Admin

`.admin-shell` usa flex. A sidebar tem largura declarada de `280px`; `.admin-main` usa `flex: 1` e `min-width: 0`. O conteúdo não recebe o `margin: 0 auto` do site público.

| Área | Layout e espaçamento implementados |
| --- | --- |
| Header | Padding `2.5rem 2rem 1.5rem`, gap `1rem`, divisor inferior |
| Páginas padrão, Configurações, Filamentos e placeholders | Máximo `1200px`, padding `2.25rem 2rem 3rem` |
| Calculadora | Máximo `1400px`, mesmo padding base |
| Indicadores do Dashboard | 4 colunas, gap `1.25rem`; cards com mínimo `160px`, padding `1.4rem 1.25rem` |
| Indicadores de Filamentos | 3 colunas, gap `1rem`; mínimo `90px`, padding `1rem 1.2rem` |
| Grids de formulários | 2 colunas, gap `1.25rem 1.5rem` em `.config-grid`, `.filamento-form__grid` e `.calculator-grid` |
| Campos | `.config-field` com máximo `640px`; campos irmãos recebem margem superior `1.4rem` |
| Painéis de cadastro | Padding `1.5rem`, borda discreta e superfície branca a 1% |
| Seções de Configurações / Calculadora | Separação com borda, padding e margem de `2rem` |
| Tabela de Filamentos | Células com padding `1rem 0.9rem`, largura mínima `980px` |
| Calculadora | Colunas `minmax(0, 1.7fr) minmax(300px, 0.9fr)`, gap `2rem` |

Os valores recorrentes não formam uma escala global de espaçamento. A regra de margem entre `.config-field` também incide dentro de grids; considerar a cascata ao reutilizar.

## 5. Componentes do site público

| Componente e uso | Estrutura, classes e comportamento |
| --- | --- |
| Header, todas as páginas | `.site-header`, `.site-header__inner`, `.brand`: fundo escuro, logo de `220px`, divisor inferior; sticky no topo, `z-index: 20` |
| Navegação | `.site-nav`; links horizontais, ativo `.is-active` com texto laranja e sublinhado de `2px`. O HTML determina a página ativa |
| Menu mobile | `.nav-toggle`, `.nav-toggle__bars`; botão circular de `46px`. Até `760px`, abre navegação vertical absoluta abaixo do header; `.site-header.is-open` exibe menu e transforma barras em X. JS atualiza `aria-expanded` e fecha ao clicar em link |
| Hero, Home | `.hero`, `.hero__content`, `.hero__title--accent`, `.hero__actions`, `.hero__visual`, `.hero__image`; título com destaque laranja, dois CTAs e imagem com `object-fit: contain`; uma coluna até `760px` |
| Botões e CTAs | `.btn`, `.btn--primary`, `.btn--secondary`: altura mínima `52px`, padding `0.9rem 1.5rem`. Primário laranja, secundário transparente com borda. `.custom-projects__cta` tem mínimo `54px`; CTAs textuais usam laranja e seta |
| Linhas de produtos, Home | `.line-showcase__grid`, `.line-card`, `.line-card__icon`, `__name`, `__description`, `__cta`; links para catálogo por categoria. Topo colorido de `3px`, ícone `78px`, mínimo `180px`. Hover/foco move card, ícone e seta; 3 → 2 → 1 colunas |
| Produtos em destaque, Home | `.featured-products__grid`, `.featured-product__link`, `__image`, `__category`, `__name`; imagem `430px`, `object-fit: cover`, texto abaixo sem painel envolvente. Links atuais levam ao catálogo; 4 → 2 → 1 colunas |
| Filtros do catálogo | `.catalog-filters`, `.catalog-filter`; botões textuais, ativo laranja e sublinhado. Rolagem horizontal sem barra visível. JS usa `data-filter`, `aria-pressed`, parâmetro `categoria` e `history.replaceState` |
| Produtos do catálogo | `.catalog-products`, `.catalog-product`, `__content`, `__category`, `__name`, `__link`; imagem `420px`, `object-fit: cover`. Links abrem `/produto/?id=...`. Filtros alternam `hidden`; 3 → 2 → 1 colunas |
| Detalhe de produto | `.product-content`, `.product-detail`, `__media`, `__back`, `__category`, `__title`, `__description`, `__cta`; JS gera conteúdo a partir de `id`. Imagem de `700px`, reduzida a `420px` até `760px`. CTA leva ao contato com `produto` na URL |
| Contato | `.contact-intro`, `.contact-product`, `.contact-channels`, `.contact-channel`; WhatsApp, Instagram e e-mail. Produto selecionado aparece em bloco condicional e contextualiza a mensagem do WhatsApp; sem formulário. Canais passam a uma coluna até `760px` |
| Footer, todas as páginas | `.site-footer`, `__inner`, `__signature`, `__links`, `__cta`, `__bottom-inner`; marca, navegação e contato, depois faixa de créditos. Logo base `200px`; até `760px`, uma coluna e base vertical |

`.catalog-empty` informa categoria sem produtos; `.product-not-found` fornece mensagem e retorno ao catálogo quando o identificador não existe. Não são telas de erro de rede.

A página Sobre usa `.about-intro`, `.about-story`, `.about-signature`, `.about-principles__grid` e `.principle-item`. A composição é editorial, com imagem e três princípios separados por linhas. Não há regras específicas reduzindo esses grids no CSS atual.

## 6. Componentes do Admin

| Componente e uso | Classes e padrão implementado |
| --- | --- |
| Sidebar, todas as páginas | `.admin-sidebar`, `__top`, `__label`, `.admin-brand`, `.admin-nav`; logo `180px`, fundo `--admin-panel`, altura `100vh`, sticky no desktop |
| Navegação ativa | `.admin-nav__item.is-active`: texto e borda esquerda de `2px` em laranja, fundo laranja a 6%. Ícones SVG de `18px`; item com mínimo `44px` |
| Cabeçalho | `.admin-header`, `__eyebrow`, `__title`, `__subtitle`, `.admin-mobile-toggle`; contexto, título e descrição. `.admin-button--header` alinha ação à direita |
| Indicadores | Dashboard: `.metrics`, `.metric-card`, `__label`, `__value`, com valores estáticos. Filamentos: `.compact-indicators`, `.compact-indicator`, `__label`, `__value`, preenchidos pelo script |
| Painéis | `.printer-form-panel`, `.filamento-form-panel`, `.calculator-form-panel`; borda de 1px, fundo discreto. `.admin-module__card` aparece em Produtos, Pedidos, Estoque e Consignação com mensagem de módulo em desenvolvimento |
| Formulários | `.config-section`, `.config-grid`, `.config-field`, `.config-field--full`, `.filamento-form__grid`; labels acima dos controles, descrição abaixo quando presente; rodapés com cancelar/salvar |
| Inputs com unidade | `.config-field__input-row`: mínimo `52px`, padding lateral `0.9rem`; `.config-field__currency` e `__unit` mostram R$, g, W, % e outras unidades. Input interno sem borda e fundo transparente |
| Selects, busca e textarea | `.config-field select`, `.config-field textarea`, `.filamentos-toolbar input/select`: borda, mínimo `48px`, padding `0.75rem 0.9rem`; textarea com mínimo `100px` e resize vertical |
| Botões | `.admin-button`: mínimo `46px`, padding `0.8rem 1rem`; `--primary` laranja, `--ghost` transparente, `--full` largura total. Ações de listas possuem regras próprias, menores |
| Tabela | `.filamentos-table-wrap`, `.table-responsive`, `.filamentos-table`; cabeçalho em caixa alta, linhas com divisor e hover discreto, oito colunas, rolagem horizontal |
| Status de filamento | `.filamento-tag` e modificadores `--disponivel`, `--estoque-baixo`, `--esgotado`; rótulo textual mais cor de texto/borda, mínimo `28px` |
| Busca e filtros | `.filamentos-toolbar`, `__search`, `__filter`; flex com quebra, base `280px`. Busca por material, marca, linha e cor em `input`; filtro de status em `change` |
| Mensagens | `.admin-form-message`, `.is-error`; reserva mínima `1.5rem`, texto laranja ou aviso. Áreas de mensagens possuem `aria-live="polite"` nos formulários analisados |
| Vazios | `.empty-state` em tabela, histórico e precificações; `.printer-list__empty` com borda tracejada. Texto explica ausência, sem ilustração |
| Impressoras | `.printer-list`, `.printer-item`, `__header`, `__actions`, `__meta`, `__depreciacao`; nome, editar/excluir, metadados em duas colunas e depreciação separada por divisor |
| Movimentações | `.movimentacoes-panel`: painel fixo à direita, `width: min(460px, 92vw)`, `height: 100vh`, `z-index: 30`, padding `1.5rem`, rolagem vertical. `.movimento-item` mostra tipo, quantidade e metadados; botão Fechar e formulário de entrada/consumo/ajuste |

### Calculadora

`.calculator-layout` separa entrada e resumo. `.calculator-summary` tem padding `1.4rem` e `position: sticky; top: 1.5rem`; até `980px`, fica estático abaixo do formulário.

- `.calculator-section` e `__header` organizam blocos; `.calculator-grid` usa duas colunas e `--compact` usa uma.
- `.time-inputs` distribui horas e minutos em duas colunas com gap `0.75rem`; `.time-inputs__field` agrupa número e unidade.
- `.material-lines` reúne blocos `.material-line`, cada um com seleção de filamento, gramagem, custo e remoção. `.material-line__fields` usa `minmax(0, 1.4fr) minmax(120px, 0.8fr)`; `.material-line__warning` informa problemas.
- `.purpose-options` agrupa radios de custo, venda e consignação. `.purpose-option` tem mínimo `48px`; radios e `.toggle-pill input` usam `accent-color: var(--admin-accent)`. O toggle controla mão de obra; painéis condicionais usam `.is-hidden`.
- `.summary-list`, `.summary-line`, `.summary-divider` e `.summary-highlight` separam componentes de custo, total e unitário; `.sales-result__row` mostra resultados comerciais. Valores são atualizados pelos eventos dos campos e formatados em reais pelo script.
- `.calculator-warning` e `.calculator-note` trazem avisos e explicações; `.calculator-actions` permite quebra dos botões. Criar pedido possui atributo `disabled` e `.admin-button--disabled`.
- `.calculator-details`, `.details-panel`, `.detail-item__title` e `__formula` mostram detalhamento expansível do cálculo.
- `.saved-pricings`, `.saved-pricing-list`, `.saved-pricing-card` mostram registros salvos. O card tem seis colunas, reduzidas a duas até `980px`; detalhes usam `.saved-pricing-detail__content`, com duas colunas e redução a uma até `640px`.

Não há componente genérico de modal, toast ou tabela reutilizável em todos os módulos. Produtos, Pedidos, Estoque e Consignação ainda não estabelecem padrões de formulários operacionais próprios.

## 7. Responsividade

Todas as media queries encontradas usam `max-width`. Os valores reais são **980px e 760px no público**, e **980px e 640px no Admin**. “Tablet” e “mobile” abaixo descrevem faixas de comportamento, não detecção de dispositivo.

| Ambiente / faixa | Comportamento efetivo |
| --- | --- |
| Público acima de `980px` | Linhas 3 colunas, destaques 4, catálogo 3; header horizontal |
| Público até `980px` | Linhas, destaques e catálogo passam a 2 colunas |
| Público até `760px` | Menu recolhido; logo `180px`; hero, linhas, destaques, catálogo, produto, personalizados, contato e footer em 1 coluna |
| Público até `760px`: medidas | Header `0.9rem 1.25rem`; hero `3rem 1.25rem 2rem`; textos do hero e personalizados `1rem`; botões `.btn` com largura total; imagens de destaque `360px`, catálogo e produto `420px` |
| Público até `760px`: detalhes | Ícones de linhas `70px`, cards com mínimo `170px`; hero visual mínimo `220px` e imagem limitada a `420px` de largura e `320px` de altura; canais de contato trocam divisores verticais por horizontais |
| Admin acima de `980px` | Sidebar no fluxo com posição sticky; métricas 4 colunas; Calculadora com resumo lateral sticky |
| Admin até `980px` | Shell em bloco; sidebar fixa com largura `min(280px, 78vw)`, escondida por `translateX(-100%)`, aberta com `.is-open`; toggle aparece. Header com padding `1.25rem`; métricas 2 colunas, atalhos e `.config-grid` em 1 coluna |
| Calculadora até `980px` | Layout em 1 coluna, resumo estático, precificações salvas em 2 colunas |
| Admin até `640px` | Métricas em 1 coluna e mínimo `120px`; metadados de impressoras em 1 coluna; subtítulo `0.98rem`; ações de formulário de impressora ocupam uma linha de largura total |
| Calculadora até `640px` | `.calculator-grid`, `.material-line__fields`, `.time-inputs` e detalhes salvos em 1 coluna; ações empilhadas e botões com largura total; padding lateral `1.25rem` |

O Admin reduz o padding lateral de Configurações e placeholders até `980px`; `.admin-page` e Calculadora possuem ajustes até `640px`. Filamentos usa `.admin-filamentos-page`, sem redução específica desse padding.

A tabela de Filamentos mantém a largura mínima de `980px` e rola dentro de `.table-responsive`; não vira uma lista de cards. `.filamento-form__grid` e `.compact-indicators` mantêm duas e três colunas, respectivamente, mesmo em telas menores. Não presumir que recebam as regras de `.config-grid` ou `.metrics`.

Sobre mantém os grids de duas e três colunas. Essas lacunas exigem avaliação visual futura. Títulos fluidos seguem seus `clamp()`; não existe redução tipográfica global por breakpoint.

## 8. Interações e estados

| Estado | Implementação atual | Limite de padronização |
| --- | --- | --- |
| Hover e foco público | Navegação aumenta opacidade; produtos ampliam imagem para `scale(1.03)`; cards de linhas sobem `2px`, ícones `3px`, setas avançam `5px`; CTAs específicos usam opacidade e deslocamento | `.btn` declara transição, mas não possui regra genérica própria de hover/foco |
| Hover e foco Admin | Navegação clareia; botões e atalhos realçam borda; primário passa a `#e66300`; tabela realça a linha no hover | Botões compactos de listas não compartilham todos os estados de `.admin-button` |
| Seleção ativa | `.is-active` identifica navegação e filtro; catálogo atualiza `aria-pressed`; radios usam estado nativo | Não há padrão geral de pseudoestado `:active` para pressionar botões |
| Disabled | Criar pedido desabilitado nativamente; `.admin-button--disabled` com opacidade `0.5` e cursor `not-allowed` | Classe específica; não há regra geral `:disabled` nem exclusão geral de hover |
| Validação | Inputs numéricos usam `min`, `max` ou `step` conforme o campo; scripts validam dados e exibem mensagem em `.admin-form-message.is-error` | Não há padrão visual consolidado de erro por campo, `aria-invalid` ou associação de erro via `aria-describedby` |
| Feedback | Calculadora informa sucesso ao salvar; edição e movimentação possuem mensagens; cadastros de impressora/filamento atualizam a lista e fecham o formulário | Não há confirmação textual uniforme para toda gravação; falhas de armazenamento são tratadas no console pelos helpers atuais |
| Exclusão | Impressoras e filamentos usam `window.confirm` | Aparência nativa do navegador, sem modal próprio |
| Vazio | Catálogo, produto inexistente, tabela, impressoras, movimentações e precificações possuem mensagens | Layout público centralizado e Admin compacto; não há componente único |
| Visibilidade | Público usa `hidden`; Admin usa `.is-hidden { display: none !important; }` | Expandir/esconder conteúdo não implica gerenciamento completo de foco |

Transições existentes duram normalmente `0.2s`, `0.25s` ou `0.35s`. Ambos os CSS usam `scroll-behavior: smooth`; Filamentos também usa `scrollIntoView` suave. Não há tratamento de `prefers-reduced-motion`.

Existem labels, botões nativos, `aria-label` em navegações, ícones decorativos com `aria-hidden`, `.sr-only` em Filamentos e regiões `aria-live`. O menu público e a sidebar atualizam `aria-expanded` e fecham ao selecionar um link. Não implementam fechamento por Escape ou clique externo nos scripts atuais; o painel de movimentações tem botão Fechar, mas não possui ciclo de foco de modal.

Os inputs de `.config-field` e `.time-inputs__field` removem `outline` e não recebem alternativa por `:focus-within` nos wrappers. Isso é uma limitação, não um padrão a replicar.

## 9. Princípios de UX

Diretrizes para futuras implementações, sem implicar que todos os pontos já estejam atendidos:

- Priorizar clareza, hierarquia visual e leitura rápida de informações.
- Evitar elementos decorativos sem função, sombras excessivas e transformar todo conteúdo em cards.
- Reutilizar componentes semelhantes, cores existentes e a organização visual de cada ambiente.
- Não introduzir gradientes, neon ou glassmorphism sem solicitação explícita.
- Manter textos e ações consistentes; nomear botões conforme a ação realizada e explicar estados vazios.
- Garantir legibilidade e avaliar contraste de textos pequenos e secundários sobre seu fundo real.
- Considerar navegação por teclado, foco visível, labels associados e anúncios de mensagens importantes.
- Evitar formulários desnecessariamente complexos; agrupar campos relacionados e explicitar unidades.
- Mostrar feedback claro após ações importantes e diferenciar sucesso, erro e aviso com texto.
- Considerar desktop, tablet e mobile, inclusive textos longos, listas vazias e tabelas com muitas colunas.
- Preservar a distinção entre simulação e operação real; avisos de saldo na Calculadora não representam consumo de estoque.

## 10. Regras para novas telas

Checklist antes e durante a implementação:

1. Consultar `AGENTS.md`.
2. Consultar `docs/PROJECT.md`.
3. Consultar este `docs/DESIGN-SYSTEM.md`.
4. Identificar componentes semelhantes existentes no HTML, CSS e JavaScript do ambiente correspondente.
5. Reutilizar cores, espaçamentos e padrões; não converter valores locais em tokens globais sem necessidade e escopo autorizados.
6. Preservar a diferença entre site público e Admin e não expor links administrativos na navegação pública.
7. Implementar comportamento responsivo, aproveitando os breakpoints existentes quando suficientes.
8. Verificar hover, foco, seleção, disabled, validação, vazio e feedback conforme as ações da tela.
9. Verificar legibilidade e acessibilidade, incluindo teclado, nomes acessíveis e foco em conteúdos recolhíveis.
10. Revisar o diff e a interface em desktop, tablet e mobile para evitar inconsistências visuais e impactos em módulos existentes.

Reutilizar um padrão não significa reproduzir as limitações registradas abaixo. Melhorias que excedam o escopo solicitado devem ser propostas separadamente.

## 11. Limitações e oportunidades

Constatações por leitura do código; nenhuma foi corrigida nesta documentação.

| Constatação | Evidência / impacto | Oportunidade futura |
| --- | --- | --- |
| Regras responsivas duplicadas | `css/style.css` repete pares de media queries de `980px` e `760px` para `.catalog-products` | Consolidar somente em tarefa de manutenção autorizada, preservando o resultado da cascata |
| Estruturas repetidas | Header/footer públicos e sidebar administrativa estão copiados em diferentes HTML | Ao editar, conferir consistência entre páginas; avaliar reúso sem introduzir ferramentas agora |
| Tokens parciais | Cores têm variáveis por ambiente; tipografia, espaçamento, estados e várias superfícies usam valores locais | Mapear recorrências antes de propor novos tokens; `--bg-soft` está declarado sem consumo atual |
| Regras de campos sobrepostas | Placeholder de input muda de branco a 35% para 30% por regra posterior; `.config-field--full` é declarado mais de uma vez | Rever cascata em manutenção específica |
| Espaçamento de formulário irregular | `.config-field + .config-field` acrescenta `1.4rem` mesmo em grids que já têm gap | Avaliar alinhamento de campos lado a lado |
| Campo sem superfície própria | `.config-field input` remove borda e fundo; há inputs de texto diretamente sob `.config-field`, sem `__input-row` | Conferir visibilidade e consistência entre tipos de campo |
| Foco incompleto | Inputs removem outline sem substituição; botões compactos não têm estados próprios uniformes | Definir foco visível consistente e testar teclado |
| Labels incompletos na Calculadora | Labels de grupos de tempo não usam `for`; linhas dinâmicas de materiais também exigem revisão de associação | Associar nomes e instruções aos controles em tarefa própria |
| Navegação recolhida por transformação | Sidebar mobile é deslocada para fora da tela, sem mecanismo de `inert` ou gestão de foco no script | Verificar tabulação com sidebar fechada e retorno de foco ao fechar |
| Painéis sem gestão completa de foco | Menus e movimentações não tratam Escape; não há política comum de foco | Definir comportamento acessível conforme a natureza de cada painel |
| Responsividade incompleta em Sobre e Filamentos | Grids de Sobre, formulário e indicadores de Filamentos não colapsam por media query específica | Testar telas estreitas e propor ajustes incrementais |
| Deslocamento do hero persiste no mobile | `.hero__visual` mantém `translateX(18px)` | Verificar possível excesso horizontal em viewport estreita |
| Imagens com alturas fixas | Catálogo mantém `420px` mesmo no mobile; destaque e detalhe usam outras alturas | Conferir recortes e proporções nas imagens reais |
| Feedback de salvamento variável | Calculadora mostra sucesso; formulários de cadastro fecham após salvar; erros de persistência ficam no console | Consolidar feedback visível de conclusão e falha |
| Navegação de destaque difere do catálogo | Cards da Home anunciam produto, mas apontam para `/catalogo/`; catálogo aponta para o detalhe | Avaliar consistência entre rótulo e destino em tarefa própria |
| Contraste e movimento sem auditoria | Textos pequenos em `#777777`, branco sobre laranja e efeitos sem preferência de movimento reduzido | Medir contraste e testar acessibilidade; não afirmar conformidade sem validação |

O documento registra o estado encontrado e não autoriza redesign, criação de dependências ou refatoração ampla. Quando código e documentação divergirem, investigar a implementação atual antes de alterar qualquer um deles.
