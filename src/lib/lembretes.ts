import { z } from "zod";

// Datas civis: um lembrete pertence ao dia escolhido, sem conversão para UTC.
export function dataCivilValida(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function hojeLembretes(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export const dataLembreteSchema = z.string().refine(dataCivilValida, "Data inválida");
export const lembreteInputSchema = z.object({
  clienteNome: z.string().trim().min(1, "Informe o cliente").max(160),
  telefone: z
    .string()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().min(8, "Informe um telefone válido").max(15)),
  dia: dataLembreteSchema,
  anotacao: z.string().trim().min(1, "Escreva o lembrete").max(2000),
});
export type LembreteInput = z.infer<typeof lembreteInputSchema>;
export type Lembrete = LembreteInput & { id: string; concluido: boolean };

export function resumirLembretes(lembretes: Lembrete[], hoje: string) {
  const pendentes = lembretes.filter((item) => !item.concluido && item.dia <= hoje);
  const doDia = pendentes.filter((item) => item.dia === hoje);
  return {
    doDia,
    atrasados: pendentes.filter((item) => item.dia < hoje),
    clientesHoje: new Set(doDia.map((item) => item.telefone)).size,
  };
}
