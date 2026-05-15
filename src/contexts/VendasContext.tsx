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

const seed: Venda[] = [
  { id: "V-1042", hora: "14:32", data: "hoje", cliente: "Marina Costa", telefone: "(11) 99812-3344", itens: [{ sku: "x", nome: "Golden Adultos 15kg", preco: 289.9, precoCompra: 200, qtd: 1 }], total: 289.9, pay: "Pix", statusPag: "Pago", status: "Concluída", whatsEnviado: true },
  { id: "V-1041", hora: "13:48", data: "hoje", cliente: "Júlia Ramos", telefone: "(11) 98011-2231", itens: [{ sku: "y", nome: "Petisco Natural 90g", preco: 24, precoCompra: 12, qtd: 2 }, { sku: "z", nome: "Brinquedo corda", preco: 39.9, precoCompra: 18, qtd: 1 }], total: 87.9, pay: "Cartão", statusPag: "Pago", status: "Concluída" },
  { id: "V-1040", hora: "12:10", data: "hoje", cliente: "Pedro Alves", telefone: "(11) 99423-7788", itens: [{ sku: "a", nome: "Areia Higiênica 4kg", preco: 35, precoCompra: 18, qtd: 1 }], total: 35, pay: "Dinheiro", statusPag: "Pendente", status: "Concluída" },
];

export function VendasProvider({ children }: { children: ReactNode }) {
  const [vendas, setVendas] = useState<Venda[]>(seed);
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
