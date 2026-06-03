import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Pay = "Pix" | "Cartão" | "Dinheiro";
export type StatusPag = "Pago" | "Pendente";
export type StatusVenda = "Concluída" | "Cancelada" | "Reembolsada";
export type Item = { sku: string; nome: string; preco: number; precoCompra: number; qtd: number };
export type Venda = {
  id: string;
  hora: string;
  data: string;
  cliente: string;
  telefone: string;
  itens: Item[];
  total: number;
  pay: Pay;
  statusPag: StatusPag;
  status: StatusVenda;
  obs?: string;
  motivoCancel?: string;
  canceladoPor?: string;
  canceladoEm?: string;
  whatsEnviado?: boolean;
};

type Ctx = {
  vendas: Venda[];
  addVenda: (v: Venda) => void;
  cancelarVenda: (id: string, motivo: string, por?: string) => void;
};

const VendasContext = createContext<Ctx | null>(null);

export function VendasProvider({ children }: { children: ReactNode }) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const addVenda = useCallback((v: Venda) => setVendas((vs) => [v, ...vs]), []);
  const cancelarVenda = useCallback((id: string, motivo: string, por = "Operador (você)") => {
    setVendas((vs) => vs.map((v) => v.id === id ? { ...v, status: "Cancelada", motivoCancel: motivo, canceladoPor: por, canceladoEm: new Date().toLocaleString("pt-BR") } : v));
  }, []);
  const value = useMemo(() => ({ vendas, addVenda, cancelarVenda }), [vendas, addVenda, cancelarVenda]);
  return <VendasContext.Provider value={value}>{children}</VendasContext.Provider>;
}

export function useVendas() {
  const ctx = useContext(VendasContext);
  if (!ctx) throw new Error("useVendas precisa estar dentro de <VendasProvider>");
  return ctx;
}
