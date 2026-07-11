alter table public.venda_itens
  add column if not exists pet_nome text;

create index if not exists venda_itens_pet_nome_idx
  on public.venda_itens (pet_nome)
  where pet_nome is not null;

create index if not exists venda_itens_pet_sku_idx
  on public.venda_itens (pet_nome, sku)
  where pet_nome is not null;

alter table if exists public.recompra_previsoes
  add column if not exists pet_nome text not null default '';

alter table if exists public.recompra_previsoes
  drop constraint if exists recompra_previsoes_cliente_id_sku_key;

do $$
begin
  if to_regclass('public.recompra_previsoes') is not null then
    execute 'create unique index if not exists recompra_previsoes_cliente_sku_pet_key on public.recompra_previsoes (cliente_id, sku, pet_nome)';
    execute 'create index if not exists recompra_previsoes_pet_nome_idx on public.recompra_previsoes (pet_nome) where pet_nome <> ''''';
  end if;
end $$;
