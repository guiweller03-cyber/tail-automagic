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
  code?: string | null;
  type?: "influencer" | "referral";
  discount_percent?: number | null;
  commission_percent?: number | null;
  influencer_name?: string | null;
  influencer_email?: string | null;
  max_uses?: number | null;
  use_count?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
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
  referrals: Referral[];
  creditTransactions: Array<{
    user_id: string;
    amount: number;
    type: "earned" | "used";
    app_users?: Pick<AppUser, "name" | "email" | "referral_code"> | null;
  }>;
  kpis: {
    influenciadoresAtivos: number;
    cuponsAtivos: number;
    vendasComCupom: number;
    faturamento: number;
    comissaoPendente: number;
    comissaoPaga: number;
    totalIndicacoes: number;
    creditosDistribuidos: number;
    rankingIndicacoes: Array<{ user_id: string; nome: string; total: number; creditos: number }>;
  };
};

type CouponRow = {
  id: string;
  code: string;
  type: "influencer" | "referral";
  discount_percent: number;
  commission_percent: number | null;
  influencer_id?: string | null;
  influencer_name: string | null;
  influencer_email: string | null;
  max_uses: number | null;
  use_count: number | null;
  is_active: boolean | null;
  created_at: string | null;
  influencers?: Pick<Influenciador, "id" | "nome" | "telefone" | "status"> | null;
};

type InfluencerRow = {
  id: string;
  nome: string;
  telefone: string | null;
  documento: string | null;
  chave_pix: string | null;
  canal: string | null;
  status: InfluenciadorStatus | null;
  observacao: string | null;
  criado_em: string;
  atualizado_em: string;
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

function supabaseAdminHeaders(prefer?: string): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_ANON_KEY");
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
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

function mapCoupon(row: CouponRow): Cupom {
  const influencerName =
    row.influencers?.nome || row.influencer_name || row.influencer_email || "Influenciador";
  const status: CupomStatus = row.is_active === false ? "pausado" : "ativo";

  return {
    id: row.id,
    influenciador_id: row.influencer_id ?? row.id,
    codigo: row.code,
    code: row.code,
    type: row.type,
    discount_percent: row.discount_percent,
    commission_percent: row.commission_percent ?? 0,
    influencer_name: row.influencer_name,
    influencer_email: row.influencer_email,
    max_uses: row.max_uses,
    use_count: row.use_count ?? 0,
    is_active: row.is_active ?? true,
    created_at: row.created_at,
    tipo_desconto: "percentual",
    valor_desconto: row.discount_percent,
    comissao_tipo: "percentual_faturamento",
    comissao_valor: row.commission_percent ?? 0,
    limite_usos: row.max_uses,
    usos: row.use_count ?? 0,
    validade: null,
    status,
    criado_em: row.created_at ?? new Date(0).toISOString(),
    atualizado_em: row.created_at ?? new Date(0).toISOString(),
    influenciadores: {
      id: row.influencer_id ?? row.id,
      nome: influencerName,
      telefone: row.influencers?.telefone ?? null,
      status: row.influencers?.status ?? "ativo",
    },
  };
}

function mapInfluencer(row: InfluencerRow): Influenciador {
  return {
    id: row.id,
    nome: row.nome,
    telefone: row.telefone,
    documento: row.documento,
    chave_pix: row.chave_pix,
    canal: row.canal,
    status: row.status ?? "ativo",
    observacao: row.observacao,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

export async function listarInfluenciadores(): Promise<Influenciador[]> {
  const rows = await requestJson<InfluencerRow[]>("/influencers?select=*&order=nome.asc").catch(
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("PGRST205") || message.includes("Could not find the table")) return null;
      throw error;
    },
  );

  if (rows) return rows.map(mapInfluencer);

  const coupons = await listarCupons();
  const influencers = new Map<string, Influenciador>();

  for (const coupon of coupons) {
    const nome = coupon.influencer_name || coupon.influencer_email;
    if (!nome) continue;

    influencers.set(coupon.influenciador_id, {
      id: coupon.influenciador_id,
      nome,
      telefone: null,
      documento: null,
      chave_pix: null,
      canal: "Cupom",
      status: "ativo",
      observacao: coupon.influencer_email ?? null,
      criado_em: coupon.criado_em,
      atualizado_em: coupon.atualizado_em,
    });
  }

  return [...influencers.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function listarCupons(): Promise<Cupom[]> {
  const rows = await requestJson<CouponRow[]>(
    "/coupons?select=*,influencers(id,nome,telefone,status)&order=created_at.desc",
  ).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("influencers")) throw error;
    return requestJson<CouponRow[]>("/coupons?select=*&order=created_at.desc");
  });
  return rows.map(mapCoupon);
}

export async function listarComissoes(): Promise<ComissaoInfluenciador[]> {
  return [];
}

export async function listarIndicacoesResumo(): Promise<IndicacoesResumo> {
  const [influenciadores, cupons, comissoes, referrals, creditTransactions] = await Promise.all([
    listarInfluenciadores(),
    listarCupons(),
    listarComissoes(),
    requestAdminJson<Referral[]>("/referrals?select=*&order=created_at.desc"),
    requestAdminJson<
      Array<{
        user_id: string;
        amount: number;
        type: "earned" | "used";
        app_users?: Pick<AppUser, "name" | "email" | "referral_code"> | null;
      }>
    >("/credit_transactions?select=user_id,amount,type&order=created_at.desc"),
  ]);
  const vendasComCupom = new Set(comissoes.map((comissao) => comissao.venda_id)).size;
  const faturamento = comissoes.reduce((sum, comissao) => sum + (comissao.vendas?.total ?? 0), 0);
  const creditosDistribuidos = creditTransactions
    .filter((item) => item.type === "earned")
    .reduce((sum, item) => sum + item.amount, 0);
  const rankingMap = new Map<
    string,
    { user_id: string; nome: string; total: number; creditos: number }
  >();
  for (const referral of referrals.filter((item) => item.status === "completed")) {
    const tx = creditTransactions.find(
      (item) => item.user_id === referral.referrer_id && item.type === "earned",
    );
    const current = rankingMap.get(referral.referrer_id) ?? {
      user_id: referral.referrer_id,
      nome:
        tx?.app_users?.name ||
        tx?.app_users?.email ||
        tx?.app_users?.referral_code ||
        referral.referrer_id,
      total: 0,
      creditos: 0,
    };
    current.total += 1;
    current.creditos += referral.credit_amount ?? 0;
    rankingMap.set(referral.referrer_id, current);
  }

  return {
    influenciadores,
    cupons,
    comissoes,
    referrals,
    creditTransactions,
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
      totalIndicacoes: referrals.filter((item) => item.status === "completed").length,
      creditosDistribuidos,
      rankingIndicacoes: [...rankingMap.values()].sort((a, b) => b.total - a.total).slice(0, 10),
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
  const rows = await requestJson<InfluencerRow[]>("/influencers", {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(influenciadorPayload(input)),
  });

  if (!rows[0]) throw new Error("Influenciador nao retornado");
  return mapInfluencer(rows[0]);
}

export async function atualizarInfluenciador(
  id: string,
  input: {
    nome: string;
    telefone?: string | null;
    documento?: string | null;
    chave_pix?: string | null;
    canal?: string | null;
    status?: InfluenciadorStatus;
    observacao?: string | null;
  },
): Promise<Influenciador> {
  const rows = await requestJson<InfluencerRow[]>(`/influencers?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(influenciadorPayload(input)),
  });

  if (!rows[0]) throw new Error("Influenciador nao encontrado");
  return mapInfluencer(rows[0]);
}

function influenciadorPayload(input: {
  nome: string;
  telefone?: string | null;
  documento?: string | null;
  chave_pix?: string | null;
  canal?: string | null;
  status?: InfluenciadorStatus;
  observacao?: string | null;
}): Record<string, unknown> {
  return {
    nome: input.nome.trim(),
    telefone: input.telefone?.replace(/\D/g, "") || null,
    documento: input.documento?.trim() || null,
    chave_pix: input.chave_pix?.trim() || null,
    canal: input.canal?.trim() || null,
    status: input.status ?? "ativo",
    observacao: input.observacao?.trim() || null,
    atualizado_em: new Date().toISOString(),
  };
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
  influencer_name?: string | null;
  influencer_email?: string | null;
}): Promise<Cupom> {
  const codigo = normalizarCupom(input.codigo);
  const rows = await requestJson<CouponRow[]>("/coupons", {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      code: codigo,
      type: "influencer",
      influencer_id: input.influenciador_id,
      discount_percent: input.tipo_desconto === "percentual" ? Math.trunc(input.valor_desconto) : 0,
      commission_percent:
        input.comissao_tipo !== "valor_fixo" ? Math.trunc(input.comissao_valor) : 0,
      influencer_name: input.influencer_name?.trim() || null,
      influencer_email: input.influencer_email?.trim() || null,
      max_uses: input.limite_usos ?? null,
      is_active: true,
    }),
  });

  if (!rows[0]) throw new Error("Cupom nao retornado");
  return mapCoupon(rows[0]);
}

async function requestAdminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(supabaseUrl(path), {
    ...init,
    headers: {
      ...supabaseAdminHeaders(),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase admin indicacoes request failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T;
}

export async function removerInfluenciador(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/influencers?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders("return=minimal"),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase influenciador delete failed (${response.status}): ${errorBody}`);
  }
}

export async function removerCupom(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/coupons?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders("return=minimal"),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cupom delete failed (${response.status}): ${errorBody}`);
  }
}

export async function definirCupomAtivo(id: string, ativo: boolean): Promise<Cupom> {
  const rows = await requestJson<CouponRow[]>(`/coupons?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      is_active: ativo,
    }),
  });
  if (!rows[0]) throw new Error("Cupom nao encontrado");
  return mapCoupon(rows[0]);
}

export async function buscarCupomAtivo(codigo: string): Promise<Cupom | null> {
  const normalized = normalizarCupom(codigo);
  const params = new URLSearchParams({
    code: `eq.${normalized}`,
    select: "*",
    limit: "1",
  });
  const rows = await requestJson<CouponRow[]>(`/coupons?${params}`);
  const cupom = rows[0] ? mapCoupon(rows[0]) : null;

  if (!cupom || cupom.status !== "ativo") return null;
  if (cupom.is_active === false) return null;
  if (cupom.limite_usos !== null && cupom.usos >= cupom.limite_usos) return null;
  if (
    cupom.max_uses !== null &&
    cupom.max_uses !== undefined &&
    (cupom.use_count ?? cupom.usos) >= cupom.max_uses
  )
    return null;

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

export async function validarCupom(
  codigo: string,
  totalBruto: number,
): Promise<CupomAplicado | null> {
  const cupom = await buscarCupomAtivo(codigo);
  return cupom ? calcularCupom(cupom, totalBruto) : null;
}

export async function registrarUsoCupom(cupom: Cupom): Promise<void> {
  try {
    await fetch(supabaseUrl(`/coupons?id=eq.${encodeURIComponent(cupom.id)}`), {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        use_count: cupom.usos + 1,
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
  void vendaId;
}

export async function cancelarComissoesVenda(vendaId: string): Promise<void> {
  void vendaId;
}

export async function marcarComissaoPaga(id: string): Promise<ComissaoInfluenciador> {
  void id;
  throw new Error(
    "Comissoes de influenciadores nao existem na migration 20260528020000_referral_system.sql",
  );
}

export type CouponUse = {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id: string;
  order_value: number;
  discount_applied: number;
  commission_value: number;
  created_at: string;
};

export type AppUser = {
  id: string;
  name: string | null;
  email: string | null;
  referral_code: string | null;
  created_at: string;
  updated_at: string;
};

export type Referral = {
  id: string;
  referrer_id: string;
  referred_id: string;
  referral_code: string;
  status: "pending" | "completed";
  order_id: string | null;
  order_value: number | null;
  credit_amount: number | null;
  created_at: string;
};

export type UserCredit = {
  id: string;
  user_id: string;
  amount: number;
  updated_at: string;
};

function roundMoney(value: number): number {
  return Math.round(Math.max(0, value) * 100) / 100;
}

function userNameSlug(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase()
    .slice(0, 12);
  return slug || "USER";
}

function randomCodePart(size = 4): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function gerarReferralCode(nome: string): string {
  return `${userNameSlug(nome)}-${randomCodePart(4)}`;
}

export async function validarCupomCheckout(code: string): Promise<{
  valid: boolean;
  discount_percent: number;
  type: "influencer" | "referral";
}> {
  const coupon = await buscarCupomAtivo(code);
  return {
    valid: Boolean(coupon),
    discount_percent:
      coupon?.discount_percent ??
      (coupon?.tipo_desconto === "percentual" ? Number(coupon.valor_desconto) : 0),
    type: coupon?.type ?? "influencer",
  };
}

export async function aplicarCupomCheckout(input: {
  coupon_code: string;
  order_id: string;
  user_id: string;
  order_value: number;
}): Promise<{ ok: true; coupon_use: CouponUse | null }> {
  const coupon = await buscarCupomAtivo(input.coupon_code);
  if (!coupon) throw new Error("Cupom invalido ou indisponivel");

  const discountPercent =
    coupon.discount_percent ??
    (coupon.tipo_desconto === "percentual" ? Number(coupon.valor_desconto) : 0);
  const commissionPercent =
    coupon.commission_percent ??
    (coupon.comissao_tipo !== "valor_fixo" ? Number(coupon.comissao_valor) : 0);
  const discountApplied = roundMoney((input.order_value * discountPercent) / 100);
  const commissionValue =
    coupon.type === "influencer" ? roundMoney((input.order_value * commissionPercent) / 100) : 0;

  const rows = await requestAdminJson<CouponUse[]>("/coupon_uses?on_conflict=coupon_id,order_id", {
    method: "POST",
    headers: supabaseAdminHeaders("resolution=ignore-duplicates,return=representation"),
    body: JSON.stringify({
      coupon_id: coupon.id,
      user_id: input.user_id,
      order_id: input.order_id,
      order_value: roundMoney(input.order_value),
      discount_applied: discountApplied,
      commission_value: commissionValue,
    }),
  });

  if (rows[0]) {
    await fetch(supabaseUrl(`/coupons?id=eq.${encodeURIComponent(coupon.id)}`), {
      method: "PATCH",
      headers: supabaseAdminHeaders("return=minimal"),
      body: JSON.stringify({
        use_count: (coupon.use_count ?? coupon.usos) + 1,
      }),
    });
  }

  return { ok: true, coupon_use: rows[0] ?? null };
}

export async function buscarUsuarioApp(userId: string): Promise<AppUser | null> {
  void userId;
  return null;
}

export async function garantirReferralCode(
  userId: string,
  name?: string | null,
  email?: string | null,
): Promise<string> {
  void name;
  void email;
  return userId;
}

export async function validarReferralCode(
  referralCode: string,
  userId: string,
): Promise<{
  valid: boolean;
  discount_percent: 10;
  referrer_id?: string;
}> {
  const normalizedCode = referralCode.trim();
  const referrerId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedCode,
    )
      ? normalizedCode
      : null;

  return {
    valid: Boolean(referrerId && referrerId !== userId),
    discount_percent: 10,
    referrer_id: referrerId ?? undefined,
  };
}

async function getCreditBalance(userId: string): Promise<UserCredit | null> {
  const rows = await requestAdminJson<UserCredit[]>(
    `/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  );
  return rows[0] ?? null;
}

export async function buscarSaldoCreditos(userId: string): Promise<number> {
  return (await getCreditBalance(userId))?.amount ?? 0;
}

export async function aplicarReferralCheckout(input: {
  referral_code: string;
  order_id: string;
  referred_id: string;
  order_value: number;
}): Promise<{ ok: true; referral: Referral; credit_amount: number }> {
  const validation = await validarReferralCode(input.referral_code, input.referred_id);
  if (!validation.valid || !validation.referrer_id) throw new Error("Codigo de indicacao invalido");

  const creditAmount = roundMoney(input.order_value * 0.1);
  const referralRows = await requestAdminJson<Referral[]>(
    "/referrals?on_conflict=referred_id,order_id",
    {
      method: "POST",
      headers: supabaseAdminHeaders("resolution=merge-duplicates,return=representation"),
      body: JSON.stringify({
        referrer_id: validation.referrer_id,
        referred_id: input.referred_id,
        referral_code: input.referral_code.trim().toUpperCase(),
        status: "completed",
        order_id: input.order_id,
        order_value: roundMoney(input.order_value),
        credit_amount: creditAmount,
      }),
    },
  );
  const referral = referralRows[0];
  if (!referral) throw new Error("Indicacao nao registrada");

  const currentCredit = await getCreditBalance(validation.referrer_id);
  await requestAdminJson<UserCredit[]>("/user_credits?on_conflict=user_id", {
    method: "POST",
    headers: supabaseAdminHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify({
      user_id: validation.referrer_id,
      amount: roundMoney((currentCredit?.amount ?? 0) + creditAmount),
      updated_at: new Date().toISOString(),
    }),
  });

  await requestAdminJson("/credit_transactions", {
    method: "POST",
    headers: supabaseAdminHeaders("return=minimal"),
    body: JSON.stringify({
      user_id: validation.referrer_id,
      referral_id: referral.id,
      amount: creditAmount,
      type: "earned",
    }),
  });

  return { ok: true, referral, credit_amount: creditAmount };
}

export async function usarCreditoNaCompra(input: {
  user_id: string;
  order_id: string;
  order_value: number;
}): Promise<{ used: number; remaining: number }> {
  const credit = await getCreditBalance(input.user_id);
  const current = credit?.amount ?? 0;
  const used = roundMoney(Math.min(current, input.order_value));
  if (used <= 0) return { used: 0, remaining: current };

  const remaining = roundMoney(current - used);
  await requestAdminJson<UserCredit[]>("/user_credits?on_conflict=user_id", {
    method: "POST",
    headers: supabaseAdminHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify({
      user_id: input.user_id,
      amount: remaining,
      updated_at: new Date().toISOString(),
    }),
  });
  await requestAdminJson("/credit_transactions", {
    method: "POST",
    headers: supabaseAdminHeaders("return=minimal"),
    body: JSON.stringify({
      user_id: input.user_id,
      referral_id: null,
      amount: used,
      type: "used",
    }),
  });

  return { used, remaining };
}
