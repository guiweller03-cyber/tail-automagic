import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { aplicarReferralCheckout } from "@/lib/indicacoes-supabase";

function numberField(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const Route = createFileRoute("/api/referrals/apply")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if (
          typeof body.referral_code !== "string" ||
          typeof body.order_id !== "string" ||
          typeof body.referred_id !== "string"
        ) {
          return Response.json({ ok: false, erro: "referral_code, order_id e referred_id sao obrigatorios" }, { status: 400 });
        }

        return Response.json(
          await aplicarReferralCheckout({
            referral_code: body.referral_code,
            order_id: body.order_id,
            referred_id: body.referred_id,
            order_value: numberField(body.order_value),
          }),
        );
      },
    },
  },
});
