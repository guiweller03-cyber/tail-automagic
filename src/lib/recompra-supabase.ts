import type {
  DemandaBairro,
  ModeloRecompraRacao,
  OrigemCicloRecompra,
  PetDetalhe,
  ProdutoPrevisto,
  RecompraPrevista,
  RecompraStatus,
} from "@/lib/crm-types";
import {
  calcularDiasRecompraRacao,
  cicloEfetivoRecompra,
  classificarLinhaRacao,
  normalizarCicloManual,
  consumoDiarioPetRacao,
  ehRacaoParaRecompra,
  inferirPesoRacaoKg,
  normalizarTextoRecompra,
} from "@/lib/recompra-calculo";
import { requireSupabaseServerKey } from "@/lib/server-env";

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
    linha?: string;
    idade?: string;
    marca?: string;
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
    faturado_em?: string | null;
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
  pets: Array<{
    nome: string;
    especie: "cachorro" | "gato";
    porte: string;
    raca?: string;
    pesoKg?: number;
    pesoInformado?: boolean;
    pesoOrigem?: string;
    consumoDiaG?: number;
    linha?: string;
    fase?: string;
  }> | null;
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
  fonte?: string | null;
  dias_calculados?: number | null;
  dias_manual?: number | null;
  clientes: ClienteRow | null;
  produtos: ProdutoRow | null;
};

type PetEstimado = {
  nome: string;
  especie: "cachorro" | "gato";
  porte: string;
  raca?: string;
  pesoKg?: number;
  pesoInformado?: boolean;
  pesoOrigem?: string;
  consumoDiaG: number;
  linha?: string;
  fase?: string;
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

const DEFAULT_CONSUMO_G_DIA = 120;
const ALERTA_DIAS_ANTES_POR_PORTE: Record<string, number> = {
  toy: 3,
  pequeno: 3,
  medio: 5,
  grande: 5,
  gigante: 5,
  gato: 3,
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
  const key = requireSupabaseServerKey();
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
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

async function writeRows<T>(
  path: string,
  body: unknown,
  prefer = "return=representation",
): Promise<T[]> {
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

type PrevisaoSubstituivelRow = Pick<PrevisaoRow, "id" | "sku" | "pet_nome" | "venda_id">;

function isMissingPetNomeColumn(errorBody: string): boolean {
  return /pet_nome|PGRST204/i.test(errorBody);
}

function normalizeText(value: string): string {
  return normalizarTextoRecompra(value);
}

function isRacao(produto: Pick<ProdutoRow, "nome" | "categoria" | "detalhes_tecnicos">): boolean {
  return ehRacaoParaRecompra(produto);
}

function inferirPesoKg(
  produto: Pick<ProdutoRow, "nome" | "detalhes_tecnicos">,
  quantidade = 1,
): number {
  return inferirPesoRacaoKg(produto, quantidade);
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

function petsEstimados(
  cliente: ClienteRow | null | undefined,
  produto: ProdutoRow | null | undefined,
  petNome?: string | null,
): PetEstimado[] {
  const especieDefault = especiePadrao(produto, cliente);
  const porteDefault = portePadrao(produto, cliente?.observacoes);

  const petNomes = Array.from(
    new Set(
      (petNome ?? "")
        .split(",")
        .map((nome) => nome.trim())
        .filter(Boolean),
    ),
  );
  if (petNomes.length > 1) return petsEstimadosPorNomes(cliente, produto, petNomes);

  const petBusca = petNomes[0] ?? petNome?.trim();
  if (petBusca) {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => pet.nome.trim().toLowerCase() === petBusca.toLowerCase(),
    );
    const consumo = consumoDiarioPetRacao({
      produto,
      pet: {
        nome: petDetalhe?.nome || petBusca,
        especie: petDetalhe?.especie,
        raca: petDetalhe?.raca,
        porte: petDetalhe?.porte,
        pesoKg: petDetalhe?.pesoKg,
        pesoKgMedidoEm: petDetalhe?.pesoKgMedidoEm,
        nascimento: petDetalhe?.nascimento,
        dataNascimentoEstimada: petDetalhe?.dataNascimentoEstimada,
        idadeAdultaConfirmada: petDetalhe?.idadeAdultaConfirmada,
        racaSlug: petDetalhe?.racaSlug,
      },
      especiePadrao: especieDefault,
      portePadrao: porteDefault,
    });

    return [
      {
        nome: consumo.nome,
        especie: consumo.especie,
        porte: consumo.porte,
        raca: consumo.raca,
        pesoKg: consumo.pesoKg,
        pesoInformado: consumo.pesoInformado,
        pesoOrigem: consumo.pesoOrigem,
        consumoDiaG: consumo.consumoDiaG,
        linha: consumo.linha,
        fase: consumo.fase,
      },
    ];
  }

  const detalhes = cliente?.pets_detalhes?.length
    ? cliente.pets_detalhes.filter((pet) => pet.nome?.trim())
    : null;
  const pets =
    detalhes ??
    (cliente?.pets?.length ? cliente.pets.map((nome) => ({ nome })) : [{ nome: "Pet" }]);

  return pets.map((pet) => {
    const consumo = consumoDiarioPetRacao({
      produto,
      pet,
      especiePadrao: especieDefault,
      portePadrao: porteDefault,
    });

    return {
      nome: consumo.nome,
      especie: consumo.especie,
      porte: consumo.porte,
      raca: consumo.raca,
      pesoKg: consumo.pesoKg,
      pesoInformado: consumo.pesoInformado,
      pesoOrigem: consumo.pesoOrigem,
      consumoDiaG: consumo.consumoDiaG,
      linha: consumo.linha,
      fase: consumo.fase,
    };
  });
}

function petsEstimadosPorNomes(
  cliente: ClienteRow | null | undefined,
  produto: ProdutoRow | null | undefined,
  petNomes: string[],
  petsDetalhes?: PetDetalhe[],
): PetEstimado[] {
  const nomes = Array.from(new Set(petNomes.map((nome) => nome.trim()).filter(Boolean)));
  if (nomes.length === 0) return petsEstimados(cliente, produto);
  const especieDefault = especiePadrao(produto, cliente);
  const porteDefault = portePadrao(produto, cliente?.observacoes);

  return nomes.map((nome) => {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => pet.nome.trim().toLowerCase() === nome.toLowerCase(),
    );
    const detalheManual = petsDetalhes?.find(
      (pet) => pet.nome.trim().toLowerCase() === nome.toLowerCase(),
    );
    const consumo = consumoDiarioPetRacao({
      produto,
      pet: {
        nome: detalheManual?.nome || petDetalhe?.nome || nome,
        especie: detalheManual?.especie ?? petDetalhe?.especie,
        raca: detalheManual?.raca ?? petDetalhe?.raca,
        porte: detalheManual?.porte ?? petDetalhe?.porte,
        pesoKg: detalheManual?.pesoKg ?? petDetalhe?.pesoKg,
        pesoKgMedidoEm: detalheManual?.pesoKgMedidoEm ?? petDetalhe?.pesoKgMedidoEm,
        nascimento: detalheManual?.nascimento ?? petDetalhe?.nascimento,
        dataNascimentoEstimada:
          detalheManual?.dataNascimentoEstimada ?? petDetalhe?.dataNascimentoEstimada,
        idadeAdultaConfirmada:
          detalheManual?.idadeAdultaConfirmada ?? petDetalhe?.idadeAdultaConfirmada,
        racaSlug: detalheManual?.racaSlug ?? petDetalhe?.racaSlug,
      },
      especiePadrao: especieDefault,
      portePadrao: porteDefault,
    });

    return {
      nome: consumo.nome,
      especie: consumo.especie,
      porte: consumo.porte,
      raca: consumo.raca,
      pesoKg: consumo.pesoKg,
      pesoInformado: consumo.pesoInformado,
      pesoOrigem: consumo.pesoOrigem,
      consumoDiaG: consumo.consumoDiaG,
      linha: consumo.linha,
      fase: consumo.fase,
    };
  });
}

function dateOnly(input: string | Date): string {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const date = typeof input === "string" ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
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

function diasAntecedenciaAviso(pets: Array<{ porte?: string }> | null | undefined): number {
  const portes = pets?.map((pet) => pet.porte).filter(Boolean) ?? [];
  if (portes.length === 0) return 5;
  return Math.max(...portes.map((porte) => ALERTA_DIAS_ANTES_POR_PORTE[porte ?? ""] ?? 5));
}

function signedDiffDaysFromToday(dateString: string): number {
  const today = dateOnly(new Date());
  const start = new Date(`${today}T00:00:00.000Z`).getTime();
  const end = new Date(`${dateString}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function media(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function petTokens(value: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );
}

function previsaoPertenceAosPetsDaVenda(previsaoPetNome: string | null, vendaPetNome: string) {
  const petsVenda = petTokens(vendaPetNome);
  const petsPrevisao = petTokens(previsaoPetNome);

  if (petsVenda.length === 0 || petsPrevisao.length === 0) return true;
  return petsPrevisao.some((pet) => petsVenda.includes(pet));
}

async function removerRecomprasSubstituidasPorNovaRacao({
  clienteId,
  sku,
  petNome,
  vendaIdAtual,
}: {
  clienteId: string;
  sku: string;
  petNome: string;
  vendaIdAtual?: string | null;
}): Promise<void> {
  const params = new URLSearchParams({
    cliente_id: `eq.${clienteId}`,
    select: "id,sku,pet_nome,venda_id",
  });
  const rows = await selectOptional<PrevisaoSubstituivelRow>(`/recompra_previsoes?${params}`);
  const ids = rows
    .filter(
      (row) =>
        row.venda_id !== vendaIdAtual &&
        (row.sku === sku || previsaoPertenceAosPetsDaVenda(row.pet_nome, petNome)),
    )
    .map((row) => row.id);

  if (ids.length === 0) return;

  const deleteParams = new URLSearchParams({
    id: `in.(${ids.join(",")})`,
  });
  const response = await fetch(supabaseUrl(`/recompra_previsoes?${deleteParams}`), {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (/PGRST205|relation .* does not exist/i.test(errorBody)) return;
    throw new Error(
      `Supabase recompra substituida delete failed (${response.status}): ${errorBody}`,
    );
  }
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

function dataCompraVenda(venda: VendaItemComVendaRow["vendas"]): string {
  return dateOnly(venda?.faturado_em || venda?.criado_em || new Date());
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
      "id,venda_id,sku,nome,pet_nome,quantidade,preco,preco_compra,vendas!inner(id,cliente_id,cliente_nome,telefone,criado_em,faturado_em,status,observacao)",
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
    .sort((a, b) => dataCompraVenda(b.vendas).localeCompare(dataCompraVenda(a.vendas)));
}

/**
 * O ajuste manual do ciclo vale para a compra em que foi feito: sobrevive ao
 * "Recalcular" e ao reprocessamento da mesma venda, mas uma compra nova volta
 * ao calculo automatico.
 */
async function cicloManualDaVenda(
  clienteId: string,
  sku: string,
  petNome: string,
  vendaId: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    cliente_id: `eq.${clienteId}`,
    sku: `eq.${sku}`,
    pet_nome: `eq.${petNome}`,
    select: "*",
    limit: "1",
  });
  const [row] = await selectOptional<Pick<PrevisaoRow, "venda_id" | "dias_manual">>(
    `/recompra_previsoes?${params}`,
  );
  if (!row || row.venda_id !== vendaId) return null;
  return row.dias_manual ?? null;
}

export async function recalcularRecompraVenda(vendaId: string): Promise<void> {
  const params = new URLSearchParams({
    venda_id: `eq.${vendaId}`,
    select:
      "id,venda_id,sku,nome,pet_nome,quantidade,preco,preco_compra,vendas(id,cliente_id,cliente_nome,telefone,criado_em,faturado_em,status,observacao)",
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
    const compraMaisRecente = compras[0];
    if (
      compraMaisRecente?.id &&
      compraMaisRecente.id !== item.id &&
      dataCompraVenda(compraMaisRecente.vendas) >= dataCompraVenda(item.vendas)
    ) {
      continue;
    }

    const historicoDias = compras
      .slice(0, 4)
      .flatMap((compra, index, arr) => {
        const proxima = arr[index + 1];
        if (!proxima?.vendas || !compra.vendas) return [];
        return [diffDays(dataCompraVenda(proxima.vendas), dataCompraVenda(compra.vendas))];
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
    const petNome = item.pet_nome?.trim() ?? "";
    const diasCalculados =
      mediaReal ?? observacaoAuto?.dias ?? calcularDiasRecompraRacao(pesoKg, consumoDiario);
    const diasManual = await cicloManualDaVenda(clienteId, item.sku, petNome, item.venda_id);
    const diasEstimados = cicloEfetivoRecompra(diasCalculados, diasManual);
    const ultimaCompra = dataCompraVenda(item.vendas);
    const proximaCompra = addDays(ultimaCompra, diasEstimados);
    const dataAlerta = addDays(proximaCompra, -diasAntecedenciaAviso(pets));
    const diasRestantes = signedDiffDaysFromToday(proximaCompra);

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
      dias_calculados: diasCalculados,
      media_dias_real: mediaReal,
      historico_dias: historicoDias,
      ultima_compra_em: ultimaCompra,
      proxima_compra_em: proximaCompra,
      data_alerta: dataAlerta,
      status: statusFromDias(diasRestantes),
      fonte: mediaReal ? "historico" : observacaoAuto?.dias ? "observacao" : "estimativa",
      contatado: false,
      atualizado_em: new Date().toISOString(),
    };

    await removerRecomprasSubstituidasPorNovaRacao({
      clienteId,
      sku: item.sku,
      petNome,
      vendaIdAtual: item.venda_id,
    });

    let response = await fetch(
      supabaseUrl("/recompra_previsoes?on_conflict=cliente_id,sku,pet_nome"),
      {
        method: "POST",
        headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      let errorBody = await response.text();
      if (/dias_calculados/.test(errorBody)) {
        // Migration 20260914180000 ainda nao aplicada: grava sem a coluna nova.
        const payloadLegado: Record<string, unknown> = { ...payload };
        delete payloadLegado.dias_calculados;
        response = await fetch(
          supabaseUrl("/recompra_previsoes?on_conflict=cliente_id,sku,pet_nome"),
          {
            method: "POST",
            headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
            body: JSON.stringify(payloadLegado),
          },
        );
        if (response.ok) continue;
        errorBody = await response.text();
      }
      if (isMissingPetNomeColumn(errorBody)) {
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
  petsDetalhes?: PetDetalhe[];
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
  const diasRecompraInformado =
    Number.isFinite(input.diasRecompra) && input.diasRecompra > 0
      ? Math.max(1, Math.min(365, Math.round(input.diasRecompra)))
      : null;
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
    const pets = petsEstimadosPorNomes(cliente, produto, grupo.petNomes, input.petsDetalhes);
    const petNome = pets.map((pet) => pet.nome).join(", ");
    const consumoDiario =
      input.consumoDiarioG ??
      modelo?.consumoDiarioG ??
      (pets.reduce((sum, pet) => sum + pet.consumoDiaG, 0) || DEFAULT_CONSUMO_G_DIA);
    const pesoKg = input.pesoKg ?? (produto ? inferirPesoKg(produto, grupo.quantidade) : 0);
    const diasEstimados =
      diasRecompraInformado ??
      modelo?.diasRecompra ??
      calcularDiasRecompraRacao(pesoKg, consumoDiario);
    const proximaCompra = addDays(compraEm, diasEstimados);
    const dataAlerta = addDays(proximaCompra, -diasAntecedenciaAviso(pets));
    const dias = signedDiffDaysFromToday(proximaCompra);

    const payload = {
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
      dias_calculados: diasEstimados,
      media_dias_real: null,
      historico_dias: [],
      ultima_compra_em: compraEm,
      proxima_compra_em: proximaCompra,
      data_alerta: dataAlerta,
      status: statusFromDias(dias),
      fonte: "manual",
      contatado: false,
      atualizado_em: new Date().toISOString(),
    };

    await removerRecomprasSubstituidasPorNovaRacao({
      clienteId,
      sku,
      petNome,
    });

    let rows: PrevisaoRow[];
    try {
      rows = await writeRows<PrevisaoRow>(
        "/recompra_previsoes?on_conflict=cliente_id,sku,pet_nome&select=*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)",
        payload,
        "resolution=merge-duplicates,return=representation",
      );
    } catch (error) {
      if (!(error instanceof Error) || !isMissingPetNomeColumn(error.message)) {
        throw error;
      }

      const payloadSemPetNome: Record<string, unknown> = { ...payload };
      delete payloadSemPetNome.pet_nome;
      rows = await writeRows<PrevisaoRow>(
        "/recompra_previsoes?on_conflict=cliente_id,sku&select=*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)",
        payloadSemPetNome,
        "resolution=merge-duplicates,return=representation",
      );
    }

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

function origemCicloDaLinha(row: PrevisaoRow): OrigemCicloRecompra {
  if (row.fonte === "historico") return "historico";
  if (row.fonte === "observacao") return "observacao";
  if (row.fonte === "manual") return "cadastro_manual";
  return "consumo";
}

function mapPrevisao(row: PrevisaoRow): RecompraPrevista {
  const cliente = row.clientes;
  const produto = row.produtos;
  const dias = diasRestantes(row.proxima_compra_em);
  const historico = row.historico_dias ?? [];
  const pet = row.pets?.[0];
  const quantidade = Math.max(1, Number(row.quantidade ?? 1));
  const especie = pet?.especie ?? especiePadrao(produto, cliente);
  const mediaRecompra = Math.round(row.media_dias_real ?? row.dias_estimados);
  const previsaoBase = Math.max(1, Math.round(row.dias_estimados));
  const linhaCalculo = classificarLinhaRacao(produto);
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
    sku: row.sku ?? "",
    racao: row.produto_nome,
    quantidade,
    pesoKg: Number(row.peso_kg ?? 0),
    consumoDiaKg: Number(row.consumo_diario_g ?? 0) / 1000,
    ultimaCompra: formatDateBr(row.ultima_compra_em),
    ultimaCompraIso: row.ultima_compra_em,
    diasRestantes: dias,
    dataPrevista: formatDateBr(row.proxima_compra_em),
    dataPrevistaIso: row.proxima_compra_em,
    valorEstimado: (produto?.preco ?? 0) * quantidade,
    fonteCalculo: linhaCalculo === "generica" ? "estimativa" : "tabela",
    petsCalculo: (row.pets ?? []).map((item) => ({
      nome: item.nome,
      especie: item.especie,
      porte: item.porte,
      raca: item.raca,
      pesoKg: item.pesoKg,
      pesoInformado: item.pesoInformado,
      pesoOrigem: item.pesoOrigem as
        | "informado"
        | "medido"
        | "crescimento"
        | "raca"
        | "porte"
        | undefined,
      consumoDiaG: item.consumoDiaG,
      linha:
        item.linha === "fresh_meat" || item.linha === "pro_life" || item.linha === "generica"
          ? item.linha
          : linhaCalculo,
      fase:
        item.fase === "filhote" ||
        item.fase === "adulto" ||
        item.fase === "senior" ||
        item.fase === "castrado"
          ? item.fase
          : undefined,
    })),
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
    cicloCalculado: Math.max(1, Math.round(Number(row.dias_calculados ?? row.dias_estimados))),
    cicloManual: row.dias_manual ?? null,
    origemCiclo: origemCicloDaLinha(row),
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
      precoUnit: recompra.valorEstimado / Math.max(1, recompra.quantidade),
      custoUnit: (recompra.valorEstimado / Math.max(1, recompra.quantidade)) * 0.65,
      estoqueAtual: 0,
      estoqueReservado: 0,
      diasParaRuptura: 30,
    };
    atual.unidadesPrevistas += recompra.quantidade;
    if (recompra.diasRestantes >= 0 && recompra.diasRestantes < 28) {
      atual.semanas[Math.min(3, Math.floor(recompra.diasRestantes / 7))] += recompra.quantidade;
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
  const recompras = rows.filter((row) => !row.produtos || isRacao(row.produtos)).map(mapPrevisao);
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

/**
 * Grava (ou remove, com `dias` vazio/null) o ciclo informado pelo operador e
 * recalcula as datas da previsao a partir da ultima compra.
 */
export async function definirCicloManualRecompra(
  id: string,
  dias: unknown,
): Promise<RecompraPrevista> {
  const diasManual = normalizarCicloManual(dias);
  const [atual] = await selectRows<PrevisaoRow>(
    `/recompra_previsoes?id=eq.${encodeURIComponent(id)}&select=*`,
  );
  if (!atual) throw new Error("Previsão de recompra não encontrada");

  // Linhas antigas nao tem dias_calculados; nelas dias_estimados ainda e o automatico.
  const diasCalculados = Math.max(
    1,
    Math.round(Number(atual.dias_calculados ?? atual.dias_estimados)),
  );
  const diasEstimados = cicloEfetivoRecompra(diasCalculados, diasManual);
  const proximaCompra = addDays(atual.ultima_compra_em, diasEstimados);
  const select =
    "*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)";

  const response = await fetch(
    supabaseUrl(`/recompra_previsoes?id=eq.${encodeURIComponent(id)}&select=${select}`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        dias_calculados: diasCalculados,
        dias_manual: diasManual,
        dias_manual_em: diasManual ? new Date().toISOString() : null,
        dias_estimados: diasEstimados,
        proxima_compra_em: proximaCompra,
        data_alerta: addDays(proximaCompra, -diasAntecedenciaAviso(atual.pets)),
        status: statusFromDias(signedDiffDaysFromToday(proximaCompra)),
        atualizado_em: new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (/dias_manual|dias_calculados/.test(errorBody)) {
      throw new Error(
        "Aplique a migration 20260914180000_recompra_ciclo_manual.sql antes de ajustar o ciclo",
      );
    }
    throw new Error(`Supabase recompra ciclo manual failed (${response.status}): ${errorBody}`);
  }

  const [row] = (await response.json()) as PrevisaoRow[];
  if (!row) throw new Error("Previsão de recompra não encontrada");
  return mapPrevisao(row);
}
