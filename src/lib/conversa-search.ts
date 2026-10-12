type ConversaPesquisavel = {
  cliente?: string | null;
  telefone?: string | null;
  ultima?: string | null;
};

type ClientePesquisavel = {
  nome?: string | null;
  telefone?: string | null;
};

/** Normaliza texto humano para que acentos, caixa e espacos nao atrapalhem a busca. */
export function normalizarBuscaConversa(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function digitosBuscaConversa(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Aceita o numero com ou sem DDI 55 e tambem pesquisas pelos ultimos digitos.
 * A busca parcial so e ativada com 3 ou mais digitos para evitar falsos positivos.
 */
export function telefoneCorrespondeBusca(value: unknown, query: unknown): boolean {
  const telefone = digitosBuscaConversa(value);
  const termo = digitosBuscaConversa(query);
  if (termo.length < 3 || telefone.length === 0) return false;

  const telefoneSemDdi =
    telefone.startsWith("55") && telefone.length > 11 ? telefone.slice(2) : telefone;
  const termoSemDdi = termo.startsWith("55") && termo.length > 11 ? termo.slice(2) : termo;
  const candidatosTelefone = new Set([
    telefone,
    telefoneSemDdi,
    telefoneSemDdi.slice(-11),
    telefoneSemDdi.slice(-10),
    telefoneSemDdi.slice(-9),
    telefoneSemDdi.slice(-8),
  ]);
  const candidatosTermo = new Set([
    termo,
    termoSemDdi,
    termoSemDdi.slice(-11),
    termoSemDdi.slice(-10),
    termoSemDdi.slice(-9),
    termoSemDdi.slice(-8),
  ]);

  return [...candidatosTelefone].some((numero) =>
    [...candidatosTermo].some((busca) => busca.length >= 3 && numero.includes(busca)),
  );
}

/** Busca na conversa e na ficha vinculada do cliente. */
export function conversaCorrespondeBusca(
  conversa: ConversaPesquisavel,
  query: string,
  cliente?: ClientePesquisavel | null,
): boolean {
  const termo = normalizarBuscaConversa(query);
  if (!termo) return true;

  const camposTexto = [conversa.cliente, cliente?.nome, conversa.ultima]
    .map(normalizarBuscaConversa)
    .filter(Boolean);
  const palavras = termo.split(" ").filter(Boolean);
  const textoCorresponde = palavras.every((palavra) =>
    camposTexto.some((campo) => campo.includes(palavra)),
  );

  return (
    textoCorresponde ||
    telefoneCorrespondeBusca(conversa.telefone, query) ||
    telefoneCorrespondeBusca(cliente?.telefone, query)
  );
}
