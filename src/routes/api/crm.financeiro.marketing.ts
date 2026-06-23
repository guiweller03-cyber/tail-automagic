import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarMarketing,
  criarMarketing,
  financeiroErrorMessage,
  listarMarketing,
  removerMarketing,
  type GastoMktInput,
  type TipoMkt,
} from "@/lib/financeiro-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

const TIPOS: TipoMkt[] = ["meta_ads", "influenciador", "panfleto", "cupom", "brinde", "outros"];

function marketingInput(body: Record<string, unknown>): GastoMktInput {
  const tipo =
    typeof body.tipo === "string" && TIPOS.includes(body.tipo as TipoMkt)
      ? (body.tipo as TipoMkt)
      : "outros";
  return {
    data: typeof body.data === "string" ? body.data : new Date().toISOString().slice(0, 10),
    tipo,
    descricao: typeof body.descricao === "string" ? body.descricao : "",
    valor: typeof body.valor === "number" ? body.valor : Number(body.valor) || 0,
    resultado: typeof body.resultado === "string" ? body.resultado : undefined,
    roi:
      body.roi === undefined || body.roi === null
        ? undefined
        : typeof body.roi === "number"
          ? body.roi
          : Number(body.roi) || undefined,
    campanha: typeof body.campanha === "string" ? body.campanha : undefined,
    pago: typeof body.pago === "boolean" ? body.pago : true,
  };
}

export const Route = createFileRoute("/api/crm/financeiro/marketing")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarMarketing());
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          return json(await criarMarketing(marketingInput(body)), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Gasto obrigatorio" }, { status: 400 });
          }
          const patch: Partial<GastoMktInput> = {};
          if (typeof body.pago === "boolean") patch.pago = body.pago;
          if (typeof body.descricao === "string") patch.descricao = body.descricao;
          if (typeof body.valor === "number") patch.valor = body.valor;
          if (typeof body.resultado === "string") patch.resultado = body.resultado;
          if (typeof body.roi === "number") patch.roi = body.roi;
          if (typeof body.campanha === "string") patch.campanha = body.campanha;
          if (typeof body.tipo === "string" && TIPOS.includes(body.tipo as TipoMkt)) {
            patch.tipo = body.tipo as TipoMkt;
          }
          if (typeof body.data === "string") patch.data = body.data;
          return json(await atualizarMarketing(body.id, patch));
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ ok: false, erro: "Gasto obrigatorio" }, { status: 400 });
          await removerMarketing(id);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
