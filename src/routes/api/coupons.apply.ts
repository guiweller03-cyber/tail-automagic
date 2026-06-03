import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { aplicarCupomCheckout } from "@/lib/indicacoes-supabase";

function numberField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const Route = createFileRoute("/api/coupons/apply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if (
          typeof body.coupon_code !== "string" ||
          typeof body.order_id !== "string" ||
          typeof body.user_id !== "string"
        ) {
          return Response.json({ ok: false, erro: "coupon_code, order_id e user_id sao obrigatorios" }, { status: 400 });
        }

        return Response.json(
          await aplicarCupomCheckout({
            coupon_code: body.coupon_code,
            order_id: body.order_id,
            user_id: body.user_id,
            order_value: numberField(body.order_value),
          }),
        );
      },
    },
  },
});
