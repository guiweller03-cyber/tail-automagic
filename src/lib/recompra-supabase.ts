import type {
  DemandaBairro,
  ProdutoPrevisto,
  RecompraPrevista,
  RecompraStatus,
} from "@/lib/crm-types";

type ClienteRow = {
  id: string;
  nome: string;
  telefone: string;
  bairro: string | null;
  cidade: string | null;
  pets: string[] | null;
  perfil: RecompraPrevista["perfil"] | null;
  especies: Array<"cachorro" | "gato"> | null;
  observacoes: string | null;
};

type ProdutoRow = {
  sku: string;
  nome: string;
  categoria: string | null;
  preco: number | null;
  preco_compra: number | null;
  estoque: number | null;
  detalhes_tecnicos?: { peso?: string; especie?: string; porte?: string; tipoProduto?: string } | null;
};

type VendaItemComVendaRow = {
  id: string;
  venda_id: string;
  sku: string;
  nome: string;
  quantidade: number;
  preco: number | null;
  preco_compra: number | null;
  vendas: {
    id: string;
    cliente_id: string | null;
    cliente_nome: string | null;
    telefone: string | null;
    criado_em: string;
    status: string | null;
  } | null;
};

type PrevisaoRow = {
  id: string;
  cliente_id: string;
  venda_id: string | null;
  venda_item_id: string | null;
  sku: string | null;
  produto_nome: string;
  categoria: string | null;
  peso_kg: number;
  quantidade: number;
  pets: Array<{ nome: string; especie: "cachorro" | "gato"; porte: string }> | null;
  consumo_diario_g: number;
  dias_estimados: number;
  media_dias_real: number | null;
  historico_dias: number[] | null;
  ultima_compra_em: string;
  proxima_compra_em: string;
  data_alerta: string;
  status: RecompraStatus;
  contatado: boolean;
  travado: boolean;
  clientes: ClienteRow | null;
  produtos: ProdutoRow | null;
};

type DadosObservadosInput = {
  clienteId?: string | null;
  telefone: string;
  dados: Record<string, unknown>;
  resumo?: string | null;
  confianca?: number;
};

export type RecompraData = {
  recompras: RecompraPrevista[];
  produtos: ProdutoPrevisto[];
  bairros: DemandaBairro[];
  alertas: { tipo: string; cliente: string; msg: string }[];
};

const ALERTA_DIAS_ANTES = 5;
const DEFAULT_CONSUMO_G_DIA = 120;

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

async function selectRows<T>(path: string): Promise<T[]> {
  const response = await fetch(supabaseUrl(path), { headers: supabaseHeaders() });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase recompra select failed (${response.status}): ${errorBody}`);
  }
  return (await response.json()) as T[];
}

async function selectOptional<T>(path: string): Promise<T[]> {
  try {
    return await selectRows<T>(path);
  } catch (error) {
    if (error instanceof Error && /PGRST205|PGRST200|recompra_previsoes|cliente_dados_observados/i.test(error.message)) {
      return [];
    }
    throw error;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function isRacao(produto: Pick<ProdutoRow, "nome" | "categoria" | "detalhes_tecnicos">): boolean {
  const text = normalizeText(
    `${produto.nome} ${produto.categoria ?? ""} ${produto.detalhes_tecnicos?.tipoProduto ?? ""}`,
  );
  return /\bracao\b|\bracoes\b|premier|golden|formula natural|n&d|granplus|special dog|special cat/.test(text);
}

function inferirPesoKg(produto: Pick<ProdutoRow, "nome" | "detalhes_tecnicos">, quantidade = 1): number {
  const origem = `${produto.detalhes_tecnicos?.peso ?? ""} ${produto.nome}`;
  const kg = origem.match(/(\d+(?:[,.]\d+)?)\s*kg/i);
  if (kg) return Number(kg[1].replace(",", ".")) * quantidade;

  const g = origem.match(/(\d+(?:[,.]\d+)?)\s*g\b/i);
  if (g) return (Number(g[1].replace(",", ".")) / 1000) * quantidade;

  return 0;
}

function especiePadrao(produto?: ProdutoRow | null, cliente?: ClienteRow | null): "cachorro" | "gato" {
  const text = normalizeText(`${produto?.nome ?? ""} ${produto?.categoria ?? ""} ${produto?.detalhes_tecnicos?.especie ?? ""}`);
  if (text.includes("gato")) return "gato";
  if (text.includes("cao") || text.includes("caes") || text.includes("cachorro")) return "cachorro";
  return cliente?.especies?.[0] ?? "cachorro";
}

function portePadrao(produto?: ProdutoRow | null, observacoes?: string | null): "pequeno" | "medio" | "grande" {
  const text = normalizeText(`${produto?.nome ?? ""} ${produto?.detalhes_tecnicos?.porte ?? ""} ${observacoes ?? ""}`);
  if (text.includes("pequeno") || text.includes("peq")) return "pequeno";
  if (text.includes("grande") || text.includes("large")) return "grande";
  return "medio";
}

function consumoPorPorte(porte: string): number {
  if (porte === "pequeno") return 70;
  if (porte === "grande") return 220;
  return 130;
}

function petsEstimados(cliente: ClienteRow | null | undefined, produto: ProdutoRow | null | undefined) {
  const nomes = cliente?.pets?.length ? cliente.pets : ["Pet"];
  const especie = especiePadrao(produto, cliente);
  const porte = portePadrao(produto, cliente?.observacoes);

  return nomes.map((nome) => ({ nome, especie, porte, consumoDiaG: consumoPorPorte(porte) }));
}

function dateOnly(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const start = new Date(`${a}T00:00:00.000Z`).getTime();
  const end = new Date(`${b}T00:00:00.000Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function statusFromDias(diasRestantes: number): RecompraStatus {
  if (diasRestantes < 0) return "atrasado";
  if (diasRestantes <= 3) return "urgente";
  if (diasRestantes <= 7) return "semana";
  return "ok";
}

function signedDiffDaysFromToday(dateString: string): number {
  const today = dateOnly(new Date());
  const days = diffDays(today, dateString);
  return dateString < today ? -days : days;
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function listarClientesPorId(ids: string[]): Promise<Map<string, ClienteRow>> {
  if (ids.length === 0) return new Map();
  const params = new URLSearchParams({
    id: `in.(${ids.map((id) => `"${id}"`).join(",")})`,
    select: "id,nome,telefone,bairro,cidade,pets,perfil,especies,observacoes",
  });
  const rows = await selectRows<ClienteRow>(`/clientes?${params}`);
  return new Map(rows.map((row) => [row.id, row]));
}

async function listarProdutosPorSku(skus: string[]): Promise<Map<string, ProdutoRow>> {
  if (skus.length === 0) return new Map();
  const params = new URLSearchParams({
    sku: `in.(${skus.map((sku) => `"${sku}"`).join(",")})`,
    select: "sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos",
  });
  const rows = await selectRows<ProdutoRow>(`/produtos?${params}`);
  return new Map(rows.map((row) => [row.sku, row]));
}

async function comprasRacaoClienteSku(clienteId: string, sku: string): Promise<VendaItemComVendaRow[]> {
  const params = new URLSearchParams({
    sku: `eq.${sku}`,
    select: "id,venda_id,sku,nome,quantidade,preco,preco_compra,vendas!inner(id,cliente_id,cliente_nome,telefone,criado_em,status)",
    order: "criado_em.desc",
  });
  const rows = await selectRows<VendaItemComVendaRow>(`/venda_itens?${params}`);
  return rows
    .filter((row) => row.vendas?.cliente_id === clienteId && row.vendas.status !== "cancelada")
    .sort((a, b) => new Date(b.vendas?.criado_em ?? 0).getTime() - new Date(a.vendas?.criado_em ?? 0).getTime());
}

export async function recalcularRecompraVenda(vendaId: string): Promise<void> {
  const params = new URLSearchParams({
    venda_id: `eq.${vendaId}`,
    select: "id,venda_id,sku,nome,quantidade,preco,preco_compra,vendas(id,cliente_id,cliente_nome,telefone,criado_em,status)",
  });
  const itens = await selectOptional<VendaItemComVendaRow>(`/venda_itens?${params}`);
  const clienteIds = Array.from(new Set(itens.map((item) => item.vendas?.cliente_id).filter(Boolean))) as string[];
  const skus = Array.from(new Set(itens.map((item) => item.sku).filter(Boolean)));
  const [clientes, produtos] = await Promise.all([listarClientesPorId(clienteIds), listarProdutosPorSku(skus)]);

  for (const item of itens) {
    const clienteId = item.vendas?.cliente_id;
    if (!clienteId || item.vendas?.status === "cancelada") continue;

    const produto = produtos.get(item.sku) ?? {
      sku: item.sku,
      nome: item.nome,
      categoria: null,
      preco: item.preco,
      preco_compra: item.preco_compra,
      estoque: null,
      detalhes_tecnicos: null,
    };
    if (!isRacao(produto)) continue;

    const cliente = clientes.get(clienteId) ?? null;
    const compras = await comprasRacaoClienteSku(clienteId, item.sku);
    const historicoDias = compras
      .slice(0, 4)
      .flatMap((compra, index, arr) => {
        const proxima = arr[index + 1];
        if (!proxima?.vendas?.criado_em || !compra.vendas?.criado_em) return [];
        return [diffDays(dateOnly(proxima.vendas.criado_em), dateOnly(compra.vendas.criado_em))];
      })
      .filter((dias) => dias >= 3 && dias <= 180)
      .slice(0, 3);
    const mediaReal = media(historicoDias);
    const pesoKg = inferirPesoKg(produto, item.quantidade);
    const pets = petsEstimados(cliente, produto);
    const consumoDiario = pets.reduce((sum, pet) => sum + pet.consumoDiaG, 0) || DEFAULT_CONSUMO_G_DIA;
    const diasEstimados = mediaReal ?? (pesoKg > 0 ? Math.max(1, Math.round((pesoKg * 1000) / consumoDiario)) : 30);
    const ultimaCompra = dateOnly(item.vendas?.criado_em ?? new Date());
    const proximaCompra = addDays(ultimaCompra, diasEstimados);
    const dataAlerta = addDays(proximaCompra, -ALERTA_DIAS_ANTES);
    const diasRestantes = signedDiffDaysFromToday(proximaCompra);

    const response = await fetch(supabaseUrl("/recompra_previsoes?on_conflict=cliente_id,sku"), {
      method: "POST",
      headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
      body: JSON.stringify({
        cliente_id: clienteId,
        venda_id: item.venda_id,
        venda_item_id: item.id,
        sku: item.sku,
        produto_nome: produto.nome,
        categoria: produto.categoria,
        peso_kg: pesoKg,
        quantidade: item.quantidade,
        pets,
        consumo_diario_g: consumoDiario,
        dias_estimados: diasEstimados,
        media_dias_real: mediaReal,
        historico_dias: historicoDias,
        ultima_compra_em: ultimaCompra,
        proxima_compra_em: proximaCompra,
        data_alerta: dataAlerta,
        status: statusFromDias(diasRestantes),
        fonte: mediaReal ? "historico" : "estimativa",
        atualizado_em: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (/PGRST205|recompra_previsoes/i.test(errorBody)) return;
      throw new Error(`Supabase recompra upsert failed (${response.status}): ${errorBody}`);
    }
  }
}

export async function recalcularTodasRecompras(limit = 2000): Promise<{ vendas: number }> {
  const params = new URLSearchParams({
    select: "venda_id",
    order: "criado_em.desc",
    limit: String(limit),
  });
  const rows = await selectRows<{ venda_id: string }>(`/venda_itens?${params}`);
  const vendaIds = Array.from(new Set(rows.map((row) => row.venda_id).filter(Boolean)));

  for (const vendaId of vendaIds) {
    await recalcularRecompraVenda(vendaId);
  }

  return { vendas: vendaIds.length };
}

export async function salvarDadosObservadosCliente(input: DadosObservadosInput): Promise<void> {
  const response = await fetch(supabaseUrl("/cliente_dados_observados"), {
    method: "POST",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({
      cliente_id: input.clienteId ?? null,
      telefone: input.telefone.replace(/\D/g, ""),
      origem: "whatsapp_ia",
      dados: input.dados,
      resumo: input.resumo ?? null,
      confianca: input.confianca ?? 0.7,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (/PGRST205|cliente_dados_observados/i.test(errorBody)) return;
    throw new Error(`Supabase dados observados insert failed (${response.status}): ${errorBody}`);
  }
}

function formatDateBr(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function diasRestantes(proximaCompra: string): number {
  return signedDiffDaysFromToday(proximaCompra);
}

function mapPrevisao(row: PrevisaoRow): RecompraPrevista {
  const cliente = row.clientes;
  const produto = row.produtos;
  const dias = diasRestantes(row.proxima_compra_em);
  const historico = row.historico_dias ?? [];
  const pet = row.pets?.[0];
  const especie = pet?.especie ?? especiePadrao(produto, cliente);
  const mediaRecompra = Math.round(row.media_dias_real ?? row.dias_estimados);
  const previsaoBase = Math.max(1, Math.round(row.dias_estimados));
  const tendencia =
    historico.length >= 2 && historico[0] < historico[1]
      ? "acelerando"
      : historico.length >= 2 && historico[0] > historico[1]
        ? "desacelerando"
        : "estavel";

  return {
    id: row.id,
    clienteId: row.cliente_id,
    cliente: cliente?.nome ?? "Cliente",
    telefone: cliente?.telefone ?? "",
    cidade: cliente?.cidade ?? "Sem cidade",
    bairro: cliente?.bairro ?? "Sem bairro",
    pet: row.pets?.map((item) => item.nome).filter(Boolean).join(", ") || "Pet",
    especie,
    perfil: cliente?.perfil ?? "Novo",
    racao: row.produto_nome,
    pesoKg: Number(row.peso_kg ?? 0),
    consumoDiaKg: Number(row.consumo_diario_g ?? 0) / 1000,
    ultimaCompra: formatDateBr(row.ultima_compra_em),
    diasRestantes: dias,
    dataPrevista: formatDateBr(row.proxima_compra_em),
    valorEstimado: produto?.preco ?? 0,
    status: statusFromDias(dias),
    contatado: row.contatado,
    mediaRecompra,
    previsaoBase,
    comportamento:
      historico.length < 2 ? "pontual" : Math.abs(historico[0] - historico[1]) > 10 ? "instavel" : tendencia === "acelerando" ? "antecipado" : tendencia === "desacelerando" ? "atrasado" : "pontual",
    precisaoIA: historico.length >= 2 ? 85 : 65,
    tendencia,
    historicoDias: historico,
    travado: row.travado,
  };
}

function produtosPrevistos(recompras: RecompraPrevista[]): ProdutoPrevisto[] {
  const map = new Map<string, ProdutoPrevisto>();
  for (const recompra of recompras) {
    const atual = map.get(recompra.racao) ?? {
      id: recompra.racao,
      nome: recompra.racao,
      categoria: "Racao",
      unidadesPrevistas: 0,
      semanas: [0, 0, 0, 0] as [number, number, number, number],
      taxaRecompra: 80,
      precoUnit: recompra.valorEstimado,
      custoUnit: recompra.valorEstimado * 0.65,
      estoqueAtual: 0,
      estoqueReservado: 0,
      diasParaRuptura: 30,
    };
    atual.unidadesPrevistas += 1;
    if (recompra.diasRestantes >= 0 && recompra.diasRestantes < 28) {
      atual.semanas[Math.min(3, Math.floor(recompra.diasRestantes / 7))] += 1;
    }
    map.set(recompra.racao, atual);
  }
  return Array.from(map.values()).sort((a, b) => b.unidadesPrevistas - a.unidadesPrevistas);
}

function demandaBairros(recompras: RecompraPrevista[]): DemandaBairro[] {
  const map = new Map<string, DemandaBairro>();
  for (const recompra of recompras) {
    const key = `${recompra.cidade}|${recompra.bairro}`;
    const atual = map.get(key) ?? {
      bairro: recompra.bairro,
      cidade: recompra.cidade,
      entregasPrevistas: 0,
      ticketMedio: 0,
      semanas: [0, 0, 0, 0] as [number, number, number, number],
    };
    atual.entregasPrevistas += 1;
    atual.ticketMedio += recompra.valorEstimado;
    if (recompra.diasRestantes >= 0 && recompra.diasRestantes < 28) {
      atual.semanas[Math.min(3, Math.floor(recompra.diasRestantes / 7))] += 1;
    }
    map.set(key, atual);
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    ticketMedio: row.entregasPrevistas ? row.ticketMedio / row.entregasPrevistas : 0,
  }));
}

export async function listarRecompraPrevista(): Promise<RecompraData> {
  const rows = await selectOptional<PrevisaoRow>(
    "/recompra_previsoes?select=*,clientes(id,nome,telefone,bairro,cidade,pets,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)&order=proxima_compra_em.asc",
  );
  const recompras = rows.map(mapPrevisao);
  return {
    recompras,
    produtos: produtosPrevistos(recompras),
    bairros: demandaBairros(recompras),
    alertas: recompras
      .filter((item) => item.status === "urgente" || item.status === "atrasado")
      .slice(0, 6)
      .map((item) => ({
        tipo: item.status,
        cliente: item.cliente,
        msg:
          item.status === "atrasado"
            ? `passou ${Math.abs(item.diasRestantes)}d da previsao de recompra`
            : `deve precisar recomprar em ${item.diasRestantes}d`,
      })),
  };
}

export async function marcarRecompraContato(id: string, contatado: boolean): Promise<void> {
  const response = await fetch(supabaseUrl(`/recompra_previsoes?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({ contatado, atualizado_em: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase recompra contato failed (${response.status})`);
}

export async function marcarRecompraTravada(id: string, travado: boolean): Promise<void> {
  const response = await fetch(supabaseUrl(`/recompra_previsoes?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({ travado, atualizado_em: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase recompra trava failed (${response.status})`);
}
