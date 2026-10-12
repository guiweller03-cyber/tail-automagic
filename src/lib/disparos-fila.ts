// Fila de disparo com cooldown entre mensagens. Roda no navegador: cada contato
// vai numa requisicao propria e a espera entre eles fica aqui, nao no worker.

export type CooldownNivel = "perigoso" | "medio" | "seguro";

export const COOLDOWNS: Record<
  CooldownNivel,
  { label: string; minMs: number; maxMs: number; descricao: string; className: string }
> = {
  perigoso: {
    label: "Perigoso",
    minMs: 30_000,
    maxMs: 60_000,
    descricao: "30s a 1min entre mensagens. Rapido, mas com alto risco de ban do WhatsApp.",
    className: "bg-destructive/15 text-destructive",
  },
  medio: {
    label: "Medio",
    minMs: 2 * 60_000,
    maxMs: 3 * 60_000,
    descricao: "2 a 3min entre mensagens. Equilibrio entre velocidade e risco.",
    className: "bg-accent/15 text-accent",
  },
  seguro: {
    label: "Seguro",
    minMs: 4 * 60_000,
    maxMs: 6 * 60_000,
    descricao: "4 a 6min entre mensagens (~5min). Mais lento, menor risco de bloqueio.",
    className: "bg-success/15 text-success",
  },
};

// Intervalo aleatorio para parecer envio humano e reduzir risco de ban.
export function cooldownAleatorio(nivel: CooldownNivel, random = Math.random): number {
  const { minMs, maxMs } = COOLDOWNS[nivel];
  return minMs + random() * (maxMs - minMs);
}

export function tempoEstimadoMs(contatos: number, nivel: CooldownNivel): number {
  const { minMs, maxMs } = COOLDOWNS[nivel];
  return Math.max(0, contatos - 1) * ((minMs + maxMs) / 2);
}

export function formatarDuracao(ms: number): string {
  const totalSeg = Math.max(0, Math.round(ms / 1000));
  if (totalSeg < 60) return `${totalSeg}s`;
  const min = Math.floor(totalSeg / 60);
  const seg = totalSeg % 60;
  if (min < 60) return seg ? `${min}min${String(seg).padStart(2, "0")}s` : `${min}min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

export type FilaDisparoOpcoes<T> = {
  itens: T[];
  /** Envia um contato. Deve tratar os proprios erros; um erro aqui nao para a fila. */
  enviar: (item: T, index: number) => Promise<void>;
  /** Sorteia o intervalo ate a proxima mensagem (contado a partir do inicio do envio). */
  intervaloMs: () => number;
  aguardar: (ms: number) => Promise<void>;
  deveParar: () => boolean;
  agora?: () => number;
  onEsperando?: (ms: number) => void;
};

export async function executarFilaDisparo<T>({
  itens,
  enviar,
  intervaloMs,
  aguardar,
  deveParar,
  agora = Date.now,
  onEsperando,
}: FilaDisparoOpcoes<T>): Promise<{ processados: number; interrompido: boolean }> {
  let processados = 0;

  for (const [index, item] of itens.entries()) {
    if (deveParar()) break;
    const inicioEnvio = agora();
    try {
      await enviar(item, index);
    } catch (error) {
      console.error("[disparos] erro_envio", error);
    }
    processados += 1;

    const ultimo = index === itens.length - 1;
    if (!ultimo && !deveParar()) {
      // O tempo gasto no envio ja conta como parte do intervalo.
      const espera = Math.max(0, intervaloMs() - (agora() - inicioEnvio));
      onEsperando?.(espera);
      await aguardar(espera);
    }
  }

  return { processados, interrompido: processados < itens.length };
}
