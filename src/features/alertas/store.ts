import { useCallback, useEffect, useState } from "react";

export type AlertaTipo =
  | "risco" | "recompra" | "pos_venda" | "pagamento"
  | "inativo" | "abandono" | "logistica" | "estoque";

export type AlertaStatus = "ativo" | "resolvido" | "descartado";

export type Alerta = {
  id: string;
  tipo: AlertaTipo;
  titulo: string;
  mensagem: string;
  clienteNome?: string;
  rota: string;          // ex: "/conversas"
  criadoEm: string;      // ISO
  status: AlertaStatus;
  severidade: "baixa" | "media" | "alta";
};

const KEY = "alertas_v1";

const SEED: Alerta[] = [
  { id: "a1", tipo: "risco", titulo: "Cliente em risco", mensagem: "Helena Souza está há 62 dias sem comprar.", clienteNome: "Helena Souza", rota: "/conversas", criadoEm: new Date().toISOString(), status: "ativo", severidade: "alta" },
  { id: "a2", tipo: "recompra", titulo: "Recompra prevista", mensagem: "Pedro Alves deve recomprar ração hoje.", clienteNome: "Pedro Alves", rota: "/recompra-prevista", criadoEm: new Date().toISOString(), status: "ativo", severidade: "media" },
  { id: "a3", tipo: "pagamento", titulo: "Pagamento pendente", mensagem: "Pedido #10237 — Pedro Alves · R$ 87,50 sem comprovante.", rota: "/pedidos", criadoEm: new Date().toISOString(), status: "ativo", severidade: "media" },
  { id: "a4", tipo: "inativo", titulo: "Cliente inativo", mensagem: "Sofia Almeida não compra há 98 dias.", clienteNome: "Sofia Almeida", rota: "/clientes", criadoEm: new Date().toISOString(), status: "ativo", severidade: "alta" },
  { id: "a5", tipo: "estoque", titulo: "Estoque crítico", mensagem: "Golden 15kg abaixo do mínimo (3 unidades).", rota: "/estoque", criadoEm: new Date().toISOString(), status: "ativo", severidade: "alta" },
  { id: "a6", tipo: "logistica", titulo: "Entrega atrasada", mensagem: "Pedido #10238 atrasado em 25min.", rota: "/entregas", criadoEm: new Date().toISOString(), status: "ativo", severidade: "media" },
  { id: "a7", tipo: "abandono", titulo: "Carrinho abandonado", mensagem: "Lucas Pereira abandonou orçamento de R$ 240.", clienteNome: "Lucas Pereira", rota: "/conversas", criadoEm: new Date().toISOString(), status: "ativo", severidade: "baixa" },
  { id: "a8", tipo: "pos_venda", titulo: "Follow-up pendente", mensagem: "Marina Costa comprou ração há 7 dias — perguntar adaptação.", clienteNome: "Marina Costa", rota: "/conversas", criadoEm: new Date().toISOString(), status: "ativo", severidade: "media" },
];

function load(): Alerta[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return SEED;
    return JSON.parse(raw) as Alerta[];
  } catch { return SEED; }
}

let memory: Alerta[] = load();
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function save() {
  try { window.localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* noop */ }
  emit();
}

export function useAlertas() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const resolver = useCallback((id: string) => {
    memory = memory.map((a) => a.id === id ? { ...a, status: "resolvido" as const } : a);
    save();
  }, []);
  const descartar = useCallback((id: string) => {
    memory = memory.map((a) => a.id === id ? { ...a, status: "descartado" as const } : a);
    save();
  }, []);
  const adicionar = useCallback((a: Omit<Alerta, "id" | "criadoEm" | "status">) => {
    memory = [{ ...a, id: `a${Date.now()}`, criadoEm: new Date().toISOString(), status: "ativo" }, ...memory];
    save();
  }, []);
  const restaurarTodos = useCallback(() => {
    memory = SEED;
    save();
  }, []);

  return {
    alertas: memory,
    ativos: memory.filter((a) => a.status === "ativo"),
    resolver, descartar, adicionar, restaurarTodos,
  };
}

export const ALERTA_META: Record<AlertaTipo, { label: string; tone: string }> = {
  risco:      { label: "Cliente em risco",  tone: "bg-destructive/15 text-destructive border-destructive/30" },
  recompra:   { label: "Recompra",          tone: "bg-primary/15 text-primary border-primary/30" },
  pos_venda:  { label: "Pós-venda",         tone: "bg-chart-2/20 text-foreground border-border" },
  pagamento:  { label: "Pagamento",         tone: "bg-accent/15 text-accent border-accent/30" },
  inativo:    { label: "Cliente inativo",   tone: "bg-destructive/15 text-destructive border-destructive/30" },
  abandono:   { label: "Abandono",          tone: "bg-accent/15 text-accent border-accent/30" },
  logistica:  { label: "Logística",         tone: "bg-primary/15 text-primary border-primary/30" },
  estoque:    { label: "Estoque",           tone: "bg-destructive/15 text-destructive border-destructive/30" },
};
