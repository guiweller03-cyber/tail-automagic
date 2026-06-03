import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { processarWebhookMercadoPago } from "./webhook.pagamento";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await processarWebhookMercadoPago(await request.json());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
