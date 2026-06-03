create table if not exists campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  origem text not null default '',
  objetivo text not null default '',
  investimento numeric(12, 2) not null default 0,
  leads integer not null default 0 check (leads >= 0),
  conversoes integer not null default 0 check (conversoes >= 0),
  receita numeric(12, 2) not null default 0,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada', 'encerrada')),
  inicio date,
  fim date,
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists campanhas_status_idx on campanhas (status);
create index if not exists campanhas_atualizado_em_idx on campanhas (atualizado_em desc);

alter table campanhas enable row level security;

drop policy if exists "campanhas_select_anon" on campanhas;
create policy "campanhas_select_anon"
  on campanhas
  for select
  to anon, authenticated
  using (true);

drop policy if exists "campanhas_insert_anon" on campanhas;
create policy "campanhas_insert_anon"
  on campanhas
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "campanhas_update_anon" on campanhas;
create policy "campanhas_update_anon"
  on campanhas
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "campanhas_delete_anon" on campanhas;
create policy "campanhas_delete_anon"
  on campanhas
  for delete
  to anon, authenticated
  using (true);
