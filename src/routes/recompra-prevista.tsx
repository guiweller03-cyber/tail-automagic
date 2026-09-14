import { createFileRoute } from "@tanstack/react-router";
import { RecompraPrevista } from "@/pages/RecompraPrevista";
export const Route = createFileRoute("/recompra-prevista")({
  validateSearch: (search: Record<string, unknown>) => ({
    clienteId: typeof search.clienteId === "string" ? search.clienteId : undefined,
    pet: typeof search.pet === "string" ? search.pet : undefined,
  }),
  component: RecompraPrevista,
});
