alter table crm_configuracoes enable row level security;

create policy "CRM pode ler configuracao global da IA"
on crm_configuracoes
for select
to anon, authenticated
using (chave = 'ia_global_desativada');

create policy "CRM pode gravar configuracao global da IA"
on crm_configuracoes
for all
to anon, authenticated
using (chave = 'ia_global_desativada')
with check (chave = 'ia_global_desativada');
