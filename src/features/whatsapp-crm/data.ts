import type { KanbanTab, LeadCard, SmartColumn } from "./types";

export const TABS: KanbanTab[] = [
  "Leads",
  "Clientes",
  "Pós-venda",
  "Indicações",
  "Recuperação",
  "Campanhas",
  "Influenciadores",
];

export const COLUMNS_BY_TAB: Record<KanbanTab, SmartColumn[]> = {
  Leads: ["Leads do dia", "Novo contato", "Em atendimento", "Interessado", "Orçamento enviado", "Não fechou"],
  Clientes: ["Em atendimento", "Interessado", "Fidelização", "Cliente em risco"],
  "Pós-venda": ["Pós-venda", "Fidelização", "Cliente em risco"],
  Indicações: ["Indicações", "Novo contato", "Em atendimento"],
  Recuperação: ["Cliente em risco", "Cliente inativo", "Recuperados"],
  Campanhas: ["Leads do dia", "Em atendimento", "Interessado", "Não fechou"],
  Influenciadores: ["Leads do dia", "Novo contato", "Em atendimento", "Interessado"],
};

export const COLUMN_META: Record<SmartColumn, { hint: string; tone: string }> = {
  "Leads do dia":        { hint: "Chegaram hoje",                tone: "bg-chart-4/15 text-foreground" },
  "Novo contato":        { hint: "Sem atendimento ainda",        tone: "bg-secondary text-muted-foreground" },
  "Em atendimento":      { hint: "Conversando agora",            tone: "bg-primary/15 text-primary" },
  "Interessado":         { hint: "Demonstrou intenção",          tone: "bg-accent/15 text-accent" },
  "Orçamento enviado":   { hint: "Proposta enviada",             tone: "bg-chart-2/20 text-foreground" },
  "Não fechou":          { hint: "Recusou ou parou",             tone: "bg-muted text-muted-foreground" },
  "Cliente em risco":    { hint: "Queda de interação",           tone: "bg-destructive/10 text-destructive" },
  "Cliente inativo":     { hint: "Há muito sem comprar",         tone: "bg-destructive/10 text-destructive" },
  "Pós-venda":           { hint: "Acompanhamento",               tone: "bg-chart-2/15 text-foreground" },
  "Fidelização":         { hint: "Recorrentes",                  tone: "bg-success/15 text-success" },
  "Indicações":          { hint: "Indicando amigos",             tone: "bg-accent/15 text-accent" },
  "Recuperados":         { hint: "Voltaram com campanha",        tone: "bg-success/15 text-success" },
};

