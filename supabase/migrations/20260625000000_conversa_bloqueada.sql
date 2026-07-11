-- Permite bloquear um contato do WhatsApp IA. Quando bloqueado, a conversa some
-- da lista do CRM e o webhook passa a ignorar TODAS as mensagens futuras desse
-- telefone: a IA nao responde, nao vira lead e nao reaparece na sincronizacao.
-- Usado para barrar leads de regioes fora da area de entrega que poluem a
-- operacao (clientes de outro lado do pais onde nao da para entregar racao).
alter table conversas
add column if not exists bloqueado boolean not null default false;

-- Acelera o filtro do webhook/listagem que separa conversas ativas das bloqueadas.
create index if not exists conversas_bloqueado_idx on conversas (bloqueado);
