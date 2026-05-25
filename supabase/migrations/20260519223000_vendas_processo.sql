alter table vendas
add column if not exists processo text not null default 'novo';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendas_processo_check'
  ) then
    alter table vendas
    add constraint vendas_processo_check
    check (processo in ('novo', 'pago', 'separando', 'em rota', 'entregue', 'cancelado'));
  end if;
end $$;

create index if not exists vendas_processo_idx on vendas (processo);
