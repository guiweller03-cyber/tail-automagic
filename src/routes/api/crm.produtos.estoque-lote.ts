import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { atualizarProdutoCrm, listarProdutos } from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

type AtualizacaoEstoque = {
  sku: string;
  estoque: number;
};

export const Route = createFileRoute("/api/crm/produtos/estoque-lote")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as { atualizacoes?: unknown };

          if (!Array.isArray(body.atualizacoes) || body.atualizacoes.length === 0) {
            return json({ ok: false, erro: "Lista de atualizações vazia ou inválida" }, { status: 400 });
          }

          const itens: AtualizacaoEstoque[] = body.atualizacoes
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map((item) => ({
              sku: typeof item.sku === "string" ? item.sku.trim().toUpperCase() : "",
              estoque: Math.max(0, Math.floor(Number(item.estoque))),
            }))
            .filter((item) => item.sku && Number.isFinite(item.estoque));

          if (itens.length === 0) {
            return json({ ok: false, erro: "Nenhum item válido encontrado" }, { status: 400 });
          }

          const produtos = await listarProdutos();
          const produtoPorSku = new Map(produtos.map((p) => [p.sku.toUpperCase(), p]));

          const atualizados: string[] = [];
          const naoEncontrados: string[] = [];

          for (const item of itens) {
            const produto = produtoPorSku.get(item.sku);
            if (!produto) {
              naoEncontrados.push(item.sku);
              continue;
            }

            await atualizarProdutoCrm(produto.sku, {
              sku: produto.sku,
              nome: produto.nome,
              categoria: produto.categoria,
              estoque: item.estoque,
              minimo: produto.minimo,
              giro: produto.giro,
              preco: produto.preco,
              precoCompra: produto.precoCompra,
              tipo: produto.tipo,
              fornecedor: produto.fornecedor,
              detalhesTecnicos: produto.detalhesTecnicos,
            });

            atualizados.push(produto.sku);
          }

          return json({
            ok: true,
            atualizados: atualizados.length,
            naoEncontrados,
            skusAtualizados: atualizados,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
