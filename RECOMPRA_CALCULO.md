# Cálculo do ciclo de recompra (Painel de recompra)

Documento de referência para qualquer pessoa ou agente que for mexer na previsão de recompra.
**Se você alterar a regra, atualize este arquivo junto.**

O "ciclo" é quantos dias uma compra de ração dura. A partir dele o sistema calcula quando o
cliente vai precisar recomprar e quando avisar.

O ciclo é **semi-automático**:

1. O sistema calcula sozinho (`dias_calculados`).
2. O operador pode corrigir no painel (`dias_manual`).
3. O ciclo efetivo é `dias_manual ?? dias_calculados`. Ele fica gravado em `dias_estimados`, e é
   daí que saem as datas.

---

## 1. Onde fica no código

| Arquivo                                                               | O que faz                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/recompra-calculo.ts`                                         | Funções puras: é ração?, peso do pacote, peso do pet, consumo diário, dias, validação do ciclo manual, ciclo efetivo. Tabelas de raça, porte, curva de crescimento e g/kg/dia.                                                                                                 |
| `src/lib/recompra-supabase.ts`                                        | Lê venda, cliente e produto no Supabase, calcula e grava em `recompra_previsoes`. Funções principais: `recalcularRecompraVenda`, `recalcularTodasRecompras`, `registrarRecompraManual`, `definirCicloManualRecompra` e `mapPrevisao` (linha do banco para `RecompraPrevista`). |
| `src/routes/api/crm.recompra-prevista.ts`                             | API. `GET` lista. `POST` recalcula tudo. `PATCH` com `tipo`: `contatado`, `travado`, `ciclo_manual` ou `data_compra`. `PUT` com `tipo`: `modelo_racao` ou `venda_manual`.                                                                                                      |
| `src/lib/painel-recompra.ts`                                          | Helpers da tela: situação, texto explicativo do ciclo (`explicacaoCiclo`) e mensagem de WhatsApp.                                                                                                                                                                              |
| `src/pages/PainelRecompra.tsx`                                        | Tela `/painel-recompra`. O modal do cliente tem o editor de ciclo (`CicloEditor`).                                                                                                                                                                                             |
| `src/lib/recompra-aprovacoes.ts`                                      | Fila de aprovação de mensagens de recompra (usa `diasRestantes`).                                                                                                                                                                                                              |
| `src/lib/recompra-calculo.test.ts`, `src/lib/painel-recompra.test.ts` | Testes (`npm test`).                                                                                                                                                                                                                                                           |
| `supabase/migrations/20260603130000_recompra_consumo_racao.sql`       | Criação de `recompra_previsoes`.                                                                                                                                                                                                                                               |
| `supabase/migrations/20260914180000_recompra_ciclo_manual.sql`        | Colunas `dias_calculados`, `dias_manual`, `dias_manual_em`.                                                                                                                                                                                                                    |
| `spec_recompra_por_crescimento.md`                                    | Especificação original da curva de crescimento de filhotes.                                                                                                                                                                                                                    |

## 2. Quando o cálculo roda

| Gatilho                                            | Caminho                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Pedido criado no PDV ou manualmente                | `src/lib/supabase.ts`, após `salvarItensVenda`, chama `recalcularRecompraVenda(vendaId)`                |
| Venda criada pelo webhook do WhatsApp              | `src/lib/supabase.ts`, mesmo fluxo                                                                      |
| Botão **Recalcular** do painel                     | `POST /api/crm/recompra-prevista`, que chama `recalcularTodasRecompras()` (últimos 2000 itens de venda) |
| Cadastro manual de venda na tela Recompra prevista | `PUT` com `tipo: "venda_manual"`, que chama `registrarRecompraManual`                                   |
| Operador corrige o ciclo no painel                 | `PATCH` com `tipo: "ciclo_manual"`, que chama `definirCicloManualRecompra`                              |
| Operador corrige a data real da compra             | `PATCH` com `tipo: "data_compra"`, que corrige a venda vinculada e recalcula suas previsões             |

Uma previsão é única por `(cliente_id, sku, pet_nome)`. Quando entra uma compra nova do mesmo SKU ou
para os mesmos pets, a previsão antiga é apagada (`removerRecomprasSubstituidasPorNovaRacao`).

## 3. Dados de entrada

| Origem                     | Campos usados                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `venda_itens`              | `sku`, `nome`, `quantidade`, `pet_nome` (um ou mais nomes separados por vírgula)                                                              |
| `vendas`                   | `cliente_id`, `criado_em` (ou `faturado_em` como fallback legado), `status` (`cancelada` é ignorada), `observacao` (marcador `recompra_auto`) |
| `produtos`                 | `nome`, `categoria`, `preco`, `detalhes_tecnicos.{peso, linha, idade, porte, especie, marca, tipoProduto}`                                    |
| `clientes`                 | `pets`, `pets_detalhes[]`, `especies`, `observacoes`                                                                                          |
| `clientes.pets_detalhes[]` | `nome`, `especie`, `raca`/`racaSlug`, `porte`, `pesoKg`, `pesoKgMedidoEm`, `nascimento`/`dataNascimentoEstimada`, `idadeAdultaConfirmada`     |

**Para o cálculo acertar, o mínimo é:**

- o peso do pacote no nome ou em `detalhes_tecnicos.peso` (ex.: "15 kg");
- o nome do pet no item da venda;
- no cadastro do pet: espécie e peso, ou raça/porte;
- para filhote: data de nascimento.

## 4. Passo a passo do cálculo automático

### 4.0 Filtros

- `ehRacaoParaRecompra`: precisa parecer ração (palavra "ração" ou marcas conhecidas). Snack, petisco,
  biscoito, bifinho, osso e mordedor ficam de fora.
- Venda cancelada é ignorada.
- Só a compra **mais recente** de cada cliente + SKU + pet gera previsão.

### 4.1 Peso do pacote (`peso_kg`)

1. `peso_kg=` do marcador `recompra_auto` na observação da venda, se existir.
2. Senão, regex `X kg` ou `X g` em `detalhes_tecnicos.peso` + nome do produto, **× quantidade**.
3. Se não achar, o peso fica 0 e o ciclo cai no **padrão de 30 dias**.

### 4.2 Pets considerados

- Se `venda_itens.pet_nome` tem nomes, busca cada um em `clientes.pets_detalhes` (comparação por nome, sem
  diferenciar maiúsculas).
- Se `pet_nome` está vazio, usa **todos os pets do cliente**.
- Espécie padrão: vem do produto ("gato", "felino", Catsy e Special Cat indicam gato; "cão", "cachorro",
  Special Dog e Bob Dog indicam cachorro). Se o produto não diz, usa a 1ª espécie do cliente, senão cachorro.
- Porte padrão: nome/porte do produto + observações do cliente. Se não houver nada, é **médio**.

### 4.3 Peso de cada pet (`pesoAtualKg`)

Ordem de prioridade:

1. **Gato**: peso informado, senão 3,5 kg.
2. Peso informado e (adulto confirmado ou sem data de nascimento): origem `informado`.
3. Peso informado com `pesoKgMedidoEm` depois do nascimento: origem `medido`.
4. Sem data de nascimento: peso médio da **raça**, senão o peso informado.
5. Com nascimento e idade ≥ 24 meses (ou adulto confirmado): peso adulto da raça, senão média do porte.
6. Com nascimento e idade < 24 meses: `peso adulto × curva de crescimento(porte, idade)`, origem
   `crescimento` (curva de Salt et al. 2017, ver `spec_recompra_por_crescimento.md`).

Peso médio por porte: toy 3,7 · pequeno 8,1 · médio 17,6 · grande 29,9 · gigante 57,1 · gato 3,5 kg.

### 4.4 Consumo diário

`consumoDiaG(pet) = round(pesoKg × gPorKgDia[linha][fase][porte])`

- **Linha** (nome, categoria e detalhes do produto): contém "fresh meat" → `fresh_meat`; contém "pro" ou
  "life" → `pro_life`; senão `generica` (hoje com os mesmos números de `pro_life`).
- **Fase**: "filhote", "puppy" ou "junior" → filhote; "castrado" ou "neutered" → castrado; "senior" →
  senior; senão adulto.

g/kg/dia, `pro_life` e `generica` (toy, pequeno / médio / grande, gigante / gato):

| Fase     | toy/pequeno | médio | grande/gigante | gato |
| -------- | ----------- | ----- | -------------- | ---- |
| filhote  | 20          | 19    | 18             | 22   |
| adulto   | 16          | 15    | 14             | 15   |
| senior   | 15          | 14    | 13             | 14   |
| castrado | 16          | 15    | 14             | 13   |

`fresh_meat` é 1 g/kg menor em quase tudo (tabela completa em `CONSUMO_G_POR_KG_DIA`).

Consumo total do pacote = `consumo_diario_g=` do marcador `recompra_auto`, senão a **soma dos pets**, senão
120 g/dia.

### 4.5 Ciclo automático (`dias_calculados`)

Regra do negócio: **métricas só na 1ª compra; da 2ª em diante vale o comportamento real do cliente.**

| Prioridade | Fonte                | `fonte` no banco | Regra                                                                                       |
| ---------- | -------------------- | ---------------- | ------------------------------------------------------------------------------------------- |
| 1          | Histórico real       | `historico`      | `calcularCicloPorHistorico` (abaixo). Vale assim que existe 1 intervalo válido (2 compras). |
| 2          | Observação do pedido | `observacao`     | `dias=` do marcador `recompra_auto` (3 a 180)                                               |
| 3          | Métricas / consumo   | `estimativa`     | `round(peso_kg × 1000 / consumo_diario_g)` (mínimo 1; 30 se peso ou consumo = 0)            |

**Histórico real (`calcularCicloPorHistorico` em `recompra-calculo.ts`):**

1. Compras consideradas: todas as rações do **mesmo cliente**, para o **mesmo conjunto de pets**
   (`pet_nome` igual; vazio só casa com vazio) e **mesma espécie**, até a compra atual. **Não filtra por
   SKU**: trocar de sabor, marca ou tamanho não zera o histórico.
2. Compras com até 3 dias de diferença viram uma só (kg somados), para pacote extra/pedido dividido.
3. Cada intervalo (3 a 180 dias) vira consumo real: `kg da compra anterior × 1000 ÷ dias até a seguinte`.
4. Usa os 3 intervalos mais recentes, com peso 3/2/1. Com 3+ intervalos, descarta o que fica a mais
   de 2,5× da mediana (ex.: cliente que comprou fora um mês).
5. `ciclo = kg da compra atual × 1000 ÷ consumo real`. Logo, se antes levou 15 kg a cada 30 dias e
   agora levou 30 kg, o ciclo vira 60 dias.
6. Se alguma compra não tem peso conhecido, usa a média ponderada dos dias.

Exemplo do cliente: comprou 15 kg dia 10 e 15 kg dia 20 → consumo 1,5 kg/dia → próxima em 10 dias.

`historico_dias` guarda os intervalos usados; `media_dias_real` guarda o ciclo resultante do histórico.

Formato do marcador na observação da venda (várias linhas separadas por `|`):
`recompra_auto sku="ABC123" dias=35 consumo_diario_g=400 peso_kg=15`

Na venda manual (`registrarRecompraManual`, `fonte = manual`) a ordem é: dias informado no formulário,
depois modelo do SKU em `recompra_racao_modelos`, depois o consumo.

Rações vendidas fora do catálogo usam um SKU estável gerado a partir do nome (`AVULSA-...`). O operador
informa nome, peso total e, se necessário, consumo diário/ciclo. O nome também participa da classificação
de fase e linha. O botão **Salvar modelo dessa ração** guarda o ciclo e o consumo para as próximas vendas,
mesmo sem criar o produto no estoque da loja.

### 4.6 Ciclo efetivo e datas

```
ciclo              = dias_manual ?? dias_calculados        (gravado em dias_estimados)
ultima_compra_em   = data de faturado_em ou criado_em, no fuso America/Sao_Paulo
proxima_compra_em  = ultima_compra_em + ciclo
data_alerta        = proxima_compra_em − antecedência      (pequeno/gato: 3 dias; médio/grande: 5; sem pet: 5; usa o maior entre os pets)
diasRestantes      = proxima_compra_em − hoje
status (banco)     = atrasado (<0) | urgente (≤3) | semana (≤7) | ok
situação (painel)  = atrasado (<0) | urgente (≤3) | normal
```

### 4.7 Exemplo

Golden Retriever "Sol", sem peso e sem nascimento, comprou 1× "Formula Natural Life Adulto Médio e
Grande 15 kg" em 14/09/2026:

- peso do pet = 29,45 kg (média da raça) · linha `pro_life` · fase adulto · porte grande → 14 g/kg/dia
- consumo = 29,45 × 14 = **412 g/dia**
- ciclo = 15000 / 412 = 36,4 → **36 dias**
- próxima compra = **20/10/2026** · alerta (porte grande, 5 dias antes) = **15/10/2026**

Se o operador acha que dura 45 dias, digita 45 no painel. A próxima compra passa para 29/10/2026 e o
alerta para 24/10/2026. `dias_calculados` continua 36.

## 5. Ajuste manual do ciclo

- **Tela:** Painel de recompra → clicar no cliente → bloco "Ciclo de recompra". Digite os dias e clique em
  **Salvar ciclo**. Antes de salvar, a tela mostra a nova data. **Voltar ao automático** apaga o ajuste.
- **API:** `PATCH /api/crm/recompra-prevista` com
  `{ "tipo": "ciclo_manual", "id": "<previsao>", "dias": 45 }`. Use `dias: null` para remover o ajuste.
  Resposta: `{ ok: true, recompra: RecompraPrevista }`.
- **Validação:** inteiro de 1 a 365 (`normalizarCicloManual`; também há um check no banco).
- **Contagem:** os dias contam a partir da **data da compra**, não de hoje.
- **Quanto tempo vale:** só para a compra atual (mesmo `venda_id`).
  - Sobrevive ao botão Recalcular e ao reprocessamento da mesma venda (`cicloManualDaVenda`).
  - Uma **compra nova** apaga a previsão antiga e volta ao automático. Com duas compras, o histórico real
    (prioridade 1) passa a valer.
- **API para a tela:** `cicloCalculado`, `cicloManual`, `origemCiclo` e `previsaoBase` (= ciclo efetivo).
- **Aprovações de recompra:** se o ajuste empurra a previsão para fora da janela de aviso (padrão 10
  dias), a aprovação pendente é cancelada com o motivo "O ciclo da recompra foi ajustado…". Se depois
  a previsão volta para a janela, a mesma aprovação é reativada com a mensagem atualizada.

## 5.1 Correção da data da compra

- **Tela:** abra o detalhe no Painel de recompra ou em Recompra prevista e use **Data real da compra**.
- **API:** `PATCH /api/crm/recompra-prevista` com
  `{ "tipo": "data_compra", "id": "<previsao>", "compraEm": "2026-09-10" }`.
- Datas futuras são recusadas.
- Se a previsão veio de uma venda, `vendas.criado_em` (e `faturado_em`, quando já preenchido) é corrigido
  e todas as previsões ligadas à venda são recalculadas. Assim o botão **Recalcular** não desfaz a correção.
- Se foi um cadastro manual sem `venda_id`, a própria previsão é atualizada preservando o ciclo atual.

## 6. Pontos fracos conhecidos (por que o automático erra)

Ao investigar "ciclo errado", confira nesta ordem:

1. ~~Histórico sem normalizar por quantidade / preso ao SKU.~~ Corrigido em 2026-10: o histórico agora
   usa consumo real (kg ÷ dias), agrupa compras próximas e não depende do SKU. Ainda erra se o cliente
   compra parte da ração em outra loja (o intervalo parece maior) ou se `pet_nome` varia entre vendas
   ("Rex" numa, vazio na outra), o que separa o histórico.
2. **`pet_nome` vazio no item da venda** soma o consumo de **todos** os pets do cliente, inclusive de
   outra espécie. O ciclo fica curto demais.
3. **Peso do pacote não encontrado** no nome ou nos detalhes técnicos: o ciclo vira 30 dias fixos.
4. **Filhote sem data de nascimento** usa o peso **adulto** da raça com o g/kg de filhote. O consumo fica
   alto e o ciclo curto.
5. **Pet sem raça, porte e peso** cai no porte médio (17,6 kg).
6. **Consumo linear por kg.** Tabelas reais crescem com peso^0,75, então a conta subestima cães muito
   pequenos e superestima cães muito grandes.
7. **`recompra_racao_modelos`** (dias por SKU) só é usado na venda manual. Vendas normais (PDV e
   WhatsApp) **não** usam esse modelo.
8. A detecção de linha por "pro" ou "life" é ampla e pega marcas de outros fabricantes. Hoje só afeta
   quando o produto é `fresh_meat`.

## 7. Checklist ao mexer

- [ ] Rodar `npm test` (testes em `src/lib/recompra-calculo.test.ts` e `src/lib/painel-recompra.test.ts`).
- [ ] Mudou colunas? Criar migration em `supabase/migrations/` e aplicar **antes** do deploy.
- [ ] Deploy: `npm run build` + `wrangler deploy`.
- [ ] Atualizar este documento.

## Histórico de vendas no painel (conferência do ciclo)

- **Tela:** modal do cliente no Painel de recompra, abaixo do ciclo. Mostra as 5 últimas vendas (botão
  para ver todas, até 300 itens) com todos os itens, total, kg de ração e quanto cada compra durou até a
  próxima ração.
- **API:** `GET /api/crm/recompra-prevista?historico=<previsao_id>` → `historicoVendasRecompra` em
  `recompra-supabase.ts`. Só carrega quando o modal abre (egress).
- **Destaque:** só os itens que entram no ciclo (mesma regra de `historicoRacaoDoItem`: ração, mesmos pets e
  mesma espécie). Os outros aparecem em cinza.
- **Comparação** (`compararCicloComHistorico` em `src/lib/historico-recompra.ts`): roda
  `calcularCicloPorHistorico` sobre as vendas e compara com o ciclo usado (`dias_estimados`). "Bate" se a
  diferença for de até 3 dias ou 10%. Se for maior, mostra "curta" ou "longa". Com menos de 2 compras de ração
  aparece "histórico insuficiente".
