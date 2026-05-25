# Plano de Implementacao: Cupons de Influenciadores e Comissoes

## Objetivo

Criar um modulo real de indicacoes onde influenciadores recebem cupons proprios. Quando um cliente compra usando um cupom, a venda fica vinculada ao influenciador e gera uma comissao rastreavel no CRM.

O sistema deve responder tres perguntas com clareza:

- Qual cupom foi usado em cada venda?
- Quanto cada influenciador gerou de faturamento/lucro?
- Quanto de comissao esta pendente, aprovada ou paga?

## Escopo Funcional

1. Cadastro de influenciadores
   - Nome, telefone, documento opcional, chave Pix opcional.
   - Status: ativo, pausado, encerrado.
   - Canal principal: Instagram, TikTok, WhatsApp, outro.
   - Observacoes internas.

2. Cupons
   - Cupom unico por influenciador, exemplo: `PEDRO10`.
   - Tipo de desconto: percentual ou valor fixo.
   - Valor do desconto.
   - Validade opcional.
   - Limite de usos opcional.
   - Status: ativo, pausado, expirado.

3. Regras de comissao
   - Comissao percentual sobre faturamento ou sobre lucro.
   - Regra padrao por cupom.
   - Possibilidade futura de regra por categoria.
   - Comissao so deve ser gerada quando a venda estiver paga.

4. Aplicacao do cupom na venda
   - PDV deve aceitar campo de cupom.
   - WhatsApp IA deve reconhecer cupom quando o cliente disser algo como "tenho cupom PEDRO10".
   - Venda deve salvar `cupom_id`, `influenciador_id`, desconto aplicado e base de comissao.

5. Comissoes
   - Cada venda paga com cupom gera um registro de comissao.
   - Status: pendente, aprovada, paga, cancelada.
   - Se pedido for cancelado/reembolsado, comissao deve ser cancelada ou estornada.
   - Tela deve permitir marcar comissao como paga.

6. Dashboard de indicacoes
   - KPIs: faturamento por cupom, lucro, comissao pendente, comissao paga, conversao.
   - Ranking de influenciadores.
   - Historico de vendas por cupom.
   - Filtro por periodo, status e influenciador.

## Modelo de Banco

Criar migration Supabase com novas tabelas.

### `influenciadores`

Campos:

- `id uuid primary key`
- `nome text not null`
- `telefone text`
- `documento text`
- `chave_pix text`
- `canal text`
- `status text not null default 'ativo'`
- `observacao text`
- `criado_em timestamptz`
- `atualizado_em timestamptz`

Checks:

- `status in ('ativo', 'pausado', 'encerrado')`

### `cupons`

Campos:

- `id uuid primary key`
- `influenciador_id uuid references influenciadores(id)`
- `codigo text not null unique`
- `tipo_desconto text not null`
- `valor_desconto numeric(12,2) not null default 0`
- `comissao_tipo text not null default 'percentual_faturamento'`
- `comissao_valor numeric(12,2) not null default 0`
- `limite_usos integer`
- `usos integer not null default 0`
- `validade timestamptz`
- `status text not null default 'ativo'`
- `criado_em timestamptz`
- `atualizado_em timestamptz`

Checks:

- `tipo_desconto in ('percentual', 'valor_fixo')`
- `comissao_tipo in ('percentual_faturamento', 'percentual_lucro', 'valor_fixo')`
- `status in ('ativo', 'pausado', 'expirado')`

### Alterar `vendas`

Adicionar:

- `cupom_id uuid references cupons(id)`
- `influenciador_id uuid references influenciadores(id)`
- `cupom_codigo text`
- `desconto_cupom numeric(12,2) not null default 0`
- `total_bruto numeric(12,2)`

Observacao: manter `cupom_codigo` como snapshot para auditoria, mesmo se o cupom mudar depois.

### `comissoes_influenciadores`

Campos:

- `id uuid primary key`
- `venda_id uuid references vendas(id)`
- `influenciador_id uuid references influenciadores(id)`
- `cupom_id uuid references cupons(id)`
- `base_calculo numeric(12,2) not null`
- `percentual numeric(8,2)`
- `valor numeric(12,2) not null`
- `status text not null default 'pendente'`
- `pago_em timestamptz`
- `observacao text`
- `criado_em timestamptz`
- `atualizado_em timestamptz`

Checks:

- `status in ('pendente', 'aprovada', 'paga', 'cancelada')`

Restricao recomendada:

- `unique(venda_id, cupom_id)` para evitar comissao duplicada.

## Fluxo de Venda

1. Cliente informa cupom no WhatsApp ou PDV.
2. Sistema valida:
   - cupom existe;
   - cupom ativo;
   - nao expirou;
   - nao excedeu limite de usos.
3. Sistema calcula desconto.
4. Venda e criada com:
   - total bruto;
   - desconto do cupom;
   - total final;
   - cupom e influenciador vinculados.
5. Quando pagamento for confirmado:
   - venda muda para paga;
   - estoque baixa normalmente;
   - comissao e criada como `pendente` ou `aprovada`.
6. Admin marca comissao como paga quando transferir ao influenciador.

## Regras de Calculo

### Desconto

Percentual:

```text
desconto = total_bruto * valor_desconto / 100
```

Valor fixo:

```text
desconto = min(valor_desconto, total_bruto)
```

### Comissao

Percentual sobre faturamento:

```text
base = total_final
comissao = base * comissao_valor / 100
```

Percentual sobre lucro:

```text
base = lucro_da_venda
comissao = base * comissao_valor / 100
```

Valor fixo:

```text
comissao = comissao_valor
```

## Backend

Criar em `src/lib/supabase.ts` ou novo modulo `src/lib/indicacoes-supabase.ts`:

- `listarInfluenciadores()`
- `criarInfluenciador(input)`
- `atualizarInfluenciador(id, input)`
- `listarCupons()`
- `criarCupom(input)`
- `validarCupom(codigo)`
- `calcularDescontoCupom(cupom, total)`
- `registrarComissaoVenda(vendaId)`
- `listarComissoes(filtros)`
- `marcarComissaoPaga(id)`

Criar rotas:

- `GET /api/crm/indicacoes`
- `POST /api/crm/influenciadores`
- `PATCH /api/crm/influenciadores/:id`
- `POST /api/crm/cupons`
- `PATCH /api/crm/cupons/:id`
- `POST /api/crm/cupons/validar`
- `PATCH /api/crm/comissoes/:id`

## Integracao com PDV

Adicionar campo de cupom no checkout:

- Input curto: `Cupom`
- Botao: validar/aplicar
- Mostrar desconto aplicado no resumo.
- Salvar cupom junto da venda manual.

Alterar `criarPedidoManual` para aceitar:

- `cupomCodigo`
- `cupomId`
- `influenciadorId`
- `descontoCupom`
- `totalBruto`

## Integracao com WhatsApp IA

1. Detectar cupom na mensagem:

```text
cupom PEDRO10
usar PEDRO10
tenho o cupom PEDRO10
```

2. Salvar cupom no contexto da conversa ou cliente temporariamente.
3. Quando emitir `[PEDIDO]`, aplicar cupom antes de criar a venda.
4. Responder de forma simples:

```text
Cupom PEDRO10 aplicado. O total ficou R$ X.
```

5. Nao inventar cupom. Se o cupom nao existir ou estiver pausado, pedir outro ou seguir sem desconto.

## Frontend

Substituir o mock atual de `src/pages/Indicacoes.tsx` por dados reais da API.

Views principais:

1. Resumo
   - Faturamento gerado.
   - Comissao pendente.
   - Comissao paga.
   - Numero de vendas com cupom.
   - Ticket medio via cupom.

2. Influenciadores
   - Lista com nome, cupom principal, status, vendas, faturamento, comissao.
   - Criar/editar influenciador.

3. Cupons
   - Codigo, desconto, regra de comissao, validade, usos, status.
   - Criar/pausar cupom.

4. Comissoes
   - Venda, data, influenciador, cupom, valor da venda, comissao, status.
   - Acao: marcar como paga.

5. Historico
   - Todas as vendas geradas por cupom.
   - Filtro por periodo e influenciador.

## Antifraude e Regras Operacionais

- Nao permitir cupom do influenciador em compra feita pelo proprio telefone dele.
- Nao gerar comissao para venda cancelada.
- Nao gerar comissao duplicada para a mesma venda.
- Se venda for reembolsada, comissao vira `cancelada`.
- Validar cupom de forma case-insensitive, mas salvar em uppercase.
- Cupom nao deve aplicar desconto maior que o total da venda.

## Ordem de Implementacao

1. Criar migration das tabelas e colunas.
2. Criar funcoes de backend para validar cupom e calcular desconto/comissao.
3. Integrar com criacao de venda manual e venda do WhatsApp.
4. Gerar comissao quando pagamento for confirmado.
5. Criar APIs do modulo de indicacoes.
6. Refatorar tela `Indicacoes.tsx` para consumir API real.
7. Adicionar campo de cupom no PDV.
8. Adicionar deteccao de cupom no WhatsApp.
9. Testar fluxo completo:
   - criar influenciador;
   - criar cupom;
   - compra com cupom;
   - pagamento aprovado;
   - comissao pendente;
   - marcar comissao como paga.

## Testes Minimos

- Cupom valido aplica desconto.
- Cupom invalido nao aplica desconto.
- Cupom expirado nao aplica desconto.
- Venda paga gera uma unica comissao.
- Venda cancelada cancela comissao.
- PDV salva cupom corretamente.
- WhatsApp reconhece cupom e aplica no pedido.
- Dashboard soma comissoes e vendas corretamente.

## Decisoes Pendentes

- Comissao sera calculada sobre faturamento ou lucro por padrao?
- Cupom deve dar desconto ao cliente sempre, ou pode ser apenas rastreador sem desconto?
- Comissao entra como pendente automaticamente ou aprovada automaticamente apos pagamento?
- Existe prazo de liberacao da comissao, por exemplo D+7?
- Influenciador pode ter mais de um cupom ativo ao mesmo tempo?
