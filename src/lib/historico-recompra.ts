import { calcularCicloPorHistorico } from "@/lib/recompra-calculo";

export type HistoricoVendaItem = {
  sku: string;
  nome: string;
  quantidade: number;
  /** Preço unitário do item na venda. */
  preco: number | null;
  petNome: string | null;
  racao: boolean;
  /** Kg de ração do item (pacote × quantidade). 0 quando não é ração ou o peso é desconhecido. */
  pesoKg: number;
  /** Ração dos mesmos pets e espécie da previsão: é o que conta para o ciclo. */
  entraNoCiclo: boolean;
};

export type HistoricoVendaRecompra = {
  vendaId: string;
  /** Data da compra (YYYY-MM-DD), mesma base usada no cálculo do ciclo. */
  data: string;
  total: number | null;
  status: string | null;
  itens: HistoricoVendaItem[];
  /** Kg de ração dessa venda que entram no ciclo. */
  kgCiclo: number;
  /** Dias até a próxima venda que entra no ciclo (null na última ou se não entra no ciclo). */
  durouDias: number | null;
  /** Consumo real nesse intervalo, quando o peso é conhecido. */
  consumoRealG: number | null;
};

export type VereditoCicloHistorico = "bate" | "curto" | "longo" | "sem_dados";

export type ComparacaoCicloHistorico = {
  veredito: VereditoCicloHistorico;
  /** Ciclo que o histórico real indica para a compra atual. */
  cicloHistorico: number | null;
  /** Média simples dos intervalos entre compras que entram no ciclo. */
  intervaloMedioDias: number | null;
  consumoRealG: number | null;
  /** cicloUsado − cicloHistorico (positivo = previsão mais longa que o real). */
  diferencaDias: number | null;
  comprasNoCiclo: number;
};

function diasEntre(inicio: string, fim: string): number {
  const a = new Date(`${inicio.slice(0, 10)}T00:00:00.000Z`).getTime();
  const b = new Date(`${fim.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Preenche quanto cada compra de ração durou até a próxima (vendas em qualquer ordem). */
export function calcularDuracoesHistorico(
  vendas: Array<Omit<HistoricoVendaRecompra, "durouDias" | "consumoRealG">>,
): HistoricoVendaRecompra[] {
  const ordenadas = [...vendas].sort((a, b) => b.data.localeCompare(a.data));
  let proximaNoCiclo: string | null = null;

  return ordenadas.map((venda) => {
    const entra = venda.itens.some((item) => item.entraNoCiclo);
    if (!entra) return { ...venda, durouDias: null, consumoRealG: null };

    const durouDias = proximaNoCiclo ? diasEntre(venda.data, proximaNoCiclo) : null;
    proximaNoCiclo = venda.data;
    return {
      ...venda,
      durouDias,
      consumoRealG:
        durouDias && durouDias > 0 && venda.kgCiclo > 0
          ? Math.round((venda.kgCiclo * 1000) / durouDias)
          : null,
    };
  });
}

/**
 * Compara o ciclo usado na previsão com o que o histórico de vendas mostra.
 * Tolerância: 3 dias ou 10% do ciclo, o que for maior.
 */
export function compararCicloComHistorico(
  vendas: HistoricoVendaRecompra[],
  cicloUsado: number,
): ComparacaoCicloHistorico {
  const noCiclo = vendas.filter((venda) => venda.itens.some((item) => item.entraNoCiclo));
  const ciclo = calcularCicloPorHistorico(
    noCiclo.map((venda) => ({ data: venda.data, pesoKg: venda.kgCiclo })),
  );
  const intervalos = noCiclo
    .map((venda) => venda.durouDias)
    .filter((dias): dias is number => dias != null && dias > 0);
  const intervaloMedioDias = intervalos.length
    ? Math.round(intervalos.reduce((soma, dias) => soma + dias, 0) / intervalos.length)
    : null;

  if (!ciclo) {
    return {
      veredito: "sem_dados",
      cicloHistorico: null,
      intervaloMedioDias,
      consumoRealG: null,
      diferencaDias: null,
      comprasNoCiclo: noCiclo.length,
    };
  }

  const diferencaDias = cicloUsado - ciclo.dias;
  const tolerancia = Math.max(3, Math.round(ciclo.dias * 0.1));
  const veredito: VereditoCicloHistorico =
    Math.abs(diferencaDias) <= tolerancia ? "bate" : diferencaDias > 0 ? "longo" : "curto";

  return {
    veredito,
    cicloHistorico: ciclo.dias,
    intervaloMedioDias,
    consumoRealG: ciclo.consumoRealG,
    diferencaDias,
    comprasNoCiclo: noCiclo.length,
  };
}
