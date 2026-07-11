import { useCallback, useMemo, useState, type ReactNode, useContext } from "react";
import { VendasContext, type Venda } from "@/contexts/vendas-store";

export function VendasProvider({ children }: { children: ReactNode }) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const addVenda = useCallback((v: Venda) => setVendas((vs) => [v, ...vs]), []);
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
    () => ({ vendas, addVenda, cancelarVenda }),
    [vendas, addVenda, cancelarVenda],
  );
  return <VendasContext.Provider value={value}>{children}</VendasContext.Provider>;
}

export function useVendas() {
  const ctx = useContext(VendasContext);
  if (!ctx) throw new Error("useVendas must be used within VendasProvider");
  return ctx;
}
