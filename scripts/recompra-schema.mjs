// node --env-file=.env scripts/recompra-schema.mjs [--aplicar]
import pg from "pg";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const uri = new URL(process.env.SUPABASE_DB_URL);
const ref = uri.hostname.replace(/^db\./, "").split(".")[0];
const client = new pg.Client({
  host: "aws-1-sa-east-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${ref}`,
  password: decodeURIComponent(uri.password),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});
try {
  await client.connect();
  const antes = await client.query("select * from public.recompra_previsoes order by id");
  const pasta = `output/recompra-schema-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await mkdir(pasta, { recursive: true });
  await writeFile(pasta + "/backup.json", JSON.stringify(antes.rows, null, 2));
  await client.query("begin");
  await client.query(
    await readFile("supabase/migrations/20261012010527_recompra_motor_unificado.sql", "utf8"),
  );
  // Confirma permissões e exercita a função na mesma transação, sem deixar alterações na projeção.
  const clienteId = antes.rows[0]?.cliente_id;
  if (clienteId) {
    await client.query("savepoint verificacao");
    const { rows } = await client.query(
      "select coalesce(jsonb_object_agg(id::text, atualizado_em), '{}'::jsonb) as versao from public.recompra_previsoes where cliente_id=$1",
      [clienteId],
    );
    const ok = await client.query(
      "select public.salvar_previsoes_recompra($1,$2,'[]'::jsonb) as ok",
      [clienteId, rows[0].versao],
    );
    if (!ok.rows[0].ok) throw new Error("Falha no controle de versão da projeção");
    const conflito = await client.query(
      "select public.salvar_previsoes_recompra($1,$2,'[]'::jsonb) as ok",
      [clienteId, rows[0].versao],
    );
    if (conflito.rows[0].ok) throw new Error("Conflito não foi rejeitado");
    await client.query("rollback to savepoint verificacao");
  }
  const seguranca = await client.query(
    "select has_function_privilege('anon','public.salvar_previsoes_recompra(uuid,jsonb,jsonb)','execute') as anon_exec, has_function_privilege('service_role','public.salvar_previsoes_recompra(uuid,jsonb,jsonb)','execute') as server_exec, relrowsecurity as rls from pg_class where oid='public.recompra_compras_manuais'::regclass",
  );
  if (seguranca.rows[0].anon_exec || !seguranca.rows[0].server_exec || !seguranca.rows[0].rls)
    throw new Error("Permissões incorretas");
  await client.query(process.argv.includes("--aplicar") ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      aplicada: process.argv.includes("--aplicar"),
      backup: pasta + "/backup.json",
      previsoesPreservadas: antes.rows.length,
      seguranca: seguranca.rows[0],
    }),
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
