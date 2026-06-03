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

const EMPTY_INITIAL: Alerta[] = [];

function load(): Alerta[] {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // Alertas mockados locais nao devem travar a tela.
    }
  }

  return EMPTY_INITIAL;
}

let memory: Alerta[] = load();
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }
function save() {
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
    memory = EMPTY_INITIAL;
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
