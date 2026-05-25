type InfluenciadorStatus = "ativo" | "pausado" | "encerrado";
type CupomStatus = "ativo" | "pausado" | "expirado";
type TipoDesconto = "percentual" | "valor_fixo";
type TipoComissao = "percentual_faturamento" | "percentual_lucro" | "valor_fixo";
type ComissaoStatus = "pendente" | "aprovada" | "paga" | "cancelada";

export type Influenciador = {
  id: string;
  nome: string;
  telefone: string | null;
  documento: string | null;
  chave_pix: string | null;
  canal: string | null;
  status: InfluenciadorStatus;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type Cupom = {
  id: string;
  influenciador_id: string;
  codigo: string;
  tipo_desconto: TipoDesconto;
  valor_desconto: number;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
  limite_usos: number | null;
  usos: number;
  validade: string | null;
  status: CupomStatus;
  criado_em: string;
  atualizado_em: string;
  influenciadores?: Pick<Influenciador, "id" | "nome" | "telefone" | "status"> | null;
};

export type ComissaoInfluenciador = {
  id: string;
  venda_id: string;
  influenciador_id: string;
  cupom_id: string;
  base_calculo: number;
  percentual: number | null;
  valor: number;
  status: ComissaoStatus;
  pago_em: string | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
  influenciadores?: Pick<Influenciador, "id" | "nome" | "telefone"> | null;
  cupons?: Pick<Cupom, "id" | "codigo"> | null;
  vendas?: {
    id: string;
    cliente_nome: string | null;
    telefone: string | null;
    total: number | null;
    lucro: number | null;
    status_pagamento: string | null;
    status: string | null;
    criado_em: string;
  } | null;
};

export type CupomAplicado = {
  cupom: Cupom;
  desconto: number;
  totalBruto: number;
  totalFinal: number;
};

export type IndicacoesResumo = {
  influenciadores: Influenciador[];
  cupons: Cupom[];
  comissoes: ComissaoInfluenciador[];
  kpis: {
    influenciadoresAtivos: number;
    cuponsAtivos: number;
    vendasComCupom: number;
    faturamento: number;
    comissaoPendente: number;
    comissaoPaga: number;
  };
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
    "User-Agent": "node",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(supabaseUrl(path), {
    ...init,
    headers: {
      ...supabaseHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase indicacoes request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

function normalizarCupom(codigo: string): string {
  return codigo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function extrairCupomTexto(texto: string): string | null {
  const match =
    texto.match(/\bcupom\s+([a-z0-9][a-z0-9._-]{2,20})\b/i) ??
    texto.match(/\b(?:usar|usa|aplicar|aplica)\s+([a-z0-9][a-z0-9._-]{2,20})\b/i);
  const codigo = match?.[1] ? normalizarCupom(match[1]) : null;
  return codigo && codigo.length >= 3 ? codigo : null;
}

export async function listarInfluenciadores(): Promise<Influenciador[]> {
  return requestJson<Influenciador[]>("/influenciadores?select=*&order=nome.asc");
}

export async function listarCupons(): Promise<Cupom[]> {
  return requestJson<Cupom[]>(
    "/cupons?select=*,influenciadores(id,nome,telefone,status)&order=criado_em.desc",
  );
}

export async function listarComissoes(): Promise<ComissaoInfluenciador[]> {
  return requestJson<ComissaoInfluenciador[]>(
    "/comissoes_influenciadores?select=*,influenciadores(id,nome,telefone),cupons(id,codigo),vendas(id,cliente_nome,telefone,total,lucro,status_pagamento,status,criado_em)&order=criado_em.desc",
  );
}

export async function listarIndicacoesResumo(): Promise<IndicacoesResumo> {
  const [influenciadores, cupons, comissoes] = await Promise.all([
    listarInfluenciadores(),
    listarCupons(),
    listarComissoes(),
  ]);
  const vendasComCupom = new Set(comissoes.map((comissao) => comissao.venda_id)).size;
  const faturamento = comissoes.reduce((sum, comissao) => sum + (comissao.vendas?.total ?? 0), 0);

  return {
    influenciadores,
    cupons,
    comissoes,
    kpis: {
      influenciadoresAtivos: influenciadores.filter((item) => item.status === "ativo").length,
      cuponsAtivos: cupons.filter((item) => item.status === "ativo").length,
      vendasComCupom,
      faturamento,
      comissaoPendente: comissoes
        .filter((item) => item.status === "pendente" || item.status === "aprovada")
        .reduce((sum, item) => sum + item.valor, 0),
      comissaoPaga: comissoes
        .filter((item) => item.status === "paga")
        .reduce((sum, item) => sum + item.valor, 0),
    },
  };
}

export async function criarInfluenciador(input: {
  nome: string;
  telefone?: string | null;
  documento?: string | null;
  chave_pix?: string | null;
  canal?: string | null;
  observacao?: string | null;
}): Promise<Influenciador> {
  const rows = await requestJson<Influenciador[]>("/influenciadores", {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      nome: input.nome.trim(),
      telefone: input.telefone?.replace(/\D/g, "") || null,
      documento: input.documento?.trim() || null,
      chave_pix: input.chave_pix?.trim() || null,
      canal: input.canal?.trim() || null,
      observacao: input.observacao?.trim() || null,
    }),
  });

  if (!rows[0]) throw new Error("Influenciador nao retornado");
  return rows[0];
}

export async function criarCupom(input: {
  influenciador_id: string;
  codigo: string;
  tipo_desconto: TipoDesconto;
  valor_desconto: number;
  comissao_tipo: TipoComissao;
  comissao_valor: number;
  limite_usos?: number | null;
  validade?: string | null;
}): Promise<Cupom> {
  const rows = await requestJson<Cupom[]>("/cupons", {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      influenciador_id: input.influenciador_id,
      codigo: normalizarCupom(input.codigo),
      tipo_desconto: input.tipo_desconto,
      valor_desconto: input.valor_desconto,
      comissao_tipo: input.comissao_tipo,
      comissao_valor: input.comissao_valor,
      limite_usos: input.limite_usos ?? null,
      validade: input.validade || null,
    }),
  });

  if (!rows[0]) throw new Error("Cupom nao retornado");
  return rows[0];
}

export async function buscarCupomAtivo(codigo: string): Promise<Cupom | null> {
  const params = new URLSearchParams({
    codigo: `eq.${normalizarCupom(codigo)}`,
    select: "*,influenciadores(id,nome,telefone,status)",
    limit: "1",
  });
  const rows = await requestJson<Cupom[]>(`/cupons?${params}`);
  const cupom = rows[0];

  if (!cupom || cupom.status !== "ativo") return null;
  if (cupom.validade && new Date(cupom.validade).getTime() < Date.now()) return null;
  if (cupom.limite_usos !== null && cupom.usos >= cupom.limite_usos) return null;
  if (cupom.influenciadores?.status && cupom.influenciadores.status !== "ativo") return null;

  return cupom;
}

export function calcularCupom(cupom: Cupom, totalBruto: number): CupomAplicado {
  const desconto =
    cupom.tipo_desconto === "percentual"
      ? (totalBruto * cupom.valor_desconto) / 100
      : cupom.valor_desconto;
  const descontoSeguro = Math.min(Math.max(0, desconto), totalBruto);

  return {
    cupom,
    desconto: Math.round(descontoSeguro * 100) / 100,
    totalBruto,
    totalFinal: Math.round((totalBruto - descontoSeguro) * 100) / 100,
  };
}

export async function validarCupom(codigo: string, totalBruto: number): Promise<CupomAplicado | null> {
  const cupom = await buscarCupomAtivo(codigo);
  return cupom ? calcularCupom(cupom, totalBruto) : null;
}

export async function registrarUsoCupom(cupom: Cupom): Promise<void> {
  try {
    await fetch(supabaseUrl(`/cupons?id=eq.${encodeURIComponent(cupom.id)}`), {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        usos: cupom.usos + 1,
        atualizado_em: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn("Uso de cupom nao atualizado:", error);
  }
}

async function buscarVendaComCupom(vendaId: string): Promise<{
  id: string;
  total: number | null;
  lucro: number | null;
  status_pagamento: string | null;
  status: string | null;
  cupom_id: string | null;
  influenciador_id: string | null;
} | null> {
  const rows = await requestJson<
    Array<{
      id: string;
      total: number | null;
      lucro: number | null;
      status_pagamento: string | null;
      status: string | null;
      cupom_id: string | null;
      influenciador_id: string | null;
    }>
  >(
    `/vendas?select=id,total,lucro,status_pagamento,status,cupom_id,influenciador_id&id=eq.${encodeURIComponent(
      vendaId,
    )}&limit=1`,
  );

  return rows[0] ?? null;
}

export async function registrarComissaoVenda(vendaId: string): Promise<void> {
  try {
    const venda = await buscarVendaComCupom(vendaId);
    if (
      !venda?.cupom_id ||
      !venda.influenciador_id ||
      venda.status_pagamento !== "pago" ||
      venda.status === "cancelada"
    ) {
      return;
    }

    const cupomRows = await requestJson<Cupom[]>(
      `/cupons?select=*&id=eq.${encodeURIComponent(venda.cupom_id)}&limit=1`,
    );
    const cupom = cupomRows[0];
    if (!cupom) return;

    const base =
      cupom.comissao_tipo === "percentual_lucro" ? (venda.lucro ?? 0) : (venda.total ?? 0);
    const valor =
      cupom.comissao_tipo === "valor_fixo"
        ? cupom.comissao_valor
        : (base * cupom.comissao_valor) / 100;
    const percentual = cupom.comissao_tipo === "valor_fixo" ? null : cupom.comissao_valor;

    await requestJson<ComissaoInfluenciador[]>("/comissoes_influenciadores?on_conflict=venda_id,cupom_id", {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
      body: JSON.stringify({
        venda_id: venda.id,
        influenciador_id: venda.influenciador_id,
        cupom_id: venda.cupom_id,
        base_calculo: Math.round(base * 100) / 100,
        percentual,
        valor: Math.round(Math.max(0, valor) * 100) / 100,
        status: "pendente",
      }),
    });
  } catch (error) {
    console.warn("Comissao de influenciador nao registrada:", error);
  }
}

export async function cancelarComissoesVenda(vendaId: string): Promise<void> {
  try {
    await fetch(supabaseUrl(`/comissoes_influenciadores?venda_id=eq.${encodeURIComponent(vendaId)}`), {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        status: "cancelada",
        atualizado_em: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.warn("Comissao de influenciador nao cancelada:", error);
  }
}

export async function marcarComissaoPaga(id: string): Promise<ComissaoInfluenciador> {
  const rows = await requestJson<ComissaoInfluenciador[]>(
    `/comissoes_influenciadores?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        status: "paga",
        pago_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }),
    },
  );
  if (!rows[0]) throw new Error("Comissao nao encontrada");
  return rows[0];
}
