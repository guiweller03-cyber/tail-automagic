alter table clientes
  add column if not exists observacoes text,
  add column if not exists follow_up_manual jsonb not null default '{}'::jsonb;
