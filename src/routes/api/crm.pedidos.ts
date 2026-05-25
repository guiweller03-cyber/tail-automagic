import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  atualizarProcessoPedido,
  criarPedidoManual,
  listarPedidos,
  type PedidoProcesso,
} from "@/lib/supabase";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

function isPedidoProcesso(value: unknown): value is PedidoProcesso {
  return (
    value === "novo" ||
    value === "pago" ||
    value === "separando" ||
    value === "em rota" ||
    value === "entregue" ||
    value === "cancelado"
  );
}

export const Route = createFileRoute("/api/crm/pedidos")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const pedidos = await listarPedidos();

          return json(pedidos);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as { id?: unknown; status?: unknown };

          if (typeof body.id !== "string" || !isPedidoProcesso(body.status)) {
            return json({ ok: false, erro: "Pedido ou status invalido" }, { status: 400 });
          }

          const pedido = await atualizarProcessoPedido(body.id, body.status);

          return json(pedido);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const nome = typeof body.nome === "string" ? body.nome.trim() : "";
          const telefone =
            typeof body.telefone === "string" ? body.telefone.replace(/\D/g, "") : "";
          const total = typeof body.total === "number" ? body.total : Number(body.total);
          const itens = Array.isArray(body.itens)
            ? body.itens.flatMap((item) => {
                if (!item || typeof item !== "object") return [];

                const fields = item as Record<string, unknown>;
                const quantidade = Number(fields.quantidade);
                const preco = Number(fields.preco);
                const precoCompra = Number(fields.precoCompra);
                if (
                  typeof fields.sku !== "string" ||
                  typeof fields.nome !== "string" ||
                  !Number.isInteger(quantidade) ||
                  quantidade <= 0 ||
                  !Number.isFinite(preco) ||
                  !Number.isFinite(precoCompra)
                ) {
                  return [];
                }

                return [
                  {
                    sku: fields.sku,
                    nome: fields.nome,
                    quantidade,
                    preco,
                    precoCompra,
                  },
                ];
              })
            : [];

          if (!nome || telefone.length < 8 || !Number.isFinite(total) || total <= 0) {
            return json(
              { ok: false, erro: "Nome, telefone e total valido sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(
            await criarPedidoManual({
              nome,
              telefone,
              total,
              formaPagamento: typeof body.formaPagamento === "string" ? body.formaPagamento : null,
              observacao: typeof body.observacao === "string" ? body.observacao : null,
              bairro: typeof body.bairro === "string" ? body.bairro : null,
              pet: typeof body.pet === "string" ? body.pet : null,
              itens,
              pago: body.pago === true,
              cupomCodigo: typeof body.cupomCodigo === "string" ? body.cupomCodigo : null,
            }),
            { status: 201 },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
