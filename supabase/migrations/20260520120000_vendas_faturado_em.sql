alter table vendas
add column if not exists faturado_em timestamptz;

create index if not exists vendas_faturado_em_idx on vendas (faturado_em);
