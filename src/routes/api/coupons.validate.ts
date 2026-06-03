import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { validarCupomCheckout } from "@/lib/indicacoes-supabase";

export const Route = createFileRoute("/api/coupons/validate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { code?: string; user_id?: string };
        if (!body.code?.trim() || !body.user_id?.trim()) {
          return Response.json({ valid: false, error: "code e user_id sao obrigatorios" }, { status: 400 });
        }

        return Response.json(await validarCupomCheckout(body.code));
      },
    },
  },
});
