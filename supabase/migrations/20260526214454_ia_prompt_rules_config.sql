insert into crm_configuracoes (chave, valor)
values
  ('ia_system_prompt', '""'::jsonb),
  ('ia_regras_customizadas', '[]'::jsonb)
on conflict (chave) do nothing;

drop policy if exists "CRM pode ler configuracao global da IA" on crm_configuracoes;
drop policy if exists "CRM pode gravar configuracao global da IA" on crm_configuracoes;
drop policy if exists "CRM pode ler configuracoes da IA" on crm_configuracoes;
drop policy if exists "CRM pode gravar configuracoes da IA" on crm_configuracoes;

create policy "CRM pode ler configuracoes da IA"
on crm_configuracoes
for select
to anon, authenticated
using (chave in ('ia_global_desativada', 'ia_system_prompt', 'ia_regras_customizadas'));

create policy "CRM pode gravar configuracoes da IA"
on crm_configuracoes
for all
to anon, authenticated
using (chave in ('ia_global_desativada', 'ia_system_prompt', 'ia_regras_customizadas'))
with check (chave in ('ia_global_desativada', 'ia_system_prompt', 'ia_regras_customizadas'));
