import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  listarRecompraPrevista,
  marcarRecompraContato,
  marcarRecompraTravada,
  recalcularTodasRecompras,
  registrarRecompraManual,
  salvarModeloRecompraRacao,
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
      PUT: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;

          if (body.tipo === "modelo_racao") {
            return json(
              await salvarModeloRecompraRacao({
                sku: String(body.sku ?? ""),
                produtoNome: typeof body.produtoNome === "string" ? body.produtoNome : undefined,
                diasRecompra: Number(body.diasRecompra),
                consumoDiarioG:
                  body.consumoDiarioG === undefined || body.consumoDiarioG === ""
                    ? undefined
                    : Number(body.consumoDiarioG),
                ativo: body.ativo !== false,
              }),
            );
          }

          if (body.tipo === "venda_manual") {
            const petNomes = Array.isArray(body.petNomes)
              ? body.petNomes.filter((pet): pet is string => typeof pet === "string")
              : undefined;
            return json(
              await registrarRecompraManual({
                clienteId: String(body.clienteId ?? ""),
                sku: String(body.sku ?? ""),
                petNome: String(body.petNome ?? ""),
                petNomes,
                modoDistribuicao:
                  body.modoDistribuicao === "por_pet" ? "por_pet" : "compartilhada",
                compraEm: String(body.compraEm ?? ""),
                diasRecompra: Number(body.diasRecompra),
                quantidade:
                  body.quantidade === undefined || body.quantidade === ""
                    ? undefined
                    : Number(body.quantidade),
                pesoKg:
                  body.pesoKg === undefined || body.pesoKg === "" ? undefined : Number(body.pesoKg),
                consumoDiarioG:
                  body.consumoDiarioG === undefined || body.consumoDiarioG === ""
                    ? undefined
                    : Number(body.consumoDiarioG),
                produtoNome: typeof body.produtoNome === "string" ? body.produtoNome : undefined,
              }),
              { status: 201 },
            );
          }

          return json({ ok: false, erro: "Tipo invalido" }, { status: 400 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
