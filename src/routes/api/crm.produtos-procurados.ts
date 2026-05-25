import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { listarProdutosProcurados } from "@/lib/supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/crm/produtos-procurados")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarProdutosProcurados());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
