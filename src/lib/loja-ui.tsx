import { createContext, useContext } from "react";
import type { LojaId } from "./loja-context";

export const LojaContext = createContext<LojaId>("loja1");
export function useLoja(): LojaId { return useContext(LojaContext); }
