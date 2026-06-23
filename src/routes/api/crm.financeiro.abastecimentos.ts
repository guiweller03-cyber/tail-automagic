import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  criarAbastecimento,
  financeiroErrorMessage,
  listarAbastecimentos,
  removerAbastecimento,
  type AbastecimentoInput,
} from "@/lib/financeiro-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function abastecimentoInput(body: Record<string, unknown>): AbastecimentoInput {
  const litros = num(body.litros);
  const valorLitro = num(body.valorLitro);
  return {
    data: typeof body.data === "string" ? body.data : new Date().toISOString().slice(0, 10),
    kmAtual: num(body.kmAtual),
    litros,
    valorLitro,
    valorTotal: typeof body.valorTotal === "number" ? body.valorTotal : litros * valorLitro,
    posto: typeof body.posto === "string" ? body.posto : undefined,
    obs: typeof body.obs === "string" ? body.obs : undefined,
  };
}

export const Route = createFileRoute("/api/crm/financeiro/abastecimentos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listarAbastecimentos());
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          return json(await criarAbastecimento(abastecimentoInput(body)), { status: 201 });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const id = url.searchParams.get("id");
          if (!id) return json({ ok: false, erro: "Abastecimento obrigatorio" }, { status: 400 });
          await removerAbastecimento(id);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, erro: financeiroErrorMessage(error) }, { status: 500 });
        }
      },
    },
  },
});
