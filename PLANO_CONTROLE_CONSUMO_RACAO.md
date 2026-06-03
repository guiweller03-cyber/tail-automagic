# Plano de implementacao: controle de consumo de racao

## Contexto do projeto

Stack detectado neste repositório:

- Frontend: TanStack Start + React 19 + TypeScript
- UI: Tailwind CSS + componentes em `src/components/ui`
- Backend: rotas server-side em `src/routes/api/*`
- Banco: Supabase/Postgres
- Persistencia atual: tabelas `clientes`, `produtos`, `vendas`, `venda_itens`, `pedidos` e `crm_configuracoes`
- Painéis relacionados: `PDV`, `Pedidos`, `Estoque`, `Conversas`, `RecompraPrevista`, `Automacoes`

O sistema já trabalha com venda, produto e cliente reais. A implementacao abaixo deve acoplar o controle de consumo de racao ao fluxo de venda existente, sem criar um app paralelo.

## Objetivo

Permitir que cada venda de racao registre:

- quais animais consomem aquele produto
- quanto cada animal consome por dia
- o total diário configurado
- a data de inicio do consumo
- a data estimada de fim
- alertas de recompra
- aprendizado com o historico real

## Modelo de dados sugerido

### 1. Configuracoes globais

Reaproveitar `crm_configuracoes` para os padroes globais:

- `racao_consumo_default_por_porte`
- `racao_consumo_fator_qualidade`
- `racao_alerta_dias_antes`

Exemplo de valores:

```json
{
  "porte": {
    "pequeno": 40,
    "medio": 80,
    "grande": 150
  },
  "qualidade": {
    "premium": 0.7,
    "padrao": 1.0,
    "economica": 1.3
  },
  "alerta_dias_antes": 2
}
```

### 2. Dados da venda

Recomendacao principal: manter `venda_itens` como base comercial e criar uma tabela filha para o controle de consumo.

Nova tabela: `venda_item_consumo_racao`

Campos sugeridos:

- `id uuid primary key`
- `venda_item_id uuid unique references venda_itens(id) on delete cascade`
- `venda_id uuid references vendas(id) on delete cascade`
- `cliente_id uuid references clientes(id) on delete set null`
- `sku text references produtos(sku)`
- `data_inicio_consumo date not null`
- `peso_saco_kg numeric(10,2) not null`
- `consumo_base_porte jsonb not null default '{}'::jsonb`
- `fator_qualidade numeric(4,2) not null default 1`
- `animais jsonb not null default '[]'::jsonb`
- `consumo_diario_total_g numeric(10,2) not null`
- `dias_estimados numeric(10,2) not null`
- `data_fim_estimada date not null`
- `alerta_dias_antes integer not null default 2`
- `data_alerta_em date not null`
- `observacao text`
- `consumo_editado_manual boolean not null default false`
- `consumo_aprendido_dias numeric(10,2)`
- `consumo_aprendido_g_dia numeric(10,2)`
- `criado_em timestamptz not null default now()`
- `atualizado_em timestamptz not null default now()`

### 3. Historico real de consumo

Nova tabela: `consumo_racao_historico`

Campos sugeridos:

- `id uuid primary key`
- `cliente_id uuid references clientes(id) on delete set null`
- `venda_item_id uuid references venda_itens(id) on delete set null`
- `venda_id uuid references vendas(id) on delete set null`
- `sku text references produtos(sku)`
- `peso_saco_kg numeric(10,2) not null`
- `data_inicio_consumo date not null`
- `data_fim_real date not null`
- `dias_reais numeric(10,2) not null`
- `consumo_diario_real_g numeric(10,2) not null`
- `consumo_diario_estimado_g numeric(10,2) not null`
- `animais jsonb not null default '[]'::jsonb`
- `observacao text`
- `criado_em timestamptz not null default now()`

### 4. Perfil aprendido por cliente e produto

Nova tabela: `consumo_racao_perfil_aprendido`

Campos sugeridos:

- `id uuid primary key`
- `cliente_id uuid references clientes(id) on delete cascade`
- `sku text references produtos(sku) on delete cascade`
- `media_dias_por_saco numeric(10,2) not null`
- `media_consumo_dia_g numeric(10,2) not null`
- `amostras integer not null default 0`
- `historico_dias jsonb not null default '[]'::jsonb`
- `ultima_compra_em date`
- `ultima_venda_id uuid`
- `observacao text`
- `atualizado_em timestamptz not null default now()`

Regra: usar a media das ultimas 3 compras como base da proxima estimativa.

### 5. Alertas compartilhados

Nova tabela: `alertas_consumo_racao`

Campos sugeridos:

- `id uuid primary key`
- `cliente_id uuid references clientes(id) on delete set null`
- `venda_id uuid references vendas(id) on delete set null`
- `venda_item_id uuid references venda_itens(id) on delete set null`
- `sku text references produtos(sku)`
- `titulo text not null`
- `mensagem text not null`
- `data_alerta date not null`
- `status text not null default 'ativo'`
- `severidade text not null default 'media'`
- `rota text not null default '/recompra-prevista'`
- `criado_em timestamptz not null default now()`
- `atualizado_em timestamptz not null default now()`

Observacao importante: nao usar `localStorage` para esse caso, porque o alerta precisa ser compartilhado entre os dois administradores.

## Logica de calculo

### Base por porte

- pequeno: `40 g/dia`
- medio: `80 g/dia`
- grande: `150 g/dia`

### Fator por qualidade

- premium: `0.7`
- padrao: `1.0`
- economica: `1.3`

### Formula por animal

`consumo_animal_g_dia = consumo_base_porte * fator_qualidade`

### Formula total

`consumo_diario_total_g = soma(consumo_animal_g_dia de todos os animais)`

Se o usuario editar manualmente o valor total, salvar esse valor como override e marcar `consumo_editado_manual = true`.

### Duracao do saco

`dias_estimados = (peso_saco_kg * 1000) / consumo_diario_total_g`

### Datas

- `data_inicio_consumo = data de entrega`
- `data_fim_estimada = data_inicio_consumo + dias_estimados`
- `data_alerta_em = data_fim_estimada - alerta_dias_antes`

## Fluxo de aprendizado

Quando o cliente comprar de novo o mesmo SKU:

1. localizar o ultimo consumo ativo daquele `cliente_id + sku`
2. calcular os dias reais entre `data_inicio_consumo` e a nova compra
3. salvar uma linha em `consumo_racao_historico`
4. recalcular `consumo_racao_perfil_aprendido` com base nas ultimas 3 compras
5. atualizar o valor base usado na proxima venda

O resumo exibido no cliente pode ser:

- `consumo real aprendido: X dias por saco de Y kg`

## UI a implementar

### 1. Tela de venda

Na tela de cadastro/edição de venda de racao:

- selecionar os animais do cliente que consomem aquele produto
- editar nome do animal
- escolher porte por animal
- mostrar consumo calculado por animal
- mostrar total diario automatico
- permitir override manual do total diario
- campo de observacao livre
- mostrar previsao de duracao e data final estimada

### 2. Tela de detalhe do cliente

Adicionar um bloco de consumo com:

- ultimo saco comprado
- dias estimados
- dias reais aprendidos
- alerta de recompra
- botao `Editar consumo`

### 3. Tela de detalhe da venda

Adicionar:

- resumo dos animais vinculados
- consumo total por dia
- data de inicio
- fim estimado
- status do alerta
- botao `Editar consumo`

### 4. Painel de alertas

Exibir:

- clientes com racao acabando em breve
- filtros por `hoje`, `2 dias`, `atrasado`, `SKU`, `cliente`
- acao rapida para abrir conversa

## Backend / rotas

### 1. Endpoints novos

Sugeridos:

- `GET /api/crm/consumo-racao/config`
- `PATCH /api/crm/consumo-racao/config`
- `POST /api/crm/consumo-racao/venda-item`
- `PATCH /api/crm/consumo-racao/venda-item`
- `GET /api/crm/consumo-racao/alertas`
- `POST /api/crm/consumo-racao/recalcular`

### 2. Funcoes de calculo

Criar funções puras em `src/lib`:

- `calcularConsumoAnimal`
- `calcularConsumoTotal`
- `calcularDiasEstimados`
- `calcularDataFim`
- `calcularDataAlerta`
- `recalcularPerfilAprendido`

### 3. Integração com o fluxo atual de venda

Pontos provaveis de integração:

- `src/lib/supabase.ts`
- `src/routes/api/crm.pedidos.ts`
- `src/routes/api/crm.conversas.ts`
- `src/pages/PDV.tsx`
- `src/pages/Pedidos.tsx`
- `src/pages/Clientes.tsx`

## Job / cron

Criar uma rotina agendada para:

- varrer consumos com `data_alerta_em <= hoje`
- inserir ou atualizar alertas ativos
- marcar como resolvido quando o cliente recompra o mesmo SKU
- opcionalmente disparar mensagem via WhatsApp ou notificação interna

Frequencia recomendada:

- 1 vez por dia, de madrugada
- opcional: mais uma execucao no meio da tarde

Se o deploy estiver em Cloudflare, este job pode virar um cron/worker.
Se estiver em outro backend, pode ser um endpoint protegido executado por scheduler externo.

## Ordem de implementacao sugerida

1. Criar migrations e tabelas novas
2. Criar helpers de calculo puros
3. Criar endpoints de leitura e escrita
4. Adicionar UI de edicao de consumo na venda
5. Adicionar resumo no cliente e na venda
6. Criar geracao de alertas
7. Criar aprendizado com base nas ultimas 3 compras
8. Conectar o painel de recompra prevista a dados reais

## Critérios de aceite

- consigo cadastrar varios animais para a mesma venda
- o total diario e a duracao sao calculados automaticamente
- consigo editar manualmente o consumo total
- a data estimada de termino aparece no sistema
- o alerta de recompra aparece no painel
- o alerta é compartilhado entre os dois administradores
- a proxima compra atualiza o consumo aprendido
- o cliente passa a mostrar o resumo `X dias por saco de Y kg`

## Observacoes de escopo

- A pagina `RecompraPrevista` ja existe, mas hoje ela opera como previsao geral. Este projeto precisa ligar a previsao ao consumo real salvo por cliente e produto.
- O controle de alerta nao deve ficar preso em estado local do navegador.
- Se o cron nao estiver disponivel no ambiente, a versao minima deve rodar a cada abertura do dashboard ou a cada envio de venda nova.

