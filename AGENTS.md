# Rondy Lab — Agent Instructions

## 1. Sobre o projeto

Rondy Lab é um projeto de impressão 3D composto por:

- um site público institucional e de catálogo;
- uma área administrativa interna em `/admin/`;
- ferramentas para gestão de custos, impressoras, filamentos, precificação, produtos, pedidos, estoque e consignação.

O projeto está em evolução incremental. Antes de implementar qualquer funcionalidade, preserve o que já funciona e entenda as integrações existentes.

---

## 2. Princípios de trabalho

Antes de alterar código:

1. Analise os arquivos relacionados à tarefa.
2. Entenda os padrões existentes antes de criar novos padrões.
3. Identifique dependências com outros módulos.
4. Preserve dados e funcionalidades existentes.
5. Prefira mudanças pequenas, claras e incrementais.

Não faça refatorações amplas que não sejam necessárias para a tarefa solicitada.

Não implemente funcionalidades adicionais apenas porque parecem úteis.

Quando encontrar um problema fora do escopo da tarefa, informe-o ao final em vez de corrigi-lo silenciosamente.

---

## 3. Stack atual

O projeto utiliza:

- HTML5;
- CSS3;
- JavaScript puro;
- localStorage para persistência local do Admin;
- Git/GitHub para versionamento;
- Vercel para deploy;
- Live Server para desenvolvimento local.

Atualmente não existem:

- frameworks JavaScript;
- Node.js como requisito do projeto;
- bundler;
- banco de dados remoto;
- API própria;
- autenticação;
- biblioteca de componentes.

Não adicione frameworks, bibliotecas, dependências, build tools ou serviços externos sem solicitação explícita.

---

## 4. Estrutura geral

O site público fica na raiz do projeto.

A área administrativa fica em:

`/admin/`

O CSS público principal é:

`/css/style.css`

O JavaScript público principal é:

`/js/main.js`

O Admin possui estilos e scripts próprios:

`/admin/css/admin.css`

`/admin/js/admin.js`

Módulos podem possuir JavaScript próprio quando necessário.

Antes de criar novos arquivos, verifique como módulos semelhantes estão organizados.

---

## 5. Separação entre Site Público e Admin

Trate o site público e o Admin como contextos diferentes dentro da mesma identidade.

Alterações no Admin não devem modificar o site público sem necessidade explícita.

Alterações no site público não devem quebrar o Admin.

Não exponha links para `/admin/` no site público.

A ausência de link público para `/admin/` não deve ser considerada mecanismo de segurança.

---

## 6. Identidade visual

Preserve a identidade visual existente da Rondy Lab.

Cores principais:

- fundo principal: `#111111`;
- destaque principal: `#FF6A00`;
- texto principal: branco;
- texto secundário: aproximadamente `#777777`.

Utilize as cores secundárias das categorias já existentes no projeto. Não invente novas variações quando uma cor já estiver definida no CSS ou nos assets.

A identidade deve transmitir:

- tecnologia;
- fabricação digital;
- criatividade;
- precisão;
- modernidade;
- caráter premium.

---

## 7. Direção de UI

Priorize:

- hierarquia tipográfica forte;
- grids claros;
- bom uso de espaço negativo;
- alinhamento consistente;
- divisores sutis;
- interfaces objetivas;
- consistência entre páginas.

Evite:

- gradientes sem necessidade;
- glassmorphism;
- neon;
- sombras excessivas;
- excesso de bordas;
- transformar todo conteúdo em cards;
- aparência genérica de template SaaS;
- elementos decorativos sem função.

Reutilize padrões existentes antes de criar novos componentes.

---

## 8. Site público

O site público deve ser mais editorial, visual e espaçado.

Preserve:

- títulos grandes;
- uso forte de caixa alta quando já aplicado;
- bastante espaço negativo;
- uso controlado do laranja;
- imagens como parte importante da composição;
- navegação simples;
- linguagem visual premium e minimalista.

Não transforme o site público em uma interface administrativa.

---

## 9. Admin

O Admin deve ser visualmente relacionado ao site público, porém mais:

- funcional;
- compacto;
- orientado a dados;
- eficiente;
- consistente.

Pode utilizar:

- tabelas;
- formulários;
- indicadores;
- painéis;
- filtros;
- resumos;
- estados;
- sidebar.

Densidade maior é aceitável no Admin.

Preserve a sidebar e os padrões existentes, salvo quando a tarefa exigir alteração.

---

## 10. Responsividade

Toda nova interface deve considerar:

- desktop;
- tablet;
- mobile.

Não considere uma tarefa visual concluída apenas porque funciona em desktop.

Preserve os breakpoints existentes quando forem suficientes.

Evite criar novos breakpoints sem necessidade.

---

## 11. Dados do Admin

Atualmente o Admin utiliza `localStorage`.

Nunca:

- apague dados existentes automaticamente;
- renomeie uma chave existente sem estratégia de compatibilidade;
- altere silenciosamente o significado de um campo;
- sobrescreva dados reais com dados padrão;
- crie migrações destrutivas sem solicitação explícita.

Antes de alterar estruturas persistidas, identifique todos os módulos que leem ou escrevem esses dados.

Novos registros devem utilizar IDs estáveis e únicos.

Relacionamentos devem utilizar IDs, evitando depender apenas de nomes.

---

## 12. Valores financeiros e configurações

Não invente valores financeiros ou operacionais.

Não defina automaticamente:

- tarifa de energia;
- custo de material;
- percentual de perdas;
- mão de obra;
- margem;
- markup;
- comissão;
- repasse;
- preço de venda;
- custos de manutenção.

Quando um valor depender do negócio, utilize o valor configurado pelo usuário.

Se não houver valor configurado, trate explicitamente a ausência em vez de assumir um número arbitrário.

---

## 13. Regras de cálculo

Fórmulas financeiras devem ser explícitas e auditáveis.

Componentes de custo devem permanecer separados sempre que possível.

Para produção:

`material + energia + depreciacao + manutencao = custos diretos`

Depois:

`custos diretos + perdas + mao de obra = custo total`

Depreciação da impressora:

`valor pago / vida util em horas`

Energia:

`(consumo em watts / 1000) × horas de impressao × tarifa de energia`

Não contabilize o mesmo custo em mais de um componente.

Diferencie corretamente markup de margem.

Quando modificar uma fórmula, revise todos os lugares que utilizam aquele resultado.

---

## 14. Precificações históricas

Uma precificação salva representa um registro histórico.

Alterações futuras em:

- impressoras;
- filamentos;
- energia;
- perdas;
- mão de obra;
- preços;
- configurações

não devem alterar retroativamente uma precificação salva.

Precificações novas devem preservar um snapshot dos parâmetros relevantes utilizados no cálculo.

Registros antigos devem continuar sendo tratados de forma compatível sempre que possível.

---

## 15. Estoque e simulação

Simulações de preço não devem movimentar estoque.

Uma Calculadora pode consultar saldo e alertar insuficiência, mas não deve registrar consumo apenas porque uma simulação foi realizada.

Movimentação real de estoque deve ocorrer apenas em fluxos que representem eventos reais, como produção, entrada, consumo, venda, envio ou retorno.

Quando houver histórico de movimentações, preserve a auditabilidade.

---

## 16. Arquitetura futura

O uso atual de `localStorage` é temporário e adequado à fase atual do protótipo.

Existe intenção futura de utilizar persistência remota e autenticação, possivelmente com um serviço como Supabase, mas isso ainda não faz parte da arquitetura implementada.

Não antecipe essa migração sem solicitação.

Produtos, Pedidos, Estoque e Consignação ainda podem evoluir significativamente.

Evite decisões prematuras que dificultem essa evolução.

---

## 17. Segurança

Não trate uma URL não divulgada como autenticação.

Antes de armazenar dados sensíveis ou disponibilizar o Admin para uso real por terceiros, será necessário implementar controle de acesso adequado.

Evite renderizar dados inseridos pelo usuário através de `innerHTML` quando isso puder permitir interpretação de HTML.

Prefira APIs seguras como `textContent` para conteúdo textual.

---

## 18. Rotas e deploy

O projeto é publicado na Vercel e utiliza diretórios com `index.html`.

Considere cuidadosamente caminhos absolutos e relativos.

Uma alteração não deve funcionar apenas no Live Server e quebrar em produção.

Ao modificar caminhos de CSS, JavaScript, imagens ou navegação, considere:

- página atual;
- profundidade do diretório;
- Live Server;
- domínio de produção na Vercel.

---

## 19. Qualidade das alterações

Após modificar código:

1. revise o diff;
2. verifique erros de sintaxe;
3. verifique caminhos de assets;
4. preserve compatibilidade com dados existentes;
5. verifique impactos nos módulos relacionados;
6. informe quais arquivos foram alterados;
7. informe qualquer risco ou ponto que precise de teste manual.

Para alterações visuais, verifique também comportamento responsivo.

---

## 20. Escopo

Execute somente o que foi solicitado.

Não use uma tarefa pequena como oportunidade para reescrever grandes partes do projeto.

Caso uma alteração estrutural maior seja realmente necessária, explique o motivo antes de executá-la quando possível.

O objetivo é evoluir o Rondy Lab de forma incremental, previsível e fácil de manter.

---

## 21. Documentação complementar

Quando existirem, consulte também antes de mudanças relevantes:

- `/docs/PROJECT.md`
- `/docs/DESIGN-SYSTEM.md`
- `/docs/ADMIN.md`
- `/docs/DATA-MODEL.md`

O `AGENTS.md` define as regras gerais de trabalho.

Os arquivos em `/docs/` documentam o estado e as decisões específicas do projeto.

Se houver divergência entre documentação e código existente, não assuma silenciosamente qual está correto. Investigue e informe a inconsistência.
