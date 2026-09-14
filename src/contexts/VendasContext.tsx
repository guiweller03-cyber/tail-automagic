import { useCallback, useMemo, useState, type ReactNode, useContext } from "react";
import { VendasContext, type Venda } from "@/contexts/vendas-store";
export type { Item, Pay, StatusPag, Venda } from "@/contexts/vendas-store";

export function VendasProvider({ children }: { children: ReactNode }) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const setVendasRecentes = useCallback((nextVendas: Venda[]) => setVendas(nextVendas), []);
  const addVenda = useCallback((v: Venda) => setVendas((vs) => [v, ...vs]), []);
  const updateVenda = useCallback((id: string, patch: Partial<Venda>) => {
    setVendas((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }, []);
  const apagarVenda = useCallback((id: string) => {
    setVendas((vs) => vs.filter((v) => v.id !== id));
  }, []);
  const cancelarVenda = useCallback((id: string, motivo: string, por = "Operador (você)") => {
    setVendas((vs) =>
      vs.map((v) =>
        v.id === id
          ? {
              ...v,
              status: "Cancelada",
              motivoCancel: motivo,
              canceladoPor: por,
              canceladoEm: new Date().toLocaleString("pt-BR"),
            }
          : v,
      ),
    );
  }, []);
  const value = useMemo(
    () => ({ vendas, setVendasRecentes, addVenda, updateVenda, cancelarVenda, apagarVenda }),
    [vendas, setVendasRecentes, addVenda, updateVenda, cancelarVenda, apagarVenda],
  );
  return <VendasContext.Provider value={value}>{children}</VendasContext.Provider>;
}

export function useVendas() {
  const ctx = useContext(VendasContext);
  if (!ctx) throw new Error("useVendas must be used within VendasProvider");
  return ctx;
}
