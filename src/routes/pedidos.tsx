import { createFileRoute } from "@tanstack/react-router";
import { Pedidos } from "@/pages/Pedidos";
import type { Pedido } from "@/lib/crm-types";

export const Route = createFileRoute("/pedidos")({
  validateSearch: (search): { busca?: string } => ({
    busca: typeof search.busca === "string" ? search.busca : undefined,
  }),
  // Os loaders usam a API autenticada relativa ao navegador.
  ssr: false,
  component: PedidosRoute,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/pedidos", { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch {
      return null;
    }
    return null;
  },
});

function PedidosRoute() {
  const { busca } = Route.useSearch();
  const pedidos = Route.useLoaderData();
  return (
    <Pedidos
      buscaInicial={busca}
      pedidosIniciais={Array.isArray(pedidos) ? pedidos.map(normalizarPedido) : []}
    />
  );
}

function normalizarPedido(pedido: Record<string, unknown>): Pedido {
  const statusPagamento = String(pedido.statusPagamento ?? pedido.status_pagamento ?? "");
  const pagamento = String(pedido.pagamento ?? "Pendente");
  return {
    id: String(pedido.id ?? ""),
    cliente: String(pedido.cliente ?? "Cliente"),
    telefone: String(pedido.telefone ?? ""),
    pet: String(pedido.pet ?? ""),
    total: Number(pedido.total ?? 0),
    status: isPedidoStatus(pedido.status) ? pedido.status : "novo",
    bairro: String(pedido.bairro ?? ""),
    hora: String(pedido.hora ?? ""),
    pagamento,
    pago:
      statusPagamento.toLowerCase() === "pago" ||
      (isPedidoStatus(pedido.status) && pedido.status === "pago"),
    comprovante: statusPagamento.toLowerCase() === "pago",
    taxaMaquina: 0,
    notaFiscal: false,
  };
}

function isPedidoStatus(value: unknown): value is Pedido["status"] {
  return (
    value === "novo" ||
    value === "pago" ||
    value === "separando" ||
    value === "em rota" ||
    value === "entregue" ||
    value === "cancelado"
  );
}
