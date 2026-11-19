import type { Cliente, PetDetalhe } from "./crm-types";
import { normalizarBusca } from "./crm-search";

/** Vincula a venda somente a um cadastro identificado por inteiro. */
export function clienteDaVenda<T extends { id: string; nome: string; telefone: string }>(
  clientes: T[],
  busca: string,
  idSelecionado?: string,
): T | undefined {
  const nome = normalizarBusca(busca);
  const telefone = busca.replace(/\D/g, "");
  const selecionado = clientes.find((cliente) => cliente.id === idSelecionado);
  if (selecionado && selecionado.nome === busca) return selecionado;
  if (!nome) return undefined;
  const encontrados = clientes.filter(
    (cliente) =>
      normalizarBusca(cliente.nome) === nome ||
      (telefone.length >= 8 && cliente.telefone.replace(/\D/g, "") === telefone),
  );
  return encontrados.length === 1 ? encontrados[0] : undefined;
}

/** Cadastros antigos podem ter nomes sem uma ficha detalhada correspondente. */
export function petsDoCadastro(cliente: Pick<Cliente, "pets" | "petsDetalhes">): PetDetalhe[] {
  const detalhes = [...(cliente.petsDetalhes ?? [])];
  const nomes = new Set(detalhes.map((pet) => normalizarBusca(pet.nome)));
  for (const nome of cliente.pets ?? []) {
    const chave = normalizarBusca(nome);
    if (chave && !nomes.has(chave)) {
      detalhes.push({ nome: nome.trim() });
      nomes.add(chave);
    }
  }
  return detalhes;
}

/** Seleção inicial da ração: uma única compra pode alimentar todos os pets do tutor. */
export function nomesPetsDoCliente(cliente: Pick<Cliente, "pets" | "petsDetalhes">): string {
  return petsDoCadastro(cliente)
    .map((pet) => pet.nome.trim())
    .filter(Boolean)
    .join(", ");
}
