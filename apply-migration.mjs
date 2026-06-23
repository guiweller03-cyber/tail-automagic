import { readFileSync } from "node:fs";
import pg from "pg";

const direct = process.env.SUPABASE_DB_URL;
if (!direct) {
  console.error("SUPABASE_DB_URL ausente");
  process.exit(1);
}

const MIGRATIONS = [
  "supabase/migrations/20260616000000_financeiro_lancamentos_manuais.sql",
  "supabase/migrations/20260616120000_crm_followups.sql",
];

const TABELAS = [
  "financeiro_despesas",
  "financeiro_marketing",
  "financeiro_abastecimentos",
  "crm_followups",
];

const parsed = new URL(direct);
const password = decodeURIComponent(parsed.password);
const projectRef = parsed.hostname.replace(/^db\./, "").split(".")[0];

const regions = [
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-central-1",
  "eu-west-1",
  "ap-southeast-1",
];

async function tryConnect(host, port) {
  const client = new pg.Client({
    host,
    port,
    user: `postgres.${projectRef}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return client;
}

let client = null;
let used = null;

// 1) conexao direta original (caso a rede tenha IPv6)
try {
  client = new pg.Client({
    connectionString: direct,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  used = "direta";
} catch {
  client = null;
}

// 2) pooler (IPv4) por regiao, modo sessao (porta 5432)
if (!client) {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    try {
      client = await tryConnect(host, 5432);
      used = `pooler ${region}:5432`;
      break;
    } catch (e) {
      console.log(`- ${region}: ${e.code || e.message}`);
      client = null;
    }
  }
}

if (!client) {
  console.error("Nao consegui conectar em nenhum host.");
  process.exit(2);
}

console.log("Conectado via:", used);

try {
  await client.query("begin");
  for (const file of MIGRATIONS) {
    const sql = readFileSync(file, "utf8");
    await client.query(sql);
    console.log(`✔ aplicada: ${file}`);
  }
  await client.query("commit");
  console.log("Todas as migrations aplicadas com sucesso.");

  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_name = any($1::text[]) order by table_name`,
    [TABELAS],
  );
  console.log("Tabelas existentes:", rows.map((r) => r.table_name).join(", "));
} catch (e) {
  try {
    await client.query("rollback");
  } catch {}
  console.error("ERRO ao aplicar:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
