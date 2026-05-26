import type { LeadCard } from "../whatsapp-crm/types";
import { LEADS_MOCK } from "../whatsapp-crm/data";

export type Insight = {
  id: string;
  tipo: "risco" | "campanha" | "cupom" | "ticket" | "marca" | "upsell" | "recompra";
  titulo: string;
  descricao: string;
  acao: string;
  severidade: "info" | "alerta" | "critico";
  rota?: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function gerarInsights(leads: LeadCard[] = LEADS_MOCK): Insight[] {
  const insights: Insight[] = [];

  // Clientes em risco / churn
  const risco = leads.filter((l) => l.churnRisk >= 65 && l.statusRelacionamento !== "Inativo");
  if (risco.length > 0) {
    insights.push({
      id: "ins-risco",
      tipo: "risco",
      titulo: `${risco.length} clientes em risco`,
      descricao: `Maior risco: ${risco[0].nome} (${risco[0].churnRisk}%). Reativar antes que virem inativos.`,
      acao: "Enviar campanha de reativação com 15% OFF",
      severidade: "critico",
      rota: "/conversas",
    });
  }

  // Inativos
  const inativos = leads.filter((l) => l.diasSemInteracao > 60);
  if (inativos.length > 0) {
    const potencial = inativos.reduce((s, l) => s + l.valorPotencial, 0);
    insights.push({
      id: "ins-inativos",
      tipo: "recompra",
      titulo: `${inativos.length} clientes inativos +60 dias`,
      descricao: `Potencial estimado: ${brl(potencial)}. Disparar cupom VOLTA20 segmentado.`,
      acao: "Criar cupom VOLTA20 e enviar",
      severidade: "alerta",
      rota: "/cupons",
    });
  }

  // Upsell — VIP comprando ração econômica
  const upsell = leads.filter((l) => l.tags.includes("VIP") && l.ticketMedio < 150 && l.comprasRealizadas >= 5);
  if (upsell.length > 0) {
    insights.push({
      id: "ins-upsell",
      tipo: "upsell",
      titulo: `${upsell.length} VIPs com ticket abaixo da média`,
      descricao: `Sugerir upgrade para ração premium ou kit gourmet. Ex: ${upsell[0].nome}.`,
      acao: "Enviar combo premium personalizado",
      severidade: "info",
      rota: "/conversas",
    });
  }

  // Marca específica (Golden) sem recompra
  const golden = leads.filter((l) => l.produtosFavoritos.some((p) => p.toLowerCase().includes("golden")) && l.diasSemInteracao > 14);
  if (golden.length > 0) {
    insights.push({
      id: "ins-golden",
      tipo: "marca",
      titulo: "Clientes Golden demorando para recomprar",
      descricao: `${golden.length} clientes Golden sem interagir há +14 dias. Marca tem ciclo de 30d.`,
      acao: "Disparar campanha Golden 10% OFF",
      severidade: "alerta",
      rota: "/cupons",
    });
  }

  // Ticket médio caindo (simulação)
  const ticketAtual = leads.reduce((s, l) => s + l.ticketMedio, 0) / Math.max(1, leads.length);
  if (ticketAtual < 200) {
    insights.push({
      id: "ins-ticket",
      tipo: "ticket",
      titulo: "Ticket médio abaixo da meta",
      descricao: `Ticket atual ${brl(ticketAtual)} · meta R$ 200. Sugerir cross-sell de petiscos e brinquedos.`,
      acao: "Habilitar sugestão IA de cross-sell no PDV",
      severidade: "alerta",
      rota: "/pdv",
    });
  }

  // Cupom abaixo da média
  insights.push({
    id: "ins-cupom",
    tipo: "cupom",
    titulo: "Cupom VOLTA15 abaixo da média",
    descricao: "Taxa de uso 8% (média 22%). Aumentar desconto ou trocar criativo.",
    acao: "Editar cupom VOLTA15",
    severidade: "info",
    rota: "/cupons",
  });

  // Vermífugo
  insights.push({
    id: "ins-vermifugo",
    tipo: "campanha",
    titulo: "12 pets com proteção vencendo em 7 dias",
    descricao: "Disparar fluxo automático de recompra de vermífugo.",
    acao: "Ativar fluxo Vermífugo",
    severidade: "alerta",
    rota: "/automacoes",
  });

  return insights;
}

export function responderPergunta(pergunta: string, leads: LeadCard[] = LEADS_MOCK): string {
  const q = pergunta.toLowerCase();
  if (q.includes("risco") || q.includes("churn")) {
    const r = leads.filter((l) => l.churnRisk >= 65);
    return `**${r.length} clientes em risco** identificados:\n\n${r.slice(0, 5).map((l) => `• ${l.nome} — ${l.churnRisk}% · ${l.diasSemInteracao}d sem interagir`).join("\n")}\n\nQuer que eu dispare campanha de reativação?`;
  }
  if (q.includes("golden")) {
    const r = leads.filter((l) => l.produtosFavoritos.some((p) => p.toLowerCase().includes("golden")));
    return `**${r.length} clientes Golden** no CRM. Ticket médio: ${brl(r.reduce((s, l) => s + l.ticketMedio, 0) / Math.max(1, r.length))}.\n\nPosso criar campanha exclusiva Golden com cupom de 10%?`;
  }
  if (q.includes("ticket")) {
    const t = leads.reduce((s, l) => s + l.ticketMedio, 0) / Math.max(1, leads.length);
    return `Ticket médio atual: **${brl(t)}**. Está ${t < 200 ? "abaixo" : "acima"} da meta de R$ 200.\n\nSugestões:\n• Cross-sell de petiscos no PDV\n• Combo ração + brinquedo\n• Upgrade VIP → Premium`;
  }
  if (q.includes("cupom") || q.includes("cupons")) {
    return "Cupons ativos:\n\n• **GABI10** — 12 usos · R$ 2.840 gerados\n• **VOLTA15** — 8% conversão (baixo)\n• **BLACK20** — pausado\n\nQuer que eu otimize o VOLTA15?";
  }
  if (q.includes("vermífug") || q.includes("vermifug")) {
    return "Identifiquei **12 pets** com proteção antiparasitária vencendo nos próximos 7 dias. Posso ativar o fluxo automático que envia lembrete + cupom de 10%?";
  }
  if (q.includes("upsell")) {
    return "3 VIPs com ticket abaixo de R$ 150:\n\n• Pedro Alves (R$ 95)\n• Helena Souza (R$ 78)\n• Sofia Almeida (R$ 110)\n\nSugiro combo Premier Gourmet + petisco natural.";
  }
  if (q.includes("inativ")) {
    const r = leads.filter((l) => l.diasSemInteracao > 60);
    return `**${r.length} clientes inativos** (+60 dias):\n\n${r.map((l) => `• ${l.nome} — ${l.diasSemInteracao}d`).join("\n")}\n\nPotencial: ${brl(r.reduce((s, l) => s + l.valorPotencial, 0))}`;
  }
  return "Posso te ajudar com: clientes em risco, recompra Golden, cupons performance, follow-up vermífugo, sugestões de upsell ou análise de ticket médio. O que quer ver primeiro?";
}
