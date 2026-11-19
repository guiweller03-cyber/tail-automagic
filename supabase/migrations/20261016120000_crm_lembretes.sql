-- Post-its manuais do calendário, independentes dos disparos de WhatsApp.
create table if not exists public.crm_lembretes (
  id uuid primary key default gen_random_uuid(),
  cliente_nome text not null check (char_length(btrim(cliente_nome)) between 1 and 160),
  telefone text not null check (telefone ~ '^[0-9]{8,15}$'),
  dia date not null,
  anotacao text not null check (char_length(btrim(anotacao)) between 1 and 2000),
  concluido boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists crm_lembretes_dia_idx on public.crm_lembretes (dia, id);
create index if not exists crm_lembretes_pendentes_idx on public.crm_lembretes (dia, id) where concluido = false;
alter table public.crm_lembretes enable row level security;
-- O CRM usa sessão própria de administrador; somente seu servidor acessa a tabela.
revoke all on public.crm_lembretes from public, anon, authenticated;
grant select, insert, update, delete on public.crm_lembretes to service_role;
