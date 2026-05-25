create table if not exists produtos_procurados (
  id uuid primary key default gen_random_uuid(),
  termo text not null,
  telefone text,
  nome_cliente text,
  contexto text,
  vezes integer not null default 1 check (vezes > 0),
  status text not null default 'pendente',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists produtos_procurados_termo_idx on produtos_procurados (termo);
create index if not exists produtos_procurados_status_idx on produtos_procurados (status);
create index if not exists produtos_procurados_atualizado_em_idx
on produtos_procurados (atualizado_em desc);
