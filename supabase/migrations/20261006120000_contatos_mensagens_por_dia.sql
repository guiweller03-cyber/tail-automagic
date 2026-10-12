-- Calendario do WhatsApp IA: quem mandou mensagem em cada dia.
-- Agrega no banco as mensagens RECEBIDAS (role = user, nao fromMe) do historico
-- de cada conversa, por dia no fuso de Sao Paulo, e devolve so o resumo. Assim a
-- tela nao precisa baixar o historico inteiro (egress do Supabase).
create or replace function contatos_mensagens_por_dia(inicio timestamptz, fim timestamptz)
returns table (
  conversa_id uuid,
  telefone text,
  nome_cliente text,
  dia date,
  mensagens integer,
  primeira timestamptz,
  ultima timestamptz,
  ultima_mensagem text
)
language sql
stable
as $$
  select
    c.id,
    c.telefone,
    c.nome_cliente,
    (m.at at time zone 'America/Sao_Paulo')::date as dia,
    count(*)::integer,
    min(m.at),
    max(m.at),
    left((array_agg(m.content order by m.at desc))[1], 160)
  from conversas c
  cross join lateral (
    select (e->>'at')::timestamptz as at, coalesce(e->>'content', '') as content
    from jsonb_array_elements(
      case when jsonb_typeof(c.historico) = 'array' then c.historico else '[]'::jsonb end
    ) e
    where e->>'role' = 'user'
      and (e->>'fromMe') is distinct from 'true'
      and e->>'at' ~ '^\d{4}-\d{2}-\d{2}T'
  ) m
  where c.atualizado_em >= inicio
    and coalesce(c.bloqueado, false) = false
    and m.at >= inicio
    and m.at < fim
  group by c.id, c.telefone, c.nome_cliente, dia
  order by dia, max(m.at) desc;
$$;
