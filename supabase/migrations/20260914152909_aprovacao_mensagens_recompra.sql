-- Uma aprovacao de recompra reutiliza crm_followups e identifica o ciclo no
-- JSON de contexto. O indice impede duas mensagens para o mesmo cliente e a
-- mesma ultima compra, inclusive quando duas abas sincronizam ao mesmo tempo.
create unique index if not exists crm_followups_recompra_ciclo_unico_idx
  on public.crm_followups (telefone, ((contexto ->> 'cicloCompraEm')))
  where contexto ->> 'origem' = 'recompra'
    and coalesce(contexto ->> 'cicloCompraEm', '') <> '';

-- A tela separa rapidamente as aprovacoes de recompra da fila geral.
create index if not exists crm_followups_recompra_status_idx
  on public.crm_followups (((contexto ->> 'origem')), status, agendado_para)
  where contexto ->> 'origem' = 'recompra';
