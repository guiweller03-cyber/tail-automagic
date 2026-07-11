create table if not exists leads_totais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  telefone text not null unique,
  nome text not null,
  endereco text,
  bairro text,
  pets jsonb not null default '[]'::jsonb,
  ticket numeric(12, 2) not null default 0,
  frequencia text,
  ultima text,
  perfil text not null default 'Novo',
  origem text,
  origem_detalhe text,
  campanha text,
  campanha_custo numeric(12, 2),
  campanha_convertidos integer,
  cupom text,
  influenciador text,
  cac numeric(12, 2) not null default 0,
  total_gasto numeric(12, 2) not null default 0,
  total_descontos numeric(12, 2) not null default 0,
  lucro_liquido numeric(12, 2) not null default 0,
  pedidos integer not null default 0,
  prox_recompra text,
  cidade text,
  especies jsonb,
  observacoes text,
  follow_up_manual jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  primeiro_registro timestamptz not null default now(),
  ultimo_registro timestamptz not null default now()
);

create index if not exists leads_totais_nome_idx on leads_totais (nome);
create index if not exists leads_totais_telefone_idx on leads_totais (telefone);
create index if not exists leads_totais_perfil_idx on leads_totais (perfil);
create index if not exists leads_totais_ultimo_registro_idx on leads_totais (ultimo_registro desc);

insert into leads_totais (
  cliente_id,
  telefone,
  nome,
  endereco,
  bairro,
  pets,
  ticket,
  frequencia,
  ultima,
  perfil,
  origem,
  origem_detalhe,
  campanha,
  campanha_custo,
  campanha_convertidos,
  cupom,
  influenciador,
  cac,
  total_gasto,
  total_descontos,
  lucro_liquido,
  pedidos,
  prox_recompra,
  cidade,
  especies,
  observacoes,
  follow_up_manual,
  ativo,
  primeiro_registro,
  ultimo_registro
)
select
  id,
  telefone,
  nome,
  endereco,
  bairro,
  pets,
  ticket,
  frequencia,
  ultima,
  perfil,
  origem,
  origem_detalhe,
  campanha,
  campanha_custo,
  campanha_convertidos,
  cupom,
  influenciador,
  cac,
  total_gasto,
  total_descontos,
  lucro_liquido,
  pedidos,
  prox_recompra,
  cidade,
  especies,
  observacoes,
  follow_up_manual,
  true,
  criado_em,
  atualizado_em
from clientes
where telefone is not null and telefone <> ''
on conflict (telefone) do update set
  cliente_id = excluded.cliente_id,
  nome = excluded.nome,
  endereco = excluded.endereco,
  bairro = excluded.bairro,
  pets = excluded.pets,
  ticket = excluded.ticket,
  frequencia = excluded.frequencia,
  ultima = excluded.ultima,
  perfil = excluded.perfil,
  origem = excluded.origem,
  origem_detalhe = excluded.origem_detalhe,
  campanha = excluded.campanha,
  campanha_custo = excluded.campanha_custo,
  campanha_convertidos = excluded.campanha_convertidos,
  cupom = excluded.cupom,
  influenciador = excluded.influenciador,
  cac = excluded.cac,
  total_gasto = excluded.total_gasto,
  total_descontos = excluded.total_descontos,
  lucro_liquido = excluded.lucro_liquido,
  pedidos = excluded.pedidos,
  prox_recompra = excluded.prox_recompra,
  cidade = excluded.cidade,
  especies = excluded.especies,
  observacoes = excluded.observacoes,
  follow_up_manual = excluded.follow_up_manual,
  ativo = excluded.ativo,
  ultimo_registro = excluded.ultimo_registro;

insert into leads_totais (
  telefone,
  nome,
  origem,
  ativo,
  primeiro_registro,
  ultimo_registro
)
select
  telefone,
  coalesce(nullif(nome_cliente, ''), 'Cliente ' || right(regexp_replace(telefone, '\D', '', 'g'), 4)),
  'WhatsApp IA',
  true,
  criado_em,
  atualizado_em
from conversas
where telefone is not null and telefone <> ''
on conflict (telefone) do update set
  nome = case
    when leads_totais.nome like 'Cliente %' and excluded.nome not like 'Cliente %' then excluded.nome
    else leads_totais.nome
  end,
  origem = coalesce(leads_totais.origem, excluded.origem),
  ativo = true,
  ultimo_registro = greatest(leads_totais.ultimo_registro, excluded.ultimo_registro);

alter table leads_totais enable row level security;

drop policy if exists "CRM pode ler leads totais" on leads_totais;
create policy "CRM pode ler leads totais"
on leads_totais
for select
to anon, authenticated
using (true);

drop policy if exists "CRM pode inserir leads totais" on leads_totais;
create policy "CRM pode inserir leads totais"
on leads_totais
for insert
to anon, authenticated
with check (true);

drop policy if exists "CRM pode atualizar leads totais" on leads_totais;
create policy "CRM pode atualizar leads totais"
on leads_totais
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on leads_totais to anon, authenticated;
