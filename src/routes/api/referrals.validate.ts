import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { validarReferralCode } from "@/lib/indicacoes-supabase";

export const Route = createFileRoute("/api/referrals/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { referral_code?: string; user_id?: string };
        if (!body.referral_code?.trim() || !body.user_id?.trim()) {
          return Response.json({ valid: false, error: "referral_code e user_id sao obrigatorios" }, { status: 400 });
        }

        const result = await validarReferralCode(body.referral_code, body.user_id);
        return Response.json({ valid: result.valid, discount_percent: 10 });
      },
    },
  },
});
