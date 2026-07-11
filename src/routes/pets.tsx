import { createFileRoute } from "@tanstack/react-router";
import { Pets } from "@/pages/Pets";

export const Route = createFileRoute("/pets")({
  component: PetsRoute,
});

function PetsRoute() {
  return <Pets clientes={[]} />;
}
