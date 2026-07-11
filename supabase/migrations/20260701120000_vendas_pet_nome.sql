alter table vendas
  add column if not exists pet_nome text;

create index if not exists vendas_pet_nome_idx on vendas (pet_nome);
