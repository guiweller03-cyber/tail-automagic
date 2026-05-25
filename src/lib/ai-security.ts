const MAX_UNTRUSTED_TEXT = 1_500;
const MAX_LESSON_TEXT = 220;

const CUSTOMER_POLICY_REDIRECT =
  "Posso ajudar com produtos, pedidos e entregas do Mundo Pet. O que voce precisa pro seu pet?";
const CUSTOMER_SAFE_FALLBACK = "Vou chamar a equipe para continuar seu atendimento.";

const promptAttackPatterns = [
  /\b(?:ignore|forget|override|bypass|disregard)\b.{0,80}\b(?:instruction|prompt|rule|policy|system|developer)\b/i,
  /\b(?:ignore|esque[cç]a|desconsidere|anule|substitua|quebre|burle)\b.{0,80}\b(?:instru[cç][aã]o|prompt|regra|pol[ií]tica|sistema|anterior)\b/i,
  /\b(?:system|developer)\s+(?:message|prompt|instruction)s?\b/i,
  /\b(?:prompt|mensagem)\s+(?:do\s+)?(?:sistema|system|developer|desenvolvedor)\b/i,
  /\b(?:reveal|show|print|expose|leak|copie|mostre|revele|imprima)\b.{0,80}\b(?:prompt|instruction|rule|secret|token|api\s*key|system)\b/i,
  /\b(?:segredo|token|chave\s+(?:de\s+)?api|api\s*key|vari[aá]ve(?:l|is)\s+de\s+ambiente)\b/i,
  /\b(?:jailbreak|dan\b|role\s*play|finja\s+que|modo\s+desenvolvedor)\b/i,
  /\[(?:pedido|handoff|salvar_cliente|produto_procurado)\b/i,
];

const learnedInstructionPatterns = [
  ...promptAttackPatterns,
  /\b(?:fa[cç]a|responda|diga|envie|salve|registre|sempre|nunca)\b.{0,80}\b(?:prompt|segredo|token|pix|pagamento|pedido|cliente)\b/i,
  /\b(?:link|http|https|www\.)\b/i,
];

const outputLeakPatterns = [
  /\b(?:system|developer)\s+(?:message|prompt|instruction)s?\b/i,
  /\b(?:prompt|instru[cç][oõ]es?|regras?)\s+(?:intern[ao]s?|do\s+sistema|de\s+sistema)\b/i,
  /\b(?:seguran[cç]a\s+absoluta|pol[ií]tica\s+de\s+seguran[cç]a|regras?\s+de\s+sa[ií]da)\b/i,
  /\b(?:pedido|handoff|salvar[_\s-]?cliente|produto[_\s-]?procurado)\b\s*[:=]/i,
  /\b(?:OPENAI_API_KEY|SUPABASE_[A-Z_]+|UAZAPI_[A-Z_]+|MP_ACCESS_TOKEN)\b/i,
  /\b(?:api\s*key|bearer\s+|sb_secret_|service_role|senha|token\s+secreto)\b/i,
];

function limparTextoNaoConfiavel(value: string, maxLength: number): string {
  return value
    .replaceAll(/./gs, (character) =>
      character.charCodeAt(0) < 32 && !/[\t\n\r]/.test(character) ? " " : character,
    )
    .replace("\u007f", " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function limitarTextoNaoConfiavel(value: string): string {
  return limparTextoNaoConfiavel(value, MAX_UNTRUSTED_TEXT);
}

export function respostaParaTentativaDeInjecao(value: string): string | null {
  const mensagem = limitarTextoNaoConfiavel(value);

  return promptAttackPatterns.some((pattern) => pattern.test(mensagem))
    ? CUSTOMER_POLICY_REDIRECT
    : null;
}

export function filtrarAprendizadosSeguros(aprendizados: string[]): string[] {
  return aprendizados
    .map((aprendizado) => limparTextoNaoConfiavel(aprendizado, MAX_LESSON_TEXT))
    .filter(Boolean)
    .filter(
      (aprendizado) => !learnedInstructionPatterns.some((pattern) => pattern.test(aprendizado)),
    )
    .slice(0, 5);
}

export function respostaClienteTemVazamentoInterno(value: string): boolean {
  return outputLeakPatterns.some((pattern) => pattern.test(value));
}

export function limparMarcadoresTecnicosResposta(value: string): string {
  return value
    .replace(/\[(?:PRODUTO_PROCURADO|SALVAR_CLIENTE|PEDIDO|HANDOFF)\b[^\]]*\][^\r\n]*/gi, "")
    .replace(
      /<(?:PRODUTO_PROCURADO|SALVAR_CLIENTE|PEDIDO|HANDOFF|tool(?:_call)?|internal|system|developer)\b[^>]*>[\s\S]*?<\/(?:PRODUTO_PROCURADO|SALVAR_CLIENTE|PEDIDO|HANDOFF|tool(?:_call)?|internal|system|developer)>/gi,
      "",
    )
    .replace(/^\s*(?:PRODUTO_PROCURADO|SALVAR_CLIENTE|PEDIDO|HANDOFF)\b\s*:?.*$/gim, "")
    .replace(/^\s*(?:registrar|salvar|consultar|buscar)_[a-z_]+\b.*$/gim, "")
    .replace(/\s*(?:,|;)?\s*(?:registrar|salvar|consultar|buscar)_[a-z_]*\s*$/i, "")
    .trim();
}

export function protegerRespostaCliente(value: string): string {
  return respostaClienteTemVazamentoInterno(value) ? CUSTOMER_POLICY_REDIRECT : value;
}

export function respostaClienteSegura(value: string): string {
  const resposta = protegerRespostaCliente(value.trim());

  return resposta || CUSTOMER_SAFE_FALLBACK;
}
