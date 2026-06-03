export type CampanhaStatus = "rascunho" | "ativa" | "pausada" | "encerrada";

export type CampanhaManual = {
  id: string;
  nome: string;
  origem: string;
  objetivo: string;
  investimento: number;
  leads: number;
  conversoes: number;
  receita: number;
  status: CampanhaStatus;
  inicio: string;
  fim: string;
  observacoes: string;
  createdAt: string;
  updatedAt: string;
};

export type CampanhaManualInput = Omit<CampanhaManual, "id" | "createdAt" | "updatedAt">;

type CampanhaRow = {
  id: string;
  nome: string;
  origem: string | null;
  objetivo: string | null;
  investimento: number | null;
  leads: number | null;
  conversoes: number | null;
  receita: number | null;
  status: CampanhaStatus | null;
  inicio: string | null;
  fim: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function mapCampanha(row: CampanhaRow): CampanhaManual {
  return {
    id: row.id,
    nome: row.nome,
    origem: row.origem ?? "",
    objetivo: row.objetivo ?? "",
    investimento: row.investimento ?? 0,
    leads: row.leads ?? 0,
    conversoes: row.conversoes ?? 0,
    receita: row.receita ?? 0,
    status: row.status ?? "rascunho",
    inicio: row.inicio ?? "",
    fim: row.fim ?? "",
    observacoes: row.observacoes ?? "",
    createdAt: row.criado_em,
    updatedAt: row.atualizado_em,
  };
}

function toPayload(input: CampanhaManualInput) {
  return {
    nome: input.nome,
    origem: input.origem,
    objetivo: input.objetivo,
    investimento: input.investimento,
    leads: input.leads,
    conversoes: input.conversoes,
    receita: input.receita,
    status: input.status,
    inicio: input.inicio || null,
    fim: input.fim || null,
    observacoes: input.observacoes,
    atualizado_em: new Date().toISOString(),
  };
}

export async function listarCampanhas(): Promise<CampanhaManual[]> {
  const response = await fetch(supabaseUrl("/campanhas?select=*&order=atualizado_em.desc"), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase campanhas select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as CampanhaRow[];
  return rows.map(mapCampanha);
}

export async function criarCampanha(input: CampanhaManualInput): Promise<CampanhaManual> {
  const response = await fetch(supabaseUrl("/campanhas"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(toPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase campanhas insert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as CampanhaRow[];
  if (!rows[0]) throw new Error("Campanha nao retornada pelo Supabase");
  return mapCampanha(rows[0]);
}

export async function atualizarCampanha(
  id: string,
  input: CampanhaManualInput,
): Promise<CampanhaManual> {
  const response = await fetch(supabaseUrl(`/campanhas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(toPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase campanhas update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as CampanhaRow[];
  if (!rows[0]) throw new Error("Campanha nao encontrada");
  return mapCampanha(rows[0]);
}

export async function removerCampanha(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/campanhas?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase campanhas delete failed (${response.status}): ${errorBody}`);
  }
}
