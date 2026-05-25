import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarProdutoCrm,
  criarProdutoCrm,
  listarProdutos,
  type ProdutoCrmInput,
} from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function produtoInput(body: Record<string, unknown>): ProdutoCrmInput | null {
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  const estoque = Number(body.estoque);
  const minimo = Number(body.minimo);
  const preco = Number(body.preco);
  const precoCompra = Number(body.precoCompra);
  const giro =
    body.giro === "alto" || body.giro === "médio" || body.giro === "baixo" ? body.giro : "baixo";
  const tipo = body.tipo === "próprio" || body.tipo === "consignado" ? body.tipo : "próprio";

  if (
    !sku ||
    !nome ||
    !categoria ||
    !Number.isInteger(estoque) ||
    !Number.isInteger(minimo) ||
    estoque < 0 ||
    minimo < 0 ||
    !Number.isFinite(preco) ||
    !Number.isFinite(precoCompra) ||
    preco < 0 ||
    precoCompra < 0
  ) {
    return null;
  }

  return {
    sku,
    nome,
    categoria,
    estoque,
    minimo,
    giro,
    preco,
    precoCompra,
    tipo,
    fornecedor: typeof body.fornecedor === "string" ? body.fornecedor : undefined,
  };
}

export const Route = createFileRoute("/api/crm/produtos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const produtos = await listarProdutos();

          return json(produtos);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const input = produtoInput((await request.json()) as Record<string, unknown>);
          if (!input) {
            return json({ ok: false, erro: "Dados do produto invalidos" }, { status: 400 });
          }

          return json(await criarProdutoCrm(input), { status: 201 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const skuAtual = typeof body.skuAtual === "string" ? body.skuAtual : "";
          const input = produtoInput(body);
          if (!skuAtual || !input) {
            return json({ ok: false, erro: "SKU e dados do produto invalidos" }, { status: 400 });
          }

          return json(await atualizarProdutoCrm(skuAtual, input));
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
