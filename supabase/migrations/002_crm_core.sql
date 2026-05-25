create extension if not exists pgcrypto;

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null unique,
  endereco text,
  bairro text,
  pets jsonb not null default '[]'::jsonb,
  ticket numeric(12, 2) not null default 0,
  frequencia text,
  ultima text,
  perfil text not null default 'Novo' check (perfil in ('VIP', 'Premium', 'Econômico', 'Novo', 'Risco')),
  origem text,
  origem_detalhe text,
  campanha text,
  campanha_custo numeric(12, 2),
  campanha_convertidos integer,
  cupom text,
  influenciador text,
  cac numeric(12, 2) not null default 0,
  total_gasto numeric(12, 2) not null default 0,
  total_descontos numeric(12, 2) not null default 0,
  lucro_liquido numeric(12, 2) not null default 0,
  pedidos integer not null default 0,
  prox_recompra text,
  cidade text,
  especies jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists clientes_nome_idx on clientes (nome);
create index if not exists clientes_telefone_idx on clientes (telefone);
create index if not exists clientes_perfil_idx on clientes (perfil);

create table if not exists produtos (
  sku text primary key,
  nome text not null,
  categoria text not null,
  estoque integer not null default 0,
  minimo integer not null default 0,
  giro text not null default 'baixo' check (giro in ('alto', 'médio', 'baixo')),
  preco numeric(12, 2) not null default 0,
  preco_compra numeric(12, 2) not null default 0,
  tipo text not null default 'próprio' check (tipo in ('próprio', 'consignado')),
  fornecedor text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists produtos_nome_idx on produtos (nome);
create index if not exists produtos_categoria_idx on produtos (categoria);
create index if not exists produtos_tipo_idx on produtos (tipo);

create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text,
  telefone text,
  total numeric(12, 2) not null default 0,
  lucro numeric(12, 2) not null default 0,
  forma_pagamento text,
  status_pagamento text not null default 'pago',
  status text not null default 'concluida' check (status in ('concluida', 'cancelada', 'reembolsada')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists vendas_cliente_id_idx on vendas (cliente_id);
create index if not exists vendas_criado_em_idx on vendas (criado_em);
create index if not exists vendas_status_idx on vendas (status);
