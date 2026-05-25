import type { Cliente, Produto } from "@/lib/mock";

export type DashboardData = {
  kpis: {
    faturamentoHoje: number;
    faturamentoSemana: number;
    faturamentoMes: number;
    lucroMes: number;
    ticketMedio: number;
    pedidosHoje: number;
    taxaRecompra: number;
    taxaUpsell: number;
    clientesVip: number;
    clientesRisco: number;
    estoqueCritico: number;
    leadsHoje: number;
    leadsSemana: number;
    conversaoHoje: number;
    conversaoSemana: number;
    conversaoMes: number;
    recompraPrevista: number;
  };
  vendasSemana: { dia: string; vendas: number; lucro: number }[];
  crescimentoMensal: { mes: string; valor: number }[];
  funilDados: { etapa: string; valor: number; cor: string }[];
  conversas: {
    id: string;
    cliente: string;
    ultima: string;
    hora: string;
    naoLidas: number;
  }[];
};

type ClienteRow = {
  id: string;
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
};

type ProdutoRow = {
  sku: string;
  nome: string;
  categoria: string;
  estoque: number | null;
  minimo: number | null;
  giro: Produto["giro"] | null;
  preco: number | null;
  preco_compra: number | null;
  tipo: Produto["tipo"] | null;
  fornecedor: string | null;
};

type VendaRow = {
  id: string;
  total: number | null;
  lucro: number | null;
  status: string | null;
  status_pagamento: string | null;
  criado_em: string;
};

type ConversaDashboardRow = {
  id: string;
  telefone: string;
  nome_cliente: string | null;
  historico: { role?: string; content?: string }[] | null;
  aguardando_humano: boolean | null;
  atualizado_em: string;
};

type ClienteDashboardRow = Pick<
  ClienteRow,
  "perfil" | "ultima" | "total_gasto" | "lucro_liquido" | "pedidos" | "prox_recompra"
>;

type ProdutoDashboardRow = Pick<ProdutoRow, "estoque" | "minimo">;

const DASHBOARD_CACHE_MS = 15_000;
let dashboardCache: { expiresAt: number; data: DashboardData } | null = null;
let dashboardPromise: Promise<DashboardData> | null = null;

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

function supabaseHeaders(): HeadersInit {
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
  };
}

async function selectFromSupabase<T>(path: string): Promise<T[]> {
  const response = await fetch(supabaseUrl(path), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T[];
}

async function selectOptional<T>(path: string): Promise<T[]> {
  try {
    return await selectFromSupabase<T>(path);
  } catch {
    return [];
  }
}

function mapCliente(row: ClienteRow): Cliente {
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
  };
}

function mapProduto(row: ProdutoRow): Produto {
  return {
    sku: row.sku,
    nome: row.nome,
    categoria: row.categoria,
    estoque: row.estoque ?? 0,
    minimo: row.minimo ?? 0,
    giro: row.giro ?? "baixo",
    preco: row.preco ?? 0,
    precoCompra: row.preco_compra ?? 0,
    tipo: row.tipo ?? "próprio",
    fornecedor: row.fornecedor ?? undefined,
  };
}

export async function listarClientes(): Promise<Cliente[]> {
  const rows = await selectFromSupabase<ClienteRow>("/clientes?select=*&order=nome.asc");
  return rows.map(mapCliente);
}

export type ClienteCrmInput = {
  nome: string;
  telefone: string;
  endereco?: string;
  bairro?: string;
  pets?: string[];
  perfil?: Cliente["perfil"];
  origem?: string;
};

function clientePayload(input: ClienteCrmInput): Record<string, unknown> {
  return {
    nome: input.nome.trim(),
    telefone: input.telefone.replace(/\D/g, ""),
    endereco: input.endereco?.trim() || null,
    bairro: input.bairro?.trim() || null,
    pets: input.pets?.map((pet) => pet.trim()).filter(Boolean) ?? [],
    perfil: input.perfil ?? "Novo",
    origem: input.origem?.trim() || "CRM manual",
    atualizado_em: new Date().toISOString(),
  };
}

async function writeCliente(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<Cliente> {
  const response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente write failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ClienteRow[];
  if (!rows[0]) throw new Error("Cliente nao retornado pelo Supabase");

  return mapCliente(rows[0]);
}

export async function criarClienteCrm(input: ClienteCrmInput): Promise<Cliente> {
  return writeCliente("/clientes", "POST", clientePayload(input));
}

export async function atualizarClienteCrm(id: string, input: ClienteCrmInput): Promise<Cliente> {
  return writeCliente(`/clientes?id=eq.${encodeURIComponent(id)}`, "PATCH", clientePayload(input));
}

export async function listarProdutos(): Promise<Produto[]> {
  const rows = await selectFromSupabase<ProdutoRow>("/produtos?select=*&order=nome.asc");
  return rows.map(mapProduto);
}

export type ProdutoCrmInput = {
  sku: string;
  nome: string;
  categoria: string;
  estoque: number;
  minimo: number;
  giro: Produto["giro"];
  preco: number;
  precoCompra: number;
  tipo: Produto["tipo"];
  fornecedor?: string;
};

function produtoPayload(input: ProdutoCrmInput): Record<string, unknown> {
  return {
    sku: input.sku.trim().toUpperCase(),
    nome: input.nome.trim(),
    categoria: input.categoria.trim(),
    estoque: input.estoque,
    minimo: input.minimo,
    giro: input.giro,
    preco: input.preco,
    preco_compra: input.precoCompra,
    tipo: input.tipo,
    fornecedor: input.fornecedor?.trim() || null,
    atualizado_em: new Date().toISOString(),
  };
}

async function writeProduto(
  path: string,
  method: "POST" | "PATCH",
  input: ProdutoCrmInput,
): Promise<Produto> {
  const response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(produtoPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produto write failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ProdutoRow[];
  if (!rows[0]) throw new Error("Produto nao retornado pelo Supabase");

  return mapProduto(rows[0]);
}

export async function criarProdutoCrm(input: ProdutoCrmInput): Promise<Produto> {
  return writeProduto("/produtos", "POST", input);
}

export async function atualizarProdutoCrm(sku: string, input: ProdutoCrmInput): Promise<Produto> {
  return writeProduto(`/produtos?sku=eq.${encodeURIComponent(sku)}`, "PATCH", input);
}

async function listarClientesDashboard(): Promise<ClienteDashboardRow[]> {
  return selectFromSupabase<ClienteDashboardRow>(
    "/clientes?select=perfil,ultima,total_gasto,lucro_liquido,pedidos,prox_recompra",
  );
}

async function listarProdutosDashboard(): Promise<ProdutoDashboardRow[]> {
  return selectFromSupabase<ProdutoDashboardRow>("/produtos?select=estoque,minimo");
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  return start;
}

function numeroSeguro(value: unknown): number {
  const numero = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function sum(rows: VendaRow[], field: "total" | "lucro"): number {
  return rows.reduce((total, row) => total + numeroSeguro(row[field]), 0);
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "");
}

function mapConversa(row: ConversaDashboardRow): DashboardData["conversas"][number] {
  const ultimaMensagem = row.historico?.at(-1)?.content ?? "";
  const atualizadoEm = new Date(row.atualizado_em);

  return {
    id: row.id,
    cliente: row.nome_cliente ?? row.telefone,
    ultima: ultimaMensagem || "Sem mensagens",
    hora: atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    naoLidas: row.aguardando_humano ? 1 : 0,
  };
}

export async function carregarDashboard(): Promise<DashboardData> {
  const cached = dashboardCache;
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  if (dashboardPromise) {
    return dashboardPromise;
  }

  dashboardPromise = carregarDashboardSemCache()
    .then((data) => {
      dashboardCache = { data, expiresAt: Date.now() + DASHBOARD_CACHE_MS };
      return data;
    })
    .finally(() => {
      dashboardPromise = null;
    });

  return dashboardPromise;
}

async function carregarDashboardSemCache(): Promise<DashboardData> {
  const agora = new Date();
  const inicioHistorico = new Date(agora.getFullYear(), agora.getMonth() - 7, 1);
  const vendasPath = `/vendas?select=id,total,lucro,status,status_pagamento,criado_em&criado_em=gte.${encodeURIComponent(
    inicioHistorico.toISOString(),
  )}&order=criado_em.desc`;
  const [clientes, produtos, vendas, conversasRows] = await Promise.all([
    listarClientesDashboard(),
    listarProdutosDashboard(),
    selectOptional<VendaRow>(vendasPath),
    selectOptional<ConversaDashboardRow>(
      "/conversas?select=id,telefone,nome_cliente,historico,aguardando_humano,atualizado_em&order=atualizado_em.desc&limit=5",
    ),
  ]);

  const hoje = startOfDay(agora);
  const semana = startOfWeek(agora);
  const mes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const vendasPagas = vendas.filter(
    (venda) =>
      venda.status_pagamento === "pago" &&
      venda.status !== "cancelado" &&
      venda.status !== "cancelada",
  );
  const vendasHoje = vendasPagas.filter((venda) => new Date(venda.criado_em) >= hoje);
  const vendasSemanaAtual = vendasPagas.filter((venda) => new Date(venda.criado_em) >= semana);
  const vendasMes = vendasPagas.filter((venda) => new Date(venda.criado_em) >= mes);
  const leadsHoje = clientes.filter((cliente) => cliente.ultima === "hoje").length;
  const leadsSemana = clientes.filter(
    (cliente) => cliente.ultima === "hoje" || cliente.ultima.includes("dia"),
  ).length;
  const faturamentoMes = vendas.length
    ? sum(vendasMes, "total")
    : clientes.reduce((total, cliente) => total + numeroSeguro(cliente.total_gasto), 0);
  const lucroMes = vendas.length
    ? sum(vendasMes, "lucro")
    : clientes.reduce((total, cliente) => total + numeroSeguro(cliente.lucro_liquido), 0);
  const pedidosMes = vendas.length
    ? vendasMes.length
    : clientes.reduce((total, cliente) => total + numeroSeguro(cliente.pedidos), 0);
  const ticketMedio = pedidosMes > 0 ? faturamentoMes / pedidosMes : 0;
  const clientesComRecompra = clientes.filter(
    (cliente) => cliente.proxRecompra && cliente.proxRecompra !== "atrasada",
  ).length;
  const clientesVip = clientes.filter((cliente) => cliente.perfil === "VIP").length;
  const clientesRisco = clientes.filter((cliente) => cliente.perfil === "Risco").length;
  const estoqueCritico = produtos.filter((produto) => produto.estoque < produto.minimo).length;

  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const vendasSemana = Array.from({ length: 7 }, (_, index) => {
    const dia = new Date(semana);
    dia.setDate(semana.getDate() + index);
    const proximoDia = new Date(dia);
    proximoDia.setDate(dia.getDate() + 1);
    const vendasDia = vendasPagas.filter((venda) => {
      const criadoEm = new Date(venda.criado_em);
      return criadoEm >= dia && criadoEm < proximoDia;
    });

    return {
      dia: dias[dia.getDay()],
      vendas: sum(vendasDia, "total"),
      lucro: sum(vendasDia, "lucro"),
    };
  });

  const crescimentoMensal = Array.from({ length: 8 }, (_, index) => {
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - 7 + index, 1);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
    const vendasDoMes = vendasPagas.filter((venda) => {
      const criadoEm = new Date(venda.criado_em);
      return criadoEm >= inicio && criadoEm < fim;
    });

    return {
      mes: monthLabel(inicio),
      valor: sum(vendasDoMes, "total"),
    };
  });

  const leads = clientes.length;
  const pedidos = vendas.length ? vendasPagas.length : pedidosMes;
  const recompra = clientesComRecompra;

  return {
    kpis: {
      faturamentoHoje: sum(vendasHoje, "total"),
      faturamentoSemana: sum(vendasSemanaAtual, "total"),
      faturamentoMes,
      lucroMes,
      ticketMedio,
      pedidosHoje: vendasHoje.length,
      taxaRecompra: percent(clientesComRecompra, clientes.length),
      taxaUpsell: 0,
      clientesVip,
      clientesRisco,
      estoqueCritico,
      leadsHoje,
      leadsSemana,
      conversaoHoje: percent(vendasHoje.length, leadsHoje),
      conversaoSemana: percent(vendasSemanaAtual.length, leadsSemana),
      conversaoMes: percent(pedidosMes, leads),
      recompraPrevista: clientesComRecompra,
    },
    vendasSemana,
    crescimentoMensal,
    funilDados: [
      { etapa: "Leads", valor: leads, cor: "var(--color-chart-4)" },
      { etapa: "Conversas", valor: conversasRows.length, cor: "var(--color-accent)" },
      { etapa: "Pedidos", valor: pedidos, cor: "var(--color-primary)" },
      {
        etapa: "Clientes ativos",
        valor: clientes.length - clientesRisco,
        cor: "var(--color-success)",
      },
      { etapa: "Recompra", valor: recompra, cor: "var(--color-chart-2)" },
    ],
    conversas: conversasRows.map(mapConversa),
  };
}
