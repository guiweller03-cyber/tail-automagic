// Persistencia dos follow-ups agendados do CRM (tabela crm_followups, migration
// 20260616120000_crm_followups.sql). Mesmo padrao REST/PostgREST usado em
// campanhas-supabase.ts e financeiro-supabase.ts.

export type FollowupModo = "manual" | "ia";
export type FollowupDisparo = "automatico" | "confirmar";
export type FollowupStatus =
  | "pendente"
  | "aguardando_confirmacao"
  | "enviado"
  | "cancelado"
  | "erro";

export type FollowupContexto = {
  nome?: string;
  pet?: string;
  ultimaInteracao?: string;
  ultimaMensagem?: string;
  resumo?: string;
  objetivo?: string;
};

export type Followup = {
  id: string;
  telefone: string;
  clienteNome: string;
  agendadoPara: string; // ISO UTC
  modo: FollowupModo;
  disparo: FollowupDisparo;
  mensagem: string;
  contexto: FollowupContexto;
  canal: string;
  status: FollowupStatus;
  erro?: string;
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm?: string;
};

export type FollowupInput = {
  telefone: string;
  clienteNome?: string;
  agendadoPara: string; // ISO
  modo: FollowupModo;
  disparo: FollowupDisparo;
  mensagem?: string;
  contexto?: FollowupContexto;
  canal?: string;
};

type FollowupRow = {
  id: string;
  telefone: string;
  cliente_nome: string | null;
  agendado_para: string;
  modo: FollowupModo | null;
  disparo: FollowupDisparo | null;
  mensagem: string | null;
  contexto: FollowupContexto | null;
  canal: string | null;
  status: FollowupStatus | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
  enviado_em: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
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
    const body = await response.text();
    throw new Error(`Supabase ${label} failed (${response.status}): ${body}`);
  }
}

export function normalizarTelefone(value: string): string {
  return value.replace("@s.whatsapp.net", "").replace(/\D/g, "");
}

function mapFollowup(row: FollowupRow): Followup {
  return {
    id: row.id,
    telefone: row.telefone,
    clienteNome: row.cliente_nome ?? "",
    agendadoPara: row.agendado_para,
    modo: row.modo ?? "manual",
    disparo: row.disparo ?? "confirmar",
    mensagem: row.mensagem ?? "",
    contexto: row.contexto ?? {},
    canal: row.canal ?? "WhatsApp",
    status: row.status ?? "pendente",
    erro: row.erro ?? undefined,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    enviadoEm: row.enviado_em ?? undefined,
  };
}

function inputPayload(input: FollowupInput): Record<string, unknown> {
  return {
    telefone: normalizarTelefone(input.telefone),
    cliente_nome: input.clienteNome?.trim() || null,
    agendado_para: input.agendadoPara,
    modo: input.modo,
    disparo: input.disparo,
    mensagem: input.mensagem?.trim() ?? "",
    contexto: input.contexto ?? {},
    canal: input.canal?.trim() || "WhatsApp",
    atualizado_em: new Date().toISOString(),
  };
}

export async function listarFollowups(filtro?: {
  telefone?: string;
  status?: FollowupStatus[];
}): Promise<Followup[]> {
  const params = new URLSearchParams({ select: "*", order: "agendado_para.asc" });
  if (filtro?.telefone) {
    params.set("telefone", `eq.${normalizarTelefone(filtro.telefone)}`);
  }
  if (filtro?.status?.length) {
    params.set("status", `in.(${filtro.status.join(",")})`);
  }
  const response = await fetch(supabaseUrl(`/crm_followups?${params.toString()}`), {
    headers: supabaseHeaders(),
  });
  await ensureOk(response, "followups select");
  const rows = (await response.json()) as FollowupRow[];
  return rows.map(mapFollowup);
}

/** Follow-ups pendentes ja vencidos — o que o worker precisa processar. */
export async function listarFollowupsVencidos(agora = new Date()): Promise<Followup[]> {
  const params = new URLSearchParams({
    select: "*",
    status: "eq.pendente",
    agendado_para: `lte.${agora.toISOString()}`,
    order: "agendado_para.asc",
  });
  const response = await fetch(supabaseUrl(`/crm_followups?${params.toString()}`), {
    headers: supabaseHeaders(),
  });
  await ensureOk(response, "followups vencidos select");
  const rows = (await response.json()) as FollowupRow[];
  return rows.map(mapFollowup);
}

export async function obterFollowup(id: string): Promise<Followup | null> {
  const response = await fetch(
    supabaseUrl(`/crm_followups?id=eq.${encodeURIComponent(id)}&select=*`),
    { headers: supabaseHeaders() },
  );
  await ensureOk(response, "followup get");
  const rows = (await response.json()) as FollowupRow[];
  return rows[0] ? mapFollowup(rows[0]) : null;
}

export async function criarFollowup(input: FollowupInput): Promise<Followup> {
  const response = await fetch(supabaseUrl("/crm_followups"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(inputPayload(input)),
  });
  await ensureOk(response, "followup insert");
  const rows = (await response.json()) as FollowupRow[];
  if (!rows[0]) throw new Error("Follow-up nao retornado pelo Supabase");
  return mapFollowup(rows[0]);
}

export async function atualizarFollowupCampos(
  id: string,
  campos: Record<string, unknown>,
): Promise<Followup> {
  const response = await fetch(supabaseUrl(`/crm_followups?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({ ...campos, atualizado_em: new Date().toISOString() }),
  });
  await ensureOk(response, "followup update");
  const rows = (await response.json()) as FollowupRow[];
  if (!rows[0]) throw new Error("Follow-up nao encontrado");
  return mapFollowup(rows[0]);
}

/** Edicao pelo operador (texto, horario, modo, disparo). */
export async function editarFollowup(id: string, patch: Partial<FollowupInput>): Promise<Followup> {
  const campos: Record<string, unknown> = {};
  if (patch.agendadoPara !== undefined) campos.agendado_para = patch.agendadoPara;
  if (patch.modo !== undefined) campos.modo = patch.modo;
  if (patch.disparo !== undefined) campos.disparo = patch.disparo;
  if (patch.mensagem !== undefined) campos.mensagem = patch.mensagem.trim();
  if (patch.canal !== undefined) campos.canal = patch.canal.trim() || "WhatsApp";
  if (patch.clienteNome !== undefined) campos.cliente_nome = patch.clienteNome.trim() || null;
  if (patch.contexto !== undefined) campos.contexto = patch.contexto;
  return atualizarFollowupCampos(id, campos);
}

export async function cancelarFollowup(id: string): Promise<Followup> {
  return atualizarFollowupCampos(id, { status: "cancelado" });
}

export async function removerFollowup(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/crm_followups?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders(),
  });
  await ensureOk(response, "followup delete");
}

export function followupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  if (message.includes("PGRST205") || message.includes("Could not find the table")) {
    return "Tabela crm_followups ainda nao existe no Supabase. Aplique a migration 20260616120000_crm_followups.sql.";
  }
  return message;
}
