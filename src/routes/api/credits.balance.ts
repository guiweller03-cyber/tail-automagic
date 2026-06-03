import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buscarSaldoCreditos } from "@/lib/indicacoes-supabase";

export const Route = createFileRoute("/api/credits/balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = new URL(request.url).searchParams.get("user_id");
        if (!userId) {
          return Response.json({ ok: false, erro: "user_id obrigatorio nesta aplicacao" }, { status: 400 });
        }

        return Response.json({ amount: await buscarSaldoCreditos(userId) });
      },
    },
  },
});
