import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buscarPagamentoMercadoPago } from "@/lib/mercadopago";
import { confirmarPagamentoPixPedido } from "@/lib/pagamento-confirmado";

type MercadoPagoWebhook = {
  type?: string;
  action?: string;
  data?: {
    id?: string;
  };
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

async function processarWebhookMercadoPago(event: MercadoPagoWebhook): Promise<Response> {
  if (event.type !== "payment" || !event.data?.id) {
    return json({ received: true, ignored: true });
  }

  const pagamento = await buscarPagamentoMercadoPago(event.data.id);

  if (pagamento.status === "approved" && pagamento.external_reference) {
    await confirmarPagamentoPixPedido(pagamento.external_reference);
  }

  return json({ received: true });
}

export const Route = createFileRoute("/api/webhook/pagamento")({
  server: {
    handlers: {
      GET: async () =>
        json({
          ok: true,
          webhook: "mercado_pago_pagamento",
          message: "Webhook ativo. O Mercado Pago deve enviar POST para esta URL.",
        }),
      POST: async ({ request }) => {
        try {
          return await processarWebhookMercadoPago((await request.json()) as MercadoPagoWebhook);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
