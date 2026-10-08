# Rondy Lab — Admin

> Atualização — integração inicial com Supabase Auth: o Admin agora possui login por e-mail/senha, verificação de sessão e logout. Os dados operacionais continuam nas cinco chaves locais, sem migração. As afirmações abaixo sobre ausência de autenticação descrevem o levantamento anterior. Consulte `docs/SUPABASE-AUTH.md` para o estado atual e os limites desta etapa. As tabelas remotas existentes e suas políticas não foram alteradas nem auditadas nesta integração.

Referência funcional e operacional baseada no código consultado em 7 de outubro de 2026. Este levantamento foi feito por leitura de arquivos, sem executar operações no navegador ou acessar dados reais do `localStorage`.

Neste documento, **implementado** significa identificado no código, não uma certificação de ausência de defeitos; **planejado** indica uma intenção de evolução; **proposta a validar** indica campos, fluxos ou contratos ainda não aprovados. A descrição de uma limitação não autoriza sua correção nesta etapa.

Fontes analisadas:

- `AGENTS.md`, `docs/PROJECT.md` e `docs/DESIGN-SYSTEM.md`.
- `admin/index.html`, `admin/js/admin.js` e regras pertinentes de `admin/css/admin.css`.
- `admin/configuracoes/index.html` e `admin/configuracoes/configuracoes.js`.
- `admin/filamentos/index.html` e `admin/filamentos/filamentos.js`.
- `admin/calculadora/index.html` e `admin/calculadora/calculadora.js`.
- `admin/produtos/index.html`, `admin/pedidos/index.html`, `admin/estoque/index.html` e `admin/consignacao/index.html`.

## 1. Visão geral do Admin

O Admin tem como objetivo centralizar a gestão operacional e comercial de um pequeno negócio de impressão 3D. Hoje oferece configurações, cadastro de impressoras, controle local de filamentos e simulações de custo e preço. A integração completa entre produção, produtos, pedidos e vendas ainda é uma visão futura.

O site público apresenta a marca, o catálogo e os canais de contato. O Admin, em `/admin/`, é orientado à operação interna e possui estilos e scripts próprios. Não há autenticação; uma URL não divulgada não é controle de acesso.

A sidebar apresenta, nesta ordem: Dashboard, Calculadora, Produtos, Pedidos, Estoque, Filamentos, Consignação e Configurações. Impressoras fica dentro de Configurações. Produção não possui página nem item próprio na navegação. A marca da sidebar leva ao Dashboard; a página ativa usa `.is-active` definida no HTML.

`admin/js/admin.js` controla somente a abertura e o fechamento da navegação em telas menores, com atualização de `aria-expanded`. Não é uma camada central de dados ou regras de negócio. Os módulos funcionais têm scripts próprios.

## 2. Mapa dos módulos

| Módulo | Objetivo | Estado atual | Dependências | Evoluções previstas |
| --- | --- | --- | --- | --- |
| Dashboard | Visão operacional e atalhos | Interface com indicadores estáticos | Navegação; sem leitura de dados dos módulos | Consolidar indicadores reais, sem KPIs adicionais definidos |
| Configurações | Parâmetros gerais de cálculo | Implementado | Persistência local | Consolidar validação e tratamento de ausência; decisões específicas pendentes |
| Impressoras | Parâmetros de cada máquina | Implementado dentro de Configurações | Persistência local; lido pela Calculadora | Manter compatibilidade com futuras integrações |
| Filamentos | Cadastro por rolo, saldo e movimentos | Implementado com limitações de auditabilidade | Persistência local; lido pela Calculadora | Integrar consumo real à produção, com regras futuras |
| Calculadora | Simular custos e preços, salvar histórico | Implementado | Configurações, Impressoras e Filamentos | Consolidar cálculos; vínculo com Produtos/Pedidos ainda indefinido |
| Produtos | Organizar itens fabricados e comercializados | Placeholder | Nenhuma integração operacional atual | Cadastro e integração futura ao catálogo público |
| Pedidos | Acompanhar demandas de clientes | Placeholder | Dependências futuras com Produtos e Produção | Definir dados, estados e fluxo |
| Produção | Registrar fabricação efetiva | Sem módulo independente | Dependências futuras com impressoras, materiais, pedidos e estoque | Definir consumo e conclusão de produção |
| Estoque | Controlar produtos acabados | Placeholder | Dependências futuras com Produção, Venda e Consignação | Saldos e movimentações auditáveis |
| Consignação | Gerenciar produtos em lojistas e acertos | Placeholder; apenas simulação na Calculadora | Dependências futuras com Produtos e Estoque | Lojistas, entregas, vendas, devoluções e pagamentos |

As dependências futuras não representam relacionamentos persistidos já implementados.

## 3. Dashboard

**Implementado:** `admin/index.html` apresenta quatro indicadores: Pedidos em aberto, Peças em estoque, Filamentos e Em consignação. Todos exibem `0` fixo no HTML. Não consultam o saldo de filamentos nem dados de outros módulos.

Atalhos existentes:

- Nova precificação → `/admin/calculadora/`.
- Novo pedido → `/admin/pedidos/`, que ainda é placeholder.
- Cadastrar filamento → `/admin/filamentos/`; o link abre a página, não o formulário automaticamente.

**Planejado:** consolidar informações operacionais dos módulos quando os fluxos estiverem definidos e implementados. Não há novos KPIs aprovados neste documento.

## 4. Configurações e Impressoras

### Configurações gerais implementadas

| Campo | Unidade / função | Persistência e validação atual |
| --- | --- | --- |
| Tarifa de energia | R$/kWh; utilizada pela Calculadora | `tarifaEnergia`; HTML com `min="0"`, `step="0.01"` |
| Perda padrão | Percentual que preenche novas simulações | `perdaPadrao`; HTML com mínimo 0, máximo 100 e passo 0,01 |
| Mão de obra padrão | R$/hora para trabalho manual | `maoObraPadrao`; HTML com mínimo 0 e passo 0,01 |

Os três campos são salvos automaticamente no evento `input`, sem botão de confirmação. Campo vazio, nulo ou inválido é normalizado para `null`; o formulário mostra vazio quando o parâmetro não está definido. A normalização aceita vírgula convertendo-a em ponto antes de converter para número.

O script não verifica `checkValidity()` nem reforça os limites de faixa antes de gravar as configurações. Assim, os atributos HTML não garantem que valores negativos ou perdas acima de 100 sejam bloqueados pelo salvamento automático. O objeto salvo contém os três campos conhecidos; não há preservação explícita de propriedades adicionais desconhecidas.

Não há valores financeiros padrão definidos para esses parâmetros: o objeto inicial usa `null`. Isso não equivale a considerar o custo igual a zero; a Calculadora atualmente faz essa conversão, conforme a seção 6.

### Impressoras implementadas

É possível cadastrar várias máquinas, editar pelo ID e excluir com confirmação nativa. Nomes repetidos não são proibidos. Cada registro recebe ID com prefixo `printer`, timestamp e sufixo aleatório; editar preserva o ID. Não existem datas de criação/edição próprias no registro atual de impressora.

| Campo | Propriedade persistida | Validação no script |
| --- | --- | --- |
| Nome | `nome` | Texto aparado, mínimo de dois caracteres |
| Valor pago | `valorPago` | Maior que zero |
| Vida útil em horas | `vidaUtilHoras` | Maior que zero |
| Consumo médio em watts | `consumoWatts` | Maior que zero |
| Reserva de manutenção por hora | `manutencaoHora` | Não negativa; vazio é convertido em zero |
| Depreciação por hora | Calculada, não um campo editável | `valorPago / vidaUtilHoras`; retorna zero se vida útil não for positiva |

O formulário usa os nomes `vidaUtil`, `consumoEnergia` e `manutencao`, mapeados pelo script para as propriedades acima. A reserva aparece como R$ no formulário, mas é armazenada e utilizada como custo por hora; a lista exibe `/h`.

Após salvar, a lista é atualizada e o formulário é fechado e limpo. Cancelar também descarta o preenchimento. Excluir remove o registro, sem verificar se há precificações que referenciem a máquina.

**Regra aplicada ao cálculo:** depreciação, energia e manutenção são componentes separados. A nota textual abaixo da depreciação diz que considera manutenção e energia, mas `calculateDepreciacaoHora()` divide apenas investimento por vida útil. Essa nota diverge da fórmula real e não deve orientar uma soma adicional desses custos.

## 5. Filamentos

### Cadastro individual e custo

Cada rolo é um registro próprio com ID, mesmo que compartilhe marca, material, linha e cor com outros. IDs usam prefixo `filamento`, timestamp e sufixo aleatório. Há `criadoEm` e `atualizadoEm` em ISO; a edição mantém o ID e a criação.

| Campo | Comportamento e validação implementados |
| --- | --- |
| Material | Lista fechada: PLA, PETG, ABS, ASA, TPU e Outro; script rejeita valores fora dela |
| Marca | Obrigatória, pelo menos dois caracteres após aparar espaços |
| Linha/acabamento | Texto opcional |
| Cor | Obrigatória, pelo menos dois caracteres após aparar espaços |
| Peso nominal | Gramas; script exige maior que zero; HTML com mínimo 1 e passo 1 |
| Quantidade disponível | Gramas; no cadastro e edição deve ficar entre zero e peso nominal |
| Valor pago | R$; não pode ser negativo; vazio é convertido em zero |
| Observações | Texto opcional |
| Custo por grama | Derivado de `valorPago / pesoNominal`, não do saldo atual; zero se peso nominal não for positivo |

O custo exibido permite de duas a quatro casas decimais em BRL. Saldos e indicadores em gramas são apresentados arredondados, sem alterar necessariamente o número armazenado. `1000` aparece como placeholder de peso/saldo, não como quantidade gravada automaticamente.

Cadastrar cria o rolo e uma movimentação ENTRADA com o saldo inicial, inclusive se ele for zero, com observação “Cadastro inicial do rolo.”. Editar pode alterar inclusive saldo, peso nominal e custo, mas não cria movimento correspondente. Excluir solicita confirmação e remove tanto o rolo quanto todos os seus movimentos. Não há bloqueio por referências em precificações.

### Busca, filtros e status

A busca considera material, marca, linha e cor, por substring sem diferenciar maiúsculas/minúsculas. Não normaliza acentos. O filtro de status é combinado com a busca; filtros não alteram os indicadores gerais.

| Status | Regra no código |
| --- | --- |
| ESGOTADO | Saldo menor ou igual a zero |
| ESTOQUE BAIXO | Saldo positivo e razão saldo/peso nominal menor ou igual a 0,2 |
| DISPONÍVEL | Demais casos |

O limite de 20% já está fixado em `LOW_STOCK_THRESHOLD`; é um comportamento existente, não uma nova regra proposta nem uma configuração editável. O indicador Estoque baixo conta apenas esse status, excluindo esgotados. Os outros indicadores mostram número de rolos e soma do saldo disponível de todos os registros.

**Divergência do filtro:** a opção HTML usa `disponivel`, enquanto o script converte `DISPONÍVEL` em `disponível`, preservando o acento. A comparação não coincide, portanto o filtro Disponíveis não encontra esses registros. Todos, Estoque baixo e Esgotados não têm essa diferença de acentuação.

### Movimentações implementadas

O painel lateral lista movimentos do rolo do mais recente para o mais antigo. Cada movimento tem ID, `filamentoId`, tipo, quantidade, data/hora ISO e observação opcional. Datas são exibidas com `toLocaleString('pt-BR')`.

| Tipo | Valor informado | Efeito no saldo | Validação |
| --- | --- | --- | --- |
| ENTRADA | Quantidade positiva em gramas | Soma ao saldo atual | Quantidade maior que zero |
| CONSUMO | Quantidade positiva em gramas | Subtrai do saldo atual | Maior que zero e não superior ao saldo |
| AJUSTE | Novo saldo real em gramas | Substitui o saldo | Novo saldo não negativo |

Em AJUSTE, `quantidade` guarda o saldo final informado, não a diferença em relação ao saldo anterior. Em CONSUMO, a quantidade também é armazenada positiva; é o tipo que define a subtração. Não se pode obter o saldo somando simplesmente todas as quantidades do histórico.

**Limitações observadas:**

- Saldo atual reside no cadastro do rolo; a aplicação não o reconstrói a partir do histórico.
- ENTRADA e AJUSTE podem elevar o saldo acima do peso nominal, embora cadastro/edição rejeitem essa situação.
- Edição direta de saldo sem movimento e exclusão do histórico junto ao rolo impedem auditabilidade completa.
- O histórico visual prefixa `+` em quantidades positivas tanto para ENTRADA quanto para CONSUMO; o saldo é subtraído corretamente no consumo, mas o sinal exibido é enganoso.
- Um AJUSTE vazio é convertido em zero e passa na validação; não há distinção entre ausência e zero nesse fluxo.
- Gravação do movimento e do saldo ocorre em chaves separadas, sem transação; uma falha pode deixar os dois inconsistentes.
- Depois de registrar ou fechar o painel, o formulário é resetado sem reaplicar `toggleMovementFields()`. Após usar AJUSTE, a visibilidade dos campos pode ficar desalinhada com o tipo retornado a ENTRADA.
- Movimentos não possuem edição/exclusão individual na interface. Não há vínculo com pedido, produção ou operador.

Essas limitações registram o comportamento atual; não definem a política desejada para o estoque futuro.

## 6. Calculadora e Precificação

### Entradas e operação implementadas

A Calculadora lê os cadastros locais e atualiza o resumo conforme seleção e digitação. A primeira impressora cadastrada é selecionada ao carregar a página. É mantida pelo menos uma linha de material; é possível adicionar e remover linhas adicionais.

| Entrada | Comportamento |
| --- | --- |
| Nome da peça/projeto | Texto exigido ao salvar |
| Quantidade produzida | Divisor do custo total; inicia em 1; não registra produção real |
| Impressora | Seleção por ID; fornece investimento, vida útil, potência e manutenção/h |
| Tempo de impressão | Horas mais minutos/60; referente à simulação inteira |
| Filamentos | Um ou vários rolos selecionados por ID, com gramagem por linha |
| Perdas | Preenchidas pela configuração geral quando presente; editáveis na simulação |
| Mão de obra | Opcional, inicialmente desligada; horas, minutos e valor/hora próprio, inicialmente vindo da configuração |
| Finalidade | Somente custo, Venda ou Consignação; alterna painéis de campos |
| Venda | Markup percentual ou preço manual por unidade |
| Consignação | Preço ao consumidor e repasse percentual ou fixo ao lojista |

Gramagens e duração são totais da simulação: não são multiplicadas pela quantidade produzida no cálculo de custo. A quantidade divide o custo e multiplica preços unitários nos resultados comerciais.

Todos os rolos cadastrados aparecem na seleção, inclusive sem saldo. O rótulo usa material, marca e cor, omitindo linha e ID, portanto rolos distintos podem parecer iguais. Selecionar o mesmo rolo em mais de uma linha é permitido. Os avisos comparam gramagem e saldo por linha, sem somar o consumo proposto das linhas do mesmo rolo.

Saldo insuficiente gera aviso, não bloqueio de salvamento. Nenhuma simulação ou precificação salva reduz estoque ou gera movimentação. Criar pedido está desabilitado e não integrado.

### Fórmulas de custo implementadas

As fórmulas abaixo representam `getTotalMaterialCost()`, `updateSummary()` e auxiliares. Valores vazios/nulos ou inválidos são frequentemente convertidos em zero por `safeNumber`; isso é uma limitação do tratamento de ausência, não um custo assumido como correto pelo negócio.

```text
horasImpressao = horas + minutos / 60
custoPorGramaDoRolo = valorPago / pesoNominal
material = soma(gramasDaLinha × custoPorGramaDoRolo)
energia = (consumoWatts / 1000) × tarifaEnergia × horasImpressao
depreciacaoHora = valorPagoDaImpressora / vidaUtilHoras
depreciacao = depreciacaoHora × horasImpressao
manutencao = manutencaoHora × horasImpressao
custosDiretos = material + energia + depreciacao + manutencao
perdas = custosDiretos × percentualPerdas / 100
horasManuais = horasMaoDeObra + minutosMaoDeObra / 60
maoDeObra = ativa ? horasManuais × valorHora : 0
custoTotal = custosDiretos + perdas + maoDeObra
custoUnitario = quantidade > 0 ? custoTotal / quantidade : 0
```

Peso nominal ou vida útil não positivos fazem seus quocientes retornarem zero. Sem impressora encontrada, energia, depreciação e manutenção ficam em zero. Linha sem filamento encontrado não participa da soma de material.

Perdas incidem sobre todos os custos diretos, antes da mão de obra. A fórmula central está de acordo com a separação definida em `AGENTS.md`: manutenção e energia não são somadas dentro da depreciação.

### Somente custo

Apura custos sem exigir preço ou lucro. `buildSalesResult()` retorna `null` para preço unitário/total, lucro, margem, repasse e receitas líquidas. O resumo comercial exibe “Sem finalidade ativa” e o custo total, apesar de Somente custo ser uma finalidade selecionada.

### Venda

Fórmulas efetivamente implementadas:

```text
precoUnitario = precoManual > 0
  ? precoManual
  : custoTotal × (1 + markup / 100)
precoTotal = precoUnitario × quantidade
lucro = precoTotal - custoTotal
margemPercentual = precoTotal > 0 ? lucro / precoTotal × 100 : 0
valorExibidoComoMargemLiquida = (precoUnitario - custoUnitario) × quantidade
```

**Divergência relevante:** o ramo automático aplica markup ao custo total do lote e apresenta o resultado como preço por unidade. Para quantidade maior que 1, depois multiplica esse valor novamente pela quantidade. Não aplica markup ao custo unitário. Uma eventual mudança de base precisa ser tratada em tarefa própria e preservar os históricos existentes.

Markup é acréscimo sobre custo; margem percentual é lucro dividido pela receita. A tela chama de “Margem líquida” um valor em reais que corresponde ao lucro do lote para quantidade válida, não à margem percentual calculada. Não há impostos, frete ou outras deduções comerciais nessa fórmula; o rótulo não constitui uma apuração contábil completa.

### Consignação

Fórmulas efetivamente implementadas:

```text
repasseUnitario = tipoRepasse == fixo
  ? valorRepasse
  : precoConsumidor × valorRepasse / 100
receitaLiquidaUnitaria = max(precoConsumidor - repasseUnitario, 0)
receitaLiquidaTotal = receitaLiquidaUnitaria × quantidade
lucro = receitaLiquidaTotal - custoTotal
margemPercentual = receitaLiquidaTotal > 0
  ? lucro / receitaLiquidaTotal × 100
  : 0
precoVendaTotal = precoConsumidor × quantidade
```

O repasse fixo é interpretado por unidade, não pelo lote. A margem usa a receita líquida da Rondy Lab como denominador. O resumo visível mostra preço ao consumidor, repasse e receita líquida unitária; lucro e margem percentual são calculados e salvos, mas não aparecem nesse resumo.

Não há validação de percentual máximo de repasse nem bloqueio se o repasse exceder o preço. `Math.max` limita a receita líquida a zero, ocultando um eventual valor negativo dessa diferença. Não há condição comercial obrigatória definida pelo negócio: os zeros iniciais são estados técnicos do formulário.

### Salvamento, validação e limites

Salvar exige nome não vazio, valor de seleção de impressora não vazio, pelo menos uma linha com filamento existente e gramagem positiva e quantidade maior que zero. Não exige que todas as linhas sejam válidas; o snapshot inclui todas elas. A verificação da impressora não confirma novamente sua existência por ID, embora o cálculo faça a consulta.

O botão de salvar é `type="button"`, fora de um fluxo de submissão de formulário. O script não chama validação nativa global. `min`, `max` e `step` no HTML não substituem validação explícita: duração positiva, integridade da quantidade, faixas de perdas, valores comerciais e gramagens das demais linhas não são todos reforçados ao salvar.

Parâmetros gerais ausentes permanecem `null` em Configurações, mas a Calculadora converte tarifa, perdas ou mão de obra vazias em zero no cálculo/snapshot. Não há bloqueio ou aviso específico de parâmetro geral ausente. Isso diverge da regra de tratar explicitamente ausência de valor configurado.

Novo cálculo limpa nome, tempos, materiais e campos comerciais, redefine quantidade para 1 e relê padrões de perdas/mão de obra. Mantém a impressora e a finalidade selecionadas; não é um reset completo da página. Também redefine o tipo de repasse sem atualizar explicitamente sua unidade visual, que pode continuar mostrando R$ após retornar a percentual.

O detalhamento expansível não é totalmente fiel às fórmulas: energia, depreciação e manutenção mostram taxa horária como `custo / max(duracao, 1)`. Para duração entre zero e uma hora, a expressão exibida multiplicada pela duração não reproduz o custo real. A linha de mão de obra mostra horas × valor mesmo se o toggle estiver desligado e o custo efetivo for zero. Os cálculos internos continuam seguindo as fórmulas acima.

## 7. Precificações históricas

**Formato implementado:** cada salvamento cria novo registro, acrescentado no início da lista, com ID `precificacao` mais timestamp e sufixo aleatório, `data` ISO e os campos resumidos `nome`, `quantidade`, `tipo`, `impressora` (nome), `totalCost`, `unitCost`, `material` e `detalhes`.

`material` contém por linha: `filamentId`, identificação textual incluindo linha/acabamento, nome resumido, gramas, custo por grama e custo calculado. `detalhes` guarda markup, preço manual, preço ao consumidor, tipo/valor de repasse, percentual de perdas e valor/hora de mão de obra quando ativa.

Novos registros também incluem `snapshot.versao: 2` e `snapshot.salvoEm`:

| Grupo do snapshot | Conteúdo persistido |
| --- | --- |
| Impressora | ID, nome, valor pago, vida útil, watts, manutenção/h e depreciação/h |
| Energia | Tarifa efetivamente convertida e usada no cálculo |
| Impressão e quantidade | Horas, minutos, duração em horas e quantidade produzida |
| Filamentos | Cópia dos dados de material usados no salvamento |
| Custos | Material, energia, depreciação, manutenção, diretos, percentual/valor de perdas, mão de obra ativa/horas/taxa/valor, total e unitário |
| Finalidade | Modo selecionado |
| Venda | Markup, preço manual, preços calculados, lucro e margem percentual |
| Consignação | Preço ao consumidor, tipo/valor/resultado do repasse e receitas líquidas unitária/total |

Os grupos comerciais são gravados para todas as finalidades. Alguns campos refletem inputs inativos; resultados não aplicáveis podem ser `null`. A finalidade deve orientar a interpretação. Lucro e margem de consignação ficam no grupo `venda`, recebidos do resultado comercial comum, enquanto receitas líquidas ficam em `consignacao`.

O snapshot preserva os valores usados, inclusive as limitações de cálculo descritas na seção 6. Alterar cadastros depois não regrava o registro salvo.

**Consulta implementada:** a lista mostra nome, tipo, impressora, custo total e unitário. Ver expande nome, impressora, custos, quantidade e finalidade usando campos resumidos do registro. Não há leitura do snapshot completo nessa visualização; data, parâmetros, fórmulas históricas e resultados comerciais não são todos expostos.

**Compatibilidade:** registros antigos sem snapshot continuam sendo exibidos se possuírem os campos resumidos esperados. Não há migração, reconstrução de parâmetros ausentes nem validação completa de schemas antigos. Não preencher um histórico antigo consultando custos atuais como se fossem os originais.

**Recalcular:** não implementado para registros salvos. Não há carregamento de histórico no formulário nem edição de precificação existente. Novo salvamento gera outro registro.

**Excluir:** implementado sem confirmação; remove o ID e regrava a lista. Se ainda houver outros registros, o detalhe anteriormente aberto pode permanecer mostrando o registro excluído; o painel é limpo automaticamente quando a lista fica vazia.

## 8. Produtos — planejamento

**Atual:** placeholder com “Módulo em desenvolvimento.”, sem cadastro nem integração operacional com o catálogo público.

**Planejado:** cadastrar e gerenciar os itens que podem ser fabricados, vendidos ou mantidos em estoque, com integração futura ao catálogo público.

**Possibilidades iniciais a validar:** identificação única, nome, descrição, categoria, imagens, preço, custo, disponibilidade e possível vínculo com uma ou mais precificações. Esses campos não constituem schema aprovado. Permanecem indefinidos a relação com snapshots, o tratamento de atualização de custos e a forma de disponibilização no catálogo.

## 9. Pedidos — planejamento

**Atual:** placeholder; o botão Criar pedido da Calculadora não cria registros.

**Planejado:** controlar demandas de clientes e acompanhar seu andamento, com conexão futura à produção.

Fluxo inicialmente proposto, ainda não implementado:

```text
Orçamento → Aprovado → Fila de impressão → Em produção → Finalizado → Entregue → Cancelado
```

Cancelado deve ser entendido como possível encerramento alternativo, não obrigatoriamente posterior a Entregue. As transições permitidas, critérios de aprovação e efeitos de cancelamento ainda precisam de definição; a sequência em `PROJECT.md` não é uma máquina de estados implementada.

Cliente, produto, quantidade, valor, prazo, observações, estado e histórico são informações possíveis a validar. Não há contrato de dados aprovado nem regra definida para reservar ou movimentar estoque ao mudar um pedido de estado.

## 10. Produção — planejamento

**Atual:** não existe módulo independente. O campo Quantidade produzida da Calculadora é somente entrada de simulação.

**Visão futura:** registrar uma fabricação real, identificando produto, impressora, quantidade produzida, consumo real por rolo e conclusão, permitindo entrada de produtos acabados no estoque.

A produção deverá evitar baixa duplicada de material e entrada duplicada de produtos ao repetir uma ação. Momento da baixa, vínculo com pedidos, tratamento de falhas, produção parcial, correções e mecanismo para impedir duplicações permanecem indefinidos. Não há modelo ou implementação aprovados para esses detalhes.

## 11. Estoque — planejamento

**Estoque de filamentos:** já existe em Filamentos, com saldo por rolo e movimentos manuais, sujeito às limitações da seção 5.

**Estoque de produtos acabados:** ainda não implementado; `/admin/estoque/` é placeholder.

**Visão futura:** acompanhar saldo disponível, entradas por produção, saídas por venda, envios em consignação, retornos, ajustes e histórico. Diferenciar produtos disponíveis, em produção e enviados a lojistas. O estoque deve permitir auditar eventos reais e seus efeitos.

Salvar uma precificação não é evento de produção nem de consumo e não deve movimentar nenhum estoque. Políticas de reserva, saldo negativo, correções e vínculo de cada evento com outros módulos precisam de definição posterior.

## 12. Consignação — planejamento

**Atual:** módulo placeholder. A Calculadora simula preço e repasse, mas não mantém lojistas, entregas, vendas ou contas a receber.

**Modelo pretendido:** a Rondy Lab poderá enviar produtos para lojistas venderem ao consumidor final. A gestão futura deverá permitir acompanhar:

- Cadastro de lojistas e produtos enviados.
- Quantidades entregues, remanescentes e vendidas.
- Reposições e devoluções.
- Preço ao consumidor, comissão ou repasse ao lojista e valor devido à Rondy Lab.
- Histórico de acertos e estado de pagamento.

As condições comerciais devem ser configuráveis por negociação, sem percentual fixo obrigatório. A estrutura dessas negociações, datas, regras de apuração e permissões ainda será validada.

Existe intenção de oferecer visualização específica para cada lojista. Não há acesso de lojista implementado, nem URLs públicas autorizadas por este documento. Autenticação e isolamento de dados precisam ser definidos antes desse fluxo.

## 13. Relacionamentos entre módulos

Visão operacional de evolução:

```text
Configurações + Impressoras + Filamentos
                 ↓
             Calculadora → Produtos → Pedidos → Produção → Estoque → Venda/Consignação
```

| Integração | Situação |
| --- | --- |
| Configurações → Calculadora | Implementada: tarifa lida nos cálculos; perdas/mão de obra copiadas para inputs ao iniciar/resetar |
| Impressoras → Calculadora | Implementada: seleção por ID e consulta de parâmetros atuais |
| Filamentos → Calculadora | Implementada: seleção por ID, consulta de custo e saldo; sem movimentação |
| Filamentos ↔ Movimentações | Implementada internamente no módulo; gravações separadas de cadastro e histórico |
| Calculadora → Precificações salvas | Implementada: novo registro com resumo e snapshot |
| Calculadora → Produtos/Pedidos | Planejada; relação e contrato ainda indefinidos |
| Produtos → Catálogo público | Planejada; nenhuma publicação automática atual |
| Pedidos → Produção → Estoque | Planejada; eventos e estados ainda indefinidos |
| Estoque → Venda/Consignação | Planejada; nenhum fluxo operacional implementado |
| Módulos → Dashboard | Integração de indicadores ainda ausente |

A aplicação não oferece sincronização reativa entre abas. Os selects da Calculadora são montados na inicialização ou ao adicionar linhas; não há listener de `storage` para atualizar toda a tela após mudanças em outra aba.

Hoje os eventos reais registrados são cadastro inicial de rolo e suas movimentações manuais. Futuramente consumo de produção, conclusão, venda, envio, retorno e ajuste deverão representar operações reais. Seus gatilhos exatos não estão definidos; não presumir baixa ao aprovar pedido ou ao salvar simulação. Venda também não possui módulo independente atualmente.

## 14. Persistência e integridade

O Admin usa `localStorage` com JSON, separado por origem e perfil de navegador. Live Server e produção podem acessar conjuntos diferentes. Não há sincronização entre dispositivos, banco remoto, API própria, autenticação, controle de permissões ou backup implementado na interface.

As coleções funcionais atuais são configurações gerais, impressoras, filamentos, movimentos de filamentos e precificações. Os nomes exatos das chaves e os schemas completos deverão ser detalhados em `docs/DATA-MODEL.md`, ainda não existente neste levantamento. Este documento não renomeia nem redefine chaves.

Princípios para evolução:

- Preservar dados e chaves existentes; qualquer mudança de estrutura precisa considerar todos os leitores e escritores.
- Manter IDs estáveis e relacionamentos por ID, sem usar nomes como vínculo único.
- Preservar snapshots e compatibilidade com registros antigos; não recalcular o passado silenciosamente.
- Avaliar referências antes de definir exclusões. Hoje excluir impressora ou filamento não verifica precificações; os valores copiados no histórico permanecem, mas o cadastro referenciado pode deixar de existir.
- Não interpretar ausência de dados ou falha de leitura como autorização para sobrescrever dados reais com padrões.

**Limites atuais:** helpers capturam falhas de leitura e retornam fallback; falhas de escrita geram `console.warn`, sem retorno de sucesso/erro ao fluxo chamador. A interface pode mostrar sucesso ou fechar um formulário mesmo após falha de persistência. Uma leitura malformada seguida de salvamento pode substituir dados anteriores pelo estado de fallback; não há recuperação automática. Atualizações usam leitura e regravação de coleções inteiras, sem transações ou proteção contra gravações concorrentes.

IDs combinam timestamp e aleatoriedade local; são gerados para distinguir registros, mas não há verificação explícita de colisão. As listas validam em geral se o dado é array, não todos os campos de cada item.

Há interpolação de nomes, observações e outros valores em `innerHTML` nos módulos. Isso diverge da orientação de renderização segura de conteúdo inserido pelo usuário e deve ser revisto em tarefa própria. Não armazenar dados sensíveis nem tratar o Admin como ambiente protegido pelo simples fato de não haver link público.

## 15. Regras de UX do Admin

Consultar `docs/DESIGN-SYSTEM.md` para cores, componentes e medidas.

| Tema | Existente | Diretriz para futuras telas |
| --- | --- | --- |
| Formulários | Labels, unidades, painéis de cadastro e mensagens locais | Explicitar obrigatoriedade, unidade e ausência de configuração; evitar complexidade desnecessária |
| Feedback | Erros de validação; sucesso ao salvar precificação; listas atualizadas após cadastro | Informar sucesso real e falhas de persistência, sem prometer gravação não confirmada |
| Exclusão | Confirmação para impressoras/filamentos; precificação excluída diretamente | Confirmar exclusões destrutivas e explicar efeitos em referências/histórico |
| Tabelas | Filamentos com busca, status textual e rolagem horizontal | Preservar legibilidade, ações identificáveis e estados vazios claros |
| Moeda | `Intl.NumberFormat`, `pt-BR`, BRL; 2 casas em Configurações/Calculadora e até 4 em Filamentos | Manter reais e precisão adequada sem arredondar prematuramente cálculos |
| Navegação | Sidebar e marcação ativa consistentes entre páginas | Reutilizar navegação e hierarquia existentes |
| Responsividade | Breakpoints administrativos de 980px e 640px; tabela rolável | Verificar desktop, tablet e mobile; Filamentos possui lacunas de redução de grids |
| Preenchimento | Erro de validação mantém campos; cancelar/resetar descarta dados | Preservar dados preenchidos sempre que possível e esclarecer descartes |
| Acessibilidade | Mensagens com `aria-live`, labels e toggle com `aria-expanded` | Garantir foco visível, associação de labels e navegação por teclado, inclusive em painéis |

Não há persistência de rascunhos, confirmação uniforme ao sair ou proteção geral contra perda de preenchimento. Essas melhorias são recomendações, não funcionalidades existentes.

## 16. Pendências e decisões em aberto

### Definições futuras, sem decisão nesta etapa

- Modelo de Produtos, identificação, imagens, disponibilidade, custo e preço.
- Relação Produtos/Calculadora: vínculo com precificações e política de atualização de valores.
- Estrutura de Pedidos, dados de cliente, estados e transições permitidas.
- Fluxo de Produção, consumo real, conclusão e prevenção de duplicidades.
- Eventos e regras de estoque de produtos acabados, reservas, ajustes e retornos.
- Gestão de consignação, negociação, apuração, acertos e pagamentos.
- Publicação e atualização do catálogo público a partir do Admin.
- Autenticação, permissões administrativas e acesso isolado de lojistas.
- Banco remoto, migração, sincronização e backup. Supabase é possibilidade em avaliação, não tecnologia adotada.

### Divergências e limitações a tratar em tarefas próprias

| Ponto | Evidência / consequência |
| --- | --- |
| Markup sobre lote tratado como unidade | `buildSalesResult()` usa `totalCost` no preço unitário automático e depois multiplica por quantidade |
| Ausência financeira convertida em zero | Cálculo e snapshot não distinguem parâmetro não configurado de custo efetivamente zero; manutenção e aquisição de filamento vazias também viram zero |
| Texto de depreciação incorreto | Nota inclui energia/manutenção, mas a função calcula somente investimento/vida útil |
| Detalhes de custo inexatos | Taxa horária exibida usa `max(duracao, 1)`; mão de obra detalhada ignora o toggle na expressão textual |
| Margem rotulada em reais | Venda exibe lucro monetário como “Margem líquida”; percentual calculado não é mostrado |
| Filtro Disponíveis | Valor sem acento no HTML versus status acentuado no JS |
| Auditabilidade de filamentos | Saldo editável sem movimento; exclusão elimina histórico; consumo aparece com sinal positivo |
| Validação incompleta | Limites HTML não reforçados em todos os fluxos; uma linha válida permite salvar outras inválidas |
| Repasse excessivo | Receita é truncada em zero, sem validação comercial do excesso |
| Histórico parcialmente visível | Snapshot existe, mas Ver só mostra resumo; não há recalcular; exclusão sem confirmação pode deixar detalhe antigo aberto |
| Estado de formulários após reset | Campos de movimentação e unidade de repasse podem permanecer visualmente desalinhados |
| Persistência e segurança | Falhas não chegam ao usuário; gravações não transacionais; interpolação de dados em HTML |

A visão geral de `PROJECT.md` permanece válida quanto ao estado dos módulos, mas “funcional” não significa integridade completa. As diretrizes de ausência explícita de valores, preservação de histórico e renderização segura de `AGENTS.md` ainda não estão integralmente atendidas pelo código descrito. Nenhuma correção foi feita nesta etapa.

## 17. Checklist para novas funcionalidades

1. Consultar `AGENTS.md`.
2. Consultar `docs/PROJECT.md`.
3. Consultar `docs/DESIGN-SYSTEM.md`.
4. Consultar `docs/ADMIN.md`.
5. Consultar `docs/DATA-MODEL.md`, quando existir.
6. Verificar o código real, sem presumir que planejamento já foi implementado.
7. Identificar dependências, leitores e escritores dos dados afetados.
8. Confirmar regras de negócio ainda indefinidas quando necessárias ao escopo, sem inventar valores ou contratos.
9. Preservar dados existentes, IDs, referências e snapshots históricos.
10. Implementar somente o escopo solicitado.
11. Validar cálculos, persistência e responsividade; distinguir simulação de movimentação real e verificar efeitos repetidos.
12. Informar arquivos alterados, verificações realizadas e testes manuais necessários.
