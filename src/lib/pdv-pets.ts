export function petsSelecionados(valor: string | null | undefined): string[] {
  return Array.from(new Set((valor ?? "").split(",").map((nome) => nome.trim()).filter(Boolean)));
}

export function petDoItem(petItem: string | null | undefined, petsVenda: string): string | null {
  const nome = petItem?.trim();
  if (nome) return nome;
  const selecionados = petsSelecionados(petsVenda);
  return selecionados.length === 1 ? selecionados[0] : null;
}
