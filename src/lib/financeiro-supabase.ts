// Persistência dos lançamentos manuais do Financeiro (Despesas, Marketing e
// Combustível) no Supabase. Antes ficavam só no localStorage do navegador e
// "sumiam" quando o usuário trocava de navegador/dispositivo ou limpava o cache.
// Tabelas criadas na migration 20260616000000_financeiro_lancamentos_manuais.sql.

/* ============================================================
   Helpers Supabase REST
   ============================================================ */
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function ensureOk(response: Response, label: string): Promise<void> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase ${label} failed (${response.status}): ${errorBody}`);
  }
}

/* ============================================================
   Datas: frontend usa DD/MM/YYYY, coluna no banco é date (ISO)
   ============================================================ */
function brDateToIso(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function isoToBrDate(value: string | null): string {
  if (!value) return "";
  const iso = value.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }
  return iso;
}

/* ============================================================
   DESPESAS
   ============================================================ */
export type CategoriaDespesa =
  | "aluguel"
  | "energia"
  | "internet"
  | "embalagem"
  | "manutencao"
  | "salario"
  | "contador"
  | "outros";

export type Despesa = {
  id: string;
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valor: number;
  recorrente: boolean;
  pago: boolean;
};

export type DespesaInput = Omit<Despesa, "id">;

type DespesaRow = {
  id: string;
  data: string | null;
  categoria: CategoriaDespesa | null;
  descricao: string | null;
  valor: number | null;
  recorrente: boolean | null;
  pago: boolean | null;
};

function mapDespesa(row: DespesaRow): Despesa {
  return {
    id: row.id,
    data: isoToBrDate(row.data),
    categoria: row.categoria ?? "outros",
    descricao: row.descricao ?? "",
    valor: row.valor ?? 0,
    recorrente: row.recorrente ?? false,
    pago: row.pago ?? true,
  };
}

function despesaPayload(input: Partial<DespesaInput>) {
  const payload: Record<string, unknown> = {};
  if (input.data !== undefined) payload.data = brDateToIso(input.data);
  if (input.categoria !== undefined) payload.categoria = input.categoria;
  if (input.descricao !== undefined) payload.descricao = input.descricao;
  if (input.valor !== undefined) payload.valor = input.valor;
  if (input.recorrente !== undefined) payload.recorrente = input.recorrente;
  if (input.pago !== undefined) payload.pago = input.pago;
  payload.atualizado_em = new Date().toISOString();
  return payload;
}

export async function listarDespesas(): Promise<Despesa[]> {
  const response = await fetch(supabaseUrl("/financeiro_despesas?select=*&order=data.desc"), {
    headers: supabaseHeaders(),
  });
  await ensureOk(response, "despesas select");
  const rows = (await response.json()) as DespesaRow[];
  return rows.map(mapDespesa);
}

export async function criarDespesa(input: DespesaInput): Promise<Despesa> {
  const response = await fetch(supabaseUrl("/financeiro_despesas"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(despesaPayload(input)),
  });
  await ensureOk(response, "despesas insert");
  const rows = (await response.json()) as DespesaRow[];
  if (!rows[0]) throw new Error("Despesa nao retornada pelo Supabase");
  return mapDespesa(rows[0]);
}

export async function atualizarDespesa(id: string, input: Partial<DespesaInput>): Promise<Despesa> {
  const response = await fetch(
    supabaseUrl(`/financeiro_despesas?id=eq.${encodeURIComponent(id)}`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify(despesaPayload(input)),
    },
  );
  await ensureOk(response, "despesas update");
  const rows = (await response.json()) as DespesaRow[];
  if (!rows[0]) throw new Error("Despesa nao encontrada");
  return mapDespesa(rows[0]);
}

export async function removerDespesa(id: string): Promise<void> {
  const response = await fetch(
    supabaseUrl(`/financeiro_despesas?id=eq.${encodeURIComponent(id)}`),
    { method: "DELETE", headers: supabaseHeaders() },
  );
  await ensureOk(response, "despesas delete");
}

/* ============================================================
   MARKETING
   ============================================================ */
export type TipoMkt = "meta_ads" | "influenciador" | "panfleto" | "cupom" | "brinde" | "outros";

export type GastoMkt = {
  id: string;
  data: string;
  tipo: TipoMkt;
  descricao: string;
  valor: number;
  resultado?: string;
  roi?: number;
  campanha?: string;
  pago: boolean;
};

export type GastoMktInput = Omit<GastoMkt, "id">;

type MarketingRow = {
  id: string;
  data: string | null;
  tipo: TipoMkt | null;
  descricao: string | null;
  valor: number | null;
  resultado: string | null;
  roi: number | null;
  campanha: string | null;
  pago: boolean | null;
};

function mapMarketing(row: MarketingRow): GastoMkt {
  return {
    id: row.id,
    data: isoToBrDate(row.data),
    tipo: row.tipo ?? "outros",
    descricao: row.descricao ?? "",
    valor: row.valor ?? 0,
    resultado: row.resultado ?? undefined,
    roi: row.roi ?? undefined,
    campanha: row.campanha ?? undefined,
    pago: row.pago ?? true,
  };
}

function marketingPayload(input: Partial<GastoMktInput>) {
  const payload: Record<string, unknown> = {};
  if (input.data !== undefined) payload.data = brDateToIso(input.data);
  if (input.tipo !== undefined) payload.tipo = input.tipo;
  if (input.descricao !== undefined) payload.descricao = input.descricao;
  if (input.valor !== undefined) payload.valor = input.valor;
  if (input.resultado !== undefined) payload.resultado = input.resultado ?? null;
  if (input.roi !== undefined) payload.roi = input.roi ?? null;
  if (input.campanha !== undefined) payload.campanha = input.campanha ?? null;
  if (input.pago !== undefined) payload.pago = input.pago;
  payload.atualizado_em = new Date().toISOString();
  return payload;
}

export async function listarMarketing(): Promise<GastoMkt[]> {
  const response = await fetch(supabaseUrl("/financeiro_marketing?select=*&order=data.desc"), {
    headers: supabaseHeaders(),
  });
  await ensureOk(response, "marketing select");
  const rows = (await response.json()) as MarketingRow[];
  return rows.map(mapMarketing);
}

export async function criarMarketing(input: GastoMktInput): Promise<GastoMkt> {
  const response = await fetch(supabaseUrl("/financeiro_marketing"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(marketingPayload(input)),
  });
  await ensureOk(response, "marketing insert");
  const rows = (await response.json()) as MarketingRow[];
  if (!rows[0]) throw new Error("Gasto de marketing nao retornado pelo Supabase");
  return mapMarketing(rows[0]);
}

export async function atualizarMarketing(
  id: string,
  input: Partial<GastoMktInput>,
): Promise<GastoMkt> {
  const response = await fetch(
    supabaseUrl(`/financeiro_marketing?id=eq.${encodeURIComponent(id)}`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify(marketingPayload(input)),
    },
  );
  await ensureOk(response, "marketing update");
  const rows = (await response.json()) as MarketingRow[];
  if (!rows[0]) throw new Error("Gasto de marketing nao encontrado");
  return mapMarketing(rows[0]);
}

export async function removerMarketing(id: string): Promise<void> {
  const response = await fetch(
    supabaseUrl(`/financeiro_marketing?id=eq.${encodeURIComponent(id)}`),
    { method: "DELETE", headers: supabaseHeaders() },
  );
  await ensureOk(response, "marketing delete");
}

/* ============================================================
   ABASTECIMENTOS (Combustível)
   ============================================================ */
export type Abastecimento = {
  id: string;
  data: string;
  kmAtual: number;
  litros: number;
  valorLitro: number;
  valorTotal: number;
  posto?: string;
  obs?: string;
};

export type AbastecimentoInput = Omit<Abastecimento, "id">;

type AbastecimentoRow = {
  id: string;
  data: string | null;
  km_atual: number | null;
  litros: number | null;
  valor_litro: number | null;
  valor_total: number | null;
  posto: string | null;
  obs: string | null;
};

function mapAbastecimento(row: AbastecimentoRow): Abastecimento {
  return {
    id: row.id,
    data: isoToBrDate(row.data),
    kmAtual: row.km_atual ?? 0,
    litros: row.litros ?? 0,
    valorLitro: row.valor_litro ?? 0,
    valorTotal: row.valor_total ?? 0,
    posto: row.posto ?? undefined,
    obs: row.obs ?? undefined,
  };
}

function abastecimentoPayload(input: Partial<AbastecimentoInput>) {
  const payload: Record<string, unknown> = {};
  if (input.data !== undefined) payload.data = brDateToIso(input.data);
  if (input.kmAtual !== undefined) payload.km_atual = input.kmAtual;
  if (input.litros !== undefined) payload.litros = input.litros;
  if (input.valorLitro !== undefined) payload.valor_litro = input.valorLitro;
  if (input.valorTotal !== undefined) payload.valor_total = input.valorTotal;
  if (input.posto !== undefined) payload.posto = input.posto ?? null;
  if (input.obs !== undefined) payload.obs = input.obs ?? null;
  return payload;
}

export async function listarAbastecimentos(): Promise<Abastecimento[]> {
  const response = await fetch(
    supabaseUrl("/financeiro_abastecimentos?select=*&order=km_atual.asc"),
    { headers: supabaseHeaders() },
  );
  await ensureOk(response, "abastecimentos select");
  const rows = (await response.json()) as AbastecimentoRow[];
  return rows.map(mapAbastecimento);
}

export async function criarAbastecimento(input: AbastecimentoInput): Promise<Abastecimento> {
  const response = await fetch(supabaseUrl("/financeiro_abastecimentos"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(abastecimentoPayload(input)),
  });
  await ensureOk(response, "abastecimentos insert");
  const rows = (await response.json()) as AbastecimentoRow[];
  if (!rows[0]) throw new Error("Abastecimento nao retornado pelo Supabase");
  return mapAbastecimento(rows[0]);
}

export async function removerAbastecimento(id: string): Promise<void> {
  const response = await fetch(
    supabaseUrl(`/financeiro_abastecimentos?id=eq.${encodeURIComponent(id)}`),
    { method: "DELETE", headers: supabaseHeaders() },
  );
  await ensureOk(response, "abastecimentos delete");
}

export function financeiroErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  if (message.includes("PGRST205") || message.includes("Could not find the table")) {
    return "Tabelas do Financeiro ainda nao existem no Supabase. Aplique a migration 20260616000000_financeiro_lancamentos_manuais.sql.";
  }
  return message;
}
