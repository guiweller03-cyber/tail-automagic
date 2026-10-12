#!/usr/bin/env node
/**
 * Backup retomavel de chats, mensagens e midias da instancia UAZAPI.
 *
 * Execucao segura (nao pede historico antigo ao WhatsApp):
 *   node scripts/baixar-whatsapp-uazapi.mjs
 *
 * Tentar recuperar lotes antigos do celular (operacao lenta e nao garantida):
 *   node scripts/baixar-whatsapp-uazapi.mjs --recuperar-historico --rodadas=1
 *
 * Transcrever audios pela UAZAPI (pode gerar custo na conta OpenAI configurada):
 *   node scripts/baixar-whatsapp-uazapi.mjs --transcrever-audios
 *
 * Opcoes:
 *   --saida=<pasta>             Padrao: output/backup-whatsapp-uazapi
 *   --sem-midias                Nao baixa imagens, audios, videos e documentos
 *   --transcrever-audios        Pede transcricao ao baixar cada audio
 *   --recuperar-historico       Pede ao celular ate 100 mensagens antigas por chat/rodada
 *   --rodadas=<n>               Padrao: 1; para se uma rodada nao trouxer mensagens
 *   --intervalo-ms=<n>          Intervalo entre pedidos de historico (padrao: 1800)
 *   --espera-segundos=<n>       Espera apos cada rodada (padrao: 120)
 *   --limite-chats=<n>          Limita chats processados (util para teste)
 *   --incluir-grupos            Inclui grupos; por padrao exporta somente chats privados
 */

import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argumentos = process.argv.slice(2);

if (argumentos.includes("--ajuda") || argumentos.includes("-h")) {
  console.log("Leia o cabecalho de scripts/baixar-whatsapp-uazapi.mjs para ver as opcoes.");
  process.exit(0);
}

function argumento(nome, padrao) {
  const prefixo = `--${nome}=`;
  return argumentos.find((item) => item.startsWith(prefixo))?.slice(prefixo.length) ?? padrao;
}

function inteiro(nome, padrao, minimo = 0) {
  const valor = Number(argumento(nome, padrao));
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new Error(`--${nome} precisa ser um inteiro maior ou igual a ${minimo}`);
  }
  return valor;
}

async function carregarEnv() {
  const texto = await readFile(resolve(RAIZ, ".env"), "utf8");
  const env = {};
  for (const linhaBruta of texto.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const indice = linha.indexOf("=");
    if (indice <= 0) continue;
    const chave = linha.slice(0, indice).trim();
    let valor = linha.slice(indice + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    env[chave] = valor;
  }
  return env;
}

const env = await carregarEnv();
const BASE_URL = (env.UAZAPI_URL ?? "").replace(/\/$/, "");
const TOKEN = env.UAZAPI_TOKEN ?? "";
if (!BASE_URL.startsWith("http") || !TOKEN) {
  throw new Error("Faltam UAZAPI_URL e/ou UAZAPI_TOKEN no .env");
}

const DESTINO = resolve(RAIZ, argumento("saida", "output/backup-whatsapp-uazapi"));
const BAIXAR_MIDIAS = !argumentos.includes("--sem-midias");
const TRANSCREVER = argumentos.includes("--transcrever-audios");
const RECUPERAR_HISTORICO = argumentos.includes("--recuperar-historico");
const INCLUIR_GRUPOS = argumentos.includes("--incluir-grupos");
const RODADAS = inteiro("rodadas", 1, 1);
const INTERVALO_MS = inteiro("intervalo-ms", 1800, 250);
const ESPERA_SEGUNDOS = inteiro("espera-segundos", 120, 10);
const LIMITE_CHATS = inteiro("limite-chats", 0, 0);
const ARQUIVO_MENSAGENS = resolve(DESTINO, "mensagens.ndjson");

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

async function existe(caminho) {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

async function request(path, { method = "POST", body, tentativas = 4 } = {}) {
  for (let tentativa = 1; ; tentativa += 1) {
    const resposta = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        token: TOKEN,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texto = await resposta.text();
    let payload;
    try {
      payload = texto ? JSON.parse(texto) : {};
    } catch {
      payload = { raw: texto.slice(0, 500) };
    }

    if (resposta.ok) return payload;
    const repetivel = resposta.status === 429 || resposta.status >= 500;
    if (!repetivel || tentativa >= tentativas) {
      const detalhe = payload?.error ?? payload?.message ?? payload?.raw ?? "sem detalhe";
      throw new Error(`${path} retornou ${resposta.status}: ${String(detalhe).slice(0, 500)}`);
    }
    const retryAfter = Number(resposta.headers.get("retry-after"));
    await delay(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** (tentativa - 1));
  }
}

function idMensagem(mensagem) {
  return String(
    mensagem.messageid ??
      mensagem.id ??
      [mensagem.chatid, mensagem.messageTimestamp, mensagem.messageType, mensagem.fromMe].join(":"),
  );
}

function timestampMs(valor) {
  const numero = Number(valor);
  if (!numero) return 0;
  return numero < 1e12 ? numero * 1000 : numero;
}

function limparConteudo(valor, profundidade = 0) {
  if (profundidade > 8 || valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) {
    if (valor.length > 1000) return `[array omitido: ${valor.length} itens]`;
    return valor.map((item) => limparConteudo(item, profundidade + 1));
  }
  if (typeof valor !== "object") {
    return typeof valor === "string" && valor.length > 200_000
      ? `[texto/base64 omitido: ${valor.length} caracteres]`
      : valor;
  }
  const resultado = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (/thumbnail|waveform|streamingSidecar|scansSidecar/i.test(chave)) continue;
    resultado[chave] = limparConteudo(item, profundidade + 1);
  }
  return resultado;
}

function normalizarMensagem(mensagem) {
  const ms = timestampMs(mensagem.messageTimestamp);
  return {
    ...mensagem,
    idBackup: idMensagem(mensagem),
    dataHora: ms ? new Date(ms).toISOString() : null,
    content: limparConteudo(mensagem.content),
  };
}

async function carregarMensagensExistentes() {
  const mapa = new Map();
  if (!(await existe(ARQUIVO_MENSAGENS))) return mapa;
  const texto = await readFile(ARQUIVO_MENSAGENS, "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    try {
      const mensagem = JSON.parse(linha);
      mapa.set(mensagem.idBackup ?? idMensagem(mensagem), mensagem);
    } catch {
      console.warn("Aviso: uma linha invalida de mensagens.ndjson foi ignorada.");
    }
  }
  return mapa;
}

async function listarChats() {
  const todos = [];
  let offset = 0;
  for (;;) {
    const resposta = await request("/chat/find", {
      body: {
        limit: 200,
        offset,
        compact: true,
        sort: "-wa_lastMsgTimestamp",
        ...(INCLUIR_GRUPOS ? {} : { wa_isGroup: false }),
      },
    });
    const pagina = Array.isArray(resposta) ? resposta : (resposta.chats ?? []);
    todos.push(...pagina);
    const total = resposta.pagination?.totalRecords;
    if (
      pagina.length === 0 ||
      pagina.length < 200 ||
      (Number.isFinite(total) && todos.length >= total)
    )
      break;
    offset += pagina.length;
  }
  return LIMITE_CHATS > 0 ? todos.slice(0, LIMITE_CHATS) : todos;
}

async function coletarMensagens(mapa) {
  let offset = 0;
  let adicionadas = 0;
  for (;;) {
    const resposta = await request("/message/find", { body: { limit: 100, offset } });
    const pagina = Array.isArray(resposta) ? resposta : (resposta.messages ?? []);
    for (const bruta of pagina) {
      if (!INCLUIR_GRUPOS && bruta.isGroup) continue;
      const mensagem = normalizarMensagem(bruta);
      const anterior = mapa.get(mensagem.idBackup);
      if (!anterior) adicionadas += 1;
      mapa.set(mensagem.idBackup, { ...mensagem, backup: anterior?.backup });
    }
    process.stdout.write(
      `\rMensagens consultadas: ${offset + pagina.length} | novas no backup: ${adicionadas}`,
    );
    if (pagina.length === 0 || !(resposta.hasMore ?? pagina.length === 100)) break;
    offset = Number.isFinite(resposta.nextOffset) ? resposta.nextOffset : offset + pagina.length;
  }
  process.stdout.write("\n");
  return adicionadas;
}

function ehMidia(mensagem) {
  const tipo = String(mensagem.messageType ?? "").toLowerCase();
  return /audio|ptt|image|video|document|sticker|album/.test(tipo);
}

function ehAudio(mensagem) {
  const tipo = String(mensagem.messageType ?? "").toLowerCase();
  const mime = String(
    mensagem.mimetype ?? mensagem.mimeType ?? mensagem.content?.mimetype ?? "",
  ).toLowerCase();
  return /audio|ptt/.test(tipo) || mime.startsWith("audio/");
}

function seguroArquivo(valor, maximo = 90) {
  return (
    String(valor ?? "sem-id")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maximo) || "sem-id"
  );
}

function extensaoPara(mime, url, nomeOriginal) {
  const porMime = {
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
  };
  const mimeLimpo = String(mime ?? "")
    .split(";")[0]
    .toLowerCase();
  if (porMime[mimeLimpo]) return porMime[mimeLimpo];
  const original = extname(String(nomeOriginal ?? ""));
  if (/^\.[a-z0-9]{1,8}$/i.test(original)) return original.toLowerCase();
  try {
    const daUrl = extname(new URL(url).pathname);
    if (/^\.[a-z0-9]{1,8}$/i.test(daUrl)) return daUrl.toLowerCase();
  } catch {
    // URL invalida: usa extensao generica.
  }
  return ".bin";
}

async function baixarMidias(mapa) {
  const mensagens = [...mapa.values()].filter(ehMidia);
  let baixadas = 0;
  let puladas = 0;
  let falhas = 0;

  for (let indice = 0; indice < mensagens.length; indice += 1) {
    const mensagem = mensagens[indice];
    const existente = mensagem.backup?.arquivo;
    const precisaTranscrever = TRANSCREVER && ehAudio(mensagem) && !mensagem.backup?.transcricao;
    if (existente && (await existe(resolve(DESTINO, existente))) && !precisaTranscrever) {
      puladas += 1;
      continue;
    }
    try {
      const resposta = await request("/message/download", {
        body: {
          id: mensagem.messageid ?? mensagem.id,
          generate_mp3: true,
          ...(TRANSCREVER && ehAudio(mensagem) ? { transcribe: true } : {}),
        },
      });
      if (!resposta.fileURL) throw new Error("UAZAPI nao retornou fileURL");
      const arquivoResposta = await fetch(resposta.fileURL);
      if (!arquivoResposta.ok)
        throw new Error(`download do arquivo retornou ${arquivoResposta.status}`);
      const mime = resposta.mimetype ?? arquivoResposta.headers.get("content-type");
      const extensao = extensaoPara(
        mime,
        resposta.fileURL,
        mensagem.fileName ?? mensagem.content?.fileName ?? mensagem.content?.fileName,
      );
      const chat = seguroArquivo(mensagem.chatid, 80);
      const data = (mensagem.dataHora ?? "sem-data").replace(/[:.]/g, "-");
      const relativo = `midias/${chat}/${data}_${seguroArquivo(mensagem.idBackup, 70)}${extensao}`;
      const absoluto = resolve(DESTINO, relativo);
      await mkdir(dirname(absoluto), { recursive: true });
      await writeFile(absoluto, Buffer.from(await arquivoResposta.arrayBuffer()));
      mensagem.backup = {
        arquivo: relativo,
        mimeType: mime ?? null,
        baixadoEm: new Date().toISOString(),
        ...(resposta.transcription ? { transcricao: resposta.transcription } : {}),
      };
      baixadas += 1;
    } catch (error) {
      falhas += 1;
      mensagem.backup = {
        ...(mensagem.backup ?? {}),
        ultimoErro: error instanceof Error ? error.message : String(error),
        erroEm: new Date().toISOString(),
      };
    }
    process.stdout.write(
      `\rMidias: ${indice + 1}/${mensagens.length} | baixadas ${baixadas} | ja salvas ${puladas} | falhas ${falhas}`,
    );
    await delay(250);
  }
  if (mensagens.length) process.stdout.write("\n");
  return { candidatas: mensagens.length, baixadas, puladas, falhas };
}

function chatId(chat) {
  return chat.wa_chatid ?? chat.chatid ?? chat.phone;
}

async function solicitarRodadaHistorico(chats, mapa, rodada) {
  const porChat = new Map();
  for (const mensagem of mapa.values()) {
    if (!mensagem.chatid) continue;
    const atual = porChat.get(mensagem.chatid);
    if (!atual || timestampMs(mensagem.messageTimestamp) < timestampMs(atual.messageTimestamp)) {
      porChat.set(mensagem.chatid, mensagem);
    }
  }

  let aceitas = 0;
  let falhas = 0;
  console.log(
    `Rodada ${rodada}: solicitando ate 100 mensagens anteriores em ${chats.length} chats.`,
  );
  for (let indice = 0; indice < chats.length; indice += 1) {
    const jid = chatId(chats[indice]);
    if (!jid) continue;
    const ancora = porChat.get(jid);
    try {
      await request("/message/history-sync", {
        body: {
          number: jid,
          mode: "history",
          count: 100,
          ...(ancora ? { messageid: ancora.messageid ?? ancora.id } : {}),
        },
        tentativas: 3,
      });
      aceitas += 1;
    } catch {
      falhas += 1;
    }
    process.stdout.write(
      `\rHistorico: ${indice + 1}/${chats.length} | aceitas ${aceitas} | falhas ${falhas}`,
    );
    await delay(INTERVALO_MS);
  }
  process.stdout.write("\n");
  console.log(
    `Aguardando ${ESPERA_SEGUNDOS}s. Mantenha o WhatsApp aberto ou ativo no celular principal...`,
  );
  for (let restante = ESPERA_SEGUNDOS; restante > 0; restante -= 15) {
    await delay(Math.min(15, restante) * 1000);
    process.stdout.write(`\rEspera do historico: ${Math.max(0, restante - 15)}s `);
  }
  process.stdout.write("\n");
  return { aceitas, falhas };
}

function textoMensagem(mensagem) {
  const candidatos = [
    mensagem.text,
    mensagem.content?.text,
    mensagem.content?.caption,
    mensagem.content?.conversation,
    mensagem.content?.selectedDisplayText,
    mensagem.backup?.transcricao,
  ];
  return candidatos.find((item) => typeof item === "string" && item.trim())?.trim() ?? "";
}

function celulaCsv(valor) {
  return `"${String(valor ?? "")
    .replace(/\r?\n/g, " | ")
    .replace(/"/g, '""')}"`;
}

async function salvarResultados(chats, mapa, relatorioParcial) {
  const mensagens = [...mapa.values()].sort(
    (a, b) => timestampMs(a.messageTimestamp) - timestampMs(b.messageTimestamp),
  );
  await mkdir(DESTINO, { recursive: true });
  await writeFile(resolve(DESTINO, "conversas.json"), JSON.stringify(chats, null, 2), "utf8");
  await writeFile(
    ARQUIVO_MENSAGENS,
    `${mensagens.map((mensagem) => JSON.stringify(mensagem)).join("\n")}\n`,
    "utf8",
  );

  const cabecalho = [
    "chatid",
    "data_hora",
    "remetente",
    "de_mim",
    "tipo",
    "texto_ou_transcricao",
    "arquivo_local",
    "mime_type",
  ];
  const linhas = mensagens.map((mensagem) =>
    [
      mensagem.chatid,
      mensagem.dataHora,
      mensagem.senderName ?? mensagem.sender,
      mensagem.fromMe ? "sim" : "nao",
      mensagem.messageType,
      textoMensagem(mensagem),
      mensagem.backup?.arquivo,
      mensagem.backup?.mimeType ?? mensagem.mimetype ?? mensagem.content?.mimetype,
    ]
      .map(celulaCsv)
      .join(";"),
  );
  await writeFile(
    resolve(DESTINO, "mensagens.csv"),
    `\uFEFF${cabecalho.join(";")}\r\n${linhas.join("\r\n")}\r\n`,
    "utf8",
  );

  const nomes = new Map(
    chats.map((chat) => [
      chatId(chat),
      chat.wa_contactName ?? chat.wa_name ?? chat.name ?? chatId(chat),
    ]),
  );
  const agrupadas = new Map();
  for (const mensagem of mensagens) {
    const grupo = agrupadas.get(mensagem.chatid) ?? [];
    grupo.push(mensagem);
    agrupadas.set(mensagem.chatid, grupo);
  }
  for (const [jid, itens] of agrupadas) {
    const nomePessoa =
      nomes.get(jid) ??
      itens.find((mensagem) => !mensagem.fromMe && mensagem.senderName)?.senderName ??
      "Contato sem nome";
    const identificadorPessoa = String(jid ?? "")
      .replace(/@.+$/, "")
      .replace(/\D/g, "");
    const pastaPessoa = resolve(
      DESTINO,
      "por-pessoa",
      seguroArquivo(`${nomePessoa}_${identificadorPessoa || jid}`, 140),
    );
    await mkdir(pastaPessoa, { recursive: true });

    const linhasChat = [`Conversa: ${nomePessoa}`, `Identificador: ${jid}`, "-".repeat(72), ""];
    for (const mensagem of itens) {
      const autor = mensagem.fromMe ? "Loja" : (mensagem.senderName ?? "Cliente");
      const texto = textoMensagem(mensagem) || `[${mensagem.messageType ?? "mensagem sem texto"}]`;
      const arquivo = mensagem.backup?.arquivo ? ` [arquivo: ${mensagem.backup.arquivo}]` : "";
      linhasChat.push(`[${mensagem.dataHora ?? "sem data"}] ${autor}: ${texto}${arquivo}`);
    }
    await mkdir(resolve(DESTINO, "transcricoes"), { recursive: true });
    await writeFile(
      resolve(
        DESTINO,
        "transcricoes",
        `${seguroArquivo(`${nomes.get(jid) ?? "contato"}_${jid}`, 120)}.txt`,
      ),
      `${linhasChat.join("\n")}\n`,
      "utf8",
    );
    await writeFile(resolve(pastaPessoa, "conversa.txt"), `${linhasChat.join("\n")}\n`, "utf8");

    const cabecalhoPessoa = [
      "data_hora",
      "quem_falou",
      "tipo",
      "mensagem_ou_transcricao",
      "arquivo",
    ];
    const linhasPessoa = [];
    for (const mensagem of itens) {
      let arquivoPessoa = "";
      if (mensagem.backup?.arquivo) {
        const origem = resolve(DESTINO, mensagem.backup.arquivo);
        if (await existe(origem)) {
          arquivoPessoa = `midias/${basename(mensagem.backup.arquivo)}`;
          const destinoMidia = resolve(pastaPessoa, arquivoPessoa);
          await mkdir(dirname(destinoMidia), { recursive: true });
          if (!(await existe(destinoMidia))) await copyFile(origem, destinoMidia);
        }
      }
      linhasPessoa.push(
        [
          mensagem.dataHora,
          mensagem.fromMe ? "Loja" : (mensagem.senderName ?? "Cliente"),
          mensagem.messageType,
          textoMensagem(mensagem),
          arquivoPessoa,
        ]
          .map(celulaCsv)
          .join(";"),
      );
    }
    await writeFile(
      resolve(pastaPessoa, "mensagens.csv"),
      `\uFEFF${cabecalhoPessoa.join(";")}\r\n${linhasPessoa.join("\r\n")}\r\n`,
      "utf8",
    );
    await writeFile(
      resolve(pastaPessoa, "resumo.json"),
      JSON.stringify(
        {
          nome: nomePessoa,
          identificador: jid,
          totalMensagens: itens.length,
          totalMidias: itens.filter((mensagem) => mensagem.backup?.arquivo).length,
          primeiraMensagem: itens[0]?.dataHora ?? null,
          ultimaMensagem: itens.at(-1)?.dataHora ?? null,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const tipos = {};
  let menor = Infinity;
  let maior = 0;
  const chatsComMensagens = new Set();
  for (const mensagem of mensagens) {
    const tipo = mensagem.messageType ?? "desconhecido";
    tipos[tipo] = (tipos[tipo] ?? 0) + 1;
    if (mensagem.chatid) chatsComMensagens.add(mensagem.chatid);
    const ms = timestampMs(mensagem.messageTimestamp);
    if (ms) {
      menor = Math.min(menor, ms);
      maior = Math.max(maior, ms);
    }
  }
  const relatorio = {
    geradoEm: new Date().toISOString(),
    destino: DESTINO,
    chatsEncontrados: chats.length,
    chatsComMensagens: chatsComMensagens.size,
    mensagensSalvas: mensagens.length,
    mensagemMaisAntiga: Number.isFinite(menor) ? new Date(menor).toISOString() : null,
    mensagemMaisRecente: maior ? new Date(maior).toISOString() : null,
    tipos,
    ...relatorioParcial,
    aviso:
      "A UAZAPI mantem historico local limitado e o WhatsApp nao garante a recuperacao de todo o acervo antigo. Confira falhas de midia e complemente chats ausentes com exportacao pelo aparelho.",
  };
  await writeFile(resolve(DESTINO, "relatorio.json"), JSON.stringify(relatorio, null, 2), "utf8");
  return relatorio;
}

await mkdir(DESTINO, { recursive: true });
console.log(`Destino: ${DESTINO}`);
if (TRANSCREVER) console.log("Transcricao de audio ativada; isso pode consumir creditos OpenAI.");

const status = await request("/instance/status", { method: "GET" });
const conectado =
  status?.connected ?? status?.instance?.connected ?? status?.instance?.status === "connected";
if (conectado === false) throw new Error("A instancia UAZAPI nao esta conectada ao WhatsApp.");

const chats = await listarChats();
console.log(`Chats encontrados: ${chats.length}`);
const mensagens = await carregarMensagensExistentes();
console.log(`Mensagens que ja estavam no backup: ${mensagens.size}`);
await coletarMensagens(mensagens);

const rodadasHistorico = [];
if (RECUPERAR_HISTORICO) {
  for (let rodada = 1; rodada <= RODADAS; rodada += 1) {
    const requisicoes = await solicitarRodadaHistorico(chats, mensagens, rodada);
    const novas = await coletarMensagens(mensagens);
    rodadasHistorico.push({ rodada, ...requisicoes, novasMensagens: novas });
    if (BAIXAR_MIDIAS) await baixarMidias(mensagens);
    await salvarResultados(chats, mensagens, { rodadasHistorico });
    if (novas === 0) {
      console.log(
        "Nenhuma mensagem nova apareceu nesta rodada; encerrando para evitar repeticoes.",
      );
      break;
    }
  }
}

const midias = BAIXAR_MIDIAS ? await baixarMidias(mensagens) : { desativadas: true };
const relatorio = await salvarResultados(chats, mensagens, { midias, rodadasHistorico });
console.log(
  `Backup concluido: ${relatorio.mensagensSalvas} mensagens em ${relatorio.chatsComMensagens} chats.`,
);
console.log(`Relatorio: ${resolve(DESTINO, "relatorio.json")}`);
