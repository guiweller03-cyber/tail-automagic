import { createFileRoute } from "@tanstack/react-router";
import { PDV } from "@/pages/PDV";

export const Route = createFileRoute("/pdv")({
  validateSearch: (search: Record<string, unknown>) => {
    const textoBusca = (value: unknown) =>
      typeof value === "string" || typeof value === "number" ? String(value) : "";

    const validated: {
      cliente: string;
      telefone: string;
      sku?: string;
      pet?: string;
      quantidade?: string;
    } = {
      cliente: textoBusca(search.cliente),
      telefone: textoBusca(search.telefone),
    };

    if (textoBusca(search.sku)) validated.sku = textoBusca(search.sku);
    if (textoBusca(search.pet)) validated.pet = textoBusca(search.pet);
    if (textoBusca(search.quantidade)) validated.quantidade = textoBusca(search.quantidade);

    return validated;
  },
  component: function PDVRoute() {
    const search = Route.useSearch();
    return (
      <PDV
        initialCliente={search.cliente}
        initialTelefone={search.telefone}
        initialSku={search.sku}
        initialPet={search.pet}
        initialQuantidade={search.quantidade}
      />
    );
  },
});
