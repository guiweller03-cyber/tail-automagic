import { createFileRoute } from "@tanstack/react-router";
import { Conversas } from "@/pages/Conversas";
import type { ConversaMensagem, ConversaView } from "@/pages/Conversas";
import type { Cliente, KanbanStage, ResumoFinanceiroConversa } from "@/lib/crm-types";
import {
  DEFAULT_KANBAN_COLUMNS,
  defaultKanbanColumnId,
  sanitizeKanbanColumns,
} from "@/features/whatsapp-crm/kanban-config";

export const Route = createFileRoute("/conversas")({
  component: ConversasRoute,
  validateSearch: (
    search,
  ): { telefone?: string; clienteId?: string; cliente?: string; origem?: string } => ({
    telefone: typeof search.telefone === "string" ? search.telefone : undefined,
    clienteId: typeof search.clienteId === "string" ? search.clienteId : undefined,
    cliente: typeof search.cliente === "string" ? search.cliente : undefined,
    origem: typeof search.origem === "string" ? search.origem : undefined,
  }),
  loaderDeps: ({ search }) => ({ telefone: search.telefone }),
  loader: async ({ deps }) => {
    try {
      const telefone = deps.telefone?.replace(/\D/g, "") ?? "";
      const acessoDireto = telefone.length >= 8;
      const endpointConversas = acessoDireto
        ? `/api/crm/conversas?telefone=${encodeURIComponent(telefone)}`
        : "/api/crm/conversas";
      const requests = [
        fetch(endpointConversas, { cache: "no-store" }),
        fetch("/api/crm/conversas?ia=status", { cache: "no-store" }),
        fetch("/api/crm/conversas?kanban=config", { cache: "no-store" }),
      ];
      if (!acessoDireto) requests.push(fetch("/api/crm/clientes", { cache: "no-store" }));

      const [res, iaRes, kanbanRes, clientesRes] = await Promise.all(requests);
      const conversaPayload = res.ok ? await res.json() : null;
      const conversas = acessoDireto
        ? conversaPayload && typeof conversaPayload === "object"
          ? [conversaPayload]
          : []
        : conversaPayload;
      const iaStatus = iaRes.ok ? await iaRes.json() : null;
      const kanban = kanbanRes.ok ? await kanbanRes.json() : null;
      const clientes = clientesRes?.ok ? await clientesRes.json() : null;
      return { conversas, iaStatus, clientes, kanban };
    } catch {
      return { conversas: null, iaStatus: null, clientes: null, kanban: null };
    }
    return { conversas: null, iaStatus: null, clientes: null, kanban: null };
  },
});

function ConversasRoute() {
  const data = Route.useLoaderData();
  return (
    <Conversas
      conversasIniciais={Array.isArray(data.conversas) ? data.conversas.map(mapConversa) : []}
      clientesIniciais={Array.isArray(data.clientes) ? (data.clientes as Cliente[]) : []}
      iaStatus={data.iaStatus}
      kanbanColumns={sanitizeKanbanColumns(data.kanban?.columns ?? DEFAULT_KANBAN_COLUMNS)}
    />
  );
}

function mapConversa(row: Record<string, unknown>): ConversaView {
  const historico = Array.isArray(row.historico) ? (row.historico as ConversaMensagem[]) : [];
  const ultimaMsg = historico.at(-1) as { content?: unknown } | undefined;
  const estagio = mapStage(row.estagio);
  return {
    id: String(row.id ?? ""),
    cliente: String(row.nome_cliente ?? row.telefone ?? "Cliente"),
    telefone: String(row.telefone ?? ""),
    ultima: String(ultimaMsg?.content ?? ""),
    hora: row.atualizado_em
      ? new Date(String(row.atualizado_em)).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
    naoLidas: row.aguardando_humano ? 1 : 0,
    tag: row.aguardando_humano ? "Aguardando" : "IA",
    estagio,
    kanbanColumnId:
      typeof row.kanban_coluna === "string" && row.kanban_coluna
        ? row.kanban_coluna
        : defaultKanbanColumnId(row.estagio),
    valorPotencial: Number(row.valor_potencial ?? 0),
    resumoFinanceiro: mapResumoFinanceiro(row.resumo_financeiro),
    filtros: [],
    historico,
    aguardandoHumano: Boolean(row.aguardando_humano),
    iaAtiva: typeof row.ia_ativa === "boolean" ? row.ia_ativa : null,
    atualizado_em: typeof row.atualizado_em === "string" ? row.atualizado_em : undefined,
    historicoResumido: row.historico_resumido === true,
  };
}

function mapResumoFinanceiro(value: unknown): ResumoFinanceiroConversa | undefined {
  if (!value || typeof value !== "object") return undefined;

  const row = value as Record<string, unknown>;
  return {
    totalGasto: Number(row.total_gasto ?? 0),
    lucroLiquido: Number(row.lucro_liquido ?? 0),
    totalDescontos: Number(row.total_descontos ?? 0),
    ticketMedio: Number(row.ticket_medio ?? 0),
    pedidos: Number(row.pedidos ?? 0),
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
