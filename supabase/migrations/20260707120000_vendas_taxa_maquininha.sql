alter table vendas
add column if not exists taxa_maquininha numeric(12, 2) not null default 0;
