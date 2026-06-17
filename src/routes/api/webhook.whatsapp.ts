import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { gerarPixPedido } from "@/lib/mercadopago";
import {
  extrairComprovantePagamento,
  extrairCompraDaConversa,
  gerarRespostaWhatsapp,
  limparRespostaCliente,
  type CompraConversaExtraida,
} from "@/lib/openai";
import {
  ehMidiaComprovantePersistivel,
  formaPagamentoDoMetodo,
  persistirMidiaComprovante,
} from "@/lib/comprovantes";
import { buscarRacoesTecnicasPorTexto, clientePediuFichaTecnica } from "@/lib/racoes-tecnicas";
import { buscarCupomAtivo, extrairCupomTexto } from "@/lib/indicacoes-supabase";
import { invalidarDashboardCache } from "@/lib/crm-supabase";
import { salvarDadosObservadosCliente } from "@/lib/recompra-supabase";
import {
  adicionarMensagemConversa,
  atualizarConversaAguardandoHumano,
  atualizarPedidoPixMercadoPago,
  buscarAprendizados,
  buscarClientePorTelefone,
  buscarConversaPorTelefone,
  buscarIaStatus,
  buscarIaPromptConfig,
  buscarProdutosDisponiveisPorTexto,
  confirmarPixPorComprovanteWhatsapp,
  criarPedidoPixPendente,
  listarPedidos,
  registrarPedidoDoWhatsapp,
  registrarProdutoProcurado,
  salvarCadastroCliente,
  upsertConversa,
  vincularPedidoPixAVenda,
  type ClienteCadastro,
  type Conversa,
  type PedidoCrm,
} from "@/lib/supabase";
import { enviarMensagemLonga, urlMidiaDescriptografada } from "@/lib/uazapi";
import { erroLog, logPix, telefoneLog } from "@/lib/pix-log";

type UazapiMessage = {
  id?: string;
  messageid?: string;
  key?: {
    remoteJid?: string;
    fromMe?: boolean;
    id?: string;
    participant?: string;
  };
  chatid?: string;
  chatId?: string;
  chat_id?: string;
  phone?: string;
  from?: string;
  to?: string;
  remoteJid?: string;
  jid?: string;
  fromMe?: boolean;
  from_me?: boolean;
  owner?: boolean | string;
  isGroup?: boolean;
  wasSentByApi?: boolean;
  messageTimestamp?: number;
  timestamp?: number;
  messageType?: string;
  type?: string;
  body?: string;
  text?: string | { message?: string; body?: string };
  message?:
    | string
    | {
        text?: string;
        conversation?: string;
        extendedTextMessage?: { text?: string };
        imageMessage?: {
          caption?: string;
          mimetype?: string;
          fileName?: string;
          url?: string;
          fileURL?: string;
        };
        videoMessage?: {
          caption?: string;
          mimetype?: string;
          fileName?: string;
          url?: string;
          fileURL?: string;
        };
        documentMessage?: {
          caption?: string;
          fileName?: string;
          mimetype?: string;
          url?: string;
          fileURL?: string;
        };
        audioMessage?:
          | { mimetype?: string; fileName?: string; url?: string; fileURL?: string }
          | unknown;
        stickerMessage?: unknown;
      };
  content?: unknown;
  caption?: string;
  fileURL?: string;
  fileUrl?: string;
  mediaUrl?: string;
  mediaURL?: string;
  mimetype?: string;
  mimeType?: string;
  fileName?: string;
  mediaKey?: string;
  senderName?: string;
  pushName?: string;
  pushname?: string;
  fromName?: string;
  chatName?: string;
  name?: string;
};

export type UazapiWebhook = {
  body?: { message?: UazapiMessage; data?: UazapiPayload };
  message?: UazapiMessage;
  Message?: UazapiMessage;
  data?: UazapiPayload;
  Data?: UazapiPayload;
  messages?: UazapiMessage[];
  Messages?: UazapiMessage[];
};

type UazapiPayloadContainer = {
  messages?: UazapiMessage[];
  Messages?: UazapiMessage[];
  message?: UazapiMessage;
  Message?: UazapiMessage;
  data?: UazapiPayload;
  Data?: UazapiPayload;
};

type UazapiPayload = UazapiMessage | UazapiMessage[] | UazapiPayloadContainer;

type ResultadoPix = {
  ok: boolean;
  erro?: string;
  mensagem?: string;
  valor_formatado?: string;
  pix_gerado: boolean;
  status_pix?: string;
  qr_code?: string;
};

type PedidoParaPix = Pick<PedidoCrm, "id" | "total" | "statusPagamento">;

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function nomeClienteSeguro(value?: string | null): string | null {
  const nome = value?.trim();
  if (!nome || /^cliente\s+\d+$/i.test(nome)) return null;

  return nome;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function partesSaoPaulo(date = new Date()): { diaSemana: number; hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = partes.find((parte) => parte.type === "weekday")?.value ?? "Sun";
  const diaSemana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const hora = Number(partes.find((parte) => parte.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((parte) => parte.type === "minute")?.value ?? 0);

  return { diaSemana, hora, minuto };
}

function horarioAtendimento(date = new Date()) {
  const { diaSemana, hora, minuto } = partesSaoPaulo(date);
  const minutos = hora * 60 + minuto;
  const horarioComercial =
    diaSemana >= 1 && diaSemana <= 6 && minutos >= 8 * 60 && minutos < 18 * 60;
  const saudacao = hora < 12 ? "Bom dia!" : hora < 18 ? "Boa tarde!" : "Boa noite!";
  const periodo = hora < 12 ? "manha" : hora < 18 ? "tarde" : "noite";

  return {
    timezone: "America/Sao_Paulo",
    horario_comercial: horarioComercial,
    saudacao,
    periodo,
    regra: "segunda a sabado, das 8h as 18h",
  };
}

function mensagemValida(message?: UazapiMessage): message is UazapiMessage & {
  chatid: string;
  text: string;
} {
  const tipo = (message?.messageType ?? message?.type ?? "").toLowerCase();
  const texto = textoMensagem(message);

  return Boolean(message?.chatid && !message?.isGroup && tipo !== "status" && texto?.trim());
}

function textoMensagem(message?: UazapiMessage): string | undefined {
  if (!message) return undefined;
  if (typeof message.text === "string") return message.text;
  if (typeof message.text?.message === "string") return message.text.message;
  if (typeof message.text?.body === "string") return message.text.body;
  if (typeof message.body === "string") return message.body;
  if (typeof message.message === "string") return message.message;
  if (typeof message.message?.text === "string") return message.message.text;
  if (typeof message.message?.conversation === "string") return message.message.conversation;
  if (typeof message.message?.extendedTextMessage?.text === "string") {
    return message.message.extendedTextMessage.text;
  }
  if (typeof message.message?.imageMessage?.caption === "string") {
    return message.message.imageMessage.caption || "[Imagem recebida]";
  }
  if (message.message?.imageMessage) return "[Imagem recebida]";
  if (typeof message.message?.videoMessage?.caption === "string") {
    return message.message.videoMessage.caption || "[Video recebido]";
  }
  if (message.message?.videoMessage) return "[Video recebido]";
  if (typeof message.message?.documentMessage?.caption === "string") {
    return message.message.documentMessage.caption || "[Documento recebido]";
  }
  if (typeof message.message?.documentMessage?.fileName === "string") {
    return `[Documento recebido] ${message.message.documentMessage.fileName}`;
  }
  if (typeof message.caption === "string") return message.caption;
  if (typeof message.content === "string") return message.content;
  if (message.content && typeof message.content === "object") {
    const content = message.content as {
      text?: string;
      body?: string;
      caption?: string;
      conversation?: string;
    };
    if (typeof content.text === "string") return content.text;
    if (typeof content.body === "string") return content.body;
    if (typeof content.caption === "string") return content.caption;
    if (typeof content.conversation === "string") return content.conversation;
  }
  if (message.message?.audioMessage) return "[Audio recebido]";
  if (message.message?.stickerMessage) return "[Figurinha recebida]";

  const tipo = (message.messageType ?? message.type ?? "").toLowerCase();
  if (tipo.includes("audio")) return message.fromMe ? "[Audio enviado]" : "[Audio recebido]";
  if (tipo.includes("image")) return message.fromMe ? "[Imagem enviada]" : "[Imagem recebida]";
  if (tipo.includes("video")) return message.fromMe ? "[Video enviado]" : "[Video recebido]";
  if (tipo.includes("document"))
    return message.fromMe ? "[Documento enviado]" : "[Documento recebido]";
  if (tipo.includes("sticker"))
    return message.fromMe ? "[Figurinha enviada]" : "[Figurinha recebida]";
  if (tipo.includes("location"))
    return message.fromMe ? "[Localizacao enviada]" : "[Localizacao recebida]";
  if (tipo.includes("contact")) return message.fromMe ? "[Contato enviado]" : "[Contato recebido]";

  return undefined;
}

function stringFromContent(content: unknown, keys: string[], depth = 0): string | undefined {
  if (!content || depth > 5) return undefined;

  if (Array.isArray(content)) {
    for (const item of content) {
      const value = stringFromContent(item, keys, depth + 1);
      if (value) return value;
    }
    return undefined;
  }

  if (typeof content !== "object") return undefined;

  const object = content as Record<string, unknown>;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  for (const value of Object.values(object)) {
    const nested = stringFromContent(value, keys, depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function mediaUrlMensagem(message?: UazapiMessage): string | undefined {
  if (!message) return undefined;

  return (
    message.fileURL ??
    message.fileUrl ??
    message.mediaUrl ??
    message.mediaURL ??
    stringFromContent(message.content, [
      "fileURL",
      "fileUrl",
      "mediaUrl",
      "mediaURL",
      "downloadUrl",
      "downloadURL",
      "URL",
      "url",
    ]) ??
    stringFromContent(message.message, [
      "fileURL",
      "fileUrl",
      "mediaUrl",
      "mediaURL",
      "downloadUrl",
      "downloadURL",
      "URL",
      "url",
    ])
  )?.trim();
}

function mimeTypeMensagem(message?: UazapiMessage): string | undefined {
  if (!message) return undefined;

  return (
    message.mimeType ??
    message.mimetype ??
    stringFromContent(message.content, ["mimetype", "mimeType", "mediaType"]) ??
    stringFromContent(message.message, ["mimetype", "mimeType", "mediaType"])
  )?.trim();
}

function fileNameMensagem(message?: UazapiMessage): string | undefined {
  if (!message) return undefined;

  return (
    message.fileName ??
    stringFromContent(message.content, ["fileName", "filename", "title"]) ??
    stringFromContent(message.message, ["fileName", "filename", "title"])
  )?.trim();
}

function mediaKeyMensagem(message?: UazapiMessage): string | undefined {
  if (!message) return undefined;

  return (
    message.mediaKey ??
    stringFromContent(message.content, ["mediaKey"]) ??
    stringFromContent(message.message, ["mediaKey"])
  )?.trim();
}

function normalizarMensagem(message?: UazapiMessage): UazapiMessage | undefined {
  if (!message) return undefined;

  return {
    ...message,
    chatid:
      message.chatid ??
      message.chatId ??
      message.chat_id ??
      message.key?.remoteJid ??
      message.remoteJid ??
      message.jid ??
      message.from ??
      message.to ??
      message.phone,
    fromMe:
      message.fromMe ??
      message.from_me ??
      (typeof message.owner === "boolean" ? message.owner : undefined) ??
      message.key?.fromMe,
    messageType: message.messageType ?? message.type,
    text: textoMensagem(message),
    fileURL: mediaUrlMensagem(message),
    mimetype: mimeTypeMensagem(message),
    fileName: fileNameMensagem(message),
    mediaKey: mediaKeyMensagem(message),
    senderName:
      message.senderName ??
      message.pushName ??
      message.pushname ??
      message.fromName ??
      message.chatName ??
      message.name,
  };
}

function extrairMensagemWebhook(event: UazapiWebhook): UazapiMessage | undefined {
  return extrairMensagensWebhook(event)[0];
}

function extrairMensagensPayload(payload?: UazapiPayload): UazapiMessage[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  const container = payload as UazapiPayloadContainer;
  const nested = [
    ...(Array.isArray(container.messages) ? container.messages : []),
    ...(Array.isArray(container.Messages) ? container.Messages : []),
    container.message,
    container.Message,
    ...extrairMensagensPayload(container.data),
    ...extrairMensagensPayload(container.Data),
  ].filter((message): message is UazapiMessage => Boolean(message));

  return nested.length > 0 ? nested : [payload as UazapiMessage];
}

function extrairMensagensWebhook(event: UazapiWebhook): UazapiMessage[] {
  const candidatos = [
    ...(Array.isArray(event.messages) ? event.messages : []),
    ...(Array.isArray(event.Messages) ? event.Messages : []),
    ...extrairMensagensPayload(event.data),
    ...extrairMensagensPayload(event.Data),
    ...extrairMensagensPayload(event.body?.data),
    event.body?.message,
    event.message,
    event.Message,
  ];

  return candidatos
    .map((message) => normalizarMensagem(message))
    .filter((message): message is UazapiMessage => Boolean(message));
}

function motivoMensagemInvalida(message?: UazapiMessage): string {
  if (!message) return "payload_sem_message";
  if (!message.chatid) return "chatid_ausente";
  if (message.isGroup) return "grupo_ignorado";
  if (!textoMensagem(message)?.trim()) return "texto_ausente";

  const tipo = (message.messageType ?? message.type ?? "").toLowerCase();
  if (tipo === "status") return `tipo_nao_suportado:${tipo}`;

  return "formato_nao_suportado";
}

function extrairCampoMarcador(dados: string, campo: string): string | undefined {
  const valor = dados.match(new RegExp(`${campo}\\s*=\\s*["']?([^;"'\\]]+)`, "i"))?.[1]?.trim();

  return valor || undefined;
}

function extrairCadastroCliente(content: string): {
  nome?: string;
  endereco?: string;
  bairro?: string;
  pets?: string[];
} | null {
  const marcador = content.match(/\[SALVAR_CLIENTE([^\]]*)\]/i)?.[1];
  if (!marcador) return null;

  const petsTexto = extrairCampoMarcador(marcador, "pets") ?? extrairCampoMarcador(marcador, "pet");
  const cadastro = {
    nome: extrairCampoMarcador(marcador, "nome"),
    endereco: extrairCampoMarcador(marcador, "endereco"),
    bairro: extrairCampoMarcador(marcador, "bairro"),
    pets: petsTexto
      ?.split(",")
      .map((pet) => pet.trim())
      .filter(Boolean),
  };

  return cadastro.nome || cadastro.endereco || cadastro.bairro || cadastro.pets?.length
    ? cadastro
    : null;
}

function extrairDadosObservados(content: string): Record<string, unknown> | null {
  const marcador = content.match(/\[DADOS_OBSERVADOS([^\]]*)\]/i)?.[1];
  if (!marcador) return null;

  const dados = {
    pets: extrairCampoMarcador(marcador, "pets"),
    especie: extrairCampoMarcador(marcador, "especie"),
    fase: extrairCampoMarcador(marcador, "fase"),
    idade: extrairCampoMarcador(marcador, "idade"),
    peso: extrairCampoMarcador(marcador, "peso"),
    porte: extrairCampoMarcador(marcador, "porte"),
    castrado: extrairCampoMarcador(marcador, "castrado"),
    necessidade: extrairCampoMarcador(marcador, "necessidade"),
    racao: extrairCampoMarcador(marcador, "racao") ?? extrairCampoMarcador(marcador, "ração"),
    produto: extrairCampoMarcador(marcador, "produto"),
    cidade: extrairCampoMarcador(marcador, "cidade"),
    bairro: extrairCampoMarcador(marcador, "bairro"),
    consumo: extrairCampoMarcador(marcador, "consumo"),
    duracao: extrairCampoMarcador(marcador, "duracao"),
    restricoes: extrairCampoMarcador(marcador, "restricoes"),
  };
  const limpo = Object.fromEntries(
    Object.entries(dados).filter(([, value]) => typeof value === "string" && value.trim()),
  );

  return Object.keys(limpo).length > 0 ? limpo : null;
}

function extrairPagamentoPedido(content: string): string | undefined {
  const marcadorPedido = content.match(/\[PEDIDO\]([^\r\n]*)/i)?.[1];

  return marcadorPedido ? extrairCampoMarcador(marcadorPedido, "pagamento") : undefined;
}

function extrairProdutoProcurado(content: string): string | undefined {
  const marcador = content.match(/\[PRODUTO_PROCURADO\s+([^\]]+)\]/i)?.[1];
  if (!marcador) return undefined;
  return marcador.replace(/^["']|["']$/g, "").trim() || undefined;
}

function limparRespostaTecnica(content: string): string {
  return limparRespostaCliente(
    content
      .replace(/\[SALVAR_CLIENTE[^\]]*\]/gi, "")
      .replace(/\[PEDIDO\][\s\S]*$/i, "")
      .replace(/\[HANDOFF\]/gi, ""),
  );
}

function pediuPix(texto: string): boolean {
  return /(?:\bpix\b|chave\s*pix|manda(?:r)?\s+(?:a\s+)?chave\s*pix|envia(?:r)?\s+(?:a\s+)?chave\s*pix)/i.test(
    texto,
  );
}

function pixJaEnviado(texto: string): boolean {
  return /chave\s*pix\s*copia\s*e\s*cola|segue\s+a\s+chave\s*pix|pix\s+gerado|depois\s+do\s+pagamento/i.test(
    texto,
  );
}

function ultimoIndiceMensagem(
  mensagens: Conversa["historico"],
  predicate: (mensagem: Conversa["historico"][number]) => boolean,
): number {
  for (let index = mensagens.length - 1; index >= 0; index -= 1) {
    if (predicate(mensagens[index])) return index;
  }

  return -1;
}

function pixSolicitadoRecentemente(conversa: Conversa): boolean {
  const historicoRecente = conversa.historico.slice(-10);
  const ultimoPixEnviado = ultimoIndiceMensagem(
    historicoRecente,
    (mensagem) => mensagem.role === "assistant" && pixJaEnviado(mensagem.content),
  );
  const ultimaSolicitacaoPix = ultimoIndiceMensagem(
    historicoRecente,
    (mensagem) => mensagem.role === "user" && pediuPix(mensagem.content),
  );

  return ultimaSolicitacaoPix >= 0 && ultimaSolicitacaoPix > ultimoPixEnviado;
}

function mensagemSomenteCupom(texto: string, codigo: string): boolean {
  const normalizado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
  const palavras = normalizado.split(/\s+/).filter(Boolean);

  return palavras.length <= 5 && palavras.includes(codigo);
}

function cupomRecenteDaConversa(conversa: Conversa, textoAtual: string): string | null {
  const mensagens = [
    ...conversa.historico
      .filter((mensagem) => mensagem.role === "user")
      .slice(-8)
      .map((mensagem) => mensagem.content),
    textoAtual,
  ];

  for (const mensagem of mensagens.reverse()) {
    const cupom = extrairCupomTexto(mensagem);
    if (cupom) return cupom;
  }

  return null;
}

function clienteTemEnderecoCompleto(cliente: ClienteCadastro | null): boolean {
  return Boolean(cliente?.endereco?.trim() && cliente?.bairro?.trim());
}

function extrairEnderecoInformado(
  texto: string,
): Pick<ClienteCadastro, "endereco" | "bairro"> | null {
  if (!/\d/.test(texto) || !texto.includes(",")) return null;

  const partes = texto
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (partes.length < 3) return null;

  const indiceNumero = partes.findIndex((parte) => /\d/.test(parte));
  if (indiceNumero < 0) return null;

  const rua = partes[0];
  const numero = partes[indiceNumero];
  const bairro =
    partes.find((parte, index) => index !== 0 && index !== indiceNumero && !/\d/.test(parte)) ??
    partes.find((parte, index) => index !== 0 && index !== indiceNumero);

  if (!rua || !numero || !bairro) return null;

  return {
    endereco: `${rua}, ${numero}`,
    bairro,
  };
}

function extrairEnderecoDoHistorico(
  conversa: Conversa,
  textoAtual: string,
): Pick<ClienteCadastro, "endereco" | "bairro"> | null {
  const mensagensCliente = [
    ...conversa.historico
      .filter((mensagem) => mensagem.role === "user")
      .slice(-8)
      .map((mensagem) => mensagem.content),
    textoAtual,
  ];

  for (const mensagem of mensagensCliente.reverse()) {
    const endereco = extrairEnderecoInformado(mensagem);
    if (endereco) return endereco;
  }

  return null;
}

async function buscarOuCriarConversa(telefone: string): Promise<Conversa> {
  return (
    (await buscarConversaPorTelefone(telefone)) ??
    (await upsertConversa({
      telefone,
      historico: [],
      nome_cliente: null,
      aguardando_humano: false,
      estagio: "novo",
      atualizado_em: new Date().toISOString(),
    }))
  );
}

async function salvarClienteWhatsappInicial({
  telefone,
  nomeWhatsapp,
}: {
  telefone: string;
  nomeWhatsapp?: string | null;
}): Promise<ClienteCadastro | null> {
  try {
    return await salvarCadastroCliente({
      telefone,
      nome: nomeWhatsapp,
      origem: "WhatsApp IA",
    });
  } catch (error) {
    console.error("[whatsapp] erro_salvar_cliente_inicial", erroLog(error));
    return null;
  }
}

function dataMensagem(message: UazapiMessage): string | undefined {
  const timestamp = message.messageTimestamp ?? message.timestamp;
  if (!timestamp || !Number.isFinite(timestamp)) return undefined;

  const millis = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(millis);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function metadataMensagem(message: UazapiMessage): Partial<Conversa["historico"][number]> {
  return {
    id: message.messageid ?? message.id ?? message.key?.id,
    at: dataMensagem(message),
    source: "whatsapp",
    fromMe: Boolean(message.fromMe),
    messageType: message.messageType,
    mediaUrl: mediaUrlMensagem(message),
    mimeType: mimeTypeMensagem(message),
    fileName: fileNameMensagem(message),
    mediaKey: mediaKeyMensagem(message),
  };
}

async function registrarMensagemHistorico(
  conversa: Conversa,
  role: "user" | "assistant",
  content: string,
  metadata: Partial<Conversa["historico"][number]> = {},
): Promise<Conversa> {
  const ultimaMensagem = conversa.historico.at(-1);
  const messageId = metadata.id;
  if (messageId && conversa.historico.some((mensagem) => mensagem.id === messageId)) {
    return conversa;
  }

  if (ultimaMensagem?.role === role && ultimaMensagem.content.trim() === content.trim()) {
    return conversa;
  }

  return adicionarMensagemConversa({
    id: conversa.id,
    mensagem: { role, content, ...metadata },
  });
}

async function registrarMensagemCliente(
  conversa: Conversa,
  content: string,
  metadata: Partial<Conversa["historico"][number]> = {},
): Promise<Conversa> {
  return registrarMensagemHistorico(conversa, "user", content, metadata);
}

function agendarTrackingPedidosWhatsapp(conversa: Conversa): void {
  if (!historicoTemSinalDePedido(conversa.historico)) return;

  void registrarPedidoAutomaticoDaConversa(conversa)
    .then((registrou) => {
      if (registrou) {
        invalidarDashboardCache();
      }
    })
    .catch((error) => {
      console.error("[whatsapp] erro_tracking_pedidos", erroLog(error));
    });
}

function historicoTemSinalDePedido(historico: Conversa["historico"]): boolean {
  return historico.slice(-12).some((mensagem) => {
    const texto = mensagem.content ?? "";

    return /(?:nome|n[uú]mero|telefone|pedido|pode\s+(?:fechar|separar|mandar|enviar)|fechado|vou\s+querer|manda|entrega|pix|cart[aã]o|dinheiro|comprovante|paguei|R\$\s*\d)/i.test(
      texto,
    );
  });
}

function formaPagamentoCompra(compra: CompraConversaExtraida): string {
  switch (compra.formaPagamento) {
    case "cartao":
      return "Cartao";
    case "transferencia":
      return "Transferencia";
    case "boleto":
      return "Boleto";
    case "dinheiro":
      return "Dinheiro";
    default:
      return "Pix";
  }
}

function textoPedidoAutomatico(
  historico: Conversa["historico"],
  compra: CompraConversaExtraida,
): string {
  const janela = historico.slice(-18);
  const contexto = janela
    .map((mensagem) => `${mensagem.role === "user" ? "Cliente" : "Atendente"}: ${mensagem.content}`)
    .join("\n");
  const produto = compra.produtos?.[0];
  const quantidade = compra.quantidade ?? 1;
  const total = compra.total ? brl(compra.total) : undefined;
  const marcador = [
    "[PEDIDO]",
    produto ? `produto="${produto}"` : null,
    `quantidade=${quantidade}`,
    `pagamento="${formaPagamentoCompra(compra)}"`,
    total ? `total="${total}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `${contexto}\n${marcador}`;
}

async function registrarPedidoAutomaticoDaConversa(conversa: Conversa): Promise<boolean> {
  const historico = conversa.historico.slice(-24);
  const compra = await extrairCompraDaConversa(historico);

  if (!compra.ehCompra || compra.status !== "fechada" || compra.confianca < 0.68) {
    return false;
  }

  const pedido = await registrarPedidoDoWhatsapp({
    telefone: normalizarTelefone(conversa.telefone),
    texto: textoPedidoAutomatico(historico, compra),
    nomeCliente: conversa.nome_cliente,
    formaPagamento: formaPagamentoCompra(compra),
    totalPago: compra.total,
    pago: compra.pagamentoConfirmado === true,
    observacaoExtra: [
      "Pedido criado automaticamente a partir do historico do WhatsApp",
      compra.motivo ? compra.motivo.slice(0, 100) : null,
    ]
      .filter(Boolean)
      .join(" | "),
  });

  return Boolean(pedido.registrado && pedido.vendaId);
}

function contextoCliente(cliente: ClienteCadastro | null) {
  return cliente
    ? {
        nome: nomeClienteSeguro(cliente.nome),
        telefone: cliente.telefone,
        endereco: cliente.endereco,
        bairro: cliente.bairro,
        pets: cliente.pets,
        pedidos: cliente.pedidos,
      }
    : null;
}

function pedidosDoCliente(pedidos: PedidoCrm[], telefone: string): PedidoCrm[] {
  return pedidos.filter((pedido) => normalizarTelefone(pedido.telefone) === telefone).slice(0, 5);
}

function primeiraUrlTexto(texto: string): string | undefined {
  return texto.match(/https?:\/\/[^\s<>"')]+/i)?.[0];
}

function contextoPedidoDoHistorico(
  historico: Conversa["historico"],
  comprovante: Conversa["historico"][number],
  valor: number,
  formaPagamento = "Pix",
): string {
  const index = historico.findIndex(
    (mensagem) =>
      mensagem === comprovante || (Boolean(mensagem.id) && mensagem.id === comprovante.id),
  );
  const inicio = index >= 0 ? Math.max(0, index - 14) : Math.max(0, historico.length - 18);
  const fim = index >= 0 ? Math.min(historico.length, index + 1) : historico.length;
  const contexto = historico
    .slice(inicio, fim)
    .map((mensagem) => `${mensagem.role === "user" ? "Cliente" : "Atendente"}: ${mensagem.content}`)
    .join("\n");

  return `${contexto}\n[PEDIDO] pagamento="${formaPagamento}"; total="${brl(valor)}"`;
}

function deveAnalisarComprovante(
  texto: string,
  metadata: Partial<Conversa["historico"][number]>,
): boolean {
  const mime = metadata.mimeType?.toLowerCase() ?? "";
  const tipo = metadata.messageType?.toLowerCase() ?? "";
  const nome = metadata.fileName?.toLowerCase() ?? "";
  const temMidiaVisual =
    Boolean(metadata.mediaUrl) &&
    (mime.startsWith("image/") || tipo.includes("image") || /\.(?:png|jpe?g|webp)$/i.test(nome));
  const temDocumento =
    Boolean(metadata.mediaUrl) &&
    (mime === "application/pdf" || tipo.includes("document") || /\.pdf$/i.test(nome));
  const textoSugereComprovante =
    /(?:comprovante|paguei|pagamento|pix|transfer[eê]ncia|recibo|maquininha|segue\s+(?:o\s+)?comprovante)/i.test(
      texto,
    );
  const temLink = /https?:\/\/\S+/i.test(texto);

  return textoSugereComprovante || temMidiaVisual || temDocumento || temLink;
}

function formaPagamentoMencionada(texto: string): "Cartão" | "Dinheiro" | undefined {
  if (
    /(?:no|com|na|pelo)\s+(?:cart[aã]o|maquininha|d[eé]bito|cr[eé]dito)|cart[aã]o\s+(?:de\s+)?(?:cr[eé]dito|d[eé]bito)|maquininha/i.test(
      texto,
    )
  ) {
    return "Cartão";
  }
  if (/(?:pagar|pago|pagamento)\s+(?:em|no|com)\s+dinheiro|dinheiro\s+na\s+entrega/i.test(texto)) {
    return "Dinheiro";
  }

  return undefined;
}

async function tentarConfirmarPagamentoPorComprovante({
  telefone,
  texto,
  conversa,
  metadata,
}: {
  telefone: string;
  texto: string;
  conversa: Conversa;
  metadata: Partial<Conversa["historico"][number]>;
}): Promise<boolean> {
  if (!deveAnalisarComprovante(texto, metadata)) return false;

  try {
    const mediaUrl =
      (await urlMidiaDescriptografada({
        id: metadata.id,
        mediaUrl: metadata.mediaUrl,
        mimeType: metadata.mimeType,
        messageType: metadata.messageType,
      })) ?? primeiraUrlTexto(texto);
    const extraido = await extrairComprovantePagamento({
      texto,
      mediaUrl,
      fileName: metadata.fileName,
    });

    logPix("whatsapp", "comprovante_analisado", {
      telefone: telefoneLog(telefone),
      eh_comprovante: extraido.ehComprovante,
      metodo: extraido.metodo ?? null,
      valor: extraido.valor ?? null,
      confianca: extraido.confianca,
      id_transacao: extraido.idTransacao ?? null,
    });

    if (!extraido.ehComprovante || !extraido.valor || extraido.confianca < 0.55) {
      return false;
    }

    const formaPagamento = formaPagamentoDoMetodo(extraido.metodo);
    const confirmacao = await confirmarPixPorComprovanteWhatsapp({
      telefone,
      valor: extraido.valor,
      formaPagamento,
    });
    let confirmacaoFinal = confirmacao;

    if (
      !confirmacao.confirmado &&
      (confirmacao.motivo === "pedido_pendente_nao_encontrado" ||
        confirmacao.motivo === "pedido_pix_sem_venda")
    ) {
      const pedido = await registrarPedidoDoWhatsapp({
        telefone,
        texto: contextoPedidoDoHistorico(
          conversa.historico,
          conversa.historico.at(-1) ?? {
            role: "user",
            content: texto,
          },
          extraido.valor,
          formaPagamento,
        ),
        nomeCliente: conversa.nome_cliente,
        formaPagamento,
        totalPago: extraido.valor,
        pago: true,
        observacaoExtra: [
          metadata.id ? `WPP_PAY:${metadata.id.slice(0, 60)}` : null,
          `Pagamento ${formaPagamento} confirmado por comprovante no WhatsApp`,
          extraido.idTransacao ? `ID ${extraido.idTransacao}` : null,
        ]
          .filter(Boolean)
          .join(" | "),
      });

      if (pedido.registrado && pedido.vendaId) {
        if (confirmacao.pedidoPixId) {
          await vincularPedidoPixAVenda({
            pedidoPixId: confirmacao.pedidoPixId,
            vendaId: pedido.vendaId,
          });
        }

        confirmacaoFinal = {
          confirmado: true,
          tipo: confirmacao.pedidoPixId ? "pedido_pix" : "venda",
          pedidoPixId: confirmacao.pedidoPixId,
          vendaId: pedido.vendaId,
          valor: pedido.total,
        };
      }
    }

    logPix(
      "whatsapp",
      confirmacaoFinal.confirmado ? "comprovante_confirmou_pagamento" : "comprovante_sem_match",
      {
        telefone: telefoneLog(telefone),
        valor: extraido.valor,
        tipo: confirmacaoFinal.tipo ?? null,
        venda_id: confirmacaoFinal.vendaId ?? null,
        pedido_pix_id: confirmacaoFinal.pedidoPixId ?? null,
        motivo: confirmacaoFinal.motivo ?? null,
      },
      confirmacaoFinal.confirmado ? "info" : "warn",
    );

    if (!confirmacaoFinal.confirmado) return false;

    const resposta =
      `Pagamento ${formaPagamento} confirmado no sistema no valor de ${brl(extraido.valor)}. ` +
      "Vou seguir com a separacao do pedido.";
    await Promise.all([
      enviarMensagemLonga(`${telefone}@s.whatsapp.net`, resposta),
      adicionarMensagemConversa({
        id: conversa.id,
        mensagem: { role: "assistant", content: resposta },
      }),
    ]);

    return true;
  } catch (error) {
    logPix(
      "whatsapp",
      "falha_analisar_comprovante",
      {
        telefone: telefoneLog(telefone),
        erro: erroLog(error),
      },
      "error",
    );
    return false;
  }
}

async function tentarGerarPix({
  telefone,
  cliente,
  pedidos,
}: {
  telefone: string;
  cliente: ClienteCadastro | null;
  pedidos: PedidoParaPix[];
}): Promise<ResultadoPix> {
  const telefoneMascara = telefoneLog(telefone);
  const pedidoPendente = pedidos.find(
    (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
  );

  if (!pedidoPendente) {
    logPix(
      "whatsapp",
      "geracao_bloqueada",
      {
        telefone: telefoneMascara,
        motivo: "valor_required",
        pedidos_recentes: pedidos.length,
      },
      "warn",
    );
    return {
      ok: false,
      erro: "valor_required",
      mensagem: "Nao encontrei pedido pendente com valor para gerar Pix.",
      pix_gerado: false,
    };
  }

  if (!clienteTemEnderecoCompleto(cliente)) {
    logPix(
      "whatsapp",
      "geracao_bloqueada",
      {
        telefone: telefoneMascara,
        motivo: "endereco_required",
        pedidos_recentes: pedidos.length,
      },
      "warn",
    );
    return {
      ok: false,
      erro: "endereco_required",
      mensagem: "Endereco completo obrigatorio antes de gerar Pix.",
      pix_gerado: false,
    };
  }

  try {
    const descricao = "Pagamento via Pix Mundo Pet";
    const pedidoPix = await criarPedidoPixPendente({
      telefone,
      descricao,
      valor: pedidoPendente.total,
      vendaId: pedidoPendente.id,
    });
    logPix("whatsapp", "pedido_pix_criado", {
      telefone: telefoneMascara,
      venda_id: pedidoPendente.id,
      pedido_pix_id: pedidoPix.id,
      valor: pedidoPendente.total,
    });
    const pix = await gerarPixPedido({
      id: pedidoPix.id,
      valor: pedidoPendente.total,
      descricao,
      email: "comprador-teste@example.com",
    });
    logPix("whatsapp", "mercado_pago_gerou_pix", {
      telefone: telefoneMascara,
      pedido_pix_id: pedidoPix.id,
      pagamento_id: pix.id,
      status_pix: pix.status,
    });

    await atualizarPedidoPixMercadoPago({
      id: pedidoPix.id,
      mpPaymentId: pix.id,
      qrCode: pix.qr_code,
      qrCodeBase64: pix.qr_code_base64,
    });
    logPix("whatsapp", "pix_salvo_no_pedido", {
      telefone: telefoneMascara,
      pedido_pix_id: pedidoPix.id,
    });

    return {
      ok: true,
      pix_gerado: true,
      status_pix: pix.status,
      qr_code: pix.qr_code,
      valor_formatado: brl(pedidoPendente.total),
    };
  } catch (error) {
    logPix(
      "whatsapp",
      "falha_geracao",
      {
        telefone: telefoneMascara,
        venda_id: pedidoPendente.id,
        erro: erroLog(error),
      },
      "error",
    );
    return {
      ok: false,
      erro: "pix_failed",
      mensagem: error instanceof Error ? error.message : "Falha ao gerar Pix.",
      pix_gerado: false,
    };
  }
}

function montarMensagensPix(resposta: string, resultadoPix?: ResultadoPix): string[] {
  if (!resultadoPix?.pix_gerado || !resultadoPix.qr_code) return [resposta];

  const introducao = resposta || "Segue a chave Pix do pedido.";
  const total = resultadoPix.valor_formatado ? ` O total e ${resultadoPix.valor_formatado}.` : "";

  return [`${introducao}${total}`, resultadoPix.qr_code];
}

function respostaPixSemChave(resposta: string, resultadoPix?: ResultadoPix): string {
  if (resultadoPix?.pix_gerado) return resposta;
  if (!resultadoPix) return resposta;
  if (
    !/(?:chave|pix).{0,80}(?:anexo|enviar|gerar)|(?:anexo|envio).{0,80}(?:chave|pix)/i.test(
      resposta,
    )
  ) {
    return resposta;
  }

  if (resultadoPix?.erro === "pix_failed") {
    return "Nao consegui gerar a chave Pix agora. Vou chamar a equipe para finalizar o pagamento.";
  }

  if (resultadoPix?.erro === "endereco_required") {
    return "Antes do Pix, me passa o endereco completo com rua, numero e bairro para finalizar a entrega.";
  }

  return "Vou fechar o pedido antes de gerar a chave Pix. Me confirma o produto e a quantidade.";
}

async function registrarPedidoPorHistorico({
  telefone,
  conversa,
  texto,
  nomeCliente,
  formaPagamento = "Pix",
}: {
  telefone: string;
  conversa: Conversa;
  texto: string;
  nomeCliente?: string | null;
  formaPagamento?: string;
}) {
  const historicoPedido = [...conversa.historico.slice(-12), { role: "user", content: texto }]
    .map((mensagem) => mensagem.content)
    .join("\n");
  const produtosHistorico = await buscarProdutosDisponiveisPorTexto(historicoPedido, 2);

  if (produtosHistorico.length === 0) {
    logPix(
      "whatsapp",
      "pedido_fallback_bloqueado",
      {
        telefone: telefoneLog(telefone),
        motivo: "produto_nao_encontrado",
        produtos_encontrados: produtosHistorico.length,
      },
      "warn",
    );
    return null;
  }

  const produto = produtosHistorico[0];
  if (produtosHistorico.length > 1) {
    logPix("whatsapp", "pedido_fallback_desambiguado", {
      telefone: telefoneLog(telefone),
      sku_escolhido: produto.sku,
      produtos_encontrados: produtosHistorico.length,
    });
  }

  const pedidoSintetico = `[PEDIDO] produto="${produto.nome}"; quantidade=1; pagamento="${formaPagamento}"; total="${brl(
    produto.preco,
  )}"\n${texto}`;
  const pedido = await registrarPedidoDoWhatsapp({
    telefone,
    texto: pedidoSintetico,
    nomeCliente,
    formaPagamento,
  });

  logPix("whatsapp", "pedido_fallback_processado", {
    telefone: telefoneLog(telefone),
    sku: produto.sku,
    registrado: pedido.registrado,
    motivo: pedido.motivo ?? null,
    venda_id: pedido.vendaId ?? null,
    total: pedido.total,
  });

  return pedido;
}

export async function processarWebhookWhatsapp(event: UazapiWebhook): Promise<Response> {
  const mensagens = extrairMensagensWebhook(event);

  if (mensagens.length > 1) {
    const resultados: unknown[] = [];

    for (const mensagem of mensagens) {
      const response = await processarWebhookWhatsapp({ message: mensagem });
      resultados.push(await response.json().catch(() => ({ ok: response.ok })));
    }

    return json({
      received: true,
      batch: true,
      total: mensagens.length,
      resultados,
    });
  }

  const message = mensagens[0] ?? extrairMensagemWebhook(event);
  if (!mensagemValida(message)) {
    const reason = motivoMensagemInvalida(message);
    console.info("[whatsapp] webhook_ignorado", {
      reason,
      eventKeys: Object.keys(event ?? {}),
      messageKeys: message ? Object.keys(message) : [],
    });

    return json({ received: true, ignored: true, reason });
  }

  const telefone = normalizarTelefone(message.chatid);
  const texto = message.text.trim();
  const nomeWhatsapp = nomeClienteSeguro(message.senderName ?? message.pushName);
  const metadata = metadataMensagem(message);
  const conversaInicial = await buscarOuCriarConversa(telefone);
  const clienteWhatsappInicial = await salvarClienteWhatsappInicial({ telefone, nomeWhatsapp });

  if (nomeWhatsapp && !nomeClienteSeguro(conversaInicial.nome_cliente)) {
    await upsertConversa({
      telefone,
      historico: conversaInicial.historico,
      nome_cliente: nomeWhatsapp,
      aguardando_humano: conversaInicial.aguardando_humano,
      ia_ativa: conversaInicial.ia_ativa,
      estagio: conversaInicial.estagio,
      atualizado_em: new Date().toISOString(),
    });
  }

  if (message.fromMe) {
    const conversaRegistrada = await registrarMensagemHistorico(
      conversaInicial,
      "assistant",
      texto,
      metadata,
    );
    agendarTrackingPedidosWhatsapp(conversaRegistrada);

    return json({
      received: true,
      ignored: true,
      reason: "mensagem_enviada_pela_propria_instancia_registrada",
    });
  }

  const solicitouPixNaMensagem = pediuPix(texto);
  if (solicitouPixNaMensagem) {
    logPix("whatsapp", "solicitacao_recebida", {
      telefone: telefoneLog(telefone),
      conversa_chatid_valido: Boolean(message.chatid),
    });
  }
  // Copia a midia (imagem/PDF) para o storage permanente enquanto ainda esta
  // fresca na UazAPI, antes que expire. A mensagem ja entra no historico com a
  // URL estavel, garantindo exibicao no chat e reanalise futura do comprovante.
  let metadataFinal = metadata;
  if (ehMidiaComprovantePersistivel(metadata)) {
    const persistida = await persistirMidiaComprovante({
      telefone,
      id: metadata.id,
      mediaUrl: metadata.mediaUrl,
      mimeType: metadata.mimeType,
      messageType: metadata.messageType,
      fileName: metadata.fileName,
    });
    if (persistida) {
      metadataFinal = {
        ...metadata,
        mediaUrl: persistida.url,
        mimeType: persistida.mimeType ?? metadata.mimeType,
      };
    }
  }

  const conversa = await registrarMensagemCliente(conversaInicial, texto, metadataFinal);
  const comprovanteConfirmado = await tentarConfirmarPagamentoPorComprovante({
    telefone,
    texto,
    conversa,
    metadata: metadataFinal,
  });

  if (comprovanteConfirmado) {
    return json({ received: true, responded: true, pagamento_confirmado: true });
  }

  const cupomMensagemAtual = extrairCupomTexto(texto);
  const solicitouPix = solicitouPixNaMensagem || pixSolicitadoRecentemente(conversa);
  const iaStatus = await buscarIaStatus();
  const iaLigadaNestaConversa = conversa.ia_ativa === true;
  const iaDesligadaNestaConversa = conversa.ia_ativa === false;
  const deveIgnorarIa =
    iaDesligadaNestaConversa ||
    (iaStatus.globalDesativada && !iaLigadaNestaConversa) ||
    (conversa.aguardando_humano && !iaLigadaNestaConversa);

  if (deveIgnorarIa) {
    const motivo = iaDesligadaNestaConversa
      ? "ia_conversa_desativada"
      : iaStatus.globalDesativada
        ? "ia_global_desativada"
        : "aguardando_humano";

    if (solicitouPix) {
      logPix(
        "whatsapp",
        "solicitacao_ignorada",
        {
          telefone: telefoneLog(telefone),
          motivo,
        },
        "warn",
      );
    }
    agendarTrackingPedidosWhatsapp(conversa);

    return json({
      received: true,
      ignored: true,
      reason: motivo,
    });
  }

  const [cliente, pedidos, produtos, aprendizados, iaConfig] = await Promise.all([
    buscarClientePorTelefone(telefone),
    listarPedidos(),
    buscarProdutosDisponiveisPorTexto(texto, 5),
    buscarAprendizados(5),
    buscarIaPromptConfig(),
  ]);
  const textoComHistorico = [...conversa.historico.slice(-8), { role: "user", content: texto }]
    .map((mensagem) => mensagem.content)
    .join("\n");
  const fichasTecnicas = clientePediuFichaTecnica(texto)
    ? buscarRacoesTecnicasPorTexto(textoComHistorico, 3)
    : [];
  const pedidosRecentes = pedidosDoCliente(pedidos, telefone);
  if (solicitouPix) {
    logPix("whatsapp", "contexto_carregado", {
      telefone: telefoneLog(telefone),
      cliente_encontrado: Boolean(cliente),
      tem_endereco: Boolean(cliente?.endereco?.trim()),
      tem_bairro: Boolean(cliente?.bairro?.trim()),
      pedidos_recentes: pedidosRecentes.length,
      pedidos_pendentes_com_valor: pedidosRecentes.filter(
        (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
      ).length,
    });
  }

  if (cupomMensagemAtual && mensagemSomenteCupom(texto, cupomMensagemAtual)) {
    const cupom = await buscarCupomAtivo(cupomMensagemAtual);
    const respostaCupom = cupom
      ? `Cupom ${cupom.codigo} aplicado. Vou considerar ele no fechamento do pedido.`
      : `Nao encontrei esse cupom ativo. Confere o codigo e me manda de novo?`;
    const chatid = `${telefone}@s.whatsapp.net`;

    await Promise.all([
      enviarMensagemLonga(chatid, respostaCupom),
      adicionarMensagemConversa({
        id: conversa.id,
        mensagem: { role: "assistant", content: respostaCupom },
      }),
    ]);

    return json({
      received: true,
      responded: true,
      cupom: cupomMensagemAtual,
      cupom_valido: Boolean(cupom),
    });
  }

  const respostaIa = await gerarRespostaWhatsapp({
    mensagem: texto,
    config: iaConfig,
    contexto: {
      cliente: contextoCliente(cliente),
      conversa: {
        id: conversa.id,
        nome_cliente: nomeClienteSeguro(conversa.nome_cliente),
        aguardando_humano: conversa.aguardando_humano,
        estagio: conversa.estagio,
        historico_recente: conversa.historico.slice(-10),
      },
      pedidos_recentes: pedidosRecentes,
      produtos_relevantes: produtos.map(
        ({ estoque: _estoque, precoCompra: _precoCompra, ...produto }) => produto,
      ),
      fichas_tecnicas_relevantes: fichasTecnicas,
      horario_atendimento: horarioAtendimento(),
      aprendizados,
    },
  });
  const handoffSolicitado = /\[HANDOFF\]/i.test(respostaIa);
  const termoProcurado = extrairProdutoProcurado(respostaIa);
  if (termoProcurado) {
    registrarProdutoProcurado({
      termo: termoProcurado,
      telefone,
      nomeCliente: cliente?.nome ?? nomeClienteSeguro(message.senderName ?? message.pushName),
      contexto: texto,
    }).catch((error) => {
      console.error("[whatsapp] erro_registrar_produto_procurado", erroLog(error));
    });
  }
  const cadastroIa = extrairCadastroCliente(respostaIa);
  const cadastroTexto = solicitouPix ? extrairEnderecoDoHistorico(conversa, texto) : null;
  const cadastro =
    cadastroIa || cadastroTexto
      ? {
          ...cadastroTexto,
          ...cadastroIa,
        }
      : null;
  const clienteSalvo = cadastro
    ? await salvarCadastroCliente({
        telefone,
        nome: cadastro.nome ?? cliente?.nome ?? clienteWhatsappInicial?.nome ?? nomeWhatsapp,
        endereco: cadastro.endereco,
        bairro: cadastro.bairro,
        pets: cadastro.pets,
      })
    : (cliente ?? clienteWhatsappInicial);
  const dadosObservados = extrairDadosObservados(respostaIa);
  if (dadosObservados) {
    void salvarDadosObservadosCliente({
      clienteId: clienteSalvo?.id,
      telefone,
      dados: {
        ...dadosObservados,
        mensagemAtual: texto,
      },
      resumo: [
        dadosObservados.necessidade,
        dadosObservados.produto,
        dadosObservados.racao,
        dadosObservados.pets,
        dadosObservados.especie,
        dadosObservados.fase,
        dadosObservados.idade,
        dadosObservados.peso,
        dadosObservados.porte,
        dadosObservados.castrado,
        dadosObservados.cidade,
        dadosObservados.bairro,
        dadosObservados.consumo,
        dadosObservados.duracao,
        dadosObservados.restricoes,
      ]
        .filter(Boolean)
        .join(" | "),
      confianca: 0.7,
    }).catch((error) => {
      console.error("[whatsapp] erro_salvar_dados_observados", erroLog(error));
    });
  }

  const respostaPreAtendimento = limparRespostaTecnica(respostaIa);
  const chatidPreAtendimento = `${telefone}@s.whatsapp.net`;

  await Promise.all([
    enviarMensagemLonga(chatidPreAtendimento, respostaPreAtendimento),
    adicionarMensagemConversa({
      id: conversa.id,
      mensagem: { role: "assistant", content: respostaPreAtendimento },
    }),
  ]);

  if (handoffSolicitado) {
    await atualizarConversaAguardandoHumano({
      id: conversa.id,
      aguardandoHumano: true,
      iaAtiva: false,
    });
  }

  agendarTrackingPedidosWhatsapp({
    ...conversa,
    historico: [
      ...conversa.historico,
      {
        role: "assistant",
        content: respostaPreAtendimento,
      },
    ],
  });

  return json({
    received: true,
    responded: true,
    pre_atendimento: true,
    handoff: handoffSolicitado,
  });
}

export const Route = createFileRoute("/api/webhook/whatsapp")({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          webhook: "uazapi_whatsapp",
          message: "Webhook ativo. A UazAPI deve enviar POST para esta URL.",
        }),
      POST: async ({ request }) => {
        try {
          return await processarWebhookWhatsapp((await request.json()) as UazapiWebhook);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          logPix("whatsapp", "falha_webhook", { erro: erroLog(error) }, "error");

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
