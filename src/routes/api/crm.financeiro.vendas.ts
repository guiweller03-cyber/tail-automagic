import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { financeiroErrorMessage, listarVendasFinanceiras } from "@/lib/financeiro-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/crm/financeiro/vendas")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const vendas = await listarVendasFinanceiras();
          return json({
            ok: true,
            vendas,
            total: vendas.length,
            atualizadoEm: new Date().toISOString(),
          });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
