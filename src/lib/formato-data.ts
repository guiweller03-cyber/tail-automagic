/** Formatacao de data/hora das conversas do WhatsApp IA e dos cards do Kanban. */

const HORA_FMT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

function parseData(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function inicioDoDia(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Quantos dias atras a data caiu em relacao a hoje (0 = hoje, 1 = ontem). */
function diasAtras(date: Date, agora: Date): number {
  return Math.round((inicioDoDia(agora) - inicioDoDia(date)) / 86_400_000);
}

function diaMes(date: Date): string {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

/**
 * Rotulo curto para listas e cards: so a hora quando e de hoje, com a data nos demais dias.
 * Ex.: "14:32", "Ontem 14:32", "12/09 14:32", "12/09/24 14:32".
 */
export function formatarQuandoConversa(value: string | number | Date | null | undefined): string {
  const date = parseData(value);
  if (!date) return "";

  const agora = new Date();
  const hora = date.toLocaleTimeString("pt-BR", HORA_FMT);
  const dias = diasAtras(date, agora);

  if (dias <= 0) return hora;
  if (dias === 1) return `Ontem ${hora}`;
  if (date.getFullYear() === agora.getFullYear()) return `${diaMes(date)} ${hora}`;
  return `${diaMes(date)}/${String(date.getFullYear()).slice(-2)} ${hora}`;
}

/** Rotulo do separador de dia dentro do chat. Ex.: "Hoje", "Ontem", "12/09/2025". */
export function formatarDiaConversa(value: string | number | Date | null | undefined): string {
  const date = parseData(value);
  if (!date) return "";

  const dias = diasAtras(date, new Date());
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return date.toLocaleDateString("pt-BR");
}

/** Chave local do dia (AAAA-MM-DD) usada para agrupar mensagens por data. */
export function chaveDiaConversa(value: string | number | Date | null | undefined): string | null {
  const date = parseData(value);
  return date ? date.toLocaleDateString("en-CA") : null;
}
