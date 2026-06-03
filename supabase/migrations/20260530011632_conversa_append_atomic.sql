create or replace function append_conversa_mensagem(conversa_id uuid, nova_mensagem jsonb)
returns setof conversas
language sql
security invoker
as $$
  update conversas
  set
    historico = coalesce(historico, '[]'::jsonb) || jsonb_build_array(nova_mensagem),
    atualizado_em = now()
  where id = conversa_id
  returning *;
$$;

grant execute on function append_conversa_mensagem(uuid, jsonb) to anon, authenticated;
