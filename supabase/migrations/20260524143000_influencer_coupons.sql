create table if not exists influenciadores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  documento text,
  chave_pix text,
  canal text,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado')),
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists influenciadores_status_idx on influenciadores (status);
create index if not exists influenciadores_nome_idx on influenciadores (nome);

create table if not exists cupons (
  id uuid primary key default gen_random_uuid(),
  influenciador_id uuid not null references influenciadores(id) on delete cascade,
  codigo text not null unique,
  tipo_desconto text not null default 'percentual' check (tipo_desconto in ('percentual', 'valor_fixo')),
  valor_desconto numeric(12, 2) not null default 0,
  comissao_tipo text not null default 'percentual_faturamento' check (
    comissao_tipo in ('percentual_faturamento', 'percentual_lucro', 'valor_fixo')
  ),
  comissao_valor numeric(12, 2) not null default 0,
  limite_usos integer,
  usos integer not null default 0,
  validade timestamptz,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'expirado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists cupons_influenciador_id_idx on cupons (influenciador_id);
create index if not exists cupons_codigo_idx on cupons (codigo);
create index if not exists cupons_status_idx on cupons (status);

alter table vendas
add column if not exists cupom_id uuid references cupons(id) on delete set null,
add column if not exists influenciador_id uuid references influenciadores(id) on delete set null,
add column if not exists cupom_codigo text,
add column if not exists desconto_cupom numeric(12, 2) not null default 0,
add column if not exists total_bruto numeric(12, 2);

create index if not exists vendas_cupom_id_idx on vendas (cupom_id);
create index if not exists vendas_influenciador_id_idx on vendas (influenciador_id);
create index if not exists vendas_cupom_codigo_idx on vendas (cupom_codigo);

create table if not exists comissoes_influenciadores (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  influenciador_id uuid not null references influenciadores(id) on delete cascade,
  cupom_id uuid not null references cupons(id) on delete cascade,
  base_calculo numeric(12, 2) not null default 0,
  percentual numeric(8, 2),
  valor numeric(12, 2) not null default 0,
  status text not null default 'pendente' check (
    status in ('pendente', 'aprovada', 'paga', 'cancelada')
  ),
  pago_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (venda_id, cupom_id)
);

create index if not exists comissoes_influenciadores_venda_id_idx
on comissoes_influenciadores (venda_id);

create index if not exists comissoes_influenciadores_influenciador_id_idx
on comissoes_influenciadores (influenciador_id);

create index if not exists comissoes_influenciadores_status_idx
on comissoes_influenciadores (status);
