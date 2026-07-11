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

create table if not exists public.recompra_racao_modelos (
  sku text primary key references public.produtos(sku) on delete cascade,
  produto_nome text not null,
  dias_recompra integer not null default 30 check (dias_recompra between 1 and 365),
  consumo_diario_g numeric(10, 2),
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index if not exists recompra_racao_modelos_ativo_idx
  on public.recompra_racao_modelos (ativo, produto_nome);
