-- Marca ate onde o operador ja leu cada conversa, alimentando o contador de
-- mensagens nao lidas (badge verde estilo WhatsApp) na pagina WhatsApp IA.
alter table conversas
add column if not exists lido_ate timestamptz;

-- Conversas existentes comecam como lidas: o badge so aparece para mensagens
-- recebidas a partir de agora.
update conversas
set lido_ate = atualizado_em
where lido_ate is null;
