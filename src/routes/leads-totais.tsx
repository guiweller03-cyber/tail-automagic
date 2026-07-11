import { createFileRoute } from "@tanstack/react-router";
import type { Cliente } from "@/lib/crm-types";
import { LeadsTotais } from "@/pages/LeadsTotais";

export const Route = createFileRoute("/leads-totais")({
  component: LeadsTotaisRoute,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/clientes?historico=1", { cache: "no-store" });
      if (res.ok) return (await res.json()) as Cliente[];
    } catch {
      return null;
    }

    return null;
  },
});

function LeadsTotaisRoute() {
  const clientes = Route.useLoaderData();
  return <LeadsTotais clientes={clientes ?? []} />;
}
