import { useContext } from "react";
import { VendasContext } from "@/contexts/vendas-store";

export function useVendas() {
  const ctx = useContext(VendasContext);
  if (!ctx) throw new Error("useVendas precisa estar dentro de <VendasProvider>");
  return ctx;
}
