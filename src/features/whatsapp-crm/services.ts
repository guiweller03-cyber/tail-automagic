import type { LeadCard, LeadIntent, LeadPriority, SmartColumn } from "./types";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatBRL = brl;

/** Custo individual do lead — nunca expõe valor total da campanha. */
export function calculateLeadCost(lead: LeadCard): {
  cac: number;
  pretty: string;
  origem: string;
} {
  return {
    cac: lead.custoLead,
    pretty: lead.custoLead > 0
      ? `Lead adquirido por ${brl(lead.custoLead)}`
      : "Lead orgânico · sem custo",
    origem: lead.origemDetalhe ? `${lead.origem} · ${lead.origemDetalhe}` : lead.origem,
  };
}

export function detectLeadSource(lead: LeadCard): string {
  const parts = [lead.origem];
  if (lead.utmSource) parts.push(`utm:${lead.utmSource}`);
  if (lead.utmCampaign) parts.push(`camp:${lead.utmCampaign}`);
  if (lead.anuncio) parts.push(lead.anuncio);
  if (lead.influenciador) parts.push(lead.influenciador);
  if (lead.cupom) parts.push(`cupom:${lead.cupom}`);
  return parts.join(" · ");
}

/** Heurística de intenção baseada em sinais comportamentais. */
export function classifyLeadIntent(lead: LeadCard): LeadIntent {
  if (lead.diasSemInteracao > 30) return "frio";
  if (lead.column === "Orçamento enviado" || lead.column === "Em atendimento") return "comprando";
  if (lead.comprasRealizadas >= 3 && lead.diasSemInteracao < 7) return "quente";
  if (lead.diasSemInteracao < 3) return "morno";
  return "frio";
}

export function detectChurnRisk(lead: LeadCard): number {
  let risk = 0;
  risk += Math.min(60, lead.diasSemInteracao * 1.2);
  if (lead.comprasRealizadas === 0 && lead.diasSemInteracao > 7) risk += 15;
  if (lead.statusRelacionamento === "Frágil") risk += 20;
  if (lead.statusRelacionamento === "Inativo") risk += 30;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

export function classifyPriority(lead: LeadCard): LeadPriority {
  const intent = classifyLeadIntent(lead);
  const risk = detectChurnRisk(lead);
  if (intent === "comprando") return "urgente";
  if (risk > 70) return "urgente";
  if (intent === "quente" || risk > 40) return "alta";
  if (intent === "morno") return "media";
  return "baixa";
}

/** Sugere movimentação automática do card via IA. */
export function autoMoveKanbanCard(lead: LeadCard): SmartColumn {
  const risk = detectChurnRisk(lead);
  const intent = classifyLeadIntent(lead);
  if (risk >= 90) return "Cliente inativo";
  if (risk >= 65) return "Cliente em risco";
  if (intent === "comprando") return "Em atendimento";
  if (intent === "quente") return "Interessado";
  if (lead.diasSemInteracao === 0 && lead.comprasRealizadas === 0) return "Leads do dia";
  return lead.column;
}

export function intentColor(intent: LeadIntent): string {
  switch (intent) {
    case "comprando": return "bg-success/15 text-success border-success/30";
    case "quente":    return "bg-accent/20 text-accent border-accent/40";
    case "morno":     return "bg-primary/15 text-primary border-primary/30";
    case "frio":      return "bg-muted text-muted-foreground border-border";
  }
}

export function priorityRing(p: LeadPriority): string {
  switch (p) {
    case "urgente": return "ring-2 ring-destructive/40 shadow-[0_0_24px_hsl(var(--destructive)/0.25)]";
    case "alta":    return "ring-2 ring-accent/40 shadow-[0_0_18px_hsl(var(--accent)/0.20)]";
    case "media":   return "ring-1 ring-primary/30";
    case "baixa":   return "ring-1 ring-border";
  }
}
