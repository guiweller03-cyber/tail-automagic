import { createContext } from "react";

export type Pay = "Pix" | "Cartão" | "Dinheiro";
export type StatusPag = "Pago" | "Pendente";
export type StatusVenda = "Concluída" | "Cancelada" | "Reembolsada";
export type Item = {
  sku: string;
  nome: string;
  preco: number;
  precoCompra: number;
  qtd: number;
  petNome?: string | null;
};
export type Venda = {
  id: string;
  hora: string;
  data: string;
  cliente: string;
  telefone: string;
  itens: Item[];
  total: number;
  taxaMaquininha?: number;
  lucroLiquido?: number;
  pay: Pay;
  statusPag: StatusPag;
  status: StatusVenda;
  obs?: string;
  motivoCancel?: string;
  canceladoPor?: string;
  canceladoEm?: string;
  whatsEnviado?: boolean;
  vendaOrigem?: string;
  adicionalDe?: number;
};

export type VendasContextValue = {
  vendas: Venda[];
  addVenda: (v: Venda) => void;
  cancelarVenda: (id: string, motivo: string, por?: string) => void;
};

export const VendasContext = createContext<VendasContextValue | null>(null);
