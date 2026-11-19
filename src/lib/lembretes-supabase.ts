import { requireServerEnv, requireSupabaseServerKey } from "./server-env";
import type { Lembrete, LembreteInput } from "./lembretes";

type Row = {
  id: string;
  cliente_nome: string;
  telefone: string;
  dia: string;
  anotacao: string;
  concluido: boolean;
};
const campos = "id,cliente_nome,telefone,dia,anotacao,concluido";
const mapear = (row: Row): Lembrete => ({
  id: row.id,
  clienteNome: row.cliente_nome,
  telefone: row.telefone,
  dia: row.dia,
  anotacao: row.anotacao,
  concluido: row.concluido,
});

async function request(params: URLSearchParams, method = "GET", body?: unknown): Promise<Row[]> {
  const key = requireSupabaseServerKey();
  const response = await fetch(
    `${requireServerEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/crm_lembretes?${params}`,
    {
      method,
      cache: "no-store",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        Prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  if (!response.ok) {
    console.error("Falha no armazenamento de lembretes", response.status);
    throw new Error("Não foi possível acessar os lembretes. Tente novamente.");
  }
  return response.json() as Promise<Row[]>;
}

export async function listarLembretes(filtro: {
  de?: string;
  ate: string;
  pendentes?: boolean;
}): Promise<Lembrete[]> {
  const params = new URLSearchParams({ select: campos, order: "dia.asc,id.asc", limit: "500" });
  params.set("dia", `lte.${filtro.ate}`);
  if (filtro.de) params.append("dia", `gte.${filtro.de}`);
  if (filtro.pendentes) params.set("concluido", "eq.false");
  const rows: Row[] = [];
  // Paginação explícita para não perder lembretes no limite padrão do PostgREST.
  for (let offset = 0; ; offset += 500) {
    params.set("offset", String(offset));
    const page = await request(params);
    rows.push(...page);
    if (page.length < 500) break;
  }
  return rows.map(mapear);
}

export async function salvarLembrete(input: LembreteInput, id?: string): Promise<Lembrete | null> {
  const params = new URLSearchParams({ select: campos });
  if (id) params.set("id", `eq.${id}`);
  const rows = await request(params, id ? "PATCH" : "POST", {
    cliente_nome: input.clienteNome,
    telefone: input.telefone,
    dia: input.dia,
    anotacao: input.anotacao,
    atualizado_em: new Date().toISOString(),
  });
  return rows[0] ? mapear(rows[0]) : null;
}

export async function concluirLembrete(id: string, concluido: boolean): Promise<Lembrete | null> {
  const rows = await request(new URLSearchParams({ id: `eq.${id}`, select: campos }), "PATCH", {
    concluido,
    atualizado_em: new Date().toISOString(),
  });
  return rows[0] ? mapear(rows[0]) : null;
}

export async function excluirLembrete(id: string): Promise<boolean> {
  const rows = await request(new URLSearchParams({ id: `eq.${id}`, select: "id" }), "DELETE");
  return rows.length > 0;
}
