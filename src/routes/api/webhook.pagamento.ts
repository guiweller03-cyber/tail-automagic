import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buscarPagamentoMercadoPago } from "@/lib/mercadopago";
import { confirmarPagamentoPixPedido } from "@/lib/pagamento-confirmado";

type MercadoPagoWebhook = {
  type?: string;
  topic?: string;
  action?: string;
  id?: string;
  "data.id"?: string;
  resource?: string;
  data?: {
    id?: string;
  };
};

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function processarWebhookMercadoPago(event: MercadoPagoWebhook): Promise<Response> {
  const paymentId =
    event.data?.id ??
    event["data.id"] ??
    (event.topic === "payment" ? event.id : undefined) ??
    event.resource?.match(/\/payments\/([^/?#]+)/i)?.[1];
  const isPayment =
    event.type === "payment" ||
    event.topic === "payment" ||
    event.action?.startsWith("payment.") ||
    Boolean(paymentId);

  if (!isPayment || !paymentId) {
    console.info("[mercadopago] webhook_ignorado", {
      eventKeys: Object.keys(event ?? {}),
      type: event.type,
      topic: event.topic,
      action: event.action,
    });

    return json({ received: true, ignored: true });
  }

  const pagamento = await buscarPagamentoMercadoPago(paymentId);

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
