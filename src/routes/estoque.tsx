import { createFileRoute } from "@tanstack/react-router";
import { Estoque } from "@/pages/Estoque";
import type { Produto } from "@/lib/crm-types";

export const Route = createFileRoute("/estoque")({
  component: EstoqueRoute,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/produtos", { cache: "no-store" });
      if (res.ok) return (await res.json()) as Produto[];
    } catch {
      return null;
    }
    return null;
  },
});

function EstoqueRoute() {
  const produtos = Route.useLoaderData();
  return <Estoque produtosIniciais={produtos ?? []} />;
}
