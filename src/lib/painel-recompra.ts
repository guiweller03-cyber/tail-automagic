import type { RecompraPrevista } from "@/lib/crm-types";

export type PainelSituacao = "atrasado" | "urgente" | "normal";

export function situacaoPainel(item: Pick<RecompraPrevista, "diasRestantes">): PainelSituacao {
  if (item.diasRestantes < 0) return "atrasado";
  if (item.diasRestantes <= 3) return "urgente";
  return "normal";
}

export function nomesPets(item: Pick<RecompraPrevista, "pet" | "petsCalculo">): string[] {
  const nomeUtil = (nome: string) => /\p{L}/u.test(nome) && !/^pets?$/i.test(nome);
  const detalhados = (item.petsCalculo ?? [])
    .map((pet) => pet.nome.trim())
    .filter((nome) => nomeUtil(nome));
  if (detalhados.length > 0) return detalhados;

  return item.pet
    .split(/\s*(?:,|\+|\be\b)\s*/i)
    .map((nome) => nome.trim())
    .filter((nome) => nomeUtil(nome));
}

export function dataRecompra(item: Pick<RecompraPrevista, "dataPrevistaIso" | "diasRestantes">) {
  if (item.dataPrevistaIso) {
    const parsed = new Date(`${item.dataPrevistaIso.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date();
  fallback.setHours(12, 0, 0, 0);
  fallback.setDate(fallback.getDate() + item.diasRestantes);
  return fallback;
}

export function previsaoPorMes(items: RecompraPrevista[]) {
  const valores = new Map<string, number>();

  for (const item of items) {
    const data = dataRecompra(item);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    valores.set(chave, (valores.get(chave) ?? 0) + item.valorEstimado);
  }

  return [...valores.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, valor]) => {
      const [ano, mes] = chave.split("-").map(Number);
      const data = new Date(ano, mes - 1, 1);
      return {
        chave,
        mes: data
          .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
          .replace(". de ", "/"),
        valor: Math.round(valor * 100) / 100,
      };
    });
}

export function telefoneWhatsApp(telefone: string): string {
  const digits = telefone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function telefoneComparavel(telefone: string): string {
  const digits = telefoneWhatsApp(telefone);
  return digits.slice(-9);
}

/** Explica, em uma frase, de onde saiu o ciclo usado na previsão. */
export function explicacaoCiclo(item: RecompraPrevista): string {
  const calculado = item.cicloCalculado ?? item.previsaoBase;
  if (item.cicloManual) {
    return `Ciclo ajustado manualmente para ${item.cicloManual} dias (o cálculo automático sugeria ${calculado} dias).`;
  }

  switch (item.origemCiclo) {
    case "historico":
      return `${calculado} dias = média dos intervalos reais entre as últimas compras deste produto (${item.historicoDias.join(", ")} dias).`;
    case "observacao":
      return `${calculado} dias anotados na observação do pedido (marcador recompra_auto).`;
    case "cadastro_manual":
      return `${calculado} dias definidos no cadastro manual da venda.`;
    default:
      return `${item.pesoKg.toLocaleString("pt-BR")} kg de ração ÷ ${Math.round(item.consumoDiaKg * 1000)} g/dia = aproximadamente ${calculado} dias de consumo.`;
  }
}

export function mensagemRecompra(item: RecompraPrevista): string {
  const primeiroNome = item.cliente.trim().split(/\s+/)[0] || "Oi";
  const saudacao = /@|\p{L}.*@/u.test(primeiroNome) ? "Oi!" : `Oi, ${primeiroNome}!`;
  const pets = nomesPets(item);
  const referenciaPet = pets.length > 0 ? `de ${pets.join(" e ")}` : "do seu pet";
  const quando =
    item.diasRestantes < 0
      ? `deve ter acabado há cerca de ${Math.abs(item.diasRestantes)} ${Math.abs(item.diasRestantes) === 1 ? "dia" : "dias"}`
      : item.diasRestantes === 0
        ? "deve acabar hoje"
        : `deve acabar em cerca de ${item.diasRestantes} ${item.diasRestantes === 1 ? "dia" : "dias"}`;
  const quantidade = Math.max(1, item.quantidade);
  const unidade = quantidade === 1 ? "pacote" : "pacotes";

  return [
    `${saudacao} Pelas nossas contas, a ração ${referenciaPet} ${quando}.`,
    `A última compra foi de ${quantidade} ${unidade} de ${item.racao}.`,
    `Quer que eu já separe novamente para você?`,
  ].join("\n\n");
}
