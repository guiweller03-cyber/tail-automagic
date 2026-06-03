create table if not exists notas_gerais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Nova nota',
  conteudo text not null default '',
  categoria text,
  fixada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists notas_gerais_atualizado_em_idx on notas_gerais (atualizado_em desc);
create index if not exists notas_gerais_fixada_idx on notas_gerais (fixada);

alter table notas_gerais enable row level security;

drop policy if exists "notas_gerais_public_read" on notas_gerais;
drop policy if exists "notas_gerais_public_insert" on notas_gerais;
drop policy if exists "notas_gerais_public_update" on notas_gerais;
drop policy if exists "notas_gerais_public_delete" on notas_gerais;

create policy "notas_gerais_public_read" on notas_gerais for select using (true);
create policy "notas_gerais_public_insert" on notas_gerais for insert with check (true);
create policy "notas_gerais_public_update" on notas_gerais for update using (true) with check (true);
create policy "notas_gerais_public_delete" on notas_gerais for delete using (true);
