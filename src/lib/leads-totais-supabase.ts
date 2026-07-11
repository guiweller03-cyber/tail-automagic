import type { Cliente } from "@/lib/crm-types";

type LeadTotalRow = {
  id: string;
  cliente_id: string | null;
  nome: string;
  telefone: string;
  endereco: string | null;
  bairro: string | null;
  pets: string[] | null;
  ticket: number | null;
  frequencia: string | null;
  ultima: string | null;
  perfil: Cliente["perfil"] | null;
  origem: string | null;
  origem_detalhe: string | null;
  campanha: string | null;
  campanha_custo: number | null;
  campanha_convertidos: number | null;
  cupom: string | null;
  influenciador: string | null;
  cac: number | null;
  total_gasto: number | null;
  total_descontos: number | null;
  lucro_liquido: number | null;
  pedidos: number | null;
  prox_recompra: string | null;
  cidade: string | null;
  especies: Cliente["especies"] | null;
  observacoes: string | null;
  follow_up_manual: Cliente["followUpManual"] | null;
  ativo: boolean | null;
  primeiro_registro: string | null;
  ultimo_registro: string | null;
};

export type LeadTotalInput = Partial<Cliente> & {
  clienteId?: string | null;
  nome?: string;
  telefone: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function supabaseUrl(path: string): string {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  return `${baseUrl}/rest/v1${path}`;
}

function supabaseHeaders(prefer?: string): HeadersInit {
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function selectAllFromSupabase<T>(path: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const page = await fetch(supabaseUrl(path), {
      headers: {
        ...supabaseHeaders(),
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!page.ok) {
      const errorBody = await page.text();
      throw new Error(`Supabase select failed (${page.status}): ${errorBody}`);
    }

    const pageRows = (await page.json()) as T[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return rows;
}

function normalizarTelefone(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

function mapLeadTotal(row: LeadTotalRow): Cliente {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    endereco: row.endereco ?? "",
    bairro: row.bairro ?? "",
    pets: row.pets ?? [],
    ticket: row.ticket ?? 0,
    frequencia: row.frequencia ?? "",
    ultima: row.ultima ?? "",
    perfil: row.perfil ?? "Novo",
    origem: row.origem ?? "",
    origemDetalhe: row.origem_detalhe ?? undefined,
    campanha: row.campanha ?? undefined,
    campanhaCusto: row.campanha_custo ?? undefined,
    campanhaConvertidos: row.campanha_convertidos ?? undefined,
    cupom: row.cupom ?? undefined,
    influenciador: row.influenciador ?? undefined,
    cac: row.cac ?? 0,
    totalGasto: row.total_gasto ?? 0,
    totalDescontos: row.total_descontos ?? 0,
    lucroLiquido: row.lucro_liquido ?? 0,
    pedidos: row.pedidos ?? 0,
    proxRecompra: row.prox_recompra ?? "",
    cidade: row.cidade ?? undefined,
    especies: row.especies ?? undefined,
    observacoes: row.observacoes ?? "",
    followUpManual: row.follow_up_manual ?? undefined,
  };
}

function leadTotalPayload(input: LeadTotalInput, ativo: boolean): Record<string, unknown> {
  const telefone = normalizarTelefone(input.telefone);

  return {
    cliente_id: "clienteId" in input ? input.clienteId : (input.id ?? null),
    telefone,
    nome: input.nome?.trim() || `Cliente ${telefone.slice(-4)}`,
    endereco: input.endereco?.trim() || null,
    bairro: input.bairro?.trim() || null,
    pets: input.pets ?? [],
    ticket: input.ticket ?? 0,
    frequencia: input.frequencia?.trim() || null,
    ultima: input.ultima?.trim() || null,
    perfil: input.perfil ?? "Novo",
    origem: input.origem?.trim() || null,
    origem_detalhe: input.origemDetalhe?.trim() || null,
    campanha: input.campanha?.trim() || null,
    campanha_custo: input.campanhaCusto ?? null,
    campanha_convertidos: input.campanhaConvertidos ?? null,
    cupom: input.cupom?.trim() || null,
    influenciador: input.influenciador?.trim() || null,
    cac: input.cac ?? 0,
    total_gasto: input.totalGasto ?? 0,
    total_descontos: input.totalDescontos ?? 0,
    lucro_liquido: input.lucroLiquido ?? 0,
    pedidos: input.pedidos ?? 0,
    prox_recompra: input.proxRecompra?.trim() || null,
    cidade: input.cidade?.trim() || null,
    especies: input.especies ?? null,
    observacoes: input.observacoes?.trim() || null,
    follow_up_manual: input.followUpManual ?? {},
    ativo,
    ultimo_registro: new Date().toISOString(),
  };
}

function isMissingLeadsTotaisTable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("leads_totais") || message.includes("PGRST205");
}

export async function listarLeadsTotais(): Promise<Cliente[]> {
  const rows = await selectAllFromSupabase<LeadTotalRow>(
    "/leads_totais?select=*&order=ultimo_registro.desc,nome.asc",
  );
  return rows.map(mapLeadTotal);
}

/**
 * Remove de vez um lead do historico. Usado quando o operador bloqueia um
 * contato do WhatsApp IA: alem de sair da tabela clientes, ele some do KPI de
 * "Leads totais" (que conta leads_totais) para nao inflar a operacao com gente
 * de regiao fora da area de entrega.
 */
export async function removerLeadTotal(telefone: string): Promise<void> {
  const telefoneLimpo = normalizarTelefone(telefone);
  if (telefoneLimpo.length < 8) return;

  try {
    const response = await fetch(
      supabaseUrl(`/leads_totais?telefone=eq.${encodeURIComponent(telefoneLimpo)}`),
      {
        method: "DELETE",
        headers: supabaseHeaders(),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase lead total delete failed (${response.status}): ${errorBody}`);
    }
  } catch (error) {
    if (isMissingLeadsTotaisTable(error)) return;
    console.error("[leads-totais] erro_remover", error);
  }
}

export async function registrarLeadTotal(
  input: LeadTotalInput,
  options: { ativo?: boolean } = {},
): Promise<void> {
  const telefone = normalizarTelefone(input.telefone);
  if (telefone.length < 8) return;

  try {
    const response = await fetch(supabaseUrl("/leads_totais?on_conflict=telefone"), {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(leadTotalPayload({ ...input, telefone }, options.ativo ?? true)),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase lead total upsert failed (${response.status}): ${errorBody}`);
    }
  } catch (error) {
    if (isMissingLeadsTotaisTable(error)) return;
    console.error("[leads-totais] erro_registrar", error);
  }
}

export async function registrarLeadsTotais(
  inputs: LeadTotalInput[],
  options: { ativo?: boolean } = {},
): Promise<void> {
  const payload = inputs
    .map((input) => ({ input, telefone: normalizarTelefone(input.telefone) }))
    .filter(({ telefone }) => telefone.length >= 8)
    .map(({ input, telefone }) => leadTotalPayload({ ...input, telefone }, options.ativo ?? true));

  if (payload.length === 0) return;

  try {
    const response = await fetch(supabaseUrl("/leads_totais?on_conflict=telefone"), {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Supabase leads totais bulk upsert failed (${response.status}): ${errorBody}`,
      );
    }
  } catch (error) {
    if (isMissingLeadsTotaisTable(error)) return;
    console.error("[leads-totais] erro_registrar_lote", error);
  }
}
