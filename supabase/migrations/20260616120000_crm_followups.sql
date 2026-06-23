-- Follow-ups agendados do CRM. O operador agenda um dia/horario para um lead e
-- escolhe se o texto e dele (manual) ou gerado pela IA, e se dispara sozinho no
-- WhatsApp (automatico) ou se fica aguardando ele confirmar com 1 clique
-- (confirmar). Um worker (automation-server na VPS) varre os pendentes vencidos
-- a cada minuto e envia / prepara conforme a configuracao.

create table if not exists crm_followups (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  cliente_nome text,
  agendado_para timestamptz not null,
  modo text not null default 'manual' check (modo in ('manual', 'ia')),
  disparo text not null default 'confirmar' check (disparo in ('automatico', 'confirmar')),
  mensagem text not null default '',
  contexto jsonb not null default '{}'::jsonb,
  canal text not null default 'WhatsApp',
  status text not null default 'pendente' check (
    status in ('pendente', 'aguardando_confirmacao', 'enviado', 'cancelado', 'erro')
  ),
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz
);

-- Busca principal do worker: pendentes ja vencidos, em ordem de agendamento.
create index if not exists crm_followups_status_agenda_idx
  on crm_followups (status, agendado_para);

-- Listagem por lead no painel da conversa.
create index if not exists crm_followups_telefone_idx on crm_followups (telefone);
