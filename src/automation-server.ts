import http from "node:http";

import { processarWebhookMercadoPago } from "./routes/api/webhook.pagamento";
import { processarWebhookWhatsapp, type UazapiWebhook } from "./routes/api/webhook.whatsapp";
import { comLoja, configuracaoLoja, lojaOperacional, type LojaId } from "./lib/loja-context";

const port = Number(process.env.PORT ?? 3001);
const requiredEnv = [
  "UAZAPI_URL",
  "UAZAPI_TOKEN",
  "UAZAPI_WEBHOOK_SECRET",
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
    return json(response, 200, { ok: true });
  }


  if (
    request.method === "POST" &&
    (url.pathname === "/webhooks/whatsapp" || url.pathname === "/api/webhook/whatsapp")
  ) {
    const loja = url.searchParams.get("loja");
    if (loja !== "loja1" && loja !== "loja2") return json(response, 400, { ok: false });
    const secret = comLoja(loja, () => configuracaoLoja("UAZAPI_WEBHOOK_SECRET"));
    const provided = url.searchParams.get("secret") ?? request.headers["x-webhook-secret"];
    if (!secret || typeof provided !== "string" || provided !== secret) {
      return json(response, 401, { ok: false });
    }
    if (!lojaOperacional(loja)) return json(response, 503, { ok: false });
    const payload = (await readJson(request)) as UazapiWebhook;
    return sendNodeResponse(
      response,
      await comLoja(loja as LojaId, () => processarWebhookWhatsapp(payload)),
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
        error: "Erro interno",
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

// O agendador de follow-ups roda em processo pm2 separado: ./followups-worker.mjs
// (sem imports de "./" / "@/", roda em Node puro). Foi tirado daqui porque esse
// servidor importa webhook.whatsapp.ts, que usa aliases "@/lib/..." que so
// resolvem via tsx/Vite — em alguns setups de VPS isso falhava silenciosamente e
// o agendador embutido aqui nunca rodava. Ver followups-worker.mjs para detalhes
// e o comando de start via pm2.
