import type {
  DemandaBairro,
  ModeloRecompraRacao,
  PetDetalhe,
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
  pets_detalhes: PetDetalhe[] | null;
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
  detalhes_tecnicos?: {
    peso?: string;
    especie?: string;
    porte?: string;
    tipoProduto?: string;
  } | null;
};

type VendaItemComVendaRow = {
  id: string;
  venda_id: string;
  sku: string;
  nome: string;
  pet_nome: string | null;
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
    observacao?: string | null;
  } | null;
};

type PrevisaoRow = {
  id: string;
  cliente_id: string;
  venda_id: string | null;
  venda_item_id: string | null;
  sku: string | null;
  pet_nome: string;
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

type ModeloRacaoRow = {
  sku: string;
  produto_nome: string | null;
  dias_recompra: number | null;
  consumo_diario_g: number | null;
  ativo: boolean | null;
  atualizado_em: string | null;
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
  modelos: ModeloRecompraRacao[];
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
    if (
      error instanceof Error &&
      /PGRST205|PGRST200|pet_nome|relation .* does not exist/i.test(error.message)
    ) {
      return [];
    }
    throw error;
  }
}

async function writeRows<T>(path: string, body: unknown, prefer = "return=representation"): Promise<T[]> {
  const response = await fetch(supabaseUrl(path), {
    method: "POST",
    headers: supabaseHeaders(prefer),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase recompra write failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as T[];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isRacao(produto: Pick<ProdutoRow, "nome" | "categoria" | "detalhes_tecnicos">): boolean {
  const text = normalizeText(
    `${produto.nome} ${produto.categoria ?? ""} ${produto.detalhes_tecnicos?.tipoProduto ?? ""}`,
  );
  return /\bracao\b|\bracoes\b|premier|golden|formula natural|n&d|gran ?(plus|nature)|special dog|special cat|bino|bionatural|bob dog|catsy/.test(
    text,
  );
}

function inferirPesoKg(
  produto: Pick<ProdutoRow, "nome" | "detalhes_tecnicos">,
  quantidade = 1,
): number {
  const origem = `${produto.detalhes_tecnicos?.peso ?? ""} ${produto.nome}`;
  const kg = origem.match(/(\d+(?:[,.]\d+)?)\s*kg/i);
  if (kg) return Number(kg[1].replace(",", ".")) * quantidade;

  const g = origem.match(/(\d+(?:[,.]\d+)?)\s*g\b/i);
  if (g) return (Number(g[1].replace(",", ".")) / 1000) * quantidade;

  return 0;
}

const MARCAS_SO_GATO = ["catsy", "special cat"];
const MARCAS_SO_CACHORRO = ["special dog", "bob dog"];

function especiePadrao(
  produto?: ProdutoRow | null,
  cliente?: ClienteRow | null,
): "cachorro" | "gato" {
  const text = normalizeText(
    `${produto?.nome ?? ""} ${produto?.categoria ?? ""} ${produto?.detalhes_tecnicos?.especie ?? ""}`,
  );
  if (
    text.includes("gato") ||
    text.includes("felin") ||
    MARCAS_SO_GATO.some((marca) => text.includes(marca))
  )
    return "gato";
  if (
    text.includes("cao") ||
    text.includes("caes") ||
    text.includes("cachorro") ||
    MARCAS_SO_CACHORRO.some((marca) => text.includes(marca))
  )
    return "cachorro";
  return cliente?.especies?.[0] ?? "cachorro";
}

function portePadrao(
  produto?: ProdutoRow | null,
  observacoes?: string | null,
): "pequeno" | "medio" | "grande" {
  const text = normalizeText(
    `${produto?.nome ?? ""} ${produto?.detalhes_tecnicos?.porte ?? ""} ${observacoes ?? ""}`,
  );
  if (text.includes("pequeno") || text.includes("peq")) return "pequeno";
  if (text.includes("grande") || text.includes("large")) return "grande";
  return "medio";
}

function consumoPorPorte(porte: string): number {
  if (porte === "pequeno") return 70;
  if (porte === "grande") return 220;
  return 130;
}

function petsEstimados(
  cliente: ClienteRow | null | undefined,
  produto: ProdutoRow | null | undefined,
  petNome?: string | null,
) {
  const petBusca = petNome?.trim();
  if (petBusca) {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => pet.nome.trim().toLowerCase() === petBusca.toLowerCase(),
    );
    const especie = petDetalhe?.especie ?? especiePadrao(produto, cliente);
    const porte = petDetalhe?.porte ?? portePadrao(produto, cliente?.observacoes);

    return [
      {
        nome: petDetalhe?.nome || petBusca,
        especie,
        porte,
        consumoDiaG: consumoPorPorte(porte),
      },
    ];
  }

  const nomes = cliente?.pets?.length ? cliente.pets : ["Pet"];
  const especie = especiePadrao(produto, cliente);
  const porte = portePadrao(produto, cliente?.observacoes);

  return nomes.map((nome) => ({ nome, especie, porte, consumoDiaG: consumoPorPorte(porte) }));
}

function petsEstimadosPorNomes(
  cliente: ClienteRow | null | undefined,
  produto: ProdutoRow | null | undefined,
  petNomes: string[],
) {
  const nomes = Array.from(new Set(petNomes.map((nome) => nome.trim()).filter(Boolean)));
  if (nomes.length === 0) return petsEstimados(cliente, produto);

  return nomes.map((nome) => {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => pet.nome.trim().toLowerCase() === nome.toLowerCase(),
    );
    const especie = petDetalhe?.especie ?? especiePadrao(produto, cliente);
    const porte = petDetalhe?.porte ?? portePadrao(produto, cliente?.observacoes);

    return {
      nome: petDetalhe?.nome || nome,
      especie,
      porte,
      consumoDiaG: consumoPorPorte(porte),
    };
  });
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

function markerValue(line: string, key: string): string | null {
  const match = line.match(new RegExp(`${key}\\s*=\\s*(?:"([^"]+)"|([^\\s|;\\]]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? null;
}

function numberMarker(line: string, key: string, min: number, max: number): number | null {
  const value = markerValue(line, key);
  if (!value) return null;

  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number < min || number > max) return null;

  return number;
}

function observacaoRecompraAuto(
  observacao: string | null | undefined,
  sku: string,
): { dias?: number; consumoDiarioG?: number; pesoKg?: number } | null {
  if (!observacao?.trim()) return null;

  const linhas = observacao
    .split("|")
    .map((line) => line.trim())
    .filter((line) => /recompra_auto/i.test(line));
  const linha =
    linhas.find((line) => markerValue(line, "sku") === sku) ??
    (linhas.length === 1 ? linhas[0] : null);
  if (!linha) return null;

  const dias = numberMarker(linha, "dias", 3, 180);
  const consumoDiarioG = numberMarker(linha, "consumo_diario_g", 20, 3000);
  const pesoKg = numberMarker(linha, "peso_kg", 0.01, 200);

  if (!dias && !consumoDiarioG && !pesoKg) return null;

  return {
    ...(dias ? { dias: Math.round(dias) } : {}),
    ...(consumoDiarioG ? { consumoDiarioG } : {}),
    ...(pesoKg ? { pesoKg } : {}),
  };
}

function modeloToApi(row: ModeloRacaoRow): ModeloRecompraRacao {
  return {
    sku: row.sku,
    produtoNome: row.produto_nome ?? row.sku,
    diasRecompra: Math.max(1, Math.round(Number(row.dias_recompra ?? 30))),
    consumoDiarioG: row.consumo_diario_g ? Number(row.consumo_diario_g) : undefined,
    ativo: row.ativo !== false,
    atualizadoEm: row.atualizado_em ?? undefined,
  };
}

export async function listarModelosRecompraRacao(): Promise<ModeloRecompraRacao[]> {
  const rows = await selectOptional<ModeloRacaoRow>(
    "/recompra_racao_modelos?select=sku,produto_nome,dias_recompra,consumo_diario_g,ativo,atualizado_em&order=produto_nome.asc",
  );
  return rows.map(modeloToApi);
}

export async function salvarModeloRecompraRacao(input: {
  sku: string;
  produtoNome?: string;
  diasRecompra: number;
  consumoDiarioG?: number;
  ativo?: boolean;
}): Promise<ModeloRecompraRacao> {
  const sku = input.sku.trim().toUpperCase();
  const diasRecompra = Math.max(1, Math.min(365, Math.round(input.diasRecompra)));
  if (!sku) throw new Error("SKU obrigatorio");

  const rows = await writeRows<ModeloRacaoRow>(
    "/recompra_racao_modelos?on_conflict=sku",
    {
      sku,
      produto_nome: input.produtoNome?.trim() || sku,
      dias_recompra: diasRecompra,
      consumo_diario_g: input.consumoDiarioG ?? null,
      ativo: input.ativo !== false,
      atualizado_em: new Date().toISOString(),
    },
    "resolution=merge-duplicates,return=representation",
  );

  if (!rows[0]) throw new Error("Modelo de recompra nao retornado");
  return modeloToApi(rows[0]);
}

async function listarClientesPorId(ids: string[]): Promise<Map<string, ClienteRow>> {
  if (ids.length === 0) return new Map();
  const params = new URLSearchParams({
    id: `in.(${ids.map((id) => `"${id}"`).join(",")})`,
    select: "id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes",
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

async function comprasRacaoClienteSku(
  clienteId: string,
  sku: string,
  petNome?: string | null,
): Promise<VendaItemComVendaRow[]> {
  const params = new URLSearchParams({
    sku: `eq.${sku}`,
    select:
      "id,venda_id,sku,nome,pet_nome,quantidade,preco,preco_compra,vendas!inner(id,cliente_id,cliente_nome,telefone,criado_em,status,observacao)",
    order: "criado_em.desc",
  });
  const rows = await selectRows<VendaItemComVendaRow>(`/venda_itens?${params}`);
  const petBusca = petNome?.trim().toLowerCase();

  return rows
    .filter((row) => {
      if (row.vendas?.cliente_id !== clienteId || row.vendas.status === "cancelada") return false;
      if (!petBusca) return true;

      return row.pet_nome?.trim().toLowerCase() === petBusca;
    })
    .sort(
      (a, b) =>
        new Date(b.vendas?.criado_em ?? 0).getTime() - new Date(a.vendas?.criado_em ?? 0).getTime(),
    );
}

export async function recalcularRecompraVenda(vendaId: string): Promise<void> {
  const params = new URLSearchParams({
    venda_id: `eq.${vendaId}`,
    select:
      "id,venda_id,sku,nome,pet_nome,quantidade,preco,preco_compra,vendas(id,cliente_id,cliente_nome,telefone,criado_em,status,observacao)",
  });
  const itens = await selectOptional<VendaItemComVendaRow>(`/venda_itens?${params}`);
  const clienteIds = Array.from(
    new Set(itens.map((item) => item.vendas?.cliente_id).filter(Boolean)),
  ) as string[];
  const skus = Array.from(new Set(itens.map((item) => item.sku).filter(Boolean)));
  const [clientes, produtos] = await Promise.all([
    listarClientesPorId(clienteIds),
    listarProdutosPorSku(skus),
  ]);

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
    const compras = await comprasRacaoClienteSku(clienteId, item.sku, item.pet_nome);
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
    const observacaoAuto = observacaoRecompraAuto(item.vendas?.observacao, item.sku);
    const pesoKg = observacaoAuto?.pesoKg ?? inferirPesoKg(produto, item.quantidade);
    const pets = petsEstimados(cliente, produto, item.pet_nome);
    const consumoDiario =
      observacaoAuto?.consumoDiarioG ??
      (pets.reduce((sum, pet) => sum + pet.consumoDiaG, 0) || DEFAULT_CONSUMO_G_DIA);
    const diasEstimados =
      mediaReal ??
      observacaoAuto?.dias ??
      (pesoKg > 0 ? Math.max(1, Math.round((pesoKg * 1000) / consumoDiario)) : 30);
    const ultimaCompra = dateOnly(item.vendas?.criado_em ?? new Date());
    const proximaCompra = addDays(ultimaCompra, diasEstimados);
    const dataAlerta = addDays(proximaCompra, -ALERTA_DIAS_ANTES);
    const diasRestantes = signedDiffDaysFromToday(proximaCompra);

    const petNome = item.pet_nome?.trim() ?? "";
    const payload = {
      cliente_id: clienteId,
      venda_id: item.venda_id,
      venda_item_id: item.id,
      sku: item.sku,
      pet_nome: petNome,
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
    };

    let response = await fetch(
      supabaseUrl("/recompra_previsoes?on_conflict=cliente_id,sku,pet_nome"),
      {
        method: "POST",
        headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (/pet_nome/i.test(errorBody)) {
        const payloadSemPetNome: Record<string, unknown> = { ...payload };
        delete payloadSemPetNome.pet_nome;
        response = await fetch(supabaseUrl("/recompra_previsoes?on_conflict=cliente_id,sku"), {
          method: "POST",
          headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
          body: JSON.stringify(payloadSemPetNome),
        });

        if (response.ok) continue;

        const retryErrorBody = await response.text();
        if (/PGRST205|relation .* does not exist/i.test(retryErrorBody)) return;
        throw new Error(`Supabase recompra upsert failed (${response.status}): ${retryErrorBody}`);
      }

      if (/PGRST205|relation .* does not exist/i.test(errorBody)) return;
      throw new Error(`Supabase recompra upsert failed (${response.status}): ${errorBody}`);
    }
  }
}

export async function registrarRecompraManual(input: {
  clienteId: string;
  sku: string;
  petNome: string;
  petNomes?: string[];
  modoDistribuicao?: "compartilhada" | "por_pet";
  compraEm: string;
  diasRecompra: number;
  quantidade?: number;
  pesoKg?: number;
  consumoDiarioG?: number;
  produtoNome?: string;
}): Promise<RecompraPrevista | RecompraPrevista[]> {
  const clienteId = input.clienteId.trim();
  const sku = input.sku.trim().toUpperCase();
  const petNomes = Array.from(
    new Set([...(input.petNomes ?? []), input.petNome].map((pet) => pet.trim()).filter(Boolean)),
  );
  const compraEm = dateOnly(input.compraEm);
  const diasEstimados = Math.max(1, Math.min(365, Math.round(input.diasRecompra)));
  if (!clienteId || !sku || petNomes.length === 0) {
    throw new Error("Cliente, racao e pet sao obrigatorios");
  }

  const [clientes, produtos, modelos] = await Promise.all([
    listarClientesPorId([clienteId]),
    listarProdutosPorSku([sku]),
    listarModelosRecompraRacao(),
  ]);
  const cliente = clientes.get(clienteId) ?? null;
  const produto = produtos.get(sku) ?? null;
  const modelo = modelos.find((item) => item.sku === sku);
  const quantidade = input.quantidade ?? 1;
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error("Quantidade deve ser maior que zero");
  }
  const grupos =
    input.modoDistribuicao === "por_pet"
      ? petNomes.map((petNome) => ({ petNomes: [petNome], quantidade }))
      : [{ petNomes, quantidade }];

  async function registrarGrupo(grupo: { petNomes: string[]; quantidade: number }) {
    const pets = petsEstimadosPorNomes(cliente, produto, grupo.petNomes);
    const petNome = pets.map((pet) => pet.nome).join(", ");
    const consumoDiario =
      input.consumoDiarioG ??
      modelo?.consumoDiarioG ??
      (pets.reduce((sum, pet) => sum + pet.consumoDiaG, 0) || DEFAULT_CONSUMO_G_DIA);
    const pesoKg = input.pesoKg ?? (produto ? inferirPesoKg(produto, grupo.quantidade) : 0);
    const proximaCompra = addDays(compraEm, diasEstimados);
    const dataAlerta = addDays(proximaCompra, -ALERTA_DIAS_ANTES);
    const dias = signedDiffDaysFromToday(proximaCompra);

    const rows = await writeRows<PrevisaoRow>(
      "/recompra_previsoes?on_conflict=cliente_id,sku,pet_nome&select=*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)",
      {
        cliente_id: clienteId,
        venda_id: null,
        venda_item_id: null,
        sku,
        pet_nome: petNome,
        produto_nome: input.produtoNome?.trim() || produto?.nome || sku,
        categoria: produto?.categoria ?? "Racao",
        peso_kg: pesoKg,
        quantidade: grupo.quantidade,
        pets,
        consumo_diario_g: consumoDiario,
        dias_estimados: diasEstimados,
        media_dias_real: null,
        historico_dias: [],
        ultima_compra_em: compraEm,
        proxima_compra_em: proximaCompra,
        data_alerta: dataAlerta,
        status: statusFromDias(dias),
        fonte: "manual",
        contatado: false,
        atualizado_em: new Date().toISOString(),
      },
      "resolution=merge-duplicates,return=representation",
    );

    if (!rows[0]) throw new Error("Previsao manual nao retornada");
    return mapPrevisao(rows[0]);
  }

  const recompras: RecompraPrevista[] = [];
  for (const grupo of grupos) {
    recompras.push(await registrarGrupo(grupo));
  }

  return recompras.length === 1 ? recompras[0] : recompras;
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

type DadosObservadosRow = {
  dados: Record<string, unknown> | null;
  observado_em: string;
};

/**
 * Reconstroi os fatos ja conhecidos sobre o cliente a partir do historico de
 * `cliente_dados_observados` (especie, porte, racao, restricoes etc.), mesclando
 * as ultimas observacoes — a mais recente vence quando o mesmo campo aparece em
 * mais de uma. Usado para alimentar o contexto da IA do WhatsApp e evitar que
 * ela repita perguntas que o cliente ja respondeu em mensagens fora da janela
 * de historico recente.
 */
export async function buscarFatosObservadosCliente(opts: {
  clienteId?: string | null;
  telefone?: string | null;
}): Promise<Record<string, unknown> | null> {
  const clienteId = opts.clienteId?.trim();
  const telefone = opts.telefone?.replace(/\D/g, "");
  if (!clienteId && !telefone) return null;

  const params = new URLSearchParams({
    select: "dados,observado_em",
    order: "observado_em.desc",
    limit: "8",
  });
  params.set(clienteId ? "cliente_id" : "telefone", `eq.${clienteId ?? telefone}`);

  const rows = await selectOptional<DadosObservadosRow>(`/cliente_dados_observados?${params}`);
  if (rows.length === 0) return null;

  const fatos: Record<string, unknown> = {};
  for (const row of [...rows].reverse()) {
    for (const [chave, valor] of Object.entries(row.dados ?? {})) {
      if (chave === "mensagemAtual" || valor === undefined || valor === null || valor === "") {
        continue;
      }
      fatos[chave] = valor;
    }
  }

  return Object.keys(fatos).length > 0 ? fatos : null;
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
    if (/PGRST205|relation .* does not exist/i.test(errorBody)) return;
    throw new Error(`Supabase dados observados insert failed (${response.status}): ${errorBody}`);
  }
}

function formatDateBr(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
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
    pet:
      row.pets
        ?.map((item) => item.nome)
        .filter(Boolean)
        .join(", ") || "Pet",
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
      historico.length < 2
        ? "pontual"
        : Math.abs(historico[0] - historico[1]) > 10
          ? "instavel"
          : tendencia === "acelerando"
            ? "antecipado"
            : tendencia === "desacelerando"
              ? "atrasado"
              : "pontual",
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
  const [rows, modelos] = await Promise.all([
    selectOptional<PrevisaoRow>(
      "/recompra_previsoes?select=*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)&order=proxima_compra_em.asc",
    ),
    listarModelosRecompraRacao(),
  ]);
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
    modelos,
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
