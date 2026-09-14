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

| Arquivo | O que faz |
|---|---|
| `src/lib/recompra-calculo.ts` | Funções puras: é ração?, peso do pacote, peso do pet, consumo diário, dias, validação do ciclo manual, ciclo efetivo. Tabelas de raça, porte, curva de crescimento e g/kg/dia. |
| `src/lib/recompra-supabase.ts` | Lê venda, cliente e produto no Supabase, calcula e grava em `recompra_previsoes`. Funções principais: `recalcularRecompraVenda`, `recalcularTodasRecompras`, `registrarRecompraManual`, `definirCicloManualRecompra` e `mapPrevisao` (linha do banco para `RecompraPrevista`). |
| `src/routes/api/crm.recompra-prevista.ts` | API. `GET` lista. `POST` recalcula tudo. `PATCH` com `tipo`: `contatado`, `travado` ou `ciclo_manual`. `PUT` com `tipo`: `modelo_racao` ou `venda_manual`. |
| `src/lib/painel-recompra.ts` | Helpers da tela: situação, texto explicativo do ciclo (`explicacaoCiclo`) e mensagem de WhatsApp. |
| `src/pages/PainelRecompra.tsx` | Tela `/painel-recompra`. O modal do cliente tem o editor de ciclo (`CicloEditor`). |
| `src/lib/recompra-aprovacoes.ts` | Fila de aprovação de mensagens de recompra (usa `diasRestantes`). |
| `src/lib/recompra-calculo.test.ts`, `src/lib/painel-recompra.test.ts` | Testes (`npm test`). |
| `supabase/migrations/20260603130000_recompra_consumo_racao.sql` | Criação de `recompra_previsoes`. |
| `supabase/migrations/20260914180000_recompra_ciclo_manual.sql` | Colunas `dias_calculados`, `dias_manual`, `dias_manual_em`. |
| `spec_recompra_por_crescimento.md` | Especificação original da curva de crescimento de filhotes. |

## 2. Quando o cálculo roda

| Gatilho | Caminho |
|---|---|
| Pedido criado no PDV ou manualmente | `src/lib/supabase.ts`, após `salvarItensVenda`, chama `recalcularRecompraVenda(vendaId)` |
| Venda criada pelo webhook do WhatsApp | `src/lib/supabase.ts`, mesmo fluxo |
| Botão **Recalcular** do painel | `POST /api/crm/recompra-prevista`, que chama `recalcularTodasRecompras()` (últimos 2000 itens de venda) |
| Cadastro manual de venda na tela Recompra prevista | `PUT` com `tipo: "venda_manual"`, que chama `registrarRecompraManual` |
| Operador corrige o ciclo no painel | `PATCH` com `tipo: "ciclo_manual"`, que chama `definirCicloManualRecompra` |

Uma previsão é única por `(cliente_id, sku, pet_nome)`. Quando entra uma compra nova do mesmo SKU ou
para os mesmos pets, a previsão antiga é apagada (`removerRecomprasSubstituidasPorNovaRacao`).

## 3. Dados de entrada

| Origem | Campos usados |
|---|---|
| `venda_itens` | `sku`, `nome`, `quantidade`, `pet_nome` (um ou mais nomes separados por vírgula) |
| `vendas` | `cliente_id`, `faturado_em` (ou `criado_em`), `status` (`cancelada` é ignorada), `observacao` (marcador `recompra_auto`) |
| `produtos` | `nome`, `categoria`, `preco`, `detalhes_tecnicos.{peso, linha, idade, porte, especie, marca, tipoProduto}` |
| `clientes` | `pets`, `pets_detalhes[]`, `especies`, `observacoes` |
| `clientes.pets_detalhes[]` | `nome`, `especie`, `raca`/`racaSlug`, `porte`, `pesoKg`, `pesoKgMedidoEm`, `nascimento`/`dataNascimentoEstimada`, `idadeAdultaConfirmada` |

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

| Fase | toy/pequeno | médio | grande/gigante | gato |
|---|---|---|---|---|
| filhote | 20 | 19 | 18 | 22 |
| adulto | 16 | 15 | 14 | 15 |
| senior | 15 | 14 | 13 | 14 |
| castrado | 16 | 15 | 14 | 13 |

`fresh_meat` é 1 g/kg menor em quase tudo (tabela completa em `CONSUMO_G_POR_KG_DIA`).

Consumo total do pacote = `consumo_diario_g=` do marcador `recompra_auto`, senão a **soma dos pets**, senão
120 g/dia.

### 4.5 Ciclo automático (`dias_calculados`)
O primeiro que existir, nesta ordem:

| Prioridade | Fonte | `fonte` no banco | Regra |
|---|---|---|---|
| 1 | Histórico real | `historico` | Pega as últimas até 4 compras do mesmo cliente + SKU (+ pet). Calcula os intervalos em dias, mantém os que ficam entre 3 e 180 (até 3 intervalos) e usa a média arredondada. |
| 2 | Observação do pedido | `observacao` | `dias=` do marcador `recompra_auto` (3 a 180) |
| 3 | Consumo | `estimativa` | `round(peso_kg × 1000 / consumo_diario_g)` (mínimo 1; 30 se peso ou consumo = 0) |

Formato do marcador na observação da venda (várias linhas separadas por `|`):
`recompra_auto sku="ABC123" dias=35 consumo_diario_g=400 peso_kg=15`

Na venda manual (`registrarRecompraManual`, `fonte = manual`) a ordem é: dias informado no formulário,
depois modelo do SKU em `recompra_racao_modelos`, depois o consumo.

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

## 6. Pontos fracos conhecidos (por que o automático erra)

Ao investigar "ciclo errado", confira nesta ordem:

1. **Histórico sem normalizar por quantidade.** A média de intervalos (prioridade 1) vence tudo e ignora
   quanto foi comprado. Exemplos: um mês com 1 pacote e outro com 2, ou duas vendas separadas com 3 a
   5 dias de diferença.
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
