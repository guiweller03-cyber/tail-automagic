/** Busca compartilhada: acentos, palavras em qualquer ordem e números formatados. */
export function normalizarBusca(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function digitosBusca(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function variantesTelefone(value: unknown): string[] {
  const digits = digitosBusca(value);
  const nacional = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  const variantes = [digits, nacional];
  if (nacional.length === 11 && nacional[2] === "9") {
    variantes.push(nacional.slice(0, 2) + nacional.slice(3));
  }
  return variantes;
}

export function telefoneCorrespondeBusca(value: unknown, query: unknown): boolean {
  if (/[a-z]/.test(normalizarBusca(query))) return false;
  const termo = digitosBusca(query);
  if (termo.length < 3) return false;
  return variantesTelefone(value).some((numero) =>
    variantesTelefone(query).some((busca) => busca.length >= 3 && numero.includes(busca)),
  );
}

export function correspondeBusca(
  query: string,
  campos: unknown[],
  telefones: unknown[] = [],
): boolean {
  const termo = normalizarBusca(query);
  if (!termo) return true;
  if (telefones.some((telefone) => telefoneCorrespondeBusca(telefone, query))) return true;
  const textos = campos.map(normalizarBusca).filter(Boolean);
  // Mantém blocos numéricos juntos: "Maria (11) 98765-4321" exige nome e telefone.
  const palavras = termo.match(/[a-z]+|\d+(?: \d+)*/g) ?? [];
  return palavras.every(
    (palavra) =>
      textos.some((texto) => texto.includes(palavra)) ||
      telefones.some((telefone) => telefoneCorrespondeBusca(telefone, palavra)),
  );
}

type ClienteBusca = {
  nome?: string | null;
  telefone?: string | null;
  pets?: string[];
  petsDetalhes?: Array<{ nome?: string; raca?: string; especie?: string }>;
  bairro?: string;
  origem?: string;
};

export function camposClienteBusca(cliente?: ClienteBusca | null): unknown[] {
  return [
    cliente?.nome,
    cliente?.bairro,
    cliente?.origem,
    ...(cliente?.pets ?? []),
    ...(cliente?.petsDetalhes ?? []).flatMap((pet) => [pet.nome, pet.raca, pet.especie]),
  ];
}

export function clienteCorrespondeBusca(cliente: ClienteBusca, query: string): boolean {
  return correspondeBusca(query, camposClienteBusca(cliente), [cliente.telefone]);
}
