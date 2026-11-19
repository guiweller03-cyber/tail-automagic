import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getCurrentSession } from "./lib/auth";
import { comLoja, configuracaoLoja, lojaOperacional, type LojaId } from "./lib/loja-context";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      let loja: LojaId = "loja1";
      const webhookWhatsapp = pathname === "/api/webhook/whatsapp";
      const webhookPagamento = pathname === "/api/webhook/pagamento" || pathname === "/api/mercadopago/webhook";
      const rotaPublica = pathname.startsWith("/api/auth/") || webhookWhatsapp || webhookPagamento;

      if (pathname.startsWith("/api/") && !rotaPublica) {
        const session = await getCurrentSession(request);
        if (!session) return Response.json({ ok: false, erro: "Sessão expirada" }, { status: 401 });
        loja = session.loja;
        if (!["GET", "HEAD"].includes(request.method)) {
          const origin = request.headers.get("origin");
          if (origin && origin !== url.origin) {
            return Response.json({ ok: false, erro: "Origem inválida" }, { status: 403 });
          }
        }
        if (loja === "loja2" && pathname === "/api/crm/pix") {
          return Response.json({ ok: false, erro: "Pix automático indisponível na Loja Tijucas" }, { status: 403 });
        }
        if (!lojaOperacional(loja)) {
          return Response.json({ ok: false, erro: "Loja Tijucas aguardando configuração" }, { status: 503 });
        }
      }
      if (webhookWhatsapp && request.method === "POST") {
        const indicada = url.searchParams.get("loja");
        if (indicada !== "loja1" && indicada !== "loja2") {
          return Response.json({ ok: false, erro: "Loja inválida" }, { status: 400 });
        }
        loja = indicada;
        const secret = comLoja(loja, () => configuracaoLoja("UAZAPI_WEBHOOK_SECRET"));
        const fornecido = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret");
        if (!secret || !fornecido || secret.length !== fornecido.length ||
            [...secret].reduce((diff, char, index) => diff | (char.charCodeAt(0) ^ fornecido.charCodeAt(index)), 0) !== 0) {
          return Response.json({ ok: false, erro: "Webhook não autorizado" }, { status: 401 });
        }
        if (!lojaOperacional(loja)) return Response.json({ ok: false }, { status: 503 });
      }
      const handler = await getServerEntry();
      const response = await comLoja(loja, () => handler.fetch(request, env, ctx));
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
