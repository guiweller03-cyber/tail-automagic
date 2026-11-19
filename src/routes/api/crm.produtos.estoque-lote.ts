import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import type { Produto } from "@/lib/crm-types";
import { atualizarProdutoCrm, criarProdutoCrm, listarProdutos } from "@/lib/crm-supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

type ItemEstoque = {
  sku: string;
  estoque: number;
  /** Presente quando a planilha traz dados para cadastrar um SKU inexistente. */
  novo?: {
    nome: string;
    categoria: string;
    preco: number;
    precoCompra: number;
    minimo: number;
    fornecedor?: string;
    tipo: Produto["tipo"];
  };
};

function numeroNaoNegativo(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function parseItem(item: Record<string, unknown>): ItemEstoque {
  const nome = texto(item.nome);
  return {
    sku: texto(item.sku).toUpperCase(),
    estoque: Math.max(0, Math.floor(Number(item.estoque))),
    novo: nome
      ? {
          nome,
          categoria: texto(item.categoria) || "Geral",
          preco: Math.round(numeroNaoNegativo(item.preco) * 100) / 100,
          precoCompra: Math.round(numeroNaoNegativo(item.precoCompra) * 100) / 100,
          minimo: Math.floor(numeroNaoNegativo(item.minimo)),
          fornecedor: texto(item.fornecedor) || undefined,
          tipo: item.tipo === "consignado" ? "consignado" : "próprio",
        }
      : undefined,
  };
}

export const Route = createFileRoute("/api/crm/produtos/estoque-lote")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as { atualizacoes?: unknown };

          if (!Array.isArray(body.atualizacoes) || body.atualizacoes.length === 0) {
            return json(
              { ok: false, erro: "Lista de atualizações vazia ou inválida" },
              { status: 400 },
            );
          }

          const itens = body.atualizacoes
            .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
            .map(parseItem)
            .filter((item) => item.sku && Number.isFinite(item.estoque));

          if (itens.length === 0) {
            return json({ ok: false, erro: "Nenhum item válido encontrado" }, { status: 400 });
          }

          const produtos = await listarProdutos();
          const produtoPorSku = new Map(produtos.map((p) => [p.sku.toUpperCase(), p]));

          const atualizados: string[] = [];
          const produtosCriados: Produto[] = [];
          const naoEncontrados: string[] = [];
          const falhas: Array<{ sku: string; erro: string }> = [];

          for (const item of itens) {
            const produto = produtoPorSku.get(item.sku);
            try {
              if (produto) {
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
              } else if (item.novo) {
                const criado = await criarProdutoCrm({
                  sku: item.sku,
                  estoque: item.estoque,
                  giro: "baixo",
                  ...item.novo,
                });
                produtoPorSku.set(item.sku, criado);
                produtosCriados.push(criado);
              } else {
                naoEncontrados.push(item.sku);
              }
            } catch (error) {
              // Um SKU com problema não derruba o lote inteiro.
              falhas.push({
                sku: item.sku,
                erro: error instanceof Error ? error.message.slice(0, 160) : "Erro desconhecido",
              });
            }
          }

          return json({
            ok: true,
            atualizados: atualizados.length,
            criados: produtosCriados.length,
            naoEncontrados,
            falhas,
            skusAtualizados: atualizados,
            produtosCriados,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";
          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
