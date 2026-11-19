-- Itens avulsos guardam preço e custo sem criar um produto de estoque fictício.
-- A chave estrangeira continua validando todos os SKUs informados.
alter table public.venda_itens alter column sku drop not null;
