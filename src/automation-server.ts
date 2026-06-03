import http from "node:http";

import { processarWebhookMercadoPago } from "./routes/api/webhook.pagamento";
import { processarWebhookWhatsapp } from "./routes/api/webhook.whatsapp";

const port = Number(process.env.PORT ?? 3001);
const requiredEnv = [
  "UAZAPI_URL",
  "UAZAPI_TOKEN",
  "OPENAI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "MP_ACCESS_TOKEN",
  "MP_WEBHOOK_URL",
];

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  return body ? JSON.parse(body) : {};
}

function mergeQueryParams(body: unknown, params: URLSearchParams): Record<string, unknown> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const queryPayload = Object.fromEntries(params.entries());

  return { ...queryPayload, ...payload };
}

async function sendNodeResponse(response: http.ServerResponse, fetchResponse: Response) {
  response.statusCode = fetchResponse.status;
  fetchResponse.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await fetchResponse.arrayBuffer()));
}

function json(response: http.ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function handle(request: http.IncomingMessage, response: http.ServerResponse) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    const envStatus = Object.fromEntries(
      requiredEnv.map((name) => [name, Boolean(process.env[name])]),
    );
    return json(response, 200, {
      ok: true,
      service: "mundo-pet-automacao",
      env: envStatus,
    });
  }

  if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
    return json(response, 200, {
      ok: true,
      webhook: "uazapi_whatsapp",
      message: "Webhook ativo. A UazAPI deve enviar POST para esta URL.",
    });
  }

  if (request.method === "GET" && url.pathname === "/webhooks/mercadopago") {
    return json(response, 200, {
      ok: true,
      webhook: "mercado_pago_pagamento",
      message: "Webhook ativo. O Mercado Pago deve enviar POST para esta URL.",
    });
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/webhooks/whatsapp" || url.pathname === "/api/webhook/whatsapp")
  ) {
    return sendNodeResponse(response, await processarWebhookWhatsapp(await readJson(request)));
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/webhooks/mercadopago" ||
      url.pathname === "/api/webhook/pagamento" ||
      url.pathname === "/api/mercadopago/webhook")
  ) {
    const body = mergeQueryParams(await readJson(request), url.searchParams);

    return sendNodeResponse(response, await processarWebhookMercadoPago(body));
  }

  return json(response, 404, { ok: false, error: "not_found" });
}

http
  .createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error(error);
      json(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    });
  })
  .listen(port, "0.0.0.0", () => {
    const missingEnv = requiredEnv.filter((name) => !process.env[name]);
    console.log(`Automacao Mundo Pet ouvindo na porta ${port}`);
    if (missingEnv.length > 0) {
      console.warn("Variaveis obrigatorias ausentes:", missingEnv.join(", "));
    }
  });
