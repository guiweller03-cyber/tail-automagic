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

export const Route = createFileRoute("/api/mercadopago/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const event = (await request.json()) as MercadoPagoWebhook;

          if (event.type !== "payment" || !event.data?.id) {
            return json({ received: true });
          }

          const pagamento = await buscarPagamentoMercadoPago(event.data.id);

          if (pagamento.status === "approved" && pagamento.external_reference) {
            await confirmarPagamentoPixPedido(pagamento.external_reference);
          }

          return json({ received: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
