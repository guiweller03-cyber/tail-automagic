import { createFileRoute } from "@tanstack/react-router";
import { Pets } from "@/pages/Pets";

export const Route = createFileRoute("/pets")({
  validateSearch: (search): { busca?: string } => ({
    busca: typeof search.busca === "string" ? search.busca : undefined,
  }),
  component: PetsRoute,
});

function PetsRoute() {
  const { busca } = Route.useSearch();
  return <Pets buscaInicial={busca} clientes={[]} />;
}
