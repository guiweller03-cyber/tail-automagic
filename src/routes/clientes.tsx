import { createFileRoute } from "@tanstack/react-router";
import { Clientes } from "@/pages/Clientes";
import type { Cliente } from "@/lib/crm-types";

export const Route = createFileRoute("/clientes")({
  validateSearch: (search): { busca?: string } => ({
    busca: typeof search.busca === "string" ? search.busca : undefined,
  }),
  // Os loaders usam a API autenticada relativa ao navegador.
  ssr: false,
  component: ClientesRoute,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/clientes", { cache: "no-store" });
      if (res.ok) return (await res.json()) as Cliente[];
    } catch {
      return null;
    }
    return null;
  },
});

function ClientesRoute() {
  const { busca } = Route.useSearch();
  const clientes = Route.useLoaderData();
  return <Clientes buscaInicial={busca} clientes={clientes ?? []} />;
}
