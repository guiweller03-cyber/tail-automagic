const NOME_CLIENTE_GENERICO_RE = /^cliente\s+\d+$/i;
const NOMES_DA_LOJA_RE = [/^mundo\s+pet\s+delivery$/i, /^mundo\s+pet$/i];

export function normalizarNomeContatoWhatsapp(value?: string | null): string | null {
  const nome = value?.trim().replace(/\s+/g, " ");
  if (!nome || NOME_CLIENTE_GENERICO_RE.test(nome)) return null;
  if (NOMES_DA_LOJA_RE.some((pattern) => pattern.test(nome))) return null;

  return nome;
}
