function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

async function requestUazAPI<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = requireEnv("UAZAPI_URL").replace(/\/$/, "");
  const token = requireEnv("UAZAPI_TOKEN");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`UazAPI request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

async function requestUazAPIGet<T>(path: string): Promise<T> {
  const baseUrl = requireEnv("UAZAPI_URL").replace(/\/$/, "");
  const token = requireEnv("UAZAPI_TOKEN");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      token,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`UazAPI request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

function normalizarNumero(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

const MAX_WHATSAPP_TEXT = 900;
const WHATSAPP_SEND_GAP_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dividirTextoWhatsapp(texto: string, maxChars = MAX_WHATSAPP_TEXT): string[] {
  const normalizado = texto.trim().replace(/\r\n/g, "\n");
  if (!normalizado) return [];
  if (normalizado.length <= maxChars) return [normalizado];

  const partes: string[] = [];
  let restante = normalizado;

  while (restante.length > maxChars) {
    const corteIdeal = restante.lastIndexOf("\n\n", maxChars);
    const corteLinha = restante.lastIndexOf("\n", maxChars);
    const corteEspaco = restante.lastIndexOf(" ", maxChars);
    const corte = Math.max(corteIdeal, corteLinha, corteEspaco);
    const pontoCorte = corte > 0 ? corte : maxChars;

    partes.push(restante.slice(0, pontoCorte).trim());
    restante = restante.slice(pontoCorte).trimStart();
  }

  if (restante) partes.push(restante);

  return partes.filter(Boolean);
}

export async function enviarMensagem(chatid: string, text: string) {
  const number = normalizarNumero(chatid);

  return requestUazAPI("/send/text", { number, text });
}

export async function enviarMensagemLonga(chatid: string, text: string) {
  const partes = dividirTextoWhatsapp(text);
  if (partes.length === 0) return null;

  let resultado: unknown = null;
  for (const [index, parte] of partes.entries()) {
    if (index > 0) await delay(WHATSAPP_SEND_GAP_MS);
    resultado = await enviarMensagem(chatid, parte);
  }

  return resultado;
}

type TipoMidiaUazapi = "image" | "video" | "audio" | "ptt" | "document";

/**
 * Determina o `type` exigido pelo endpoint /send/media da UazAPI a partir do
 * mimetype. Sem esse campo a UazAPI trata o envio como mensagem de texto e
 * retorna "missing text for text message".
 */
function tipoMidiaUazapi(mimetype?: string, ptt?: boolean): TipoMidiaUazapi {
  if (ptt) return "ptt";

  const mime = mimetype?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  return "document";
}

export async function enviarMidia(
  chatid: string,
  mediaUrl: string,
  caption?: string,
  options?: { mimetype?: string; fileName?: string },
) {
  const number = normalizarNumero(chatid);
  const type = tipoMidiaUazapi(options?.mimetype);

  return requestUazAPI("/send/media", {
    number,
    type,
    file: mediaUrl,
    text: caption ?? "",
    ...(type === "document" && options?.fileName
      ? { docName: options.fileName, filename: options.fileName }
      : {}),
  });
}

export async function enviarMidiaBase64(
  chatid: string,
  base64: string,
  caption?: string,
  options?: { fileName?: string; mimetype?: string; ptt?: boolean },
) {
  const number = normalizarNumero(chatid);
  const type = tipoMidiaUazapi(options?.mimetype, options?.ptt);

  // Envia o base64 como data URI com o mimetype correto. Sem essa informacao a
  // UazAPI nao sabe o formato original e pode reencodar a imagem em qualidade
  // baixa; o data URI preserva a qualidade da foto enviada.
  const mime = options?.mimetype?.trim();
  const file = base64.startsWith("data:")
    ? base64
    : mime
      ? `data:${mime};base64,${base64}`
      : base64;

  return requestUazAPI("/send/media", {
    number,
    type,
    file,
    text: caption ?? "",
    ...(type === "document" && options?.fileName
      ? { docName: options.fileName, filename: options.fileName }
      : {}),
  });
}

export async function verificarNumero(phone: string) {
  return requestUazAPI("/chat/check", { phone });
}

export type ChatWhatsApp = {
  wa_chatid?: string;
  wa_isGroup?: boolean;
  wa_contactName?: string;
  wa_name?: string;
  name?: string;
  phone?: string;
  wa_lastMsgTimestamp?: number;
  wa_lastMessageTextVote?: string;
  wa_lastMessageType?: string;
};

export type MensagemWhatsApp = {
  id?: string;
  messageid?: string;
  chatid?: string;
  sender?: string;
  senderName?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  messageType?: string;
  messageTimestamp?: number;
  status?: string;
  text?: string;
  message?: unknown;
  content?: unknown;
  wasSentByApi?: boolean;
  fileURL?: string;
  fileUrl?: string;
  mediaUrl?: string;
  mediaURL?: string;
  mimetype?: string;
  mimeType?: string;
  fileName?: string;
  mediaKey?: string;
};

/**
 * Baixa a versao descriptografada de uma midia do WhatsApp via UazAPI.
 * As URLs originais (mmg.whatsapp.net) vem criptografadas e nao podem ser
 * lidas diretamente; este endpoint retorna um link servido pela UazAPI
 * (ex.: https://<host>/files/...jpg) que pode ser baixado normalmente.
 */
export async function baixarMidiaUazapi(
  messageId: string,
): Promise<{ fileURL: string; mimetype?: string } | null> {
  const id = messageId?.trim();
  if (!id) return null;

  try {
    const response = await requestUazAPI<{ fileURL?: string; mimetype?: string }>(
      "/message/download",
      { id },
    );
    const fileURL = response.fileURL?.trim();

    return fileURL ? { fileURL, mimetype: response.mimetype } : null;
  } catch (error) {
    console.error(
      "[uazapi] erro_baixar_midia",
      error instanceof Error ? error.message : String(error),
    );

    return null;
  }
}

/**
 * Resolve a melhor URL de imagem para analise (ex.: comprovante Pix).
 * Se a midia for do WhatsApp (criptografada) ou visual, baixa a versao
 * descriptografada via UazAPI. URLs publicas/ja descriptografadas sao
 * usadas direto. Retorna undefined quando nao ha imagem utilizavel.
 */
export async function urlMidiaDescriptografada(opts: {
  id?: string;
  mediaUrl?: string;
  mimeType?: string;
  messageType?: string;
}): Promise<string | undefined> {
  const mediaUrl = opts.mediaUrl?.trim();

  // URL ja persistida no nosso storage (Supabase) e estavel: usa direto, sem
  // tentar baixar de novo da UazAPI (que pode ter expirado).
  if (mediaUrl && /\/storage\/v1\/object\/public\//.test(mediaUrl)) {
    return mediaUrl;
  }

  const ehWhatsapp = mediaUrl ? /whatsapp\.net/i.test(mediaUrl) : false;
  const tipo = opts.messageType?.toLowerCase() ?? "";
  const ehVisual =
    (opts.mimeType?.toLowerCase().startsWith("image/") ?? false) ||
    tipo.includes("image") ||
    tipo.includes("document");

  if (opts.id && (ehWhatsapp || ehVisual)) {
    const baixada = await baixarMidiaUazapi(opts.id);
    if (baixada?.fileURL) return baixada.fileURL;
  }

  if (mediaUrl && !ehWhatsapp) return mediaUrl;

  return undefined;
}

export async function listarChatsWhatsApp({
  limit = 50,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<ChatWhatsApp[]> {
  const response = await requestUazAPI<
    ChatWhatsApp[] | { chats?: ChatWhatsApp[]; pagination?: unknown }
  >("/chat/find", {
    limit,
    offset,
    sort: "-wa_lastMsgTimestamp",
    wa_isGroup: false,
  });

  return Array.isArray(response) ? response : (response.chats ?? []);
}

export async function buscarMensagensChatWhatsApp(
  chatid: string,
  limit = 80,
): Promise<MensagemWhatsApp[]> {
  const response = await requestUazAPI<
    MensagemWhatsApp[] | { messages?: MensagemWhatsApp[]; returnedMessages?: number }
  >("/message/find", {
    chatid,
    limit,
    offset: 0,
  });
  const messages = Array.isArray(response) ? response : (response.messages ?? []);

  return [...messages].sort((a, b) => (a.messageTimestamp ?? 0) - (b.messageTimestamp ?? 0));
}

export type ContatoWhatsApp = {
  jid?: string;
  contact_name?: string;
  contact_FirstName?: string;
  first_name?: string;
  name?: string;
  pushname?: string;
};

export async function listarContatosWhatsApp(): Promise<ContatoWhatsApp[]> {
  const response = await requestUazAPIGet<ContatoWhatsApp[] | { contacts?: ContatoWhatsApp[] }>(
    "/contacts",
  );
  return Array.isArray(response) ? response : (response.contacts ?? []);
}
