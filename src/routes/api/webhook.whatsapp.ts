import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { gerarPixPedido } from "@/lib/mercadopago";
import { gerarRespostaWhatsapp, limparRespostaCliente } from "@/lib/openai";
import { buscarRacoesTecnicasPorTexto, clientePediuFichaTecnica } from "@/lib/racoes-tecnicas";
import { buscarCupomAtivo, extrairCupomTexto } from "@/lib/indicacoes-supabase";
import { salvarDadosObservadosCliente } from "@/lib/recompra-supabase";
import {
  adicionarMensagemConversa,
  atualizarPedidoPixMercadoPago,
  buscarAprendizados,
  buscarClientePorTelefone,
  buscarConversaPorTelefone,
  buscarIaStatus,
  buscarIaPromptConfig,
  buscarProdutosDisponiveisPorTexto,
  criarPedidoPixPendente,
  listarPedidos,
  registrarPedidoDoWhatsapp,
  registrarProdutoProcurado,
  salvarCadastroCliente,
  upsertConversa,
  type ClienteCadastro,
  type Conversa,
  type PedidoCrm,
} from "@/lib/supabase";
import { enviarMensagemLonga } from "@/lib/uazapi";
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
        imageMessage?: { caption?: string; mimetype?: string; fileName?: string; url?: string; fileURL?: string };
        videoMessage?: { caption?: string; mimetype?: string; fileName?: string; url?: string; fileURL?: string };
        documentMessage?: { caption?: string; fileName?: string; mimetype?: string; url?: string; fileURL?: string };
        audioMessage?: { mimetype?: string; fileName?: string; url?: string; fileURL?: string } | unknown;
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

type UazapiWebhook = {
  body?: { message?: UazapiMessage; data?: UazapiPayload };
  message?: UazapiMessage;
  Message?: UazapiMessage;
  data?: UazapiPayload;
  Data?: UazapiPayload;
  messages?: UazapiMessage[];
  Messages?: UazapiMessage[];
};

type UazapiPayload =
  | UazapiMessage
  | UazapiMessage[]
  | { messages?: UazapiMessage[]; Messages?: UazapiMessage[]; message?: UazapiMessage; Message?: UazapiMessage; data?: UazapiPayload; Data?: UazapiPayload };

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
  if (tipo.includes("document")) return message.fromMe ? "[Documento enviado]" : "[Documento recebido]";
  if (tipo.includes("sticker")) return message.fromMe ? "[Figurinha enviada]" : "[Figurinha recebida]";
  if (tipo.includes("location")) return message.fromMe ? "[Localizacao enviada]" : "[Localizacao recebida]";
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
    stringFromContent(message.content, ["fileURL", "fileUrl", "mediaUrl", "mediaURL", "downloadUrl", "downloadURL", "URL", "url"]) ??
    stringFromContent(message.message, ["fileURL", "fileUrl", "mediaUrl", "mediaURL", "downloadUrl", "downloadURL", "URL", "url"])
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

  return (message.mediaKey ?? stringFromContent(message.content, ["mediaKey"]) ?? stringFromContent(message.message, ["mediaKey"]))?.trim();
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

  const container = payload as Exclude<UazapiPayload, UazapiMessage[]>;
  const nested = [
    ...(Array.isArray(container.messages) ? container.messages : []),
    ...(Array.isArray(container.Messages) ? container.Messages : []),
    container.message,
    container.Message,
    ...extrairMensagensPayload(container.data),
    ...extrairMensagensPayload(container.Data),
  ].filter((message): message is UazapiMessage => Boolean(message));

  return nested.length > 0 ? nested : [container as UazapiMessage];
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
    produto: extrairCampoMarcador(marcador, "produto"),
    consumo: extrairCampoMarcador(marcador, "consumo"),
    duracao: extrairCampoMarcador(marcador, "duracao"),
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
  if (
    messageId &&
    conversa.historico.some((mensagem) => mensagem.id === messageId)
  ) {
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

async function registrarPedidoPixPorHistorico({
  telefone,
  conversa,
  texto,
  nomeCliente,
}: {
  telefone: string;
  conversa: Conversa;
  texto: string;
  nomeCliente?: string | null;
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

  const pedidoSintetico = `[PEDIDO] produto="${produto.nome}"; quantidade=1; pagamento="Pix"; total="${brl(
    produto.preco,
  )}"\n${texto}`;
  const pedido = await registrarPedidoDoWhatsapp({
    telefone,
    texto: pedidoSintetico,
    nomeCliente,
    formaPagamento: "Pix",
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
    await registrarMensagemHistorico(conversaInicial, "assistant", texto, metadata);

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
  const conversa = await registrarMensagemCliente(conversaInicial, texto, metadata);
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

  const temPedidoPendente = pedidosRecentes.some(
    (pedido) => pedido.statusPagamento !== "pago" && pedido.total > 0,
  );
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
      aprendizados,
    },
  });
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
  const temPedido = /\[PEDIDO\]/i.test(respostaIa);
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
      resumo: [dadosObservados.produto, dadosObservados.pets, dadosObservados.consumo, dadosObservados.duracao]
        .filter(Boolean)
        .join(" | "),
      confianca: 0.7,
    }).catch((error) => {
      console.error("[whatsapp] erro_salvar_dados_observados", erroLog(error));
    });
  }
  const cupomRecente = cupomRecenteDaConversa(conversa, texto);
  const pedidoMarcado = temPedido
    ? await registrarPedidoDoWhatsapp({
        telefone,
        texto: `${respostaIa}\n${texto}${cupomRecente ? `\ncupom ${cupomRecente}` : ""}`,
        nomeCliente: cliente?.nome ?? clienteWhatsappInicial?.nome ?? nomeWhatsapp,
        formaPagamento: extrairPagamentoPedido(respostaIa),
      })
    : null;
  const pedidoRegistrado =
    pedidoMarcado ??
    (solicitouPix && !temPedidoPendente
      ? await registrarPedidoPixPorHistorico({
          telefone,
          conversa,
          texto,
          nomeCliente: cliente?.nome ?? clienteWhatsappInicial?.nome ?? nomeWhatsapp,
        })
      : null);

  if (solicitouPix && pedidoRegistrado) {
    logPix("whatsapp", "pedido_processado_antes_pix", {
      telefone: telefoneLog(telefone),
      registrado: pedidoRegistrado.registrado,
      motivo: pedidoRegistrado.motivo ?? null,
      venda_id: pedidoRegistrado.vendaId ?? null,
      total: pedidoRegistrado.total,
    });
  }

  const pedidoNovoParaPix =
    pedidoRegistrado?.registrado && pedidoRegistrado.vendaId && pedidoRegistrado.total > 0
      ? [
          {
            id: pedidoRegistrado.vendaId,
            total: pedidoRegistrado.total,
            statusPagamento: "pendente",
          },
        ]
      : [];
  const pedidosParaPix = pedidoNovoParaPix.length > 0 ? pedidoNovoParaPix : pedidosRecentes;
  const resultadoPix =
    solicitouPix && pedidosParaPix.length > 0
      ? await tentarGerarPix({
          telefone,
          cliente: clienteSalvo,
          pedidos: pedidosParaPix,
        })
      : undefined;

  if (resultadoPix) {
    logPix(
      "whatsapp",
      resultadoPix.pix_gerado ? "pix_pronto_para_resposta" : "pix_nao_gerado",
      {
        telefone: telefoneLog(telefone),
        erro: resultadoPix.erro ?? null,
        mensagem: resultadoPix.mensagem ?? null,
        status_pix: resultadoPix.status_pix ?? null,
      },
      resultadoPix.pix_gerado ? "info" : "warn",
    );
  }

  const respostaLimpa = respostaPixSemChave(
    resultadoPix?.pix_gerado ? "Segue a chave Pix do pedido." : limparRespostaTecnica(respostaIa),
    resultadoPix,
  );
  const mensagensCliente = montarMensagensPix(respostaLimpa, resultadoPix);
  const respostaCliente = mensagensCliente.join("\n\n");
  const chatid = `${telefone}@s.whatsapp.net`;

  await Promise.all([
    (async () => {
      for (const mensagemCliente of mensagensCliente) {
        await enviarMensagemLonga(chatid, mensagemCliente);
      }
    })()
      .then((resultado) => {
        if (solicitouPix) {
          logPix("whatsapp", "resposta_enviada", {
            telefone: telefoneLog(telefone),
            pix_anexado: Boolean(resultadoPix?.pix_gerado),
          });
        }

        return resultado;
      })
      .catch((error) => {
        if (solicitouPix) {
          logPix(
            "whatsapp",
            "falha_envio_resposta",
            {
              telefone: telefoneLog(telefone),
              pix_anexado: Boolean(resultadoPix?.pix_gerado),
              erro: erroLog(error),
            },
            "error",
          );
        }

        throw error;
      }),
    adicionarMensagemConversa({
      id: conversa.id,
      mensagem: { role: "assistant", content: respostaCliente },
    }),
  ]);

  return json({ received: true, responded: true });
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
