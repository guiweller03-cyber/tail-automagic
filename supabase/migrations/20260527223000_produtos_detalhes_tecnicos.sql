alter table produtos
add column if not exists detalhes_tecnicos jsonb not null default '{}'::jsonb;
