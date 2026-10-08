# Rondy Lab — Modelo de dados

> Atualização — integração inicial com Supabase Auth: o Admin agora possui login por e-mail/senha, verificação de sessão e logout. Os dados operacionais continuam nas cinco chaves locais, sem migração. As afirmações abaixo sobre ausência de autenticação descrevem o levantamento anterior. Consulte `docs/SUPABASE-AUTH.md` para o estado atual e os limites desta etapa. As tabelas remotas existentes e suas políticas não foram alteradas nem auditadas nesta integração.

Referência técnica da implementação consultada em 7 de outubro de 2026. A fonte dos schemas é o JavaScript atual da árvore de trabalho, inclusive alterações locais já existentes. Nenhum dado real de navegador foi lido ou modificado. Descrever uma estrutura ou risco não significa aprovar mudanças de schema.

Documentação consultada: `AGENTS.md`, `docs/PROJECT.md`, `docs/DESIGN-SYSTEM.md` e `docs/ADMIN.md`.

Fontes de código:

- `admin/configuracoes/configuracoes.js`: configurações e impressoras.
- `admin/filamentos/filamentos.js`: rolos e movimentações.
- `admin/calculadora/calculadora.js`: cálculos, consultas e precificações.
- `admin/js/admin.js`: navegação, sem persistência.
- `admin/configuracoes/index.html`, `admin/filamentos/index.html` e `admin/calculadora/index.html`: limites dos controles e opções de formulário.
- Busca de operações de armazenamento em todo o repositório. Para confirmar o formato legado, também foi consultada a versão de `admin/calculadora/calculadora.js` em `HEAD`; ela não substitui a árvore de trabalho como fonte do formato atual.

## 1. Visão geral da persistência

O Admin serializa objetos e arrays com `JSON.stringify()` e os lê com `JSON.parse()` no `localStorage`. O armazenamento é local ao perfil de navegador e à origem (protocolo, domínio e porta). Live Server e produção podem apresentar bases distintas. Abas da mesma origem compartilham armazenamento, mas não há sincronização reativa implementada na interface nem sincronização entre dispositivos.

É uma solução temporária da fase atual. Não há banco remoto, API própria, autenticação, permissões por usuário, backup pela interface ou transações entre chaves. Cada gravação substitui integralmente o valor da chave; não há atualização parcial de registros no mecanismo de armazenamento.

Os schemas abaixo descrevem o que os fluxos atuais gravam. Não são validadores executáveis nem garantia sobre registros antigos ou alterados manualmente. `number` representa número JSON/JavaScript, sem tipo decimal monetário específico. Datas são strings ISO produzidas por `new Date().toISOString()`, não objetos Date persistidos. Os horários dependem do relógio local do dispositivo.

Compatibilidade com registros anteriores deve ser preservada. Somente snapshots têm versão explícita atualmente; não existe envelope geral versionado para as coleções.

## 2. Inventário completo de chaves

Foram encontradas **cinco chaves distintas**, todas já conhecidas na auditoria. Não foram identificadas novas chaves ou chamadas a `localStorage.removeItem()`/`localStorage.clear()` no código do projeto. Excluir um registro significa filtrar um array e regravá-lo com `setItem`, mantendo a chave, inclusive como `[]`.

Abreviações de arquivos nesta tabela: **Configurações** = `admin/configuracoes/configuracoes.js`; **Filamentos** = `admin/filamentos/filamentos.js`; **Calculadora** = `admin/calculadora/calculadora.js`.

| Chave exata | Tipo JSON / finalidade | Consulta | Altera / responsável | Ausência | Dado inválido |
| --- | --- | --- | --- | --- | --- |
| `rondyLabConfiguracoesGerais` | Objeto; parâmetros gerais | Configurações e Calculadora | Configurações, via `saveSettings()` | Objeto com três propriedades `null` | JSON inválido retorna padrão; objeto lido é combinado com padrão, sem validar tipo ou campos |
| `rondyLabConfiguracoesImpressoras` | Array de impressoras | Configurações e Calculadora | Configurações, via `savePrinters()` | `[]` | JSON inválido, `null` ou valor que não é array resulta em `[]`; elementos não são validados |
| `rondyLabFilamentos` | Array de rolos | Filamentos e Calculadora | Filamentos, via `saveFilamentos()` | `[]` | Mesmo tratamento de array; sem validação completa dos elementos |
| `rondyLabFilamentosMovimentacoes` | Array de movimentos de rolos | Filamentos | Filamentos, via `saveMovimentacoes()` | `[]` | Mesmo tratamento de array; sem validação dos vínculos, tipos ou datas na leitura |
| `rondyLabPrecificacoesSalvas` | Array de registros históricos | Calculadora | Calculadora, via `saveSavedPricings()` | `[]` | Mesmo tratamento de array; sem validação de versão ou consistência entre resumo e snapshot |

Nos três scripts, `readStorage()` usa `getItem`, retorna fallback se não houver texto ou se o JSON for `null`, e captura falha de acesso/parse com `console.warn`. Ler um fallback não grava automaticamente a chave. Arrays com itens malformados passam por `Array.isArray` e podem causar exceções nas renderizações posteriores, fora do `try/catch` de leitura.

Configurações não verifica se o JSON é objeto de parâmetros: `getSettings()` faz spread do valor lido sobre `DEFAULT_SETTINGS`. Campos desconhecidos podem aparecer no objeto em memória, mas `saveSettings()` grava somente os três campos conhecidos.

`writeStorage()` captura falhas e apenas escreve no console, sem sinalizar sucesso/erro ao chamador. Uma ação posterior pode substituir dados malformados pelo fallback alterado. Não há quarentena de dados inválidos, recuperação ou rollback.

## 3. Configurações gerais

Chave: `rondyLabConfiguracoesGerais`. Objeto atual sem ID, data ou versão.

| Campo | Tipo gravado | Unidade | Obrigatoriedade / valores | Uso |
| --- | --- | --- | --- | --- |
| `tarifaEnergia` | number ou null | R$/kWh | Propriedade sempre escrita; preenchimento opcional. HTML: mínimo 0, passo 0,01 | Energia em `updateSummary()` |
| `perdaPadrao` | number ou null | % | Propriedade sempre escrita; preenchimento opcional. HTML: 0 a 100, passo 0,01 | Preenche `percentual-perdas` em `resetInputs()` |
| `maoObraPadrao` | number ou null | R$/h | Propriedade sempre escrita; preenchimento opcional. HTML: mínimo 0, passo 0,01 | Preenche `labor-rate` em `resetInputs()` |

`normalizaNumero()` retorna `null` para `''`, `null`, `undefined` ou conversão não finita; nos demais casos substitui vírgula por ponto e usa `Number`. Não aplica limites de faixa. O evento `input` grava imediatamente; não há verificação de validade nativa antes da gravação. Assim, as faixas HTML são a intenção dos controles, não uma restrição garantida da persistência. Qualquer número finito recebido pode ser gravado, inclusive fora dessas faixas.

**Fallbacks financeiros confirmados:** `DEFAULT_SETTINGS` nos dois consumidores usa os três campos como `null`. Não há tarifa, perda ou valor/hora comercial arbitrário nesse objeto. Configurações renderiza ausência como vazio, e a Calculadora usa `?? ''` ao preencher perdas e mão de obra.

**Limitação remanescente:** `safeNumber(null, 0)` e `safeNumber('', 0)` resultam em zero. A Calculadora ainda converte parâmetros ausentes em zero ao calcular e salvar o snapshot. A remoção de padrões numéricos nas configurações não eliminou essa conversão nem implementou aviso de ausência. Valores previamente armazenados não são removidos automaticamente.

## 4. Impressoras

Chave: `rondyLabConfiguracoesImpressoras`; array, com cada novo objeto contendo exatamente os campos abaixo.

| Campo | Tipo | Unidade / significado | Validação na criação/edição |
| --- | --- | --- | --- |
| `id` | string | Identidade estável do registro | Gerado no cadastro; sem verificação de colisão |
| `nome` | string | Nome da máquina | Aparado; ao menos dois caracteres |
| `valorPago` | number | R$ investidos | Maior que zero |
| `vidaUtilHoras` | number | Horas de vida útil | Maior que zero |
| `consumoWatts` | number | Potência média em W | Maior que zero |
| `manutencaoHora` | number | Reserva em R$/h | Não negativa; vazio convertido em zero |

Formato de geração do ID: `printer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`. O sufixo é extraído da representação hexadecimal, com até seis caracteres; não é UUID. Não há timestamps próprios de cadastro ou edição nesse schema.

O formulário usa `vidaUtil`, `consumoEnergia` e `manutencao` como nomes de entrada; o script os mapeia para `vidaUtilHoras`, `consumoWatts` e `manutencaoHora`. Não confundir nomes HTML com campos persistidos.

Cadastrar faz `push`; editar procura o primeiro ID com `findIndex`, preserva campos existentes por spread e substitui os campos editáveis. Excluir, após confirmação, filtra todos os registros com aquele ID e regrava a coleção. Nomes repetidos não são bloqueados.

Valor derivado, não salvo no cadastro:

```text
depreciacaoHora = vidaUtilHoras > 0 ? valorPago / vidaUtilHoras : 0
```

Energia e manutenção são calculadas separadamente. A nota visual que menciona esses componentes sob a depreciação não corresponde à função real.

A Calculadora consulta o registro atual por ID; edição afeta novas simulações que consultem esse cadastro. Exclusão não verifica referências e pode deixar seleções antigas sem registro correspondente. Precificações já salvas mantêm nome, valores e snapshot copiados; não são atualizadas nem excluídas junto com a máquina.

## 5. Filamentos

Chave: `rondyLabFilamentos`; array de rolos individuais. Marca/material/cor iguais não unificam registros.

| Campo | Tipo gravado | Significado / validação de cadastro e edição |
| --- | --- | --- |
| `id` | string | Gerado por `uniqueId('filamento')`; mantido na edição |
| `material` | string | Um de `PLA`, `PETG`, `ABS`, `ASA`, `TPU`, `Outro` |
| `marca` | string | Aparada; mínimo dois caracteres |
| `linha` | string | Linha/acabamento opcional; vazio como `""` |
| `cor` | string | Aparada; mínimo dois caracteres |
| `pesoNominal` | number | Gramas; maior que zero. HTML: mínimo 1, passo 1 |
| `quantidadeDisponivel` | number | Saldo em gramas; entre 0 e `pesoNominal` no cadastro/edição |
| `valorPago` | number | R$ de aquisição; não negativo; vazio vira zero |
| `observacoes` | string | Opcional, aparada; vazio como `""` |
| `criadoEm` | string ISO | Data/hora do cadastro |
| `atualizadoEm` | string ISO | Data/hora do cadastro, última edição ou movimentação |

Formato de ID: `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, com prefixo `filamento` e sufixo de até oito caracteres. Datas de criação e atualização são chamadas separadas de `new Date()` e podem diferir por milissegundos.

Campos derivados, não persistidos no cadastro:

```text
custoPorGrama = pesoNominal > 0 ? valorPago / pesoNominal : 0
saldo <= 0                                      → ESGOTADO
saldo > 0 e saldo / pesoNominal <= 0.2           → ESTOQUE BAIXO
demais casos                                   → DISPONÍVEL
```

O custo usa peso nominal, não o saldo restante. Para dados inválidos, a função de status usa `safeNumber(pesoNominal, 1)` e define a razão como zero se o peso resultante não for positivo. O limiar de 20% é constante atual, não configuração do usuário. Status, custo/g e indicadores são recalculados na leitura/renderização.

Cadastrar grava uma ENTRADA inicial e o rolo em operações separadas. Editar mantém ID e criação via spread, atualiza `atualizadoEm` e permite alterar saldo sem movimentação. A atribuição do saldo usa `Math.min` após validar saldo ≤ peso nominal.

Excluir solicita confirmação, remove o rolo e depois filtra todos os movimentos com seu `filamentoId`. Não verifica precificações. Estas mantêm referências e cópias antigas. A Calculadora consulta custo e saldo atuais por ID, sem gravar nesta chave; pode usar o mesmo rolo em várias linhas. Alertas de saldo são por linha, não agregados por ID.

## 6. Movimentações de filamentos

Chave: `rondyLabFilamentosMovimentacoes`; array global de movimentos, filtrado por rolo na interface.

| Campo | Tipo gravado | Semântica |
| --- | --- | --- |
| `id` | string | `uniqueId('mov')`, mesma função de Filamentos |
| `filamentoId` | string | Referência ao `id` de um rolo |
| `tipo` | string | `ENTRADA`, `CONSUMO` ou `AJUSTE` |
| `quantidade` | number | Gramas; interpretação depende de `tipo` |
| `dataHora` | string ISO | Momento da gravação no relógio do dispositivo |
| `observacao` | string | Opcional; `""` se não preenchida |

| Tipo | Valor persistido em `quantidade` | Atualização de saldo | Validação |
| --- | --- | --- | --- |
| ENTRADA | Quantidade adicionada, positiva | `saldoAtual + quantidade` | Manualmente deve ser > 0 |
| CONSUMO | Quantidade retirada, positiva | `saldoAtual - quantidade` | > 0 e ≤ saldo atual |
| AJUSTE | **Saldo final absoluto**, não uma variação | `saldoAjuste` | Deve ser ≥ 0 |

A ENTRADA automática do cadastro inicial pode ter quantidade zero; não passa pelo validador do formulário de movimentação. Sua observação é `Cadastro inicial do rolo.`. AJUSTE vazio é convertido em zero e aceito. ENTRADA/AJUSTE não limitam saldo ao peso nominal. O fluxo rejeita saldo final negativo e exige encontrar o filamento selecionado antes de prosseguir.

Ordem de gravação manual: acrescentar e salvar movimento; reler rolos; atualizar saldo e `atualizadoEm`; salvar rolos. Cadastro inicial também salva movimento antes da coleção de rolos. Não há transação nem rollback.

O saldo utilizado é `quantidadeDisponivel` do cadastro; não há recomposição automática pelo histórico. Somar `quantidade` de todos os movimentos é incorreto: CONSUMO subtrai e AJUSTE substitui. O schema não guarda saldo anterior, diferença do ajuste, operador, motivo obrigatório ou referência de produção/pedido.

Movimentos são exibidos em ordem decrescente de data, sem edição/exclusão individual. Excluir rolo elimina seus movimentos. Edição direta de saldo não deixa evento. A apresentação de CONSUMO pode prefixar `+` por armazenar quantidade positiva, embora o saldo seja subtraído; o tipo continua sendo a fonte de interpretação.

## 7. Precificações salvas

Chave: `rondyLabPrecificacoesSalvas`; array. Cada salvamento cria novo ID e insere o registro no início com `unshift`. Não há atualização ou recálculo de registro existente.

### 7.1. Nível superior atual

| Campo | Tipo | Origem / semântica |
| --- | --- | --- |
| `id` | string | `uniqueId('precificacao')`; timestamp e sufixo hexadecimal de até oito caracteres |
| `nome` | string | Nome do projeto aparado; obrigatório ao salvar |
| `data` | string ISO | Momento do salvamento |
| `quantidade` | number | Quantidade da simulação; validação exige > 0, mas não reforça inteiro no JS |
| `tipo` | string | `somente-custo`, `venda` ou `consignacao`, conforme radio selecionado |
| `impressora` | string | Nome copiado da máquina; fallback `Sem impressora`; não é ID |
| `totalCost` | number | Custo total calculado |
| `unitCost` | number | Custo por unidade calculado |
| `material` | array de objetos | Todas as linhas, inclusive incompletas se outra linha satisfizer a validação |
| `detalhes` | objeto | Entradas comerciais e parâmetros resumidos |
| `snapshot` | objeto | Cópia histórica versão 2, confirmada no escritor atual |

### 7.2. `material[]` e `snapshot.filamentos[]`

Ambos recebem o mesmo array em memória antes de `JSON.stringify`. No JSON são cópias estruturais, sem vínculo reativo ou referência compartilhada após o parse.

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `filamentId` | string ou null | ID do rolo encontrado; null se não encontrado |
| `identificacao` | string | `material • marca • linha (ou Sem linha) • cor`; fallback `Filamento não selecionado` |
| `nome` | string | `material • marca • cor`; mesmo fallback |
| `grams` | number | Gramagem informada na linha, convertida por `safeNumber` |
| `costPerGram` | number | Custo/g utilizado no momento |
| `materialCost` | number | `grams × costPerGram` |

Não há `pesoNominal` ou `valorPago` do rolo copiados separadamente nesse objeto. O custo/g é preservado, mas sua decomposição histórica de aquisição não está completa. Identificação é texto composto, não objetos independentes de marca/cor/linha.

### 7.3. `detalhes`

| Campo | Tipo | Unidade / semântica |
| --- | --- | --- |
| `markup` | number | % informado |
| `precoManual` | number | R$/unidade informado |
| `precoConsumidor` | number | R$/unidade informado |
| `repasseTipo` | string | `percentual` ou `fixo` |
| `repasseValor` | number | % ou R$/unidade, conforme tipo |
| `perdas` | number | Percentual aplicado aos custos diretos |
| `maoObra` | number | **Valor/hora**, não custo total; zero se mão de obra inativa |

Campos comerciais inativos também são gravados com seus valores de formulário. Interpretar sempre junto de `tipo`/`snapshot.finalidade`.

### 7.4. Estrutura completa de `snapshot`

| Campo direto | Tipo | Semântica |
| --- | --- | --- |
| `versao` | number | Literal `2` |
| `salvoEm` | string ISO | Nova chamada de data; pode diferir de `data` por milissegundos |
| `impressora` | objeto | Dados copiados descritos abaixo |
| `tarifaEnergia` | number | R$/kWh efetivamente usado; ausência já convertida em zero |
| `impressao` | objeto | Duração descrita abaixo |
| `quantidadeProduzida` | number | Mesma quantidade de nível superior; não é produção efetiva |
| `filamentos` | array | Estrutura da seção 7.2 |
| `custos` | objeto | Componentes e totais descritos abaixo |
| `finalidade` | string | Mesmo modo comercial de `tipo` |
| `venda` | objeto | Resultado comercial comum, inclusive lucro da consignação |
| `consignacao` | objeto | Inputs de repasse e receitas líquidas |

`snapshot.impressora`:

| Campo | Tipo | Unidade / origem |
| --- | --- | --- |
| `id` | string ou null | ID da máquina encontrada |
| `nome` | string | Nome copiado ou `Sem impressora` |
| `valorPago` | number | R$ |
| `vidaUtilHoras` | number | Horas |
| `consumoWatts` | number | W |
| `manutencaoHora` | number | R$/h |
| `depreciacaoHora` | number | R$/h derivado |

Campos numéricos da máquina recebem zero quando ausentes/invalidamente convertidos. `snapshot.impressao` contém `horas` (number), `minutos` (number) e `duracaoHoras` (number, horas + minutos/60).

`snapshot.custos`:

| Campo / caminho interno | Tipo | Unidade / semântica |
| --- | --- | --- |
| `material` | number | R$ total de filamentos |
| `energia` | number | R$ total de energia |
| `depreciacao` | number | R$ total de depreciação |
| `manutencao` | number | R$ total de manutenção |
| `diretos` | number | Soma dos quatro componentes acima |
| `perdas` | objeto | Contém `percentual` e `valor` |
| `perdas.percentual` | number | % informado |
| `perdas.valor` | number | R$ sobre custos diretos |
| `maoDeObra` | objeto | Contém os quatro campos seguintes |
| `maoDeObra.ativa` | boolean | Toggle da mão de obra |
| `maoDeObra.horas` | number | Tempo manual convertido em horas, mesmo se inativa |
| `maoDeObra.valorHora` | number | R$/h; zero quando inativa |
| `maoDeObra.valor` | number | R$ total; zero quando inativa |
| `total` | number | Custo total do lote |
| `unitario` | number | Custo por unidade |

`snapshot.venda`:

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `markupPercentual` | number | Input de markup, mesmo se modo não for venda |
| `precoManual` | number | Input de preço manual |
| `precoVendaUnitario` | number ou null | Preço calculado na venda; preço ao consumidor na consignação; null em somente custo |
| `precoVendaTotal` | number ou null | Preço unitário × quantidade; null em somente custo |
| `lucro` | number ou null | Resultado comercial do lote, inclusive na consignação; null em somente custo |
| `margemPercentual` | number ou null | Margem calculada com denominador dependente da finalidade |

`snapshot.consignacao`:

| Campo | Tipo | Semântica |
| --- | --- | --- |
| `precoConsumidor` | number | Input em R$/unidade, mesmo se inativo |
| `repasseTipo` | string | `percentual` ou `fixo` |
| `repasseValor` | number | Input em % ou R$/unidade |
| `repasseCalculado` | number ou null | R$/unidade do lojista; null fora de consignação |
| `receitaLiquidaUnitario` | number ou null | R$/unidade da Rondy Lab; nome exato termina em `Unitario` |
| `receitaLiquidaTotal` | number ou null | Receita líquida do lote; null fora de consignação |

Não há objeto separado de lucro da consignação: esse resultado fica em `snapshot.venda.lucro`. Não substituir os nomes existentes por terminologia mais uniforme sem estratégia de compatibilidade.

### 7.5. Formato legado e leitura atual

A versão consultada em `HEAD`, anterior às alterações locais de snapshot, gravava os mesmos campos superiores até `detalhes`, **sem `snapshot`**. `material[]` continha somente `filamentId`, `nome` e `grams`; não guardava `identificacao`, `costPerGram` ou `materialCost`. `detalhes` tinha os mesmos sete campos da seção 7.3.

O escritor legado extraía `totalCost` e `unitCost` do texto monetário já formatado no resumo, convertido novamente em número. O escritor atual usa os números de `updateSummary()`, sem esse arredondamento de apresentação intermediário. Não presumir que seja possível recuperar precisão, duração, tarifa ou parâmetros de máquina de registros legados.

O leitor atual não ramifica por versão: valida somente o array, usa campos superiores para listar e mostrar detalhes, e não consulta o snapshot para montar essa visualização. Assim, registros legados com os campos esperados continuam visíveis. Campos monetários ausentes/inválidos podem aparecer como zero por `toCurrency`, e outros campos ausentes podem aparecer como `undefined`.

Não há migração automática, enriquecimento histórico, edição ou botão de recalcular registro salvo. A lista permite Ver e Excluir; exclusão regrava o array sem confirmação. Não existe verificação de concordância entre `totalCost` e `snapshot.custos.total`, por exemplo. Esses campos são coerentes quando criados pelo escritor atual, mas podem divergir em dados alterados externamente.

## 8. Fórmulas e valores derivados

As fórmulas a seguir descrevem a implementação; os nomes em português nesta seção são notação explicativa, não novos campos persistidos. Quantidade, tempo e materiais correspondem ao lote simulado. Gramagens e duração não são multiplicadas pela quantidade antes de calcular os custos.

```text
horasImpressao = horas + minutos / 60
horasManuais = horasManuaisInformadas + minutosManuais / 60
custoPorGrama = pesoNominal > 0 ? valorPagoDoRolo / pesoNominal : 0
material = soma(gramas × custoPorGrama), apenas para rolos encontrados
energia = (consumoWatts / 1000) × horasImpressao × tarifaEnergia
depreciacaoHora = vidaUtilHoras > 0 ? valorPagoDaImpressora / vidaUtilHoras : 0
depreciacao = depreciacaoHora × horasImpressao
manutencao = manutencaoHora × horasImpressao
custosDiretos = material + energia + depreciacao + manutencao
perdas = custosDiretos × percentualPerdas / 100
maoDeObra = ativa ? horasManuais × valorHora : 0
custoTotal = custosDiretos + perdas + maoDeObra
custoUnitario = quantidade > 0 ? custoTotal / quantidade : 0
```

Sem máquina encontrada, energia, depreciação e manutenção retornam zero. Perdas não incidem sobre mão de obra. As fórmulas centrais coincidem com a regra geral documentada, com proteções de divisão por zero e conversões de ausência descritas acima.

### Venda implementada

```text
precoUnitario = precoManual > 0 ? precoManual : custoTotal × (1 + markup / 100)
precoTotal = precoUnitario × quantidade
lucro = precoTotal - custoTotal
margemPercentual = precoTotal > 0 ? lucro / precoTotal × 100 : 0
```

Preço manual positivo prevalece sobre markup; zero não representa uma venda gratuita explícita, pois ativa o ramo automático. Markup é acréscimo sobre a base de custo, diferente de margem sobre receita.

**Divergência:** o ramo automático usa `totalCost`, não `unitCost`, e chama o resultado de preço unitário antes de multiplicá-lo por quantidade. Para lotes maiores que uma unidade isso difere de aplicar markup ao custo unitário. Não corrigir históricos retroativamente. A tela exibe `(precoUnitario - custoUnitario) × quantidade` em reais sob o rótulo Margem líquida, e não o percentual calculado.

### Consignação implementada

```text
repasseCalculado = repasseTipo == fixo
  ? repasseValor
  : precoConsumidor × repasseValor / 100
receitaLiquidaUnitario = max(precoConsumidor - repasseCalculado, 0)
receitaLiquidaTotal = receitaLiquidaUnitario × quantidade
lucro = receitaLiquidaTotal - custoTotal
margemPercentual = receitaLiquidaTotal > 0 ? lucro / receitaLiquidaTotal × 100 : 0
precoVendaUnitario = precoConsumidor
precoVendaTotal = precoConsumidor × quantidade
```

Repasse fixo é por unidade, não pelo lote. O denominador da margem é a receita líquida recebida pela Rondy Lab. Não há limite explícito de 100% para repasse; se ele ultrapassa o preço, a receita é truncada em zero, sem registrar a diferença negativa como receita. Isso é comportamento atual, não regra comercial aprovada neste documento.

Em somente custo, os resultados comerciais calculados são `null`; custos continuam sendo apurados. Inputs comerciais ainda são preservados nos grupos de parâmetros.

### Precisão, validações e divergências de apresentação

Os cálculos usam `Number`, com precisão de ponto flutuante. Não há política explícita de arredondamento monetário na persistência atual. Formatação BRL usa duas casas na Calculadora e até quatro no custo/g de Filamentos. Uma fórmula exibida pode usar valores arredondados sem reproduzir exatamente o valor numérico armazenado.

Salvar exige nome, seleção não vazia de impressora, ao menos uma linha com rolo encontrado e gramagem positiva e quantidade positiva. Não verifica cada linha, integer da quantidade, duração positiva, ausência de tarifa ou todas as faixas dos inputs. O botão não dispara validação nativa global de formulário. Gramagens inválidas em outras linhas podem afetar os números salvos.

O detalhamento de energia/depreciação/manutenção divide custo por `Math.max(runtime, 1)` para exibir taxa/h. Para duração entre zero e uma hora a expressão textual não equivale ao cálculo efetivo. A expressão textual de mão de obra também não considera seu toggle, embora o resultado calculado considere. São divergências de apresentação, além da divergência de base do markup.

## 9. Relacionamentos existentes

| Origem → destino | Campo / mecanismo | Persistência | Edição e exclusão |
| --- | --- | --- | --- |
| Movimento → rolo | `filamentoId` → `filamentos[].id` | Referência persistida | Editar rolo mantém ID; excluir rolo elimina seus movimentos pelo script, sem transação |
| Calculadora → impressora | Valor de `#impressora-select`, usado em `getPrinterById()` | Seleção no DOM durante cálculo; ID copiado ao snapshot ao salvar | Consulta parâmetros atuais; exclusão pode tornar seleção obsoleta; não há integridade no DOM |
| Calculadora → rolos | Valor de `.material-line__filamento`, usado em `getFilamentoById()` | Seleção no DOM e referência nas linhas salvas | Novos cálculos consultam custo atual; rolo removido não contribui ao custo |
| Precificação → rolos | `material[].filamentId` → `filamentos[].id` | Referência persistida e valores copiados | Edição/exclusão do rolo não altera a precificação; referências podem ficar sem destino |
| Snapshot → rolos | `snapshot.filamentos[].filamentId` | Referência histórica e custo/g copiado | Não acompanha alterações posteriores do cadastro |
| Snapshot → impressora | `snapshot.impressora.id` → `impressoras[].id` | Referência histórica e parâmetros copiados | Edição/exclusão não altera snapshot; ID pode ficar sem destino |
| Calculadora → configurações | Consulta do objeto global, sem ID | Tarifa copiada no snapshot; perdas e mão de obra incorporadas aos inputs/resultados | Alterações futuras afetam novas consultas, sem regravar históricos |

O `impressora` superior da precificação é somente nome histórico, não chave estrangeira. IDs são comparados por igualdade estrita em `find`, `findIndex` e `filter`; não há restrições de banco, cascatas declarativas ou validação global de referências. Não existe ligação de precificação com produto, pedido, produção ou movimento.

## 10. Integridade e riscos

Classificação qualitativa por impacto potencial, sem estimativa de probabilidade: **alto** para perda/corrupção de dados, execução de conteúdo ou resultado financeiro relevante; **médio** para referências, rastreabilidade ou apresentação incompleta que dificulte a operação. Nenhuma correção foi realizada.

| Impacto | Risco confirmado no código | Consequência |
| --- | --- | --- |
| Alto | Edição de saldo sem movimentação | Histórico deixa de explicar saldo atual |
| Alto | Exclusão de rolo remove todos os movimentos | Perda definitiva da trilha desse rolo, sem arquivamento |
| Alto | Gravações entre chaves sem transação | Movimento pode ser salvo sem saldo correspondente, ou exclusão deixar órfãos |
| Alto | Falhas de gravação apenas no console | Interface pode afirmar sucesso ou fechar formulário sem ter persistido |
| Alto | Fallback sobre dados inválidos seguido de salvamento | Uma coleção malformada pode ser substituída por nova lista incompleta |
| Alto | Regravação integral sem controle de concorrência | Operações em abas podem sobrescrever mudanças umas das outras |
| Alto | Markup aplicado ao total como preço unitário | Resultado financeiro do lote pode ser superestimado |
| Alto | Ausência convertida em zero e validação parcial | Custos podem ser subestimados; entradas inválidas podem ser salvas |
| Alto | Conteúdo de usuário interpolado em `innerHTML` | Possibilidade de interpretação de HTML e execução de conteúdo; dados locais não são confiáveis por definição |
| Médio | Exclusão de impressoras/rolos referenciados | IDs históricos ficam sem destino; valores copiados permanecem, mas não há recuperação do cadastro |
| Médio | IDs sem verificação de colisão | `findIndex` edita primeiro correspondente; `filter` pode excluir vários com mesmo ID |
| Médio | Validação só do array na leitura | Itens inválidos podem interromper renderização ou gerar zeros/`undefined` |
| Médio | Legados sem parâmetros completos | Não é possível reconstruir fielmente todos os cálculos antigos |
| Médio | Resumo e snapshot redundantes sem conferência | Edição externa pode produzir totais contraditórios |
| Médio | Saldo acima do peso nominal por movimento | Regra difere da validação do cadastro; custo/g continua usando peso nominal |
| Médio | Repasse acima do preço com receita truncada | Excesso não é tratado como erro comercial |
| Médio | Histórico limitado de movimentos | Não guarda saldo anterior, autor ou evento operacional; CONSUMO pode aparecer com sinal positivo |
| Médio | Exclusão de precificação sem confirmação | Perda do registro por ação direta, sem desfazer |

Não há unicidade garantida, histórico de alterações de cadastro, proteção contra mudanças externas no armazenamento ou autenticação. O snapshot preserva uma cópia no salvamento, mas não é imutável tecnicamente: scripts da origem e o próprio usuário podem alterar o armazenamento.

## 11. Estruturas futuras — não implementadas

**Planejamento, sem schemas, chaves ou nomes de campos aprovados.** Os dados abaixo são necessidades prováveis a validar, não entidades persistidas existentes.

| Modelo futuro | Objetivo | Dados prováveis | Relações previstas | Decisões pendentes |
| --- | --- | --- | --- | --- |
| Produtos | Organizar itens fabricáveis/vendáveis | Identificação, nome, descrição, categoria, imagens, custo, preço, disponibilidade | Precificação, catálogo, pedidos e estoque | Relação com históricos, variantes, publicação e atualização de custo |
| Pedidos | Acompanhar demanda | Cliente, itens, quantidade, valor, prazo, estado, observações e histórico | Produtos e produção | Contrato, transições, cancelamento e eventuais reservas |
| Produção | Registrar fabricação real | Produto, impressora, quantidade, consumo por rolo e conclusão | Pedidos, filamentos e estoque | Momento de baixa/entrada, falhas, parcialidade e prevenção de duplicidade |
| Estoque de produtos acabados | Controlar saldo auditável | Quantidades, entradas, saídas, envios, retornos e ajustes | Produção, vendas e consignação | Disponibilidade, reservas, correções e eventos autorizadores |
| Lojistas | Identificar parceiros | Identificação e condições comerciais necessárias ao negócio | Consignação e futuro perfil de acesso | Dados necessários, autenticação e isolamento de acesso |
| Consignação | Controlar envios, vendas e acertos | Quantidades entregues/remanescentes/vendidas, reposições, devoluções, preço, repasse e pagamentos | Lojistas, produtos e estoque | Apuração, negociação, acertos e permissões |
| Vendas | Representar saída comercial | Itens, quantidades, valores e resultado | Estoque, pedidos e eventualmente consignação | Existência de módulo próprio, gatilhos, recebimentos e vínculo com acertos |

Produtos, Pedidos, Estoque e Consignação têm páginas placeholder. Produção, Lojistas e Vendas não possuem modelos persistidos próprios no código analisado. Não criar chaves apenas para antecipar esse planejamento.

## 12. Migração futura para banco de dados

Considerações para uma migração futura, ainda não implementada nem definida tecnicamente:

- Inventariar/exportar dados existentes por origem e navegador antes de qualquer transformação; manter backup recuperável.
- Preservar IDs ou estabelecer mapeamento explícito se houver mudança de formato; identificar colisões antes de importar.
- Migrar registros e relações respeitando referências ausentes, sem descartar históricos por não encontrar cadastro atual.
- Preservar a semântica de ENTRADA, CONSUMO e AJUSTE; não converter ajuste absoluto em variação sem contexto comprovado.
- Preservar snapshots versão 2 e manter legados identificáveis; não inventar parâmetros históricos ausentes.
- Definir integridade referencial, política de exclusão/arquivamento e atomicidade entre saldo e movimentos.
- Implementar autenticação e permissões por perfil, incluindo isolamento por lojista quando esse acesso existir.
- Definir versionamento de schemas, migrações verificáveis, política de backup/restauração e tratamento de falhas.
- Definir sincronização entre dispositivos e estratégia de concorrência antes de permitir múltiplos escritores.

Supabase é opção em avaliação, não decisão final ou dependência instalada. Não existe rotina de migração, sincronização ou importação remota no projeto atual.

## 13. Regras para futuras alterações de dados

1. Consultar este documento e as regras de `AGENTS.md`.
2. Verificar o código atual antes de confiar na descrição histórica.
3. Identificar todos os consumidores e escritores de cada chave afetada.
4. Preservar compatibilidade com registros anteriores.
5. Evitar mudanças destrutivas e substituição automática de dados reais por padrões.
6. Utilizar IDs estáveis e verificar efeitos sobre referências.
7. Preservar históricos e snapshots sem recalcular o passado silenciosamente.
8. Evitar duplicidade de movimentações ao repetir ações ou integrar módulos.
9. Separar simulação de operação real: salvar precificação não movimenta estoque.
10. Atualizar este documento quando houver mudança efetiva de schema, distinguindo-a de planejamento.

## 14. Exemplos JSON

**Todos os nomes, IDs, datas, preços e parâmetros abaixo são fictícios e apenas ilustrativos. Não são valores padrão do negócio, dados reais, seeds ou instruções para gravar no navegador.** Os arrays representam o conteúdo completo de uma chave com poucos registros de exemplo. Números JSON usam ponto decimal e não incluem símbolos monetários.

### Configurações gerais — `rondyLabConfiguracoesGerais`

Exemplo configurado para os cálculos ilustrativos seguintes:

```json
{
  "tarifaEnergia": 1,
  "perdaPadrao": 0,
  "maoObraPadrao": 10
}
```

Ausência explícita permitida pelo escritor atual:

```json
{
  "tarifaEnergia": null,
  "perdaPadrao": null,
  "maoObraPadrao": null
}
```

### Impressoras — `rondyLabConfiguracoesImpressoras`

```json
[
  {
    "id": "printer-1704067200000-a1b2c3",
    "nome": "Impressora fictícia A",
    "valorPago": 1000,
    "vidaUtilHoras": 1000,
    "consumoWatts": 100,
    "manutencaoHora": 0.5
  }
]
```

### Filamentos — `rondyLabFilamentos`

```json
[
  {
    "id": "filamento-1704067200000-a1b2c3d4",
    "material": "PLA",
    "marca": "Marca fictícia",
    "linha": "Linha exemplo",
    "cor": "Preto",
    "pesoNominal": 1000,
    "quantidadeDisponivel": 850,
    "valorPago": 100,
    "observacoes": "Registro fictício para documentação.",
    "criadoEm": "2024-01-01T00:00:00.000Z",
    "atualizadoEm": "2024-01-01T02:00:00.000Z"
  }
]
```

### Movimentações — `rondyLabFilamentosMovimentacoes`

Exemplo coerente com o saldo acima: entrada de 1000 g, consumo de 100 g e ajuste para saldo final de 850 g.

```json
[
  {
    "id": "mov-1704067200000-11111111",
    "filamentoId": "filamento-1704067200000-a1b2c3d4",
    "tipo": "ENTRADA",
    "quantidade": 1000,
    "dataHora": "2024-01-01T00:00:00.000Z",
    "observacao": "Cadastro inicial do rolo."
  },
  {
    "id": "mov-1704070800000-22222222",
    "filamentoId": "filamento-1704067200000-a1b2c3d4",
    "tipo": "CONSUMO",
    "quantidade": 100,
    "dataHora": "2024-01-01T01:00:00.000Z",
    "observacao": "Consumo fictício."
  },
  {
    "id": "mov-1704074400000-33333333",
    "filamentoId": "filamento-1704067200000-a1b2c3d4",
    "tipo": "AJUSTE",
    "quantidade": 850,
    "dataHora": "2024-01-01T02:00:00.000Z",
    "observacao": "Conferência fictícia de saldo."
  }
]
```

### Precificação legada — `rondyLabPrecificacoesSalvas`

Exemplo do formato anterior confirmado no escritor em `HEAD`, sem snapshot nem custo/g histórico por linha. Não permite recuperar todos os parâmetros que geraram os totais.

```json
[
  {
    "id": "precificacao-1704078000000-44444444",
    "nome": "Peça fictícia legada",
    "data": "2024-01-01T03:00:00.000Z",
    "quantidade": 2,
    "tipo": "venda",
    "impressora": "Impressora fictícia A",
    "totalCost": 18.2,
    "unitCost": 9.1,
    "material": [
      {
        "filamentId": "filamento-1704067200000-a1b2c3d4",
        "nome": "PLA • Marca fictícia • Preto",
        "grams": 100
      }
    ],
    "detalhes": {
      "markup": 0,
      "precoManual": 20,
      "precoConsumidor": 0,
      "repasseTipo": "percentual",
      "repasseValor": 0,
      "perdas": 0,
      "maoObra": 10
    }
  }
]
```

### Precificação atual com snapshot 2 — `rondyLabPrecificacoesSalvas`

Simulação fictícia independente dos movimentos: 100 g a R$ 0,10/g, 2 h de impressão, duas peças e 0,5 h de trabalho manual. Material 10 + energia 0,2 + depreciação 2 + manutenção 1 = custos diretos 13,2; sem perdas, com mão de obra 5, total 18,2 e unitário 9,1. Preço manual 20 por unidade resulta em receita 40, lucro 21,8 e margem 54,5%. Nenhum consumo seria registrado por salvar este exemplo.

```json
[
  {
    "id": "precificacao-1704081600000-55555555",
    "nome": "Peça fictícia atual",
    "data": "2024-01-01T04:00:00.000Z",
    "quantidade": 2,
    "tipo": "venda",
    "impressora": "Impressora fictícia A",
    "totalCost": 18.2,
    "unitCost": 9.1,
    "material": [
      {
        "filamentId": "filamento-1704067200000-a1b2c3d4",
        "identificacao": "PLA • Marca fictícia • Linha exemplo • Preto",
        "nome": "PLA • Marca fictícia • Preto",
        "grams": 100,
        "costPerGram": 0.1,
        "materialCost": 10
      }
    ],
    "detalhes": {
      "markup": 0,
      "precoManual": 20,
      "precoConsumidor": 0,
      "repasseTipo": "percentual",
      "repasseValor": 0,
      "perdas": 0,
      "maoObra": 10
    },
    "snapshot": {
      "versao": 2,
      "salvoEm": "2024-01-01T04:00:00.000Z",
      "impressora": {
        "id": "printer-1704067200000-a1b2c3",
        "nome": "Impressora fictícia A",
        "valorPago": 1000,
        "vidaUtilHoras": 1000,
        "consumoWatts": 100,
        "manutencaoHora": 0.5,
        "depreciacaoHora": 1
      },
      "tarifaEnergia": 1,
      "impressao": {
        "horas": 2,
        "minutos": 0,
        "duracaoHoras": 2
      },
      "quantidadeProduzida": 2,
      "filamentos": [
        {
          "filamentId": "filamento-1704067200000-a1b2c3d4",
          "identificacao": "PLA • Marca fictícia • Linha exemplo • Preto",
          "nome": "PLA • Marca fictícia • Preto",
          "grams": 100,
          "costPerGram": 0.1,
          "materialCost": 10
        }
      ],
      "custos": {
        "material": 10,
        "energia": 0.2,
        "depreciacao": 2,
        "manutencao": 1,
        "diretos": 13.2,
        "perdas": {
          "percentual": 0,
          "valor": 0
        },
        "maoDeObra": {
          "ativa": true,
          "horas": 0.5,
          "valorHora": 10,
          "valor": 5
        },
        "total": 18.2,
        "unitario": 9.1
      },
      "finalidade": "venda",
      "venda": {
        "markupPercentual": 0,
        "precoManual": 20,
        "precoVendaUnitario": 20,
        "precoVendaTotal": 40,
        "lucro": 21.8,
        "margemPercentual": 54.5
      },
      "consignacao": {
        "precoConsumidor": 0,
        "repasseTipo": "percentual",
        "repasseValor": 0,
        "repasseCalculado": null,
        "receitaLiquidaUnitario": null,
        "receitaLiquidaTotal": null
      }
    }
  }
]
```

## 15. Mapa de dependências

```text
IMPLEMENTADO — leitura e gravação locais

Configurações ── lê/grava ── rondyLabConfiguracoesGerais
              └ lê/grava ── rondyLabConfiguracoesImpressoras

Filamentos ──── lê/grava ── rondyLabFilamentos
           └─── lê/grava ── rondyLabFilamentosMovimentacoes
                                  └ filamentoId → rolo.id

Calculadora ─── lê ──────── configurações + impressoras + filamentos
            └── lê/grava ── rondyLabPrecificacoesSalvas
                                  ├ material[].filamentId → rolo.id
                                  ├ snapshot.impressora.id → impressora.id
                                  └ snapshot.filamentos[].filamentId → rolo.id

As setas por ID não têm integridade referencial imposta.
Snapshot é cópia histórica, não consulta dinâmica ao cadastro.
Calculadora não grava saldo nem movimentos de filamentos.

PLANEJADO — sem coleções ou integrações implementadas

Calculadora → Produtos → Pedidos → Produção → Estoque de produtos acabados
                └→ Catálogo público                    ├→ Venda
                                                      └→ Consignação ← Lojistas
Produção → consumo real de Filamentos

INDEFINIDO

Contratos e cardinalidades desses vínculos futuros; gatilhos de baixa/entrada;
relação produto/precificação; reservas; cancelamentos; acertos de consignação;
modelo de Vendas; autenticação, permissões e persistência remota.
```
