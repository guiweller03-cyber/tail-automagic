import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const origem = new URL("../supabase/migrations/", import.meta.url);
const destino = new URL("../output/loja2-schema.sql", import.meta.url);
const arquivos = (await readdir(origem)).filter((name) => name.endsWith(".sql")).sort();
const excluidos = new Set(["003_seed_catalogo_ana.sql"]);
const partes = [
  "-- Loja 2: somente estrutura, buckets e configurações padrão. Sem catálogo ou dados da Loja 1.",
  "-- Confira as políticas RLS antes da ativação e execute apenas em afmaedbatcedarszqczr.",
];
for (const arquivo of arquivos) {
  if (excluidos.has(arquivo)) continue;
  const sql = await readFile(new URL(arquivo, origem), "utf8");
  partes.push(`\n-- ${arquivo}\n${sql.trim()}\n`);
}
partes.push(`
-- A API de negócio é acessada somente pelo servidor com service_role.
do $$ declare tabela record; begin
  for tabela in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', tabela.tablename);
  end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Comprovantes contêm dados financeiros; somente o CRM autenticado pode lê-los.
update storage.buckets set public = false where id = 'comprovantes';
drop policy if exists "comprovantes_select" on storage.objects;
drop policy if exists "comprovantes_insert" on storage.objects;
drop policy if exists "comprovantes_update" on storage.objects;
drop policy if exists "comprovantes_delete" on storage.objects;
-- Fotos de catálogo podem ser públicas para leitura, mas só o servidor escreve.
drop policy if exists "produto_fotos_insert" on storage.objects;
drop policy if exists "produto_fotos_update" on storage.objects;
drop policy if exists "produto_fotos_delete" on storage.objects;
`);
await mkdir(new URL("../output/", import.meta.url), { recursive: true });
await writeFile(destino, partes.join("\n"), "utf8");
console.log(`Gerado ${destino.pathname} com ${arquivos.length - excluidos.size} migrações; catálogo excluído.`);
