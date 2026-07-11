-- Detalhes estruturados do pet do cliente, preenchidos pela IA a partir do
-- contexto das conversas e editaveis manualmente no painel da conversa.
-- Cada item: { nome, especie, raca, porte, pesoKg, idade, observacao }.
alter table clientes
  add column if not exists pets_detalhes jsonb not null default '[]'::jsonb;
