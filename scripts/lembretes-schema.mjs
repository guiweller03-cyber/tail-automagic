// node --env-file=.env scripts/lembretes-schema.mjs [--aplicar]
import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  await client.query("begin");
  await client.query(
    await readFile("supabase/migrations/20261016120000_crm_lembretes.sql", "utf8"),
  );
  const {
    rows: [seguranca],
  } = await client.query(`select relrowsecurity as rls,
    has_table_privilege('anon', oid, 'select') as anon,
    has_table_privilege('authenticated', oid, 'select') as authenticated,
    has_table_privilege('service_role', oid, 'select,insert,update,delete') as servidor
    from pg_class where oid = 'public.crm_lembretes'::regclass`);
  assert.deepEqual(seguranca, { rls: true, anon: false, authenticated: false, servidor: true });
  await client.query("savepoint verificacao");
  await client.query("set local role service_role");
  const {
    rows: [item],
  } = await client.query(`insert into public.crm_lembretes (cliente_nome, telefone, dia, anotacao)
    values ('Teste de validação', '5500000000000', '2026-10-16', 'Validar lembrete') returning id, concluido`);
  assert.equal(item.concluido, false);
  const {
    rows: [editado],
  } = await client.query(
    "update public.crm_lembretes set concluido=true, dia='2026-10-17' where id=$1 returning concluido, dia::text",
    [item.id],
  );
  assert.equal(editado.concluido, true);
  assert.equal(editado.dia, "2026-10-17");
  const removido = await client.query("delete from public.crm_lembretes where id=$1", [item.id]);
  assert.equal(removido.rowCount, 1);
  await client.query("rollback to savepoint verificacao");
  await client.query(process.argv.includes("--aplicar") ? "commit" : "rollback");
  console.log(
    JSON.stringify({
      aplicada: process.argv.includes("--aplicar"),
      seguranca,
      crud: "ok; dados de teste revertidos",
    }),
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  await client.end();
}
