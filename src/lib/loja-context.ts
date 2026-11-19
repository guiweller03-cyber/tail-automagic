import { AsyncLocalStorage } from "node:async_hooks";

export type LojaId = "loja1" | "loja2";

const contexto = new AsyncLocalStorage<LojaId>();

export function lojaAtual(): LojaId {
  return contexto.getStore() ?? "loja1";
}

export function comLoja<T>(loja: LojaId, executar: () => T): T {
  return contexto.run(loja, executar);
}

export function configuracaoLoja(nome: string): string | undefined {
  if (lojaAtual() === "loja2") {
    const valor = process.env[`LOJA2_${nome}`]?.trim();
    if (valor) return valor;
    if (nome.startsWith("SUPABASE_") || nome.startsWith("UAZAPI_")) return undefined;
  }
  return process.env[nome]?.trim() || undefined;
}

export function exigirConfiguracaoLoja(nome: string): string {
  const valor = configuracaoLoja(nome);
  if (!valor) throw new Error(`Configuração ausente para ${lojaAtual()}: ${nome}`);
  return valor;
}

export function lojaOperacional(loja: LojaId): boolean {
  if (loja === "loja1") return true;
  return Boolean(
    process.env.LOJA2_ATIVA === "1" &&
      process.env.LOJA2_SUPABASE_URL &&
      (process.env.LOJA2_SUPABASE_SERVICE_ROLE_KEY || process.env.LOJA2_SUPABASE_SECRET_KEY) &&
      process.env.LOJA2_UAZAPI_URL &&
      process.env.LOJA2_UAZAPI_TOKEN &&
      process.env.LOJA2_UAZAPI_WEBHOOK_SECRET,
  );
}
