export type NotaGeral = {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string | null;
  fixada: boolean;
  criado_em: string;
  atualizado_em: string;
};

export type NotaGeralInput = {
  titulo: string;
  conteudo: string;
  categoria?: string | null;
  fixada?: boolean;
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
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function notaPayload(input: NotaGeralInput): Record<string, unknown> {
  return {
    titulo: input.titulo.trim() || "Nova nota",
    conteudo: input.conteudo,
    categoria: input.categoria?.trim() || null,
    ...(typeof input.fixada === "boolean" ? { fixada: input.fixada } : {}),
    atualizado_em: new Date().toISOString(),
  };
}

export async function listarNotasGerais(): Promise<NotaGeral[]> {
  const response = await fetch(
    supabaseUrl("/notas_gerais?select=*&order=fixada.desc,atualizado_em.desc"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase notas select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as NotaGeral[];
}

export async function criarNotaGeral(input: NotaGeralInput): Promise<NotaGeral> {
  const response = await fetch(supabaseUrl("/notas_gerais"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(notaPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase notas insert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as NotaGeral[];
  if (!rows[0]) throw new Error("Nota nao retornada");
  return rows[0];
}

export async function atualizarNotaGeral(id: string, input: NotaGeralInput): Promise<NotaGeral> {
  const response = await fetch(supabaseUrl(`/notas_gerais?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(notaPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase notas update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as NotaGeral[];
  if (!rows[0]) throw new Error("Nota nao encontrada");
  return rows[0];
}

export async function excluirNotaGeral(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/notas_gerais?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders("return=minimal"),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase notas delete failed (${response.status}): ${errorBody}`);
  }
}
