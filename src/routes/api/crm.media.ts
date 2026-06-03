import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;

  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

function mediaInfo(messageType: string, mimeType: string): string {
  const type = `${messageType} ${mimeType}`.toLowerCase();
  if (type.includes("image")) return "WhatsApp Image Keys";
  if (type.includes("audio") || type.includes("ptt")) return "WhatsApp Audio Keys";
  if (type.includes("video")) return "WhatsApp Video Keys";
  return "WhatsApp Document Keys";
}

async function deriveMediaKeys(mediaKey: string, info: string): Promise<{
  iv: Uint8Array;
  cipherKey: Uint8Array;
  macKey: Uint8Array;
}> {
  const inputKey = await crypto.subtle.importKey("raw", bytesBody(base64ToBytes(mediaKey)), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytesBody(new Uint8Array(32)),
      info: bytesBody(new TextEncoder().encode(info)),
    },
    inputKey,
    112 * 8,
  );
  const expanded = new Uint8Array(bits);

  return {
    iv: expanded.slice(0, 16),
    cipherKey: expanded.slice(16, 48),
    macKey: expanded.slice(48, 80),
  };
}

async function decryptWhatsappMedia({
  encrypted,
  mediaKey,
  messageType,
  mimeType,
}: {
  encrypted: Uint8Array;
  mediaKey: string;
  messageType: string;
  mimeType: string;
}): Promise<Uint8Array> {
  if (encrypted.byteLength <= 10) throw new Error("Arquivo de midia invalido");

  const { iv, cipherKey, macKey } = await deriveMediaKeys(mediaKey, mediaInfo(messageType, mimeType));
  const cipherText = encrypted.slice(0, -10);
  const receivedMac = encrypted.slice(-10);

  const hmacKey = await crypto.subtle.importKey("raw", bytesBody(macKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedMac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, bytesBody(concatBytes(iv, cipherText)))).slice(0, 10);
  if (!timingSafeEqual(receivedMac, expectedMac)) {
    throw new Error("Assinatura da midia invalida");
  }

  const aesKey = await crypto.subtle.importKey("raw", bytesBody(cipherKey), "AES-CBC", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: bytesBody(iv) }, aesKey, bytesBody(cipherText)));
}

function safeMimeType(value: string): string {
  const mimeType = value.split(";")[0]?.trim();
  return mimeType && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(mimeType)
    ? value.trim()
    : "application/octet-stream";
}

function isUazapiUrl(url: URL): boolean {
  const baseUrl = optionalEnv("UAZAPI_URL");
  if (!baseUrl) return false;

  try {
    return url.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isAllowedMediaUrl(url: URL): boolean {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.protocol === "https:" && url.hostname.endsWith("whatsapp.net")) return true;

  return isUazapiUrl(url);
}

function mediaFetchHeaders(url: URL): HeadersInit | undefined {
  if (!isUazapiUrl(url)) return undefined;

  return { token: requireEnv("UAZAPI_TOKEN") };
}

export const Route = createFileRoute("/api/crm/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const mediaUrl = url.searchParams.get("url")?.trim();
          const mediaKey = url.searchParams.get("mediaKey")?.trim();
          const messageType = url.searchParams.get("messageType")?.trim() ?? "";
          const mimeType = safeMimeType(url.searchParams.get("mimeType") ?? "");

          if (!mediaUrl) {
            return Response.json({ ok: false, erro: "url e obrigatoria" }, { status: 400 });
          }

          const parsed = new URL(mediaUrl);
          if (!isAllowedMediaUrl(parsed)) {
            return Response.json({ ok: false, erro: "url de midia nao permitida" }, { status: 400 });
          }

          const response = await fetch(parsed.toString(), {
            headers: mediaFetchHeaders(parsed),
          });
          if (!response.ok) {
            return Response.json({ ok: false, erro: "nao foi possivel baixar a midia" }, { status: 502 });
          }

          const responseMimeType = safeMimeType(response.headers.get("content-type") ?? mimeType);
          const encrypted = new Uint8Array(await response.arrayBuffer());
          const bytes = mediaKey
            ? await decryptWhatsappMedia({
                encrypted,
                mediaKey,
                messageType,
                mimeType: responseMimeType,
              })
            : encrypted;

          return new Response(bytesBody(bytes), {
            headers: {
              "content-type": responseMimeType,
              "cache-control": "private, max-age=3600",
            },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return Response.json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
