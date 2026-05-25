create extension if not exists "uuid-ossp";

create table if not exists pedidos (
  id uuid primary key default uuid_generate_v4(),
  cliente_telefone text not null,
  descricao text,
  valor numeric(10, 2) not null,
  status text default 'pendente' check (status in ('pendente', 'pago', 'cancelado', 'entregue')),
  mp_payment_id text,
  mp_qr_code text,
  mp_qr_code_base64 text,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists pedidos_cliente_telefone_idx on pedidos (cliente_telefone);
create index if not exists pedidos_mp_payment_id_idx on pedidos (mp_payment_id);
create index if not exists pedidos_status_idx on pedidos (status);

alter table pedidos
add column if not exists venda_id uuid references vendas(id) on delete set null;

create index if not exists pedidos_venda_id_idx on pedidos (venda_id);

create table if not exists venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  sku text not null references produtos(sku),
  nome text not null,
  quantidade integer not null default 1 check (quantidade > 0),
  preco numeric(12, 2) not null default 0,
  preco_compra numeric(12, 2) not null default 0,
  estoque_baixado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists venda_itens_venda_id_idx on venda_itens (venda_id);
create index if not exists venda_itens_sku_idx on venda_itens (sku);
create index if not exists venda_itens_estoque_baixado_idx on venda_itens (estoque_baixado);
