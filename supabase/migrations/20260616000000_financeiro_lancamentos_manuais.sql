-- As abas Despesas, Marketing e Combustivel do Financeiro guardavam os
-- lancamentos so no localStorage do navegador (sem tabela/API no backend).
-- Isso fazia registros "sumirem" sempre que o usuario trocava de
-- navegador/dispositivo ou tinha o localStorage limpo. Estas tabelas passam
-- a persistir os lancamentos manuais de verdade no Supabase.

create table if not exists financeiro_despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  categoria text not null default 'outros' check (
    categoria in (
      'aluguel', 'energia', 'internet', 'embalagem', 'manutencao', 'salario', 'contador', 'outros'
    )
  ),
  descricao text not null,
  valor numeric(12, 2) not null default 0,
  recorrente boolean not null default false,
  pago boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists financeiro_despesas_data_idx on financeiro_despesas (data);

create table if not exists financeiro_marketing (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null default 'outros' check (
    tipo in ('meta_ads', 'influenciador', 'panfleto', 'cupom', 'brinde', 'outros')
  ),
  descricao text not null,
  valor numeric(12, 2) not null default 0,
  resultado text,
  roi numeric(10, 2),
  campanha text,
  pago boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists financeiro_marketing_data_idx on financeiro_marketing (data);

create table if not exists financeiro_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  km_atual integer not null,
  litros numeric(10, 2) not null,
  valor_litro numeric(10, 2) not null,
  valor_total numeric(12, 2) not null,
  posto text,
  obs text,
  criado_em timestamptz not null default now()
);

create index if not exists financeiro_abastecimentos_km_idx on financeiro_abastecimentos (km_atual);
