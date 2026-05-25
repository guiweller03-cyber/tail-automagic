import { createFileRoute } from "@tanstack/react-router";
import { Clientes } from "@/pages/Clientes";
import type { Cliente } from "@/lib/mock";

export const Route = createFileRoute("/clientes")({
  component: Clientes,
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
