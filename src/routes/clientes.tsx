import { createFileRoute } from "@tanstack/react-router";
import { Clientes } from "@/pages/Clientes";
import type { Cliente } from "@/lib/crm-types";

export const Route = createFileRoute("/clientes")({
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
  const clientes = Route.useLoaderData();
  return <Clientes clientes={clientes ?? []} />;
}
