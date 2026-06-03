import { createFileRoute } from "@tanstack/react-router";
import { NotasGerais } from "@/pages/NotasGerais";
import type { NotaGeral } from "@/lib/notas-supabase";

export const Route = createFileRoute("/notas")({
  component: NotasRoute,
  loader: async () => {
    try {
      const res = await fetch("/api/crm/notas", { cache: "no-store" });
      if (res.ok) return (await res.json()) as NotaGeral[];
    } catch {
      return null;
    }
    return null;
  },
});

function NotasRoute() {
  const notas = Route.useLoaderData();
  return <NotasGerais notasIniciais={notas ?? []} />;
}
