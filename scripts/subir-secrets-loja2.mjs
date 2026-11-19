// Sobe as variáveis LOJA2_* do .env como secrets do worker Cloudflare.
// Uso: node scripts/subir-secrets-loja2.mjs   (não imprime os valores)
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*(LOJA2_[A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);

const nomes = [
  "LOJA2_SUPABASE_URL",
  "LOJA2_SUPABASE_SERVICE_ROLE_KEY",
  "LOJA2_UAZAPI_URL",
  "LOJA2_UAZAPI_TOKEN",
  "LOJA2_UAZAPI_WEBHOOK_SECRET",
  "LOJA2_ATIVA",
];

let falhou = false;
for (const nome of nomes) {
  const valor = env[nome];
  if (!valor) {
    console.log(`✗ ${nome} vazio no .env — pulando`);
    falhou = true;
    continue;
  }
  const r = spawnSync("npx", ["wrangler", "secret", "put", nome], {
    input: valor,
    encoding: "utf8",
    shell: true,
  });
  const ok = r.status === 0;
  if (!ok) falhou = true;
  console.log(`${ok ? "✓" : "✗"} ${nome}${ok ? "" : "\n" + (r.stderr || r.stdout).slice(-400)}`);
}
process.exit(falhou ? 1 : 0);
