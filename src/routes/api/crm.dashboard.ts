import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { carregarDashboard } from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/crm/dashboard")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const dashboard = await carregarDashboard();

          return json(dashboard);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
