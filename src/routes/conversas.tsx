import { createFileRoute } from "@tanstack/react-router";
import { Conversas } from "@/pages/Conversas";

export const Route = createFileRoute("/conversas")({
  component: Conversas,
  loader: async () => {
    try {
      const [res, iaRes, clientesRes] = await Promise.all([
        fetch("/api/crm/conversas", { cache: "no-store" }),
        fetch("/api/crm/conversas?ia=status", { cache: "no-store" }),
        fetch("/api/crm/clientes", { cache: "no-store" }),
      ]);
      const conversas = res.ok ? await res.json() : null;
      const iaStatus = iaRes.ok ? await iaRes.json() : null;
      const clientes = clientesRes.ok ? await clientesRes.json() : null;
      return { conversas, iaStatus, clientes };
    } catch {
      return { conversas: null, iaStatus: null, clientes: null };
    }
    return { conversas: null, iaStatus: null, clientes: null };
  },
});
