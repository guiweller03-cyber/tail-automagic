import type { Cliente, PetDetalhe, Produto, ProdutoDetalhesTecnicos } from "@/lib/crm-types";
import {
  type LeadTotalInput,
  listarLeadsTotais,
  registrarLeadTotal,
  registrarLeadsTotais,
} from "@/lib/leads-totais-supabase";

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
    leadsTotais: number;
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
  pets_detalhes: unknown;
  observacoes: string | null;
  follow_up_manual: Cliente["followUpManual"] | null;
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
  foto_url?: string | null;
  foto_path?: string | null;
  detalhes_tecnicos?: ProdutoDetalhesTecnicos | null;
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
const PRODUTO_FOTOS_BUCKET = "produto-fotos";
const PRODUTO_FOTO_MAX_BYTES = 5 * 1024 * 1024;
const PRODUTO_FOTO_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const COMPROVANTES_BUCKET = "comprovantes";
const COMPROVANTE_MAX_BYTES = 20 * 1024 * 1024;
const COMPROVANTE_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
let dashboardCache: { expiresAt: number; data: DashboardData } | null = null;
let dashboardPromise: Promise<DashboardData> | null = null;
const PESO_PADRAO_GATO_KG = 3.5;

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

function supabaseStorageUrl(path: string): string {
  const baseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  return `${baseUrl}/storage/v1${path}`;
}

function supabasePublicObjectUrl(bucket: string, path: string): string {
  return supabaseStorageUrl(`/object/public/${bucket}/${encodeStoragePath(path)}`);
}

function supabaseHeaders(): HeadersInit {
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "content-type": "application/json",
  };
}

function supabaseStorageHeaders(contentType?: string): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
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

async function selectAllFromSupabase<T>(path: string, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const page = await fetch(supabaseUrl(path), {
      headers: {
        ...supabaseHeaders(),
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });

    if (!page.ok) {
      const errorBody = await page.text();
      throw new Error(`Supabase select failed (${page.status}): ${errorBody}`);
    }

    const pageRows = (await page.json()) as T[];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
  }

  return rows;
}

async function selectOptional<T>(path: string): Promise<T[]> {
  try {
    return await selectFromSupabase<T>(path);
  } catch {
    return [];
  }
}

function parsePesoPetKg(value: unknown): number | undefined {
  if (typeof value === "string" && !value.trim()) return undefined;
  const texto =
    typeof value === "string" ? value.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] : undefined;
  const numero = typeof value === "number" ? value : texto ? Number(texto) : Number.NaN;

  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
}

function normalizarPetDetalhe(value: unknown): PetDetalhe | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const item = value as Record<string, unknown>;
  const nome = typeof item.nome === "string" ? item.nome.trim() : "";
  const especie = item.especie === "cachorro" || item.especie === "gato" ? item.especie : undefined;
  const castrado =
    typeof item.castrado === "boolean"
      ? item.castrado
      : typeof item.castrado === "string" && /^(sim|true|1)$/i.test(item.castrado.trim())
        ? true
        : typeof item.castrado === "string" && /^(nao|não|false|0)$/i.test(item.castrado.trim())
          ? false
          : undefined;
  const porte =
    item.porte === "pequeno" || item.porte === "medio" || item.porte === "grande"
      ? item.porte
      : undefined;
  const pesoKg =
    parsePesoPetKg(item.pesoKg) ?? (especie === "gato" ? PESO_PADRAO_GATO_KG : undefined);
  const raca = typeof item.raca === "string" ? item.raca.trim() || undefined : undefined;
  const idade = typeof item.idade === "string" ? item.idade.trim() || undefined : undefined;
  const observacao =
    typeof item.observacao === "string"
      ? item.observacao.trim().slice(0, 300) || undefined
      : undefined;

  if (
    !nome &&
    !especie &&
    castrado === undefined &&
    !raca &&
    !porte &&
    !pesoKg &&
    !idade &&
    !observacao
  )
    return null;

  return { nome, especie, castrado, raca, porte, pesoKg, idade, observacao };
}

function normalizarPetsDetalhes(value: unknown): PetDetalhe[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizarPetDetalhe)
    .filter((pet): pet is PetDetalhe => pet !== null)
    .slice(0, 20);
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
    petsDetalhes: normalizarPetsDetalhes(row.pets_detalhes),
    observacoes: row.observacoes ?? "",
    followUpManual: row.follow_up_manual ?? undefined,
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
    fotoUrl: row.foto_url ?? null,
    fotoPath: row.foto_path ?? null,
    detalhesTecnicos: row.detalhes_tecnicos ?? undefined,
  };
}

export async function listarClientes(): Promise<Cliente[]> {
  const rows = await selectAllFromSupabase<ClienteRow>("/clientes?select=*&order=nome.asc");
  return rows.map(mapCliente);
}

export async function listarClientesHistorico(
  leadsExtras: LeadTotalInput[] = [],
): Promise<Cliente[]> {
  const clientes = await listarClientes();

  await registrarLeadsTotais([...clientes, ...leadsExtras], { ativo: true });

  try {
    return await listarLeadsTotais();
  } catch (error) {
    console.error("[leads-totais] erro_listar_historico", error);
    return clientes;
  }
}

export type ClienteCrmInput = {
  nome: string;
  telefone: string;
  endereco?: string;
  bairro?: string;
  pets?: string[];
  petsDetalhes?: PetDetalhe[];
  perfil?: Cliente["perfil"];
  origem?: string;
  observacoes?: string;
  followUpManual?: Cliente["followUpManual"];
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
    ...(input.petsDetalhes !== undefined
      ? { pets_detalhes: normalizarPetsDetalhes(input.petsDetalhes) }
      : {}),
    ...(input.observacoes !== undefined ? { observacoes: input.observacoes.trim() || null } : {}),
    ...(input.followUpManual !== undefined ? { follow_up_manual: input.followUpManual ?? {} } : {}),
    atualizado_em: new Date().toISOString(),
  };
}

async function writeCliente(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
  prefer = "return=representation",
): Promise<Cliente> {
  const response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      ...supabaseHeaders(),
      Prefer: prefer,
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
  const cliente = await writeCliente(
    "/clientes?on_conflict=telefone",
    "POST",
    clientePayload(input),
    "resolution=merge-duplicates,return=representation",
  );

  await registrarLeadTotal(cliente, { ativo: true });

  return cliente;
}

export async function atualizarClienteCrm(id: string, input: ClienteCrmInput): Promise<Cliente> {
  const cliente = await writeCliente(
    `/clientes?id=eq.${encodeURIComponent(id)}`,
    "PATCH",
    clientePayload(input),
  );

  await registrarLeadTotal(cliente, { ativo: true });

  return cliente;
}

export async function excluirClienteCrm(id: string): Promise<void> {
  const cliente = await buscarClientePorId(id);

  const response = await fetch(supabaseUrl(`/clientes?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente delete failed (${response.status}): ${errorBody}`);
  }

  if (cliente) {
    await registrarLeadTotal({ ...cliente, clienteId: null }, { ativo: false });
  }
}

async function buscarClientePorId(id: string): Promise<Cliente | null> {
  const rows = await selectFromSupabase<ClienteRow>(
    `/clientes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );

  return rows[0] ? mapCliente(rows[0]) : null;
}

export async function listarProdutos(): Promise<Produto[]> {
  const rows = await selectAllFromSupabase<ProdutoRow>("/produtos?select=*&order=nome.asc");
  return rows.map(mapProduto);
}

export async function zerarEstoqueTodosProdutos(): Promise<number> {
  const response = await fetch(supabaseUrl("/produtos?estoque=gt.0"), {
    method: "PATCH",
    headers: { ...supabaseHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ estoque: 0, atualizado_em: new Date().toISOString() }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase zerar estoque failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as unknown[];
  return rows.length;
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
  fotoUrl?: string | null;
  fotoPath?: string | null;
  detalhesTecnicos?: ProdutoDetalhesTecnicos;
};

function produtoPayload(
  input: ProdutoCrmInput,
  includeDetalhesTecnicos = true,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
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

  if (includeDetalhesTecnicos) {
    payload.detalhes_tecnicos = input.detalhesTecnicos ?? {};
  }

  if ("fotoUrl" in input) {
    payload.foto_url = input.fotoUrl || null;
  }

  if ("fotoPath" in input) {
    payload.foto_path = input.fotoPath || null;
  }

  return payload;
}

async function writeProduto(
  path: string,
  method: "POST" | "PATCH",
  input: ProdutoCrmInput,
): Promise<Produto> {
  let response = await fetch(supabaseUrl(path), {
    method,
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify(produtoPayload(input)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("detalhes_tecnicos")) {
      response = await fetch(supabaseUrl(path), {
        method,
        headers: {
          ...supabaseHeaders(),
          Prefer: "return=representation",
        },
        body: JSON.stringify(produtoPayload(input, false)),
      });

      if (response.ok) {
        const rows = (await response.json()) as ProdutoRow[];
        if (!rows[0]) throw new Error("Produto nao retornado pelo Supabase");

        return mapProduto(rows[0]);
      }
    }

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

export async function excluirProdutoCrm(sku: string): Promise<void> {
  const produto = await buscarProdutoPorSku(sku);

  const response = await fetch(
    supabaseUrl(`/produtos?sku=eq.${encodeURIComponent(sku.trim().toUpperCase())}`),
    {
      method: "DELETE",
      headers: supabaseHeaders(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produto delete failed (${response.status}): ${errorBody}`);
  }

  void removerProdutoFotoStorage(produto?.fotoPath).catch(() => undefined);
}

export type ProdutoFotoArquivo = {
  name?: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function produtoFotoPath(sku: string, contentType: string): string {
  const skuPath = sku
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = PRODUTO_FOTO_MIME_EXT[contentType];
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${skuPath || "produto"}/${id}.${ext}`;
}

function validarProdutoFoto(file: ProdutoFotoArquivo): string {
  const contentType = file.type.toLowerCase();

  if (!PRODUTO_FOTO_MIME_EXT[contentType]) {
    throw new Error("Envie uma imagem JPG, PNG, WEBP ou GIF");
  }

  if (file.size <= 0) {
    throw new Error("Arquivo de imagem vazio");
  }

  if (file.size > PRODUTO_FOTO_MAX_BYTES) {
    throw new Error("A foto deve ter no maximo 5MB");
  }

  return contentType;
}

async function buscarProdutoPorSku(sku: string): Promise<Produto | null> {
  const params = new URLSearchParams({
    sku: `eq.${sku.trim().toUpperCase()}`,
    select: "*",
    limit: "1",
  });
  const rows = await selectFromSupabase<ProdutoRow>(`/produtos?${params}`);

  return rows[0] ? mapProduto(rows[0]) : null;
}

async function atualizarProdutoFotoCampos({
  sku,
  fotoUrl,
  fotoPath,
}: {
  sku: string;
  fotoUrl: string | null;
  fotoPath: string | null;
}): Promise<Produto> {
  const response = await fetch(supabaseUrl(`/produtos?sku=eq.${encodeURIComponent(sku)}`), {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(),
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      foto_url: fotoUrl,
      foto_path: fotoPath,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produto foto update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ProdutoRow[];
  if (!rows[0]) throw new Error("Produto nao retornado pelo Supabase");

  return mapProduto(rows[0]);
}

async function uploadProdutoFotoStorage({
  path,
  file,
  contentType,
}: {
  path: string;
  file: ProdutoFotoArquivo;
  contentType: string;
}): Promise<void> {
  const response = await fetch(
    supabaseStorageUrl(`/object/${PRODUTO_FOTOS_BUCKET}/${encodeStoragePath(path)}`),
    {
      method: "POST",
      headers: {
        ...supabaseStorageHeaders(contentType),
        "cache-control": "3600",
        "x-upsert": "true",
      },
      body: await file.arrayBuffer(),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase storage upload failed (${response.status}): ${errorBody}`);
  }
}

async function removerProdutoFotoStorage(path: string | null | undefined): Promise<void> {
  if (!path) return;

  const response = await fetch(
    supabaseStorageUrl(`/object/${PRODUTO_FOTOS_BUCKET}/${encodeStoragePath(path)}`),
    {
      method: "DELETE",
      headers: supabaseStorageHeaders(),
    },
  );

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    throw new Error(`Supabase storage delete failed (${response.status}): ${errorBody}`);
  }
}

export async function salvarProdutoFotoCrm(
  sku: string,
  file: ProdutoFotoArquivo,
): Promise<Produto> {
  const produto = await buscarProdutoPorSku(sku);
  if (!produto) throw new Error("Produto nao encontrado");

  const contentType = validarProdutoFoto(file);
  const path = produtoFotoPath(produto.sku, contentType);
  const fotoUrl = supabasePublicObjectUrl(PRODUTO_FOTOS_BUCKET, path);

  await uploadProdutoFotoStorage({ path, file, contentType });

  try {
    const atualizado = await atualizarProdutoFotoCampos({
      sku: produto.sku,
      fotoUrl,
      fotoPath: path,
    });

    void removerProdutoFotoStorage(produto.fotoPath).catch(() => undefined);

    return atualizado;
  } catch (error) {
    void removerProdutoFotoStorage(path).catch(() => undefined);
    throw error;
  }
}

export async function removerProdutoFotoCrm(sku: string): Promise<Produto> {
  const produto = await buscarProdutoPorSku(sku);
  if (!produto) throw new Error("Produto nao encontrado");

  const atualizado = await atualizarProdutoFotoCampos({
    sku: produto.sku,
    fotoUrl: null,
    fotoPath: null,
  });

  void removerProdutoFotoStorage(produto.fotoPath).catch(() => undefined);

  return atualizado;
}

/**
 * Sobe os bytes de um comprovante (imagem/PDF) para o bucket permanente e
 * devolve a URL publica estavel. Usado para guardar comprovantes do WhatsApp
 * antes que a midia original da UazAPI/WhatsApp expire.
 */
export async function uploadComprovanteStorage({
  path,
  bytes,
  contentType,
}: {
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
}): Promise<string> {
  if (bytes.byteLength > COMPROVANTE_MAX_BYTES) {
    throw new Error("Comprovante excede o tamanho maximo permitido");
  }

  const response = await fetch(
    supabaseStorageUrl(`/object/${COMPROVANTES_BUCKET}/${encodeStoragePath(path)}`),
    {
      method: "POST",
      headers: {
        ...supabaseStorageHeaders(contentType),
        "cache-control": "31536000",
        "x-upsert": "true",
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase comprovante upload failed (${response.status}): ${errorBody}`);
  }

  return supabasePublicObjectUrl(COMPROVANTES_BUCKET, path);
}

export function comprovanteStoragePath(
  telefone: string,
  messageId: string | undefined,
  contentType: string,
): string {
  const ext = COMPROVANTE_MIME_EXT[contentType.toLowerCase()] ?? "bin";
  const telefoneLimpo = telefone.replace(/\D/g, "") || "sem-telefone";
  const idLimpo = (messageId ?? `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);

  return `${telefoneLimpo}/${idLimpo}.${ext}`;
}

async function listarClientesDashboard(): Promise<ClienteDashboardRow[]> {
  return selectAllFromSupabase<ClienteDashboardRow>(
    "/clientes?select=perfil,ultima,total_gasto,lucro_liquido,pedidos,prox_recompra",
  );
}

async function listarProdutosDashboard(): Promise<ProdutoDashboardRow[]> {
  return selectFromSupabase<ProdutoDashboardRow>("/produtos?select=estoque,minimo");
}

function dataLocalSaoPaulo(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function dataLocalSaoPauloDiasAtras(date: Date, days: number): string {
  const [year, month, day] = dataLocalSaoPaulo(date).split("-").map(Number);
  const localNoonUtc = new Date(Date.UTC(year, month - 1, day, 15));
  localNoonUtc.setUTCDate(localNoonUtc.getUTCDate() - days);
  return dataLocalSaoPaulo(localNoonUtc);
}

function labelDiaSemanaSaoPaulo(dataLocal: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  })
    .format(new Date(`${dataLocal}T12:00:00-03:00`))
    .replace(".", "");
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

export function invalidarDashboardCache(): void {
  dashboardCache = null;
  dashboardPromise = null;
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

  const hojeLocal = dataLocalSaoPaulo(agora);
  const inicioSemanaLocal = dataLocalSaoPauloDiasAtras(agora, 6);
  const mes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const vendasPagas = vendas.filter(
    (venda) =>
      venda.status_pagamento === "pago" &&
      venda.status !== "cancelado" &&
      venda.status !== "cancelada",
  );
  const vendasHoje = vendasPagas.filter(
    (venda) => dataLocalSaoPaulo(new Date(venda.criado_em)) === hojeLocal,
  );
  const vendasSemanaAtual = vendasPagas.filter(
    (venda) => dataLocalSaoPaulo(new Date(venda.criado_em)) >= inicioSemanaLocal,
  );
  const vendasMes = vendasPagas.filter((venda) => new Date(venda.criado_em) >= mes);
  const leadsHoje = clientes.filter((cliente) => cliente.ultima === "hoje").length;
  const leadsSemana = clientes.filter(
    (cliente) => cliente.ultima === "hoje" || (cliente.ultima ?? "").includes("dia"),
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
    (cliente) => cliente.prox_recompra && cliente.prox_recompra !== "atrasada",
  ).length;
  const clientesVip = clientes.filter((cliente) => cliente.perfil === "VIP").length;
  const clientesRisco = clientes.filter((cliente) => cliente.perfil === "Risco").length;
  const estoqueCritico = produtos.filter(
    (produto) => numeroSeguro(produto.estoque) < numeroSeguro(produto.minimo),
  ).length;
  const leadsHistoricos = await listarLeadsTotais().catch((error) => {
    console.error("[leads-totais] erro_dashboard", error);
    return null;
  });

  const vendasSemana = Array.from({ length: 7 }, (_, index) => {
    const diaLocal = dataLocalSaoPauloDiasAtras(agora, 6 - index);
    const vendasDia = vendasPagas.filter((venda) => {
      return dataLocalSaoPaulo(new Date(venda.criado_em)) === diaLocal;
    });

    return {
      dia: labelDiaSemanaSaoPaulo(diaLocal),
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

  const leads = Math.max(clientes.length, leadsHistoricos?.length ?? 0);
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
      leadsTotais: leads,
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
