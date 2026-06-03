create table if not exists cliente_dados_observados (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  telefone text not null,
  origem text not null default 'whatsapp_ia',
  dados jsonb not null default '{}'::jsonb,
  resumo text,
  confianca numeric(4, 2) not null default 0.60,
  observado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists cliente_dados_observados_cliente_idx on cliente_dados_observados (cliente_id);
create index if not exists cliente_dados_observados_telefone_idx on cliente_dados_observados (telefone);

create table if not exists recompra_previsoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  venda_id uuid references vendas(id) on delete set null,
  venda_item_id uuid references venda_itens(id) on delete set null,
  sku text references produtos(sku) on delete set null,
  produto_nome text not null,
  categoria text,
  peso_kg numeric(10, 2) not null default 0,
  quantidade integer not null default 1,
  pets jsonb not null default '[]'::jsonb,
  consumo_diario_g numeric(10, 2) not null default 0,
  dias_estimados numeric(10, 2) not null default 0,
  media_dias_real numeric(10, 2),
  historico_dias jsonb not null default '[]'::jsonb,
  ultima_compra_em date not null,
  proxima_compra_em date not null,
  data_alerta date not null,
  status text not null default 'ok' check (status in ('ok', 'semana', 'urgente', 'atrasado')),
  contatado boolean not null default false,
  travado boolean not null default false,
  fonte text not null default 'venda',
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (cliente_id, sku)
);

create index if not exists recompra_previsoes_cliente_idx on recompra_previsoes (cliente_id);
create index if not exists recompra_previsoes_alerta_idx on recompra_previsoes (data_alerta, status);
create index if not exists recompra_previsoes_proxima_idx on recompra_previsoes (proxima_compra_em);
