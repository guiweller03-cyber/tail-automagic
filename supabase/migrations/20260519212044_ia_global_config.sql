create table if not exists crm_configuracoes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

insert into crm_configuracoes (chave, valor)
values ('ia_global_desativada', 'false'::jsonb)
on conflict (chave) do nothing;
