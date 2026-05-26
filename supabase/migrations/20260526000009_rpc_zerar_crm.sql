create or replace function zerar_dados_crm()
returns void
language plpgsql
security definer
as $$
begin
  -- Exclui tabelas dependentes primeiro
  truncate table pedidos cascade;
  truncate table venda_itens cascade;
  truncate table vendas cascade;
  -- Exclui clientes por último
  truncate table clientes cascade;
end;
$$;
