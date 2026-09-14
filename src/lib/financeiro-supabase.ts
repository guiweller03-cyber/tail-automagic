// Persistência dos lançamentos manuais do Financeiro (Despesas, Marketing e
// Combustível) no Supabase. Antes ficavam só no localStorage do navegador e
// "sumiam" quando o usuário trocava de navegador/dispositivo ou limpava o cache.
// Tabelas criadas na migration 20260616000000_financeiro_lancamentos_manuais.sql.

import { requireSupabaseServerKey } from "./server-env";

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
  const key = requireSupabaseServerKey();
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

async function selectAllPages<T>(path: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(
      supabaseUrl(`${path}${separator}limit=${pageSize}&offset=${offset}`),
      { headers: supabaseHeaders() },
    );
    await ensureOk(response, "historico financeiro select");
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

/* ============================================================
   VENDAS / EXTRATO FINANCEIRO
   A tabela vendas e a fonte unica: PDV, WhatsApp e CRM gravam nela.
   ============================================================ */
export type OrigemVendaFinanceira = "PDV" | "WhatsApp IA" | "CRM";

export type VendaFinanceiraItem = {
  id: string;
  sku: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  subtotal: number;
  custoTotal: number;
  petNome?: string;
};

export type VendaFinanceira = {
  id: string;
  clienteId?: string;
  cliente: string;
  telefone: string;
  petNome?: string;
  itens: VendaFinanceiraItem[];
  quantidadeItens: number;
  totalBruto: number;
  desconto: number;
  total: number;
  custoProdutos: number;
  lucro: number;
  margem: number;
  formaPagamento: string;
  statusPagamento: string;
  status: string;
  processo: string;
  origem: OrigemVendaFinanceira;
  observacao: string;
  cupom?: string;
  vendaOrigem?: string;
  criadoEm: string;
  atualizadoEm: string;
  faturadoEm?: string;
};

type VendaFinanceiraRow = {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  pet_nome: string | null;
  total: number | null;
  total_bruto: number | null;
  desconto_cupom: number | null;
  lucro: number | null;
  forma_pagamento: string | null;
  status_pagamento: string | null;
  status: string | null;
  processo: string | null;
  observacao: string | null;
  cupom_codigo: string | null;
  venda_origem: string | null;
  criado_em: string;
  atualizado_em: string;
  faturado_em: string | null;
  clientes: {
    id: string;
    nome: string;
    telefone: string;
  } | null;
};

type VendaItemFinanceiroRow = {
  id: string;
  venda_id: string;
  sku: string;
  nome: string;
  quantidade: number | null;
  preco: number | null;
  preco_compra: number | null;
  pet_nome: string | null;
};

function numero(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferirOrigemVenda(observacao: string | null | undefined): OrigemVendaFinanceira {
  const texto = observacao?.toLocaleLowerCase("pt-BR") ?? "";
  if (/whatsapp|comprovante/.test(texto)) return "WhatsApp IA";
  if (/\bpdv\b|venda r[aá]pida/.test(texto)) return "PDV";
  return "CRM";
}

function mapVendaItem(row: VendaItemFinanceiroRow): VendaFinanceiraItem {
  const quantidade = Math.max(0, numero(row.quantidade));
  const precoUnitario = numero(row.preco);
  const custoUnitario = numero(row.preco_compra);
  return {
    id: row.id,
    sku: row.sku,
    nome: row.nome,
    quantidade,
    precoUnitario,
    custoUnitario,
    subtotal: precoUnitario * quantidade,
    custoTotal: custoUnitario * quantidade,
    petNome: row.pet_nome?.trim() || undefined,
  };
}

export function mapVendaFinanceira(
  row: VendaFinanceiraRow,
  itens: VendaFinanceiraItem[],
): VendaFinanceira {
  const total = numero(row.total);
  const desconto = numero(row.desconto_cupom);
  const totalBrutoInformado = numero(row.total_bruto);
  const totalBruto = totalBrutoInformado > 0 ? totalBrutoInformado : total + desconto;
  const custoItens = itens.reduce((sum, item) => sum + item.custoTotal, 0);
  const lucro = row.lucro == null && custoItens > 0 ? total - custoItens : numero(row.lucro);
  const custoProdutos = custoItens > 0 ? custoItens : Math.max(0, total - lucro);

  return {
    id: row.id,
    clienteId: row.cliente_id ?? row.clientes?.id ?? undefined,
    cliente: row.cliente_nome?.trim() || row.clientes?.nome?.trim() || "Cliente não informado",
    telefone: row.telefone?.trim() || row.clientes?.telefone?.trim() || "",
    petNome: row.pet_nome?.trim() || undefined,
    itens,
    quantidadeItens: itens.reduce((sum, item) => sum + item.quantidade, 0),
    totalBruto,
    desconto: Math.max(desconto, totalBruto - total),
    total,
    custoProdutos,
    lucro,
    margem: total > 0 ? (lucro / total) * 100 : 0,
    formaPagamento: row.forma_pagamento?.trim() || "Não informado",
    statusPagamento: row.status_pagamento?.trim() || "pendente",
    status: row.status?.trim() || "concluida",
    processo: row.processo?.trim() || "novo",
    origem: inferirOrigemVenda(row.observacao),
    observacao: row.observacao?.trim() || "",
    cupom: row.cupom_codigo?.trim() || undefined,
    vendaOrigem: row.venda_origem?.trim() || undefined,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    faturadoEm: row.faturado_em ?? undefined,
  };
}

export async function listarVendasFinanceiras(): Promise<VendaFinanceira[]> {
  const [vendas, itensRows] = await Promise.all([
    selectAllPages<VendaFinanceiraRow>(
      "/vendas?select=id,cliente_id,cliente_nome,telefone,pet_nome,total,total_bruto,desconto_cupom,lucro,forma_pagamento,status_pagamento,status,processo,observacao,cupom_codigo,venda_origem,criado_em,atualizado_em,faturado_em,clientes(id,nome,telefone)&order=criado_em.desc",
    ),
    selectAllPages<VendaItemFinanceiroRow>(
      "/venda_itens?select=id,venda_id,sku,nome,quantidade,preco,preco_compra,pet_nome&order=criado_em.asc",
    ),
  ]);
  const itensPorVenda = new Map<string, VendaFinanceiraItem[]>();

  for (const row of itensRows) {
    const itens = itensPorVenda.get(row.venda_id) ?? [];
    itens.push(mapVendaItem(row));
    itensPorVenda.set(row.venda_id, itens);
  }

  return vendas.map((venda) => mapVendaFinanceira(venda, itensPorVenda.get(venda.id) ?? []));
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
