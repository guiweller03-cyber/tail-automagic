import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  cancelarAprovacaoRecompra,
  enviarAprovacaoRecompra,
  janelaRecompraSegura,
  sincronizarAprovacoesRecompra,
} from "@/lib/recompra-aprovacoes";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export const Route = createFileRoute("/api/crm/recompra-aprovacoes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const janelaDias = janelaRecompraSegura(Number(url.searchParams.get("janelaDias")));
          return json({
            ok: true,
            janelaDias,
            ...(await sincronizarAprovacoesRecompra(janelaDias)),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Aprovação obrigatória" }, { status: 400 });
          }

          if (body.acao === "enviar") {
            return json({
              ok: true,
              ...(await enviarAprovacaoRecompra(
                body.id,
                typeof body.mensagem === "string" ? body.mensagem : undefined,
              )),
            });
          }
          if (body.acao === "cancelar") {
            return json({ ok: true, aprovacao: await cancelarAprovacaoRecompra(body.id) });
          }

          return json({ ok: false, erro: "Ação inválida" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
