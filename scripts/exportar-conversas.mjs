#!/usr/bin/env node
/**
 * Exporta todas as conversas do WhatsApp IA (tabela `conversas` do Supabase).
 *
 * Gera em output/relatorio-conversas/:
 *   - conversas-completas.json  dump bruto (todos os campos + historico)
 *   - mensagens.csv             uma linha por mensagem
 *   - resumo-conversas.csv      uma linha por conversa (contagens e datas)
 *   - transcricoes/*.txt        transcricao legivel de cada conversa
 *
 * Uso:
 *   node scripts/exportar-conversas.mjs [--desde=2026-01-01] [--sem-transcricoes]
 *
 * Paginado de proposito (PAGINA=25): a tabela `conversas` e a maior do banco e
 * o projeto Supabase e sensivel a egress. Rodar sob demanda, nao em loop.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = resolve(RAIZ, "output/relatorio-conversas");
const PAGINA = 25;

function carregarEnv() {
  const texto = readFileSync(resolve(RAIZ, ".env"), "utf8");
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const i = linha.indexOf("=");
    if (i <= 0 || linha.trimStart().startsWith("#")) continue;
    env[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
  }
  return env;
}

const argumentos = process.argv.slice(2);
const desde = argumentos.find((a) => a.startsWith("--desde="))?.slice(8) ?? null;
const semTranscricoes = argumentos.includes("--sem-transcricoes");

const env = carregarEnv();
const baseUrl = `${(env.SUPABASE_URL ?? "").replace(/\/$/, "")}/rest/v1`;
const chave = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
if (!baseUrl.startsWith("http") || !chave) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}
const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}` };

const CAMPOS = [
  "id",
  "telefone",
  "nome_cliente",
  "estagio",
  "kanban_coluna",
  "aguardando_humano",
  "ia_ativa",
  "bloqueado",
  "criado_em",
  "atualizado_em",
  "historico",
].join(",");

async function baixarConversas() {
  const conversas = [];
  let offset = 0;
  for (;;) {
    const filtro = desde ? `&criado_em=gte.${encodeURIComponent(desde)}` : "";
    const url = `${baseUrl}/conversas?select=${CAMPOS}${filtro}&order=criado_em.asc&limit=${PAGINA}&offset=${offset}`;
    const resposta = await fetch(url, { headers: cabecalhos });
    if (!resposta.ok) {
      throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
    }
    const pagina = await resposta.json();
    conversas.push(...pagina);
    process.stdout.write(`\rBaixadas ${conversas.length} conversas...`);
    if (pagina.length < PAGINA) break;
    offset += PAGINA;
  }
  process.stdout.write("\n");
  return conversas;
}

const formatador = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});

function dataBr(valor) {
  if (!valor) return "";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? String(valor) : formatador.format(data);
}

function celula(valor) {
  const texto = String(valor ?? "").replace(/\r?\n/g, " | ").replace(/"/g, '""');
  return `"${texto}"`;
}

function csv(colunas, linhas) {
  const corpo = [colunas.join(";"), ...linhas.map((linha) => linha.map(celula).join(";"))];
  return `\uFEFF${corpo.join("\r\n")}\r\n`;
}

function quemFalou(mensagem) {
  if (mensagem.role === "assistant" || mensagem.fromMe) return "Loja/IA";
  return "Cliente";
}

function nomeArquivo(conversa) {
  const nome = (conversa.nome_cliente ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return [conversa.telefone, nome].filter(Boolean).join("_") || conversa.id;
}

function ordenarHistorico(historico) {
  return [...(Array.isArray(historico) ? historico : [])].sort((a, b) => {
    const ta = a?.at ? new Date(a.at).getTime() : 0;
    const tb = b?.at ? new Date(b.at).getTime() : 0;
    return ta && tb ? ta - tb : 0;
  });
}

const conversas = await baixarConversas();
mkdirSync(DESTINO, { recursive: true });
if (!semTranscricoes) mkdirSync(resolve(DESTINO, "transcricoes"), { recursive: true });

writeFileSync(
  resolve(DESTINO, "conversas-completas.json"),
  JSON.stringify(conversas, null, 2),
  "utf8",
);

const linhasMensagens = [];
const linhasResumo = [];
let totalMensagens = 0;

for (const conversa of conversas) {
  const historico = ordenarHistorico(conversa.historico);
  const doCliente = historico.filter((m) => quemFalou(m) === "Cliente").length;
  const daLoja = historico.length - doCliente;
  totalMensagens += historico.length;

  historico.forEach((mensagem, indice) => {
    linhasMensagens.push([
      conversa.telefone,
      conversa.nome_cliente ?? "",
      conversa.estagio ?? "",
      indice + 1,
      dataBr(mensagem.at),
      quemFalou(mensagem),
      mensagem.messageType ?? "texto",
      mensagem.content ?? "",
      mensagem.mediaUrl ?? "",
      mensagem.source ?? "",
    ]);
  });

  linhasResumo.push([
    conversa.telefone,
    conversa.nome_cliente ?? "",
    conversa.estagio ?? "",
    conversa.kanban_coluna ?? "",
    historico.length,
    doCliente,
    daLoja,
    dataBr(historico[0]?.at ?? conversa.criado_em),
    dataBr(historico.at(-1)?.at ?? conversa.atualizado_em),
    conversa.ia_ativa === false ? "nao" : "sim",
    conversa.bloqueado ? "sim" : "nao",
    conversa.aguardando_humano ? "sim" : "nao",
  ]);

  if (semTranscricoes) continue;

  const linhas = [
    `Conversa: ${conversa.nome_cliente ?? "(sem nome)"} - ${conversa.telefone}`,
    `Estagio: ${conversa.estagio ?? "-"} | Mensagens: ${historico.length}`,
    `Criada em: ${dataBr(conversa.criado_em)} | Ultima atividade: ${dataBr(conversa.atualizado_em)}`,
    "-".repeat(70),
    "",
  ];
  for (const mensagem of historico) {
    const midia = mensagem.mediaUrl ? ` [midia: ${mensagem.mediaUrl}]` : "";
    linhas.push(`[${dataBr(mensagem.at) || "sem data"}] ${quemFalou(mensagem)}: ${mensagem.content ?? ""}${midia}`);
  }
  writeFileSync(
    resolve(DESTINO, "transcricoes", `${nomeArquivo(conversa)}.txt`),
    `${linhas.join("\n")}\n`,
    "utf8",
  );
}

writeFileSync(
  resolve(DESTINO, "mensagens.csv"),
  csv(
    [
      "telefone",
      "nome_cliente",
      "estagio",
      "ordem",
      "data_hora",
      "quem_falou",
      "tipo",
      "mensagem",
      "midia_url",
      "origem",
    ],
    linhasMensagens,
  ),
  "utf8",
);

writeFileSync(
  resolve(DESTINO, "resumo-conversas.csv"),
  csv(
    [
      "telefone",
      "nome_cliente",
      "estagio",
      "coluna_kanban",
      "total_mensagens",
      "mensagens_cliente",
      "mensagens_loja_ia",
      "primeira_mensagem",
      "ultima_mensagem",
      "ia_ativa",
      "bloqueado",
      "aguardando_humano",
    ],
    linhasResumo,
  ),
  "utf8",
);

console.log(`\nConversas exportadas: ${conversas.length}`);
console.log(`Mensagens exportadas: ${totalMensagens}`);
console.log(`Destino: ${DESTINO}`);
