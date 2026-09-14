import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import {
  apagarPedidoManual,
  atualizarProcessoPedido,
  criarPedidoManual,
  editarPedidoManual,
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

function inicioHojeSaoPaulo(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return new Date();
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}

export const Route = createFileRoute("/api/crm/pedidos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const today = url.searchParams.get("today") === "1";
          const recentHours = Number(url.searchParams.get("recentHours"));
          const desde = today
            ? inicioHojeSaoPaulo()
            : Number.isFinite(recentHours) && recentHours > 0
              ? new Date(Date.now() - recentHours * 60 * 60 * 1000)
              : undefined;
          const pedidos = await listarPedidos({ desde });

          return json(pedidos);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            id?: unknown;
            status?: unknown;
            formaPagamento?: unknown;
          };

          if (typeof body.id !== "string" || !isPedidoProcesso(body.status)) {
            return json({ ok: false, erro: "Pedido ou status invalido" }, { status: 400 });
          }

          const pedido = await atualizarProcessoPedido(body.id, body.status, {
            formaPagamento:
              typeof body.formaPagamento === "string" ? body.formaPagamento : undefined,
          });

          return json(pedido);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      DELETE: async ({ request }) => {
        try {
          const body = (await request.json()) as { id?: unknown };

          if (typeof body.id !== "string" || !body.id.trim()) {
            return json({ ok: false, erro: "Pedido invalido" }, { status: 400 });
          }

          await apagarPedidoManual(body.id);

          return json({ ok: true });
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
          const telefonePedido = telefone.length >= 8 ? telefone : `pdv${Date.now()}`;
          const total = typeof body.total === "number" ? body.total : Number(body.total);
          const totalBruto =
            typeof body.totalBruto === "number" ? body.totalBruto : Number(body.totalBruto);
          const descontoPercentual =
            typeof body.descontoPercentual === "number"
              ? body.descontoPercentual
              : Number(body.descontoPercentual);
          const descontoValor =
            typeof body.descontoValor === "number"
              ? body.descontoValor
              : Number(body.descontoValor);
          const taxaMaquininha =
            typeof body.taxaMaquininha === "number"
              ? body.taxaMaquininha
              : Number(body.taxaMaquininha);
          let temItemInvalido = false;
          const itens = Array.isArray(body.itens)
            ? body.itens.flatMap((item) => {
                if (!item || typeof item !== "object") {
                  temItemInvalido = true;
                  return [];
                }

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
                  preco <= 0 ||
                  !Number.isFinite(precoCompra) ||
                  precoCompra < 0
                ) {
                  temItemInvalido = true;
                  return [];
                }

                return [
                  {
                    sku: fields.sku,
                    nome: fields.nome,
                    quantidade,
                    preco,
                    precoCompra,
                    petNome:
                      typeof fields.petNome === "string"
                        ? fields.petNome.trim() || null
                        : typeof fields.pet_nome === "string"
                          ? fields.pet_nome.trim() || null
                          : typeof fields.pet === "string"
                            ? fields.pet.trim() || null
                            : null,
                  },
                ];
              })
            : [];

          if (temItemInvalido) {
            return json({ ok: false, erro: "Itens do pedido invalidos" }, { status: 400 });
          }

          if (!nome || !Number.isFinite(total) || total <= 0) {
            return json(
              { ok: false, erro: "Nome e total valido sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(
            await criarPedidoManual({
              nome,
              telefone: telefonePedido,
              total,
              totalBruto: Number.isFinite(totalBruto) ? totalBruto : undefined,
              descontoPercentual: Number.isFinite(descontoPercentual)
                ? descontoPercentual
                : undefined,
              descontoValor: Number.isFinite(descontoValor) ? descontoValor : undefined,
              taxaMaquininha: Number.isFinite(taxaMaquininha) ? taxaMaquininha : undefined,
              formaPagamento: typeof body.formaPagamento === "string" ? body.formaPagamento : null,
              observacao: typeof body.observacao === "string" ? body.observacao : null,
              bairro: typeof body.bairro === "string" ? body.bairro : null,
              pet: typeof body.pet === "string" ? body.pet : null,
              itens,
              pago: body.pago === true,
              cupomCodigo: typeof body.cupomCodigo === "string" ? body.cupomCodigo : null,
              criadoEm: typeof body.dataVenda === "string" ? body.dataVenda : null,
              vendaOrigem: typeof body.vendaOrigem === "string" ? body.vendaOrigem : null,
            }),
            { status: 201 },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const body = (await request.json()) as Record<string, unknown>;
          const id = typeof body.id === "string" ? body.id.trim() : "";
          const nome = typeof body.nome === "string" ? body.nome.trim() : "";
          const telefone =
            typeof body.telefone === "string" ? body.telefone.replace(/\D/g, "") : "";
          const total = typeof body.total === "number" ? body.total : Number(body.total);

          if (!id || !nome || !Number.isFinite(total) || total <= 0) {
            return json(
              { ok: false, erro: "Pedido, nome e total valido sao obrigatorios" },
              { status: 400 },
            );
          }

          return json(
            await editarPedidoManual({
              id,
              nome,
              telefone: telefone.length >= 8 ? telefone : null,
              total,
              formaPagamento: typeof body.formaPagamento === "string" ? body.formaPagamento : null,
              observacao: typeof body.observacao === "string" ? body.observacao : null,
              bairro: typeof body.bairro === "string" ? body.bairro : null,
              pet: typeof body.pet === "string" ? body.pet : null,
              pago: body.pago === true,
              criadoEm: typeof body.dataVenda === "string" ? body.dataVenda : null,
            }),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro desconhecido";

          return json({ ok: false, erro: message }, { status: 500 });
        }
      },
    },
  },
});
