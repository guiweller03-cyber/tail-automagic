create table if not exists public.aprendizados (
  id uuid primary key default gen_random_uuid(),
  licao text not null,
  criado_em timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativar RLS se necessário, ou permitir acesso público para simplicidade (depende da sua configuração geral)
alter table public.aprendizados enable row level security;

-- Política simples: anônimo pode ler e inserir
create policy "Anônimo pode ler aprendizados"
  on public.aprendizados
  for select
  to anon, authenticated
  using (true);

create policy "Anônimo pode inserir aprendizados"
  on public.aprendizados
  for insert
  to anon, authenticated
  with check (true);
