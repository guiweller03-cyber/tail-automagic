-- Ciclo de recompra semi-automatico (ver RECOMPRA_CALCULO.md).
-- dias_calculados guarda o ciclo que o sistema calculou sozinho e dias_manual o
-- ajuste do operador. dias_estimados continua sendo o ciclo efetivo
-- (dias_manual ?? dias_calculados), entao proxima_compra_em, data_alerta e as
-- aprovacoes de recompra seguem funcionando sem mudanca.
alter table if exists public.recompra_previsoes
  add column if not exists dias_calculados numeric(10, 2),
  add column if not exists dias_manual integer,
  add column if not exists dias_manual_em timestamptz;

alter table if exists public.recompra_previsoes
  drop constraint if exists recompra_previsoes_dias_manual_check;

alter table if exists public.recompra_previsoes
  add constraint recompra_previsoes_dias_manual_check
  check (dias_manual is null or dias_manual between 1 and 365);

update public.recompra_previsoes
  set dias_calculados = dias_estimados
  where dias_calculados is null;

comment on column public.recompra_previsoes.dias_calculados is
  'Ciclo em dias calculado automaticamente (historico, observacao recompra_auto ou consumo).';
comment on column public.recompra_previsoes.dias_manual is
  'Ciclo em dias informado pelo operador no painel; quando preenchido vence o calculado. Vale so para a compra atual (venda_id).';
