export type KanbanColumnColor = "sky" | "violet" | "amber" | "emerald" | "rose" | "slate";

export type KanbanColumn = {
  id: string;
  nome: string;
  descricao: string;
  cor: KanbanColumnColor;
  estagioInterno: "novo" | "qualificando" | "vendendo" | "pos_venda" | "inativo";
};

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "hoje",
    nome: "Hoje",
    descricao: "Conversas que chegaram agora",
    cor: "sky",
    estagioInterno: "novo",
  },
  {
    id: "recompra",
    nome: "Recompra",
    descricao: "Clientes no momento de comprar novamente",
    cor: "violet",
    estagioInterno: "pos_venda",
  },
  {
    id: "follow-up",
    nome: "Follow-up",
    descricao: "Contatos que precisam de retorno",
    cor: "amber",
    estagioInterno: "pos_venda",
  },
  {
    id: "aguardando-pagamento",
    nome: "Aguardando pagamento",
    descricao: "Pedido encaminhado, aguardando confirmação",
    cor: "emerald",
    estagioInterno: "vendendo",
  },
  {
    id: "aprovada",
    nome: "Aprovada",
    descricao: "Vendas com pagamento confirmado",
    cor: "emerald",
    estagioInterno: "pos_venda",
  },
  {
    id: "upsell",
    nome: "Upsell",
    descricao: "Oportunidades de venda complementar",
    cor: "violet",
    estagioInterno: "vendendo",
  },
  {
    id: "risco",
    nome: "Risco",
    descricao: "Clientes que podem deixar de comprar",
    cor: "rose",
    estagioInterno: "inativo",
  },
];

const VALID_COLORS = new Set<KanbanColumnColor>([
  "sky",
  "violet",
  "amber",
  "emerald",
  "rose",
  "slate",
]);
const VALID_STAGES = new Set<KanbanColumn["estagioInterno"]>([
  "novo",
  "qualificando",
  "vendendo",
  "pos_venda",
  "inativo",
]);

export function sanitizeKanbanColumns(value: unknown): KanbanColumn[] {
  if (!Array.isArray(value)) return DEFAULT_KANBAN_COLUMNS.map((column) => ({ ...column }));

  const ids = new Set<string>();
  const columns = value.slice(0, 16).flatMap((item): KanbanColumn[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<KanbanColumn>;
    const id = String(row.id ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 64);
    const nome = String(row.nome ?? "")
      .trim()
      .slice(0, 40);
    if (!id || !nome || ids.has(id)) return [];
    ids.add(id);

    return [
      {
        id,
        nome,
        descricao: String(row.descricao ?? "")
          .trim()
          .slice(0, 90),
        cor: VALID_COLORS.has(row.cor as KanbanColumnColor)
          ? (row.cor as KanbanColumnColor)
          : "slate",
        estagioInterno: VALID_STAGES.has(row.estagioInterno as KanbanColumn["estagioInterno"])
          ? (row.estagioInterno as KanbanColumn["estagioInterno"])
          : "qualificando",
      },
    ];
  });

  if (columns.length === 0) return DEFAULT_KANBAN_COLUMNS.map((column) => ({ ...column }));
  if (!colunaVendaAprovada(columns)) {
    columns.push({ ...DEFAULT_KANBAN_COLUMNS.find((column) => column.id === "aprovada")! });
  }
  return columns;
}

export function defaultKanbanColumnId(estagio: unknown): string {
  switch (estagio) {
    case "pos_venda":
      return "follow-up";
    case "vendendo":
      return "aguardando-pagamento";
    case "inativo":
      return "risco";
    default:
      return "hoje";
  }
}

export function colunaVendaAprovada(columns: KanbanColumn[]): KanbanColumn | undefined {
  return columns.find((column) => {
    const nome = column.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return /\baprovad[ao]s?\b/.test(nome) || /\baprovad[ao]s?\b/.test(column.id.replace(/-/g, " "));
  });
}
