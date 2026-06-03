import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { garantirReferralCode } from "@/lib/indicacoes-supabase";

export const Route = createFileRoute("/api/referrals/my-code")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get("user_id");
        if (!userId) {
          return Response.json({ ok: false, erro: "user_id obrigatorio nesta aplicacao" }, { status: 400 });
        }

        const referral_code = await garantirReferralCode(
          userId,
          url.searchParams.get("name"),
          url.searchParams.get("email"),
        );
        return Response.json({ referral_code });
      },
    },
  },
});
