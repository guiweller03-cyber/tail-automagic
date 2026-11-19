import { configuracaoLoja } from "./loja-context.ts";

/**
 * Ponto unico de escolha de modelo da OpenAI.
 *
 * - "principal": conversa com cliente, sugestao de resposta, assistente,
 *   auditoria de recompra. Padrao gpt-5.5.
 * - "rapido": extracoes estruturadas (cadastro, compra, comprovante),
 *   follow-up curto e reformulacao. Padrao gpt-5.4-mini.
 *
 * Os dois podem ser trocados sem deploy de codigo pelas variaveis
 * OPENAI_MODEL e OPENAI_FAST_MODEL (e LOJA2_OPENAI_MODEL etc. por loja).
 */
export type NivelModelo = "principal" | "rapido";

export const MODELO_PRINCIPAL_PADRAO = "gpt-5.5";
export const MODELO_RAPIDO_PADRAO = "gpt-5.4-mini";

export function modeloOpenAI(nivel: NivelModelo = "principal"): string {
  if (nivel === "rapido") {
    return configuracaoLoja("OPENAI_FAST_MODEL") || MODELO_RAPIDO_PADRAO;
  }
  return configuracaoLoja("OPENAI_MODEL") || MODELO_PRINCIPAL_PADRAO;
}

/** Chave da OpenAI da loja atual (LOJA2_OPENAI_API_KEY cai na chave principal se nao existir). */
export function chaveOpenAI(): string {
  const chave = configuracaoLoja("OPENAI_API_KEY");
  if (!chave) throw new Error("Missing environment variable: OPENAI_API_KEY");
  return chave;
}

/** Modelos de raciocinio (gpt-5+, o-series) nao aceitam temperature nem max_tokens. */
export function modeloDeRaciocinio(modelo: string): boolean {
  return /^(gpt-[5-9]|gpt-\d{2,}|o\d)/i.test(modelo.trim());
}

export type EsforcoRaciocinio = "low" | "medium" | "high";

/**
 * Monta model + limites de tokens no formato que o modelo aceita.
 * Em modelos de raciocinio o limite inclui os tokens de raciocinio, entao
 * damos folga para a resposta visivel nao sair vazia. So o que for usado
 * e cobrado.
 */
export function parametrosChat({
  nivel = "principal",
  modelo,
  maxTokens,
  temperature,
  esforco = "low",
}: {
  nivel?: NivelModelo;
  modelo?: string;
  maxTokens: number;
  temperature?: number;
  esforco?: EsforcoRaciocinio;
}): Record<string, unknown> {
  const model = modelo?.trim() || modeloOpenAI(nivel);

  if (modeloDeRaciocinio(model)) {
    return {
      model,
      reasoning_effort: esforco,
      max_completion_tokens: maxTokens + (esforco === "low" ? 2_000 : 6_000),
    };
  }

  return {
    model,
    max_tokens: maxTokens,
    ...(temperature === undefined ? {} : { temperature }),
  };
}
