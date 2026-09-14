import { createFileRoute } from "@tanstack/react-router";
import { PainelRecompra } from "@/pages/PainelRecompra";

export const Route = createFileRoute("/painel-recompra")({
  head: () => ({
    meta: [
      { title: "Painel de recompra | Mundo Pet CRM" },
      {
        name: "description",
        content: "Fila operacional de recompra calculada com os dados reais do CRM.",
      },
    ],
  }),
  component: PainelRecompra,
});
