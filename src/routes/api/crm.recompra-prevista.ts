import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  listarRecompraPrevista,
  marcarRecompraContato,
  marcarRecompraTravada,
  recalcularTodasRecompras,
} from "@/lib/recompra-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/crm/recompra-prevista")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarRecompraPrevista());
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Previsao obrigatoria" }, { status: 400 });
          }

          if (body.tipo === "contatado") {
            await marcarRecompraContato(body.id, body.contatado === true);
            return json({ ok: true });
          }

          if (body.tipo === "travado") {
            await marcarRecompraTravada(body.id, body.travado === true);
            return json({ ok: true });
          }

          return json({ ok: false, erro: "Tipo invalido" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async () => {
        try {
          return json({ ok: true, ...(await recalcularTodasRecompras()) });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
