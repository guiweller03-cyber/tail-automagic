// Calendario do WhatsApp IA: agrupa por dia (fuso de Sao Paulo) os contatos que
// mandaram mensagem. O banco faz isso pela RPC contatos_mensagens_por_dia; esta
// versao em JS e o fallback quando a migration 20261006120000 nao esta aplicada.

export type ContatoDoDia = {
  conversaId: string;
  telefone: string;
  nome: string;
  dia: string; // YYYY-MM-DD
  mensagens: number;
  primeira: string;
  ultima: string;
  ultimaMensagem: string;
};

type MensagemHistorico = {
  role?: string;
  content?: string;
  at?: string;
  fromMe?: boolean;
};

type ConversaHistorico = {
  id: string;
  telefone: string;
  nome_cliente: string | null;
  historico: unknown;
};

const FUSO = "America/Sao_Paulo";

const formatoDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data (YYYY-MM-DD) de um instante no fuso de Sao Paulo. */
export function diaSaoPaulo(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return formatoDia.format(date);
}

/** Intervalo [inicio, fim) em UTC de um mes "YYYY-MM" no fuso de Sao Paulo (UTC-3). */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!match) return null;
  const ano = Number(match[1]);
  const mesIndex = Number(match[2]) - 1;
  if (mesIndex < 0 || mesIndex > 11) return null;
  // Brasil sem horario de verao desde 2019: meia-noite local = 03:00 UTC.
  const inicio = new Date(Date.UTC(ano, mesIndex, 1, 3));
  const fim = new Date(Date.UTC(ano, mesIndex + 1, 1, 3));
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export function agruparContatosPorDia(
  conversas: ConversaHistorico[],
  inicio: string,
  fim: string,
): ContatoDoDia[] {
  const inicioMs = new Date(inicio).getTime();
  const fimMs = new Date(fim).getTime();
  const grupos = new Map<string, ContatoDoDia>();

  for (const conversa of conversas) {
    if (!Array.isArray(conversa.historico)) continue;
    for (const item of conversa.historico as MensagemHistorico[]) {
      if (!item || item.role !== "user" || item.fromMe === true || !item.at) continue;
      const ms = new Date(item.at).getTime();
      if (!Number.isFinite(ms) || ms < inicioMs || ms >= fimMs) continue;

      const dia = diaSaoPaulo(new Date(ms));
      const chave = `${conversa.id}|${dia}`;
      const atual = grupos.get(chave);
      const at = new Date(ms).toISOString();
      if (!atual) {
        grupos.set(chave, {
          conversaId: conversa.id,
          telefone: conversa.telefone,
          nome: conversa.nome_cliente ?? "",
          dia,
          mensagens: 1,
          primeira: at,
          ultima: at,
          ultimaMensagem: (item.content ?? "").slice(0, 160),
        });
        continue;
      }
      atual.mensagens += 1;
      if (at < atual.primeira) atual.primeira = at;
      if (at >= atual.ultima) {
        atual.ultima = at;
        atual.ultimaMensagem = (item.content ?? "").slice(0, 160);
      }
    }
  }

  return [...grupos.values()].sort((a, b) =>
    a.dia === b.dia ? b.ultima.localeCompare(a.ultima) : a.dia.localeCompare(b.dia),
  );
}
