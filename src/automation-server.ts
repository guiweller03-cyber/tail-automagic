import http from "node:http";

import { processarWebhookMercadoPago } from "./routes/api/webhook.pagamento";
import { processarWebhookWhatsapp, type UazapiWebhook } from "./routes/api/webhook.whatsapp";
import { processarFollowupsVencidos } from "./lib/followups-runner";

const FOLLOWUP_POLL_MS = Number(process.env.FOLLOWUP_POLL_MS ?? 60_000);

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
    return sendNodeResponse(
      response,
      await processarWebhookWhatsapp((await readJson(request)) as UazapiWebhook),
    );
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
    iniciarAgendadorFollowups();
  });

/**
 * Agendador de follow-ups: a cada minuto varre os follow-ups pendentes ja
 * vencidos. Os de disparo automatico sao enviados; os de confirmacao ficam
 * prontos (com texto gerado pela IA quando preciso) aguardando o operador.
 * Um guard evita execucoes sobrepostas se um ciclo demorar.
 */
function iniciarAgendadorFollowups() {
  let rodando = false;

  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      const resultado = await processarFollowupsVencidos();
      if (resultado.total > 0) {
        console.log(
          `[followups] ${resultado.total} vencidos: ${resultado.enviados} enviados, ` +
            `${resultado.aguardando} aguardando confirmacao, ${resultado.erros} erros`,
        );
      }
    } catch (error) {
      console.error(
        "[followups] erro no ciclo:",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      rodando = false;
    }
  };

  setInterval(() => void tick(), FOLLOWUP_POLL_MS).unref();
  void tick();
  console.log(`Agendador de follow-ups ativo (a cada ${Math.round(FOLLOWUP_POLL_MS / 1000)}s)`);
}
