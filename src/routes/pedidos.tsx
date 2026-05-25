import { createFileRoute } from "@tanstack/react-router";
import { Pedidos } from "@/pages/Pedidos";

export const Route = createFileRoute("/pedidos")({
  component: Pedidos,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/pedidos", { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch {
      return null;
    }
    return null;
  },
});
