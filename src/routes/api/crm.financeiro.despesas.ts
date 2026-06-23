import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarDespesa,
  criarDespesa,
  financeiroErrorMessage,
  listarDespesas,
  removerDespesa,
  type CategoriaDespesa,
  type DespesaInput,
} from "@/lib/financeiro-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

const CATEGORIAS: CategoriaDespesa[] = [
  "aluguel",
  "energia",
  "internet",
  "embalagem",
  "manutencao",
  "salario",
  "contador",
  "outros",
];

function despesaInput(body: Record<string, unknown>): DespesaInput {
  const categoria =
    typeof body.categoria === "string" && CATEGORIAS.includes(body.categoria as CategoriaDespesa)
      ? (body.categoria as CategoriaDespesa)
      : "outros";
  return {
    data: typeof body.data === "string" ? body.data : new Date().toISOString().slice(0, 10),
    categoria,
    descricao: typeof body.descricao === "string" ? body.descricao : "",
    valor: typeof body.valor === "number" ? body.valor : Number(body.valor) || 0,
    recorrente: typeof body.recorrente === "boolean" ? body.recorrente : false,
    pago: typeof body.pago === "boolean" ? body.pago : true,
  };
}

export const Route = createFileRoute("/api/crm/financeiro/despesas")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarDespesas());
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          return json(await criarDespesa(despesaInput(body)), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          if (typeof body.id !== "string") {
            return json({ ok: false, erro: "Despesa obrigatoria" }, { status: 400 });
          }
          const patch: Partial<DespesaInput> = {};
          if (typeof body.pago === "boolean") patch.pago = body.pago;
          if (typeof body.descricao === "string") patch.descricao = body.descricao;
          if (typeof body.valor === "number") patch.valor = body.valor;
          if (typeof body.recorrente === "boolean") patch.recorrente = body.recorrente;
          if (
            typeof body.categoria === "string" &&
            CATEGORIAS.includes(body.categoria as CategoriaDespesa)
          ) {
            patch.categoria = body.categoria as CategoriaDespesa;
          }
          if (typeof body.data === "string") patch.data = body.data;
          return json(await atualizarDespesa(body.id, patch));
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ ok: false, erro: "Despesa obrigatoria" }, { status: 400 });
          await removerDespesa(id);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
