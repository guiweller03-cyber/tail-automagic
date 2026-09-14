-- Mantem a coluna exata escolhida no Kanban. O campo estagio continua existindo
-- para compatibilidade com automacoes antigas e com o assistente.
alter table conversas
  add column if not exists kanban_coluna text;

create index if not exists conversas_kanban_coluna_idx on conversas (kanban_coluna);

update conversas
set kanban_coluna = case estagio
  when 'pos_venda' then 'follow-up'
  when 'vendendo' then 'aguardando-pagamento'
  when 'inativo' then 'risco'
  else 'hoje'
end
where kanban_coluna is null;

alter table conversas
  alter column kanban_coluna set default 'hoje';

insert into crm_configuracoes (chave, valor)
values (
  'whatsapp_kanban_colunas',
  '[
    {"id":"hoje","nome":"Hoje","descricao":"Conversas que chegaram agora","cor":"sky","estagioInterno":"novo"},
    {"id":"recompra","nome":"Recompra","descricao":"Clientes no momento de comprar novamente","cor":"violet","estagioInterno":"pos_venda"},
    {"id":"follow-up","nome":"Follow-up","descricao":"Contatos que precisam de retorno","cor":"amber","estagioInterno":"pos_venda"},
    {"id":"aguardando-pagamento","nome":"Aguardando pagamento","descricao":"Pedido encaminhado, aguardando confirmação","cor":"emerald","estagioInterno":"vendendo"},
    {"id":"upsell","nome":"Upsell","descricao":"Oportunidades de venda complementar","cor":"violet","estagioInterno":"vendendo"},
    {"id":"risco","nome":"Risco","descricao":"Clientes que podem deixar de comprar","cor":"rose","estagioInterno":"inativo"}
  ]'::jsonb
)
on conflict (chave) do nothing;
