-- Compras informadas no painel são fatos de consumo, não vendas financeiras.
create table if not exists public.recompra_compras_manuais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  sku text not null,
  produto_nome text not null,
  pet_nome text not null,
  especie text not null check (especie in ('cachorro', 'gato')),
  comprado_em date not null,
  quantidade numeric not null check (quantidade > 0),
  peso_kg numeric not null default 0 check (peso_kg >= 0),
  consumo_diario_g numeric check (consumo_diario_g > 0),
  dias_manual integer check (dias_manual between 1 and 365),
  pets_detalhes jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists recompra_compras_manuais_cliente_data_idx
  on public.recompra_compras_manuais (cliente_id, comprado_em, id);
alter table public.recompra_compras_manuais enable row level security;
revoke all on public.recompra_compras_manuais from public, anon, authenticated;
grant all on public.recompra_compras_manuais to service_role;

alter table public.recompra_previsoes add column if not exists calculo jsonb;

-- Preserva os cadastros manuais existentes antes do primeiro recálculo novo.
insert into public.recompra_compras_manuais
  (id, cliente_id, sku, produto_nome, pet_nome, especie, comprado_em, quantidade,
   peso_kg, consumo_diario_g, dias_manual, pets_detalhes)
select id, cliente_id, coalesce(sku, 'AVULSA-' || id::text), produto_nome, pet_nome,
  coalesce(pets->0->>'especie', 'cachorro'), ultima_compra_em, greatest(1, quantidade),
  greatest(0, peso_kg), nullif(consumo_diario_g, 0),
  case when dias_manual between 1 and 365 then dias_manual::integer
       when fonte = 'manual' and dias_estimados between 1 and 365 then dias_estimados::integer
       else null end,
  coalesce(pets, '[]'::jsonb)
from public.recompra_previsoes
where venda_id is null and cliente_id is not null and calculo is null
on conflict (id) do nothing;

-- Só o servidor pode substituir a projeção de um cliente. Tudo ou nada;
-- uma edição concorrente exige nova leitura/cálculo em vez de ser sobrescrita.
create or replace function public.salvar_previsoes_recompra(
  p_cliente_id uuid, p_versao jsonb, p_previsoes jsonb
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare versao_atual jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_cliente_id::text, 917));
  select coalesce(jsonb_object_agg(id::text, atualizado_em), '{}'::jsonb)
    into versao_atual from public.recompra_previsoes where cliente_id = p_cliente_id;
  if versao_atual <> p_versao then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_previsoes) p
             where (p->>'cliente_id')::uuid is distinct from p_cliente_id) then
    raise exception 'Cliente da previsão incompatível';
  end if;
  delete from public.recompra_previsoes
    where cliente_id = p_cliente_id and id not in
      (select (p->>'id')::uuid from jsonb_array_elements(p_previsoes) p);
  insert into public.recompra_previsoes as alvo
    (id, cliente_id, venda_id, venda_item_id, sku, pet_nome, produto_nome, categoria,
     peso_kg, quantidade, pets, consumo_diario_g, dias_estimados, dias_calculados,
     dias_manual, media_dias_real, historico_dias, ultima_compra_em, proxima_compra_em,
     data_alerta, status, fonte, contatado, travado, calculo, atualizado_em)
  select r.id, r.cliente_id, r.venda_id, r.venda_item_id, r.sku, r.pet_nome,
     r.produto_nome, r.categoria, r.peso_kg, r.quantidade, r.pets, r.consumo_diario_g,
     r.dias_estimados, r.dias_calculados, r.dias_manual, r.media_dias_real,
     r.historico_dias, r.ultima_compra_em, r.proxima_compra_em, r.data_alerta,
     r.status, r.fonte, r.contatado, r.travado, r.calculo, now()
  from jsonb_populate_recordset(null::public.recompra_previsoes, p_previsoes) r
  on conflict (id) do update set
    venda_id = excluded.venda_id, venda_item_id = excluded.venda_item_id,
    sku = excluded.sku, pet_nome = excluded.pet_nome, produto_nome = excluded.produto_nome,
    categoria = excluded.categoria, peso_kg = excluded.peso_kg, quantidade = excluded.quantidade,
    pets = excluded.pets, consumo_diario_g = excluded.consumo_diario_g,
    dias_estimados = excluded.dias_estimados, dias_calculados = excluded.dias_calculados,
    dias_manual = excluded.dias_manual, media_dias_real = excluded.media_dias_real,
    historico_dias = excluded.historico_dias, ultima_compra_em = excluded.ultima_compra_em,
    proxima_compra_em = excluded.proxima_compra_em, data_alerta = excluded.data_alerta,
    status = excluded.status, fonte = excluded.fonte, contatado = excluded.contatado,
    travado = excluded.travado, calculo = excluded.calculo, atualizado_em = excluded.atualizado_em;
  return true;
end;
$$;
revoke all on function public.salvar_previsoes_recompra(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.salvar_previsoes_recompra(uuid, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
