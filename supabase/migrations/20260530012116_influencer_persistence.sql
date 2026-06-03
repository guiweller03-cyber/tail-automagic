create table if not exists influencers (
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

alter table coupons
  add column if not exists influencer_id uuid references influencers(id) on delete set null;

create index if not exists influencers_nome_idx on influencers (nome);
create index if not exists influencers_status_idx on influencers (status);
create index if not exists coupons_influencer_id_idx on coupons (influencer_id);

alter table influencers enable row level security;

drop policy if exists "influencers_public_read" on influencers;
drop policy if exists "influencers_public_insert" on influencers;
drop policy if exists "influencers_public_update" on influencers;
drop policy if exists "influencers_public_delete" on influencers;

create policy "influencers_public_read" on influencers for select using (true);
create policy "influencers_public_insert" on influencers for insert with check (true);
create policy "influencers_public_update" on influencers for update using (true) with check (true);
create policy "influencers_public_delete" on influencers for delete using (true);
