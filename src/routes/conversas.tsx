import { createFileRoute } from "@tanstack/react-router";
import { Conversas } from "@/pages/Conversas";
import type { Cliente, Conversa, KanbanStage } from "@/lib/crm-types";

export const Route = createFileRoute("/conversas")({
  component: ConversasRoute,
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

function ConversasRoute() {
  const data = Route.useLoaderData();
  return (
    <Conversas
      conversasIniciais={Array.isArray(data.conversas) ? data.conversas.map(mapConversa) : []}
      clientesIniciais={Array.isArray(data.clientes) ? (data.clientes as Cliente[]) : []}
      iaStatus={data.iaStatus}
    />
  );
}

function mapConversa(row: Record<string, unknown>): Conversa & {
  historico: any[];
  aguardandoHumano: boolean;
  iaAtiva: boolean | null;
} {
  const historico = Array.isArray(row.historico) ? row.historico : [];
  const ultimaMsg = historico.at(-1) as { content?: unknown } | undefined;
  const estagio = mapStage(row.estagio);
  return {
    id: String(row.id ?? ""),
    cliente: String(row.nome_cliente ?? row.telefone ?? "Cliente"),
    telefone: String(row.telefone ?? ""),
    ultima: String(ultimaMsg?.content ?? ""),
    hora: row.atualizado_em
      ? new Date(String(row.atualizado_em)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
    naoLidas: row.aguardando_humano ? 1 : 0,
    tag: row.aguardando_humano ? "Aguardando" : "IA",
    estagio,
    valorPotencial: Number(row.valor_potencial ?? 0),
    filtros: [],
    historico,
    aguardandoHumano: Boolean(row.aguardando_humano),
    iaAtiva: typeof row.ia_ativa === "boolean" ? row.ia_ativa : null,
  };
}

function mapStage(value: unknown): KanbanStage {
  switch (value) {
    case "pos_venda":
      return "Follow-up";
    case "vendendo":
      return "Aguardando pagamento";
    case "inativo":
      return "Risco";
    default:
      return "Hoje";
  }
}
