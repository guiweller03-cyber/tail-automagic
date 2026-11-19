import { configuracaoLoja } from "./loja-context";
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
  type CompraHistoricoRecompra,
  cicloEfetivoRecompra,
  classificarLinhaRacao,
  dataBaseRecompra,
  normalizarCicloManual,
  consumoDiarioPetRacao,
  ehRacaoParaRecompra,
  inferirPesoRacaoKg,
  normalizarDataCompraRecompra,
  normalizarTextoRecompra,
  portePadraoProdutoRecompra,
  preverRecompra,
  diasEntreCompras,
  type MemoriaCalculoRecompra,
} from "@/lib/recompra-calculo";
import {
  calcularDuracoesHistorico,
  compararCicloComHistorico,
  type ComparacaoCicloHistorico,
  type HistoricoVendaRecompra,
} from "@/lib/historico-recompra";
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
  manual?: CompraManualRow;
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
  calculo?: MemoriaCalculoRecompra | null;
  atualizado_em: string;
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

type CompraManualRow = {
  id: string;
  cliente_id: string;
  sku: string;
  produto_nome: string;
  pet_nome: string;
  especie: "cachorro" | "gato";
  comprado_em: string;
  quantidade: number;
  peso_kg: number;
  consumo_diario_g: number | null;
  dias_manual: number | null;
  pets_detalhes: PetDetalhe[];
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

const ALERTA_DIAS_ANTES_POR_PORTE: Record<string, number> = {
  toy: 3,
  pequeno: 3,
  medio: 5,
  grande: 5,
  gigante: 5,
  gato: 3,
};

function requireEnv(name: string): string {
  const value = configuracaoLoja(name);
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
    /\b(cao|caes|cachorros?)\b/.test(text) ||
    MARCAS_SO_CACHORRO.some((marca) => text.includes(marca))
  )
    return "cachorro";
  return cliente?.especies?.[0] ?? "cachorro";
}

function portePadrao(
  produto?: ProdutoRow | null,
  observacoes?: string | null,
): "pequeno" | "medio" | "grande" {
  return portePadraoProdutoRecompra(produto, observacoes);
}

function petsEstimados(
  cliente: ClienteRow | null | undefined,
  produto: ProdutoRow | null | undefined,
  petNome?: string | null,
  dataCalculo?: string,
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
  if (petNomes.length > 1)
    return petsEstimadosPorNomes(cliente, produto, petNomes, undefined, dataCalculo);

  const petBusca = petNomes[0] ?? petNome?.trim();
  if (petBusca) {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => normalizeText(pet.nome).trim() === normalizeText(petBusca).trim(),
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
      hoje: dataCalculo,
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
    ? cliente.pets_detalhes.filter(
        (pet) => pet.nome?.trim() && (!pet.especie || pet.especie === especieDefault),
      )
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
      hoje: dataCalculo,
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
  dataCalculo?: string,
): PetEstimado[] {
  const nomes = Array.from(new Set(petNomes.map((nome) => nome.trim()).filter(Boolean)));
  if (nomes.length === 0) return petsEstimados(cliente, produto, undefined, dataCalculo);
  const especieDefault = especiePadrao(produto, cliente);
  const porteDefault = portePadrao(produto, cliente?.observacoes);

  return nomes.map((nome) => {
    const petDetalhe = cliente?.pets_detalhes?.find(
      (pet) => normalizeText(pet.nome).trim() === normalizeText(nome).trim(),
    );
    const detalheManual = petsDetalhes?.find(
      (pet) => normalizeText(pet.nome).trim() === normalizeText(nome).trim(),
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
      hoje: dataCalculo,
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
        .map((item) => normalizeText(item).trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  );
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
  petNome?: string | null,
): { dias?: number; consumoDiarioG?: number; pesoKg?: number; confirmado: boolean } | null {
  if (!observacao?.trim()) return null;

  const linhas = observacao
    .split("|")
    .map((line) => line.trim())
    .filter((line) => /recompra_auto/i.test(line));
  const candidatas = linhas.filter((line) => markerValue(line, "sku") === sku);
  const exatas = candidatas.filter((line) => mesmosPets(markerValue(line, "pet"), petNome));
  const linha =
    exatas.length === 1
      ? exatas[0]
      : candidatas.length === 1 && !markerValue(candidatas[0], "pet")
        ? candidatas[0]
        : null;
  if (!linha) return null;

  const dias = numberMarker(linha, "dias", 3, 180);
  const consumoDiarioG = numberMarker(linha, "consumo_diario_g", 20, 3000);
  const pesoKg = numberMarker(linha, "peso_kg", 0.01, 200);

  if (!dias && !consumoDiarioG && !pesoKg) return null;

  return {
    confirmado: markerValue(linha, "confirmado") === "true",
    ...(dias ? { dias: Math.round(dias) } : {}),
    ...(consumoDiarioG ? { consumoDiarioG } : {}),
    ...(pesoKg ? { pesoKg } : {}),
  };
}

function dataCompraVenda(venda: VendaItemComVendaRow["vendas"]): string {
  return dateOnly(
    dataBaseRecompra({
      criadoEm: venda?.criado_em,
      faturadoEm: venda?.faturado_em,
    }) ?? new Date(),
  );
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

async function selectAll<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; ) {
    const url = new URL(path, "https://local.invalid");
    url.searchParams.set("limit", "300");
    url.searchParams.set("offset", String(offset));
    const page = await selectRows<T>(url.pathname + url.search);
    rows.push(...page);
    if (page.length < 300) return rows;
    offset += page.length;
  }
}

function itemCompraManual(row: CompraManualRow): VendaItemComVendaRow {
  return {
    id: "manual:" + row.id,
    venda_id: "manual:" + row.id,
    sku: row.sku,
    nome: row.produto_nome,
    pet_nome: row.pet_nome,
    quantidade: Number(row.quantidade),
    preco: null,
    preco_compra: null,
    manual: row,
    vendas: {
      id: "manual:" + row.id,
      cliente_id: row.cliente_id,
      cliente_nome: null,
      telefone: null,
      criado_em: row.comprado_em,
      status: "concluida",
    },
  };
}

/** Data a que a venda se refere: "Venda retroativa (22/07)" aponta para 22/07. */
function dataReferidaVenda(item: VendaItemComVendaRow): string {
  const data = dataCompraVenda(item.vendas);
  const retro = item.vendas?.observacao?.match(/venda retroativa \((\d{1,2})\/(\d{1,2})\)/i);
  if (!retro) return data;
  const [dia, mes] = [retro[1], retro[2]].map((v) => v.padStart(2, "0"));
  const candidata = `${data.slice(0, 4)}-${mes}-${dia}`;
  // Referência de dezembro lançada em janeiro pertence ao ano anterior.
  return candidata > data ? `${Number(data.slice(0, 4)) - 1}-${mes}-${dia}` : candidata;
}

/**
 * Lançamentos retroativos repetidos geravam a mesma venda várias vezes (6× o mesmo pacote
 * de 10 kg virava 60 kg). Item idêntico (nome, pet, quantidade e preço) em outra venda
 * referente ao mesmo dia é duplicata e não soma no abastecimento.
 */
function semVendasDuplicadas(itens: VendaItemComVendaRow[]): VendaItemComVendaRow[] {
  const vendaPorChave = new Map<string, string>();
  return itens.filter((item) => {
    if (item.manual) return true;
    const chave = [
      dataReferidaVenda(item),
      normalizarTextoRecompra(item.nome ?? item.sku).replace(/\s+/g, " ").trim(),
      petTokens(item.pet_nome).sort().join(","),
      Number(item.quantidade),
      Number(item.preco ?? 0),
    ].join("|");
    const venda = vendaPorChave.get(chave);
    if (!venda) vendaPorChave.set(chave, item.venda_id);
    return !venda || venda === item.venda_id;
  });
}

async function comprasCliente(clienteId: string): Promise<VendaItemComVendaRow[]> {
  const params = new URLSearchParams({
    sku: "not.is.null",
    "vendas.cliente_id": "eq." + clienteId,
    select:
      "id,venda_id,sku,nome,pet_nome,quantidade,preco,preco_compra,vendas!inner(id,cliente_id,cliente_nome,telefone,criado_em,faturado_em,status,observacao)",
    order: "id.asc",
  });
  const [vendas, manuais] = await Promise.all([
    selectAll<VendaItemComVendaRow>("/venda_itens?" + params),
    selectAll<CompraManualRow>(
      "/recompra_compras_manuais?cliente_id=eq." +
        encodeURIComponent(clienteId) +
        "&select=*&order=id.asc",
    ),
  ]);
  return semVendasDuplicadas(
    [...vendas, ...manuais.map(itemCompraManual)]
      .filter((row) => row.vendas?.cliente_id === clienteId && row.vendas.status !== "cancelada"),
  ).sort(
      (a, b) =>
        dataCompraVenda(a.vendas).localeCompare(dataCompraVenda(b.vendas)) ||
        (a.vendas?.criado_em ?? "").localeCompare(b.vendas?.criado_em ?? "") ||
        a.id.localeCompare(b.id),
    );
}

function mesmosPets(a: string | null | undefined, b: string | null | undefined): boolean {
  const petsA = petTokens(a).sort();
  const petsB = petTokens(b).sort();
  return petsA.length === petsB.length && petsA.every((pet, i) => pet === petsB[i]);
}

function produtoDoItem(item: VendaItemComVendaRow, produtos: Map<string, ProdutoRow>): ProdutoRow {
  const catalogo = produtos.get(item.sku);
  return {
    sku: item.sku,
    nome: item.nome || catalogo?.nome || item.sku,
    categoria: catalogo?.categoria ?? (item.manual ? "Racao" : null),
    preco: item.preco,
    preco_compra: item.preco_compra,
    estoque: null,
    detalhes_tecnicos: {
      ...catalogo?.detalhes_tecnicos,
      ...(item.manual ? { especie: item.manual.especie } : {}),
    },
  };
}

function nomesDoGrupo(
  item: VendaItemComVendaRow,
  produto: ProdutoRow,
  cliente: ClienteRow | null,
): string {
  const explicitos = petTokens(item.pet_nome);
  if (explicitos.length) return explicitos.sort().join(", ");
  const especie = especiePadrao(produto, cliente);
  const pets = (cliente?.pets_detalhes ?? [])
    .filter((p) => p.nome?.trim() && (!p.especie || p.especie === especie))
    .map((p) => p.nome);
  if (pets.length) return petTokens(pets.join(",")).sort().join(", ");
  // Sem detalhes não é possível atribuir os nomes do cadastro a uma espécie com segurança.
  return "pet (" + especie + ")";
}

function chaveGrupo(
  item: VendaItemComVendaRow,
  produtos: Map<string, ProdutoRow>,
  cliente: ClienteRow | null,
): string {
  const produto = produtoDoItem(item, produtos);
  return especiePadrao(produto, cliente) + "|" + nomesDoGrupo(item, produto, cliente);
}

function pesoDoItem(item: VendaItemComVendaRow, produtos: Map<string, ProdutoRow>): number {
  if (item.manual) return Number(item.manual.peso_kg);
  const produto = produtoDoItem(item, produtos);
  const marcador = observacaoRecompraAuto(item.vendas?.observacao, item.sku, item.pet_nome);
  // Nome gravado na venda preserva o tamanho comprado mesmo após editar o catálogo.
  const pesoNome = inferirPesoRacaoKg({ nome: item.nome }, Number(item.quantidade));
  return (
    (marcador?.confirmado ? marcador.pesoKg : undefined) ??
    (pesoNome || inferirPesoKg(produto, Number(item.quantidade)) || marcador?.pesoKg || 0)
  );
}

function historicoRacaoDoItem(
  item: VendaItemComVendaRow,
  compras: VendaItemComVendaRow[],
  produtos: Map<string, ProdutoRow>,
  cliente: ClienteRow | null,
): CompraHistoricoRecompra[] {
  const chave = chaveGrupo(item, produtos, cliente);
  return compras
    .filter(
      (compra) =>
        isRacao(produtoDoItem(compra, produtos)) &&
        chaveGrupo(compra, produtos, cliente) === chave &&
        dataCompraVenda(compra.vendas) <= dataCompraVenda(item.vendas),
    )
    .map((compra) => ({
      data: dataCompraVenda(compra.vendas),
      pesoKg: pesoDoItem(compra, produtos),
    }));
}

/** Projeção completa e determinística: independe da ordem de lançamento das vendas. */
export async function recalcularRecompraCliente(
  clienteId: string,
  simular = false,
): Promise<PrevisaoRow[]> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    // A versão é lida ANTES dos fatos. A transação rejeita alterações concorrentes.
    const anteriores = await selectRows<PrevisaoRow>(
      "/recompra_previsoes?cliente_id=eq." + encodeURIComponent(clienteId) + "&select=*",
    );
    const [clientes, compras] = await Promise.all([
      listarClientesPorId([clienteId]),
      comprasCliente(clienteId),
    ]);
    const cliente = clientes.get(clienteId) ?? null;
    const produtos = await listarProdutosPorSku([...new Set(compras.map((c) => c.sku))]);
    const grupos = new Map<string, VendaItemComVendaRow[]>();
    for (const compra of compras) {
      if (!isRacao(produtoDoItem(compra, produtos))) continue;
      const chave = chaveGrupo(compra, produtos, cliente);
      grupos.set(chave, [...(grupos.get(chave) ?? []), compra]);
    }
    const payloads: PrevisaoRow[] = [];
    const idsUsados = new Set<string>();
    for (const [grupo, itens] of grupos) {
      const item = itens.at(-1)!;
      const produto = produtoDoItem(item, produtos);
      const ultimaCompra = dataCompraVenda(item.vendas);
      const petNome = nomesDoGrupo(item, produto, cliente);
      const petBusca = petNome.startsWith("pet (") ? "" : petNome;
      const petsNaData = (data: string) =>
        item.manual
          ? petsEstimadosPorNomes(
              cliente,
              produto,
              petTokens(petBusca),
              item.manual.pets_detalhes,
              data,
            )
          : petsEstimados(cliente, produto, petBusca, data);
      const pets = petsNaData(ultimaCompra);
      const marcador = observacaoRecompraAuto(item.vendas?.observacao, item.sku, item.pet_nome);
      const consumoInformado =
        item.manual?.consumo_diario_g ??
        (marcador?.confirmado ? marcador.consumoDiarioG : undefined);
      const consumoNaData = (data: string) =>
        consumoInformado ?? petsNaData(data).reduce((sum, pet) => sum + pet.consumoDiaG, 0);
      const resultado = preverRecompra({
        compras: historicoRacaoDoItem(item, compras, produtos, cliente),
        consumoNaData,
      });
      const evento = resultado.evento!;
      const comprasEvento = itens.filter((i) => dataCompraVenda(i.vendas) >= evento.inicio);
      // Conserva o id da previsão e as decisões do operador quando o grupo não mudou.
      const anterior =
        anteriores.find((p) => !idsUsados.has(p.id) && p.calculo?.grupo === grupo) ??
        anteriores.find(
          (p) =>
            !idsUsados.has(p.id) &&
            !p.calculo &&
            (p.venda_item_id === item.id || p.id === item.manual?.id),
        ) ??
        anteriores.find(
          (p) =>
            !idsUsados.has(p.id) &&
            !p.calculo &&
            mesmosPets(p.pet_nome || (p.pets ?? []).map((pet) => pet.nome).join(","), petNome) &&
            (p.pets?.[0]?.especie ?? especiePadrao(p.produtos, cliente)) ===
              especiePadrao(produto, cliente),
        );
      const id = anterior?.id ?? crypto.randomUUID();
      idsUsados.add(id);
      const mesmaCompra =
        anterior?.calculo?.compraId === item.venda_id ||
        (!anterior?.calculo &&
          (anterior?.venda_id === item.venda_id || item.manual?.id === anterior?.id));
      const diasManual = mesmaCompra
        ? (anterior?.dias_manual ?? item.manual?.dias_manual ?? null)
        : (item.manual?.dias_manual ?? null);
      let diasCalculados = resultado.dias;
      // Só informações confirmadas pelo tutor prevalecem sobre uma nova estimativa.
      const diasConfirmados = marcador?.confirmado ? marcador.dias : null;
      if (!resultado.historico && diasConfirmados) diasCalculados = diasConfirmados;
      let pendencia = resultado.pendencia;
      if (pets.some((p) => p.especie !== especiePadrao(produto, cliente))) {
        pendencia = "O pet selecionado tem espécie diferente da ração.";
      }
      const dias = diasManual ?? (pendencia && !diasConfirmados ? 0 : diasCalculados);
      const proxima = addDays(ultimaCompra, dias);
      const memoria: MemoriaCalculoRecompra = {
        versao: 2,
        grupo,
        compraId: item.venda_id,
        produtoSku: item.sku,
        consumoEstimadoG: consumoNaData(ultimaCompra),
        consumoHistoricoG: resultado.historico?.consumoRealG ?? null,
        pesoEventoKg: evento.pesoKg,
        inicioEvento: evento.inicio,
        diasTranscorridos: diasEntreCompras(evento.inicio, evento.fim),
        intervalosDescartados: resultado.historico?.intervalosDescartados ?? [],
        pendencia: diasManual || diasConfirmados ? null : pendencia,
      };
      payloads.push({
        id,
        cliente_id: clienteId,
        venda_id: item.manual ? null : item.venda_id,
        venda_item_id: item.manual ? null : item.id,
        sku: produtos.has(item.sku) ? item.sku : null,
        pet_nome: petNome,
        produto_nome: [...new Set(comprasEvento.map((i) => i.nome))].join(" + "),
        categoria: produto.categoria,
        peso_kg: evento.pesoKg,
        quantidade: comprasEvento.reduce((sum, i) => sum + Number(i.quantidade), 0),
        pets,
        consumo_diario_g: memoria.consumoHistoricoG ?? memoria.consumoEstimadoG,
        dias_estimados: dias,
        dias_calculados: diasCalculados,
        dias_manual: diasManual,
        media_dias_real: resultado.historico?.dias ?? null,
        historico_dias: resultado.historico?.intervalos ?? [],
        ultima_compra_em: ultimaCompra,
        proxima_compra_em: proxima,
        data_alerta: addDays(proxima, -diasAntecedenciaAviso(pets)),
        status: memoria.pendencia ? "ok" : statusFromDias(signedDiffDaysFromToday(proxima)),
        fonte: resultado.historico ? "historico" : diasConfirmados ? "observacao" : "estimativa",
        contatado: mesmaCompra ? (anterior?.contatado ?? false) : false,
        travado: anterior?.travado ?? false,
        calculo: memoria,
        atualizado_em: new Date().toISOString(),
        clientes: null,
        produtos: null,
      });
    }
    if (simular) return payloads;
    const response = await fetch(supabaseUrl("/rpc/salvar_previsoes_recompra"), {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_cliente_id: clienteId,
        p_versao: Object.fromEntries(anteriores.map((p) => [p.id, p.atualizado_em])),
        p_previsoes: payloads.map(({ clientes: _c, produtos: _p, ...row }) => row),
      }),
    });
    if (!response.ok)
      throw new Error("Não foi possível atualizar a recompra: " + (await response.text()));
    if (await response.json()) return payloads;
  }
  throw new Error("As compras foram alteradas durante o cálculo. Tente novamente.");
}

export async function recalcularRecompraVenda(vendaId: string): Promise<void> {
  const vendas = await selectRows<{ cliente_id: string | null }>(
    "/vendas?id=eq." + encodeURIComponent(vendaId) + "&select=cliente_id",
  );
  // Inclui o cliente anterior, caso o pedido tenha mudado de tutor.
  const previsoes = await selectRows<{ cliente_id: string }>(
    "/recompra_previsoes?venda_id=eq." + encodeURIComponent(vendaId) + "&select=cliente_id",
  );
  for (const id of new Set([...vendas, ...previsoes].map((v) => v.cliente_id).filter(Boolean))) {
    await recalcularRecompraCliente(id!);
  }
}

export async function registrarRecompraManual(input: {
  requisicaoId?: string;
  clienteId: string;
  sku: string;
  petNome: string;
  petNomes?: string[];
  petsDetalhes?: PetDetalhe[];
  modoDistribuicao?: "compartilhada" | "por_pet";
  compraEm: string;
  diasRecompra: number;
  cicloConfirmado?: boolean;
  quantidade?: number;
  pesoKg?: number;
  consumoDiarioG?: number;
  produtoNome?: string;
}): Promise<RecompraPrevista | RecompraPrevista[]> {
  const clienteId = input.clienteId.trim();
  const sku = input.sku.trim().toUpperCase();
  const compraEm = normalizarDataCompraRecompra(input.compraEm);
  if (signedDiffDaysFromToday(compraEm) > 0)
    throw new Error("A data da compra não pode ficar no futuro");
  const nomes = [
    ...new Set(
      [...(input.petNomes ?? []), input.petNome]
        .flatMap((p) => p.split(","))
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  if (!clienteId || !sku || !nomes.length) throw new Error("Cliente, ração e pet são obrigatórios");
  const [clientes, produtos] = await Promise.all([
    listarClientesPorId([clienteId]),
    listarProdutosPorSku([sku]),
  ]);
  const cliente = clientes.get(clienteId);
  if (!cliente) throw new Error("Cliente não encontrado");
  const produto = produtos.get(sku) ?? {
    sku,
    nome: input.produtoNome || sku,
    categoria: "Racao",
    preco: null,
    preco_compra: null,
    estoque: null,
  };
  const quantidade = Number(input.quantidade ?? 1);
  const peso = Number(input.pesoKg ?? inferirPesoKg(produto, quantidade));
  if (!Number.isInteger(quantidade) || quantidade <= 0 || !Number.isFinite(peso) || peso <= 0) {
    throw new Error("Informe a quantidade de pacotes e o peso total da ração");
  }
  if (
    input.consumoDiarioG != null &&
    (!Number.isFinite(input.consumoDiarioG) || input.consumoDiarioG <= 0)
  ) {
    throw new Error("O consumo diário deve ser maior que zero");
  }
  const grupos = input.modoDistribuicao === "por_pet" ? nomes.map((n) => [n]) : [nomes];
  const requisicaoId = input.requisicaoId || crypto.randomUUID();
  const registros = await Promise.all(
    grupos.map(async (grupo) => {
      const pets = petsEstimadosPorNomes(cliente, produto, grupo, input.petsDetalhes, compraEm);
      const especies = [...new Set(pets.map((p) => p.especie))];
      if (especies.length > 1) throw new Error("Separe a compra dos cães da compra dos gatos");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          clienteId + "|" + requisicaoId + "|" + petTokens(grupo.join(",")).sort().join(","),
        ),
      );
      const hex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      return {
        id,
        cliente_id: clienteId,
        sku,
        produto_nome: input.produtoNome?.trim() || produto.nome,
        pet_nome: grupo.join(", "),
        especie: especies[0] ?? especiePadrao(produto, cliente),
        comprado_em: compraEm,
        quantidade,
        peso_kg: peso,
        consumo_diario_g: input.consumoDiarioG ?? null,
        dias_manual: input.cicloConfirmado ? normalizarCicloManual(input.diasRecompra) : null,
        pets_detalhes: input.petsDetalhes ?? [],
      };
    }),
  );
  await writeRows(
    "/recompra_compras_manuais?on_conflict=id",
    registros,
    "resolution=ignore-duplicates,return=representation",
  );
  await recalcularRecompraCliente(clienteId);
  const data = await listarRecompraPrevista();
  const resultados = data.recompras.filter((r) => r.clienteId === clienteId);
  if (!resultados.length)
    throw new Error("Compra registrada, mas a previsão precisa ser recalculada");
  return resultados.length === 1 ? resultados[0] : resultados;
}

export async function recalcularTodasRecompras(): Promise<{ vendas: number }> {
  const [vendas, manuais, previsoes] = await Promise.all([
    selectAll<{ cliente_id: string }>("/vendas?select=cliente_id&order=id.asc"),
    selectAll<{ cliente_id: string }>("/recompra_compras_manuais?select=cliente_id&order=id.asc"),
    selectAll<{ cliente_id: string }>("/recompra_previsoes?select=cliente_id&order=id.asc"),
  ]);
  const ids = [
    ...new Set([...vendas, ...manuais, ...previsoes].map((v) => v.cliente_id).filter(Boolean)),
  ];
  for (const id of ids) await recalcularRecompraCliente(id);
  return { vendas: vendas.length };
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
  const cicloRacao = calcularDiasRecompraRacao(
    Number(row.peso_kg ?? 0),
    Number(row.calculo?.consumoEstimadoG ?? row.consumo_diario_g ?? 0),
  );
  const intervaloPedidos = media(historico);
  const mediaRecompra = Math.round(row.media_dias_real ?? row.dias_estimados);
  const previsaoBase = Math.max(0, Math.round(row.dias_estimados));
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
    sku: row.calculo?.produtoSku ?? row.sku ?? "",
    racao: row.produto_nome,
    quantidade,
    pesoKg: Number(row.peso_kg ?? 0),
    consumoDiaKg: Number(row.consumo_diario_g ?? 0) / 1000,
    consumoEstimadoG: row.calculo?.consumoEstimadoG,
    consumoHistoricoG: row.calculo?.consumoHistoricoG,
    pendenciaCalculo: row.calculo?.pendencia,
    diasAbastecimento: row.calculo?.diasTranscorridos ?? 0,
    intervalosDescartados: row.calculo?.intervalosDescartados ?? [],
    ultimaCompra: formatDateBr(row.ultima_compra_em),
    ultimaCompraIso: row.ultima_compra_em,
    diasDesdeCompra: Math.max(0, -signedDiffDaysFromToday(row.ultima_compra_em)),
    cicloRacao,
    intervaloPedidos,
    diasRestantes: dias,
    dataPrevista: row.calculo?.pendencia ? "Pendente" : formatDateBr(row.proxima_compra_em),
    dataPrevistaIso: row.calculo?.pendencia ? undefined : row.proxima_compra_em,
    valorEstimado: (produto?.preco ?? 0) * quantidade,
    fonteCalculo: "estimativa",
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
    status: row.calculo?.pendencia ? "pendente" : statusFromDias(dias),
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
    precisaoIA: 0,
    tendencia,
    historicoDias: historico,
    travado: row.travado,
    cicloCalculado: Math.max(0, Math.round(Number(row.dias_calculados ?? row.dias_estimados))),
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
    produtos: produtosPrevistos(recompras.filter((r) => !r.pendenciaCalculo)),
    bairros: demandaBairros(recompras.filter((r) => !r.pendenciaCalculo)),
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
/**
 * Histórico de vendas do cliente da previsão (todas as vendas não canceladas, mais
 * recente primeiro), marcando quais itens entram no ciclo — mesma regra de
 * historicoRacaoDoItem: ração, mesmos pets e mesma espécie.
 */
export async function historicoVendasRecompra(previsaoId: string): Promise<{
  vendas: HistoricoVendaRecompra[];
  comparacao: ComparacaoCicloHistorico;
}> {
  const [previsao] = await selectRows<PrevisaoRow>(
    "/recompra_previsoes?id=eq." + encodeURIComponent(previsaoId) + "&select=*",
  );
  if (!previsao) throw new Error("Previsão de recompra não encontrada");
  const [itens, clientes] = await Promise.all([
    comprasCliente(previsao.cliente_id),
    listarClientesPorId([previsao.cliente_id]),
  ]);
  const produtos = await listarProdutosPorSku([...new Set(itens.map((i) => i.sku))]);
  const cliente = clientes.get(previsao.cliente_id) ?? null;
  const grupo = previsao.calculo?.grupo;
  const porVenda = new Map<string, Omit<HistoricoVendaRecompra, "durouDias" | "consumoRealG">>();
  for (const row of itens) {
    const produto = produtoDoItem(row, produtos);
    const racao = isRacao(produto);
    const entraNoCiclo =
      racao &&
      dataCompraVenda(row.vendas) <= previsao.ultima_compra_em &&
      (grupo
        ? chaveGrupo(row, produtos, cliente) === grupo
        : mesmosPets(row.pet_nome, previsao.pet_nome));
    const pesoKg = racao ? pesoDoItem(row, produtos) : 0;
    const atual = porVenda.get(row.venda_id) ?? {
      vendaId: row.venda_id,
      data: dataCompraVenda(row.vendas),
      total: null,
      status: row.manual ? "compra informada" : (row.vendas?.status ?? null),
      itens: [],
      kgCiclo: 0,
    };
    atual.itens.push({
      sku: row.sku,
      nome: row.nome,
      quantidade: Number(row.quantidade),
      preco: row.preco,
      petNome: row.pet_nome,
      racao,
      pesoKg,
      entraNoCiclo,
    });
    if (entraNoCiclo) atual.kgCiclo += pesoKg;
    porVenda.set(row.venda_id, atual);
  }
  const vendas = calcularDuracoesHistorico([...porVenda.values()]);
  return { vendas, comparacao: compararCicloComHistorico(vendas, previsao.dias_estimados) };
}

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
    0,
    Math.round(Number(atual.dias_calculados ?? atual.dias_estimados)),
  );
  const diasEstimados = diasManual ?? diasCalculados;
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

  if (atual.calculo?.compraId.startsWith("manual:")) {
    const manualResponse = await fetch(
      supabaseUrl(
        `/recompra_compras_manuais?id=eq.${encodeURIComponent(atual.calculo.compraId.slice(7))}`,
      ),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=minimal"),
        body: JSON.stringify({ dias_manual: diasManual }),
      },
    );
    if (!manualResponse.ok)
      throw new Error("Não foi possível atualizar o ciclo da compra informada");
  }
  await recalcularRecompraCliente(atual.cliente_id);
  const data = await listarRecompraPrevista();
  const row = data.recompras.find((r) => r.id === id);
  if (!row) throw new Error("Previsão de recompra não encontrada");
  return row;
}

/**
 * Corrige a data real da compra. Quando a previsao veio de uma venda, tambem
 * corrige a venda e refaz todas as previsoes ligadas a ela. Previsoes criadas
 * manualmente nao possuem venda_id e sao atualizadas diretamente.
 */
export async function definirDataCompraRecompra(id: string, value: unknown): Promise<void> {
  const compraEm = normalizarDataCompraRecompra(value);
  if (signedDiffDaysFromToday(compraEm) > 0) {
    throw new Error("A data da compra não pode ficar no futuro");
  }

  const [atual] = await selectRows<PrevisaoRow>(
    `/recompra_previsoes?id=eq.${encodeURIComponent(id)}&select=*`,
  );
  if (!atual) throw new Error("Previsao de recompra nao encontrada");

  if (atual.calculo?.compraId.startsWith("manual:")) {
    const response = await fetch(
      supabaseUrl(
        `/recompra_compras_manuais?id=eq.${encodeURIComponent(atual.calculo.compraId.slice(7))}`,
      ),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=minimal"),
        body: JSON.stringify({ comprado_em: compraEm }),
      },
    );
    if (!response.ok) throw new Error("Não foi possível corrigir a data da compra informada");
    await recalcularRecompraCliente(atual.cliente_id);
    return;
  }

  if (atual.venda_id) {
    const [venda] = await selectRows<{ id: string; faturado_em: string | null }>(
      `/vendas?id=eq.${encodeURIComponent(atual.venda_id)}&select=id,faturado_em`,
    );
    if (!venda) throw new Error("Venda vinculada a recompra nao encontrada");

    const timestamp = new Date(`${compraEm}T12:00:00-03:00`).toISOString();
    const response = await fetch(
      supabaseUrl(`/vendas?id=eq.${encodeURIComponent(atual.venda_id)}`),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=minimal"),
        body: JSON.stringify({
          criado_em: timestamp,
          ...(venda.faturado_em ? { faturado_em: timestamp } : {}),
          atualizado_em: new Date().toISOString(),
        }),
      },
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase venda data failed (${response.status}): ${errorBody}`);
    }

    await recalcularRecompraVenda(atual.venda_id);
    return;
  }

  const proximaCompra = addDays(compraEm, atual.dias_estimados);
  const response = await fetch(supabaseUrl(`/recompra_previsoes?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({
      ultima_compra_em: compraEm,
      proxima_compra_em: proximaCompra,
      data_alerta: addDays(proximaCompra, -diasAntecedenciaAviso(atual.pets)),
      status: statusFromDias(signedDiffDaysFromToday(proximaCompra)),
      atualizado_em: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase recompra data failed (${response.status}): ${errorBody}`);
  }
}

/** Busca previsões específicas (sem carregar o painel inteiro, para poupar egress). */
export async function buscarRecomprasPorIds(ids: string[]): Promise<RecompraPrevista[]> {
  const limpos = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, 50);
  if (limpos.length === 0) return [];
  const filtro = limpos.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
  const rows = await selectOptional<PrevisaoRow>(
    `/recompra_previsoes?id=in.(${encodeURIComponent(filtro)})&select=*,clientes(id,nome,telefone,bairro,cidade,pets,pets_detalhes,perfil,especies,observacoes),produtos(sku,nome,categoria,preco,preco_compra,estoque,detalhes_tecnicos)`,
  );
  return rows.map(mapPrevisao);
}

export async function lerConfiguracaoRecompra<T>(chave: string): Promise<T | null> {
  const params = new URLSearchParams({ chave: `eq.${chave}`, select: "valor" });
  const rows = await selectOptional<{ valor: T }>(`/crm_configuracoes?${params}`);
  return rows[0]?.valor ?? null;
}

export async function salvarConfiguracaoRecompra(chave: string, valor: unknown): Promise<void> {
  const response = await fetch(supabaseUrl("/crm_configuracoes?on_conflict=chave"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([{ chave, valor, atualizado_em: new Date().toISOString() }]),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase configuracao recompra failed (${response.status}): ${errorBody}`);
  }
}
