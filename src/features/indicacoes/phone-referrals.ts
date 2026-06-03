// Serviços de indicação por telefone (frontend-only, prontos p/ Supabase)
import type { CompraIndicado } from "./data";
import type { Cliente } from "@/lib/crm-types";

export const DESCONTO_INDICACAO = 0.10; // 10% OFF na 1ª compra do indicado

/** Mantém apenas dígitos. "+55 (11) 9 9812-3344" → "5511998123344" */
export function normalizePhone(raw: string): string {
  return (raw || "").replace(/\D+/g, "");
}

/** Compara dois telefones ignorando máscara e DDI 55 inicial. */
export function samePhone(a: string, b: string): boolean {
  const na = normalizePhone(a).replace(/^55/, "");
  const nb = normalizePhone(b).replace(/^55/, "");
  return na.length >= 8 && na === nb;
}

export function findClienteByPhone(tel: string, clientes: Cliente[]): Cliente | null {
  const n = normalizePhone(tel);
  if (n.length < 8) return null;
  return clientes.find((c) => samePhone(c.telefone, tel)) ?? null;
}

export type ReferralValidation =
  | { ok: true; indicador: Cliente }
  | { ok: false; code: "INVALID" | "NOT_FOUND" | "SELF" | "ALREADY_USED"; message: string };

/**
 * Valida o telefone informado pelo indicado no checkout.
 *  - normaliza
 *  - confere se pertence a um cliente existente
 *  - bloqueia auto-indicação
 *  - bloqueia se o indicado já usou o desconto antes
 */
export function validateReferralPhone(params: {
  telefoneIndicador: string;
  telefoneIndicado?: string;
  nomeIndicado?: string;
  clientes: Cliente[];
  comprasExistentes: CompraIndicado[];
}): ReferralValidation {
  const tel = normalizePhone(params.telefoneIndicador);
  if (tel.length < 8) return { ok: false, code: "INVALID", message: "Telefone inválido." };

  const indicador = findClienteByPhone(tel, params.clientes);
  if (!indicador) return { ok: false, code: "NOT_FOUND", message: "Telefone não pertence a nenhum cliente." };

  if (params.telefoneIndicado && samePhone(params.telefoneIndicador, params.telefoneIndicado)) {
    return { ok: false, code: "SELF", message: "Auto-indicação não é permitida." };
  }

  // Primeira compra: se já existe registro do indicado (mesmo telefone OU mesmo nome) com desconto aplicado, bloqueia
  const jaUsou = params.comprasExistentes.some((c) => {
    if (!c.descontoAplicado) return false;
    if (params.telefoneIndicado && c.indicadoTelefone && samePhone(c.indicadoTelefone, params.telefoneIndicado)) return true;
    if (params.nomeIndicado && c.indicadoNome.toLowerCase() === params.nomeIndicado.trim().toLowerCase()) return true;
    return false;
  });
  if (jaUsou) return { ok: false, code: "ALREADY_USED", message: "Este cliente já utilizou o desconto de indicação." };

  return { ok: true, indicador };
}

export function applyReferralDiscount(subtotal: number) {
  const desconto = +(subtotal * DESCONTO_INDICACAO).toFixed(2);
  return { desconto, total: +(subtotal - desconto).toFixed(2), percentual: DESCONTO_INDICACAO * 100 };
}

export function formatPhone(raw: string): string {
  const n = normalizePhone(raw).replace(/^55/, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return raw;
}
