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

export async function enviarMensagem(chatid: string, text: string) {
  const number = chatid.replace("@s.whatsapp.net", "");

  return requestUazAPI("/send/text", { number, text });
}

export async function enviarMidia(chatid: string, mediaUrl: string, caption?: string) {
  return requestUazAPI("/send/media", { chatid, mediaUrl, caption });
}

export async function enviarMidiaBase64(chatid: string, base64: string, caption?: string) {
  const number = chatid.replace("@s.whatsapp.net", "");

  return requestUazAPI("/send/media", { number, base64, caption });
}

export async function verificarNumero(phone: string) {
  return requestUazAPI("/chat/check", { phone });
}
