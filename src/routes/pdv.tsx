import { createFileRoute } from "@tanstack/react-router";
import { PDV } from "@/pages/PDV";

export const Route = createFileRoute("/pdv")({
  validateSearch: (search: Record<string, unknown>) => ({
    cliente: typeof search.cliente === "string" ? search.cliente : "",
    telefone: typeof search.telefone === "string" ? search.telefone : "",
  }),
  component: function PDVRoute() {
    const search = Route.useSearch();
    return <PDV initialCliente={search.cliente} initialTelefone={search.telefone} />;
  },
});
