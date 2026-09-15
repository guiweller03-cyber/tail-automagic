import {
  BASE_SYSTEM_PROMPT,
  type IaPromptConfig,
  type IaRegraCustomizada,
  type Mensagem,
} from "./openai";
import {
  cancelarComissoesVenda,
  extrairCupomTexto,
  registrarComissaoVenda,
  registrarUsoCupom,
  validarCupom,
  type CupomAplicado,
} from "./indicacoes-supabase";
import { registrarLeadTotal } from "./leads-totais-supabase";
import { recalcularRecompraVenda } from "./recompra-supabase";
import { requireSupabaseServerKey } from "./server-env";
import {
  DEFAULT_KANBAN_COLUMNS,
  sanitizeKanbanColumns,
  type KanbanColumn,
} from "@/features/whatsapp-crm/kanban-config";

export type Conversa = {
  id: string;
  telefone: string;
  nome_cliente: string | null;
  historico: Mensagem[];
  aguardando_humano: boolean;
  ia_ativa: boolean | null;
  estagio: "novo" | "qualificando" | "vendendo" | "pos_venda" | "inativo";
  kanban_coluna: string | null;
  criado_em: string;
  atualizado_em: string;
  lido_ate: string | null;
  bloqueado?: boolean;
};

export type IaStatus = {
  globalDesativada: boolean;
};

export type IaAprendizadoResumo = {
  total: number;
  recentes7d: number;
  pontuacao: number;
  nivel: "Inicial" | "Aprendendo" | "Avancada" | "Madura";
  aprendizados: Array<{ licao: string; criadoEm: string }>;
  criterios: Array<{ nome: string; valor: string; pontos: number }>;
};

export type ProdutoPedido = {
  sku: string;
  nome: string;
  quantidade: number;
  preco: number;
  precoCompra: number;
  petNome?: string | null;
};

export type PedidoProcesso = "novo" | "pago" | "separando" | "em rota" | "entregue" | "cancelado";

export type PedidoCrm = {
  id: string;
  cliente: string;
  telefone: string;
  pet: string;
  bairro: string;
  total: number;
  hora: string;
  data: string;
  criadoEm: string;
  status: PedidoProcesso;
  pagamento: string;
  statusPagamento: string;
  observacao: string;
  taxaMaquina: number;
};

export type PedidoPixRow = {
  id: string;
  venda_id: string | null;
  cliente_telefone: string;
  descricao: string | null;
  valor: number;
  status: "pendente" | "pago" | "cancelado" | "entregue";
  mp_payment_id: string | null;
  mp_qr_code: string | null;
  mp_qr_code_base64: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type ConfirmacaoComprovantePix = {
  confirmado: boolean;
  tipo?: "pedido_pix" | "venda";
  pedidoPixId?: string;
  vendaId?: string;
  valor?: number;
  motivo?: string;
};

type ConversaUpsert = {
  telefone: string;
  historico: Mensagem[];
  nome_cliente?: string | null;
  aguardando_humano?: boolean;
  ia_ativa?: boolean | null;
  estagio?: Conversa["estagio"];
  atualizado_em?: string;
};

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
  const apiKey = requireSupabaseServerKey();

  return {
    apikey: apiKey,
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

export async function buscarConversaPorTelefone(telefone: string): Promise<Conversa | null> {
  const params = new URLSearchParams({
    telefone: `eq.${telefone}`,
    select: "*",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/conversas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  return rows[0] ?? null;
}

export async function upsertConversa(payload: ConversaUpsert): Promise<Conversa> {
  const response = await fetch(supabaseUrl("/conversas?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase upsert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  return rows[0];
}

export async function upsertConversas(payloads: ConversaUpsert[]): Promise<void> {
  if (payloads.length === 0) return;

  // return=minimal: o retorno nao e usado e traria o historico inteiro de volta.
  const response = await fetch(supabaseUrl("/conversas?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(payloads),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase bulk upsert failed (${response.status}): ${errorBody}`);
  }
}

export async function listarConversas(): Promise<Conversa[]> {
  const response = await fetch(supabaseUrl("/conversas?select=*&order=atualizado_em.desc"), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];

  // Contatos bloqueados somem de toda a operacao do CRM (lista, leads derivados de
  // conversa, scan de pagamentos). O filtro em JS tolera o banco sem a coluna
  // ainda (migration nao aplicada): nesse caso bloqueado vem undefined.
  return rows.filter((conversa) => conversa.bloqueado !== true);
}

/*
 * O historico e ~90% do tamanho da tabela conversas. Baixar `select=*` da tabela
 * inteira so para ler telefone/nome estourava o limite de egress do Supabase, entao
 * as funcoes abaixo pedem ao banco apenas as linhas/colunas necessarias.
 * O filtro de bloqueados usa listarTelefonesBloqueados, que tolera o banco sem a
 * coluna `bloqueado` (migration nao aplicada).
 */

export type ConversaContato = Pick<
  Conversa,
  | "id"
  | "telefone"
  | "nome_cliente"
  | "estagio"
  | "aguardando_humano"
  | "ia_ativa"
  | "atualizado_em"
>;

function semBloqueados<T extends { telefone: string }>(rows: T[], bloqueados: Set<string>): T[] {
  if (bloqueados.size === 0) return rows;
  return rows.filter((row) => !bloqueados.has(row.telefone.replace(/\D/g, "")));
}

/** Contatos das conversas, sem historico. */
export async function listarConversasContatos(): Promise<ConversaContato[]> {
  const params = new URLSearchParams({
    select: "id,telefone,nome_cliente,estagio,aguardando_humano,ia_ativa,atualizado_em",
    order: "atualizado_em.desc",
  });
  const [response, bloqueados] = await Promise.all([
    fetch(supabaseUrl(`/conversas?${params}`), { headers: supabaseHeaders() }),
    listarTelefonesBloqueados(),
  ]);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas contatos failed (${response.status}): ${errorBody}`);
  }

  return semBloqueados((await response.json()) as ConversaContato[], bloqueados);
}

/**
 * Uma pagina de conversas com historico, para varreduras em lote. `lidas` e o
 * tamanho da pagina antes de tirar os bloqueados (use para avancar o offset).
 */
export async function listarConversasComHistoricoPagina({
  offset,
  limite,
}: {
  offset: number;
  limite: number;
}): Promise<{ conversas: Conversa[]; lidas: number; total: number }> {
  const params = new URLSearchParams({
    select: "*",
    historico: "neq.[]",
    order: "atualizado_em.desc,id.asc",
    offset: String(offset),
    limit: String(limite),
  });
  const [response, bloqueados] = await Promise.all([
    fetch(supabaseUrl(`/conversas?${params}`), { headers: supabaseHeaders("count=exact") }),
    listarTelefonesBloqueados(),
  ]);

  if (response.status === 416) return { conversas: [], lidas: 0, total: offset };
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas pagina failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  const total = Number(response.headers.get("content-range")?.split("/")[1]);

  return {
    conversas: semBloqueados(rows, bloqueados),
    lidas: rows.length,
    total: Number.isFinite(total) ? total : offset + rows.length,
  };
}

/** Conversas completas apenas dos telefones informados. */
export async function buscarConversasPorTelefones(telefones: string[]): Promise<Conversa[]> {
  const unicos = [...new Set(telefones.filter(Boolean))];
  if (unicos.length === 0) return [];

  const params = new URLSearchParams({
    select: "*",
    telefone: `in.(${unicos.map((telefone) => `"${telefone}"`).join(",")})`,
  });
  const response = await fetch(supabaseUrl(`/conversas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas por telefones failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as Conversa[];
}

/** Conversas completas com IA ativa atualizadas a partir de `desde`. */
export async function listarConversasAtivasDesde(desde: string): Promise<Conversa[]> {
  const params = new URLSearchParams({
    select: "*",
    atualizado_em: `gte.${desde}`,
    ia_ativa: "not.is.false",
    order: "atualizado_em.desc",
  });
  const [response, bloqueados] = await Promise.all([
    fetch(supabaseUrl(`/conversas?${params}`), { headers: supabaseHeaders() }),
    listarTelefonesBloqueados(),
  ]);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas ativas failed (${response.status}): ${errorBody}`);
  }

  return semBloqueados((await response.json()) as Conversa[], bloqueados);
}

export async function listarConversasResumo(): Promise<
  Array<Conversa & { historico_resumido: true }>
> {
  const params = new URLSearchParams({
    select:
      "id,telefone,nome_cliente,ultima_mensagem:historico->-1,aguardando_humano,ia_ativa,estagio,kanban_coluna,criado_em,atualizado_em,lido_ate",
    order: "atualizado_em.desc",
  });
  const response = await fetch(supabaseUrl(`/conversas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas resumo failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Array<
    Omit<Conversa, "historico"> & { ultima_mensagem: Mensagem | null }
  >;
  return rows.map(({ ultima_mensagem, ...conversa }) => ({
    ...conversa,
    historico: ultima_mensagem ? [ultima_mensagem] : [],
    historico_resumido: true as const,
  }));
}

export async function buscarConversaPorId(id: string): Promise<Conversa | null> {
  const params = new URLSearchParams({ id: `eq.${id}`, select: "*", limit: "1" });
  const response = await fetch(supabaseUrl(`/conversas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa detalhe failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  return rows[0] ?? null;
}

type CaudaHistorico = Partial<Record<"m1" | "m2" | "m3" | "m4" | "m5" | "m6", Mensagem | null>>;

/**
 * Polling incremental da tela de Conversas (roda a cada 10s por aba aberta).
 * Devolve so as ultimas 6 mensagens de cada conversa alterada, marcada como
 * historico_resumido; apenas a conversa aberta (`conversaAbertaId`) vem completa.
 */
export async function listarConversasAtualizadasDesde(
  desde: string,
  conversaAbertaId?: string | null,
): Promise<Conversa[]> {
  const params = new URLSearchParams({
    select:
      "id,telefone,nome_cliente,aguardando_humano,ia_ativa,estagio,kanban_coluna,criado_em,atualizado_em,lido_ate," +
      "m6:historico->-6,m5:historico->-5,m4:historico->-4,m3:historico->-3,m2:historico->-2,m1:historico->-1",
    atualizado_em: `gt.${desde}`,
    order: "atualizado_em.asc",
  });
  const [response, bloqueados] = await Promise.all([
    fetch(supabaseUrl(`/conversas?${params}`), { headers: supabaseHeaders() }),
    listarTelefonesBloqueados(),
  ]);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase conversas incremental select failed (${response.status}): ${errorBody}`,
    );
  }

  const rows = (await response.json()) as Array<Omit<Conversa, "historico"> & CaudaHistorico>;
  const conversas: Conversa[] = semBloqueados(rows, bloqueados).map(
    ({ m6, m5, m4, m3, m2, m1, ...conversa }) => ({
      ...conversa,
      historico: [m6, m5, m4, m3, m2, m1].filter((mensagem): mensagem is Mensagem =>
        Boolean(mensagem),
      ),
      historico_resumido: true,
    }),
  );

  const indiceAberta = conversaAbertaId
    ? conversas.findIndex((conversa) => conversa.id === conversaAbertaId)
    : -1;
  if (conversaAbertaId && indiceAberta >= 0) {
    const completa = await buscarConversaPorId(conversaAbertaId);
    if (completa) conversas[indiceAberta] = completa;
  }

  return conversas;
}

/**
 * Telefones bloqueados pelo operador. Usado pela sincronizacao do WhatsApp para
 * nao recriar conversas que ja foram bloqueadas (a listarConversas as esconde, e
 * sem este filtro o sync as traria de volta do historico do WhatsApp).
 */
export async function listarTelefonesBloqueados(): Promise<Set<string>> {
  const response = await fetch(supabaseUrl("/conversas?select=telefone&bloqueado=eq.true"), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) return new Set();

  const rows = (await response.json()) as Array<{ telefone: string }>;
  return new Set(rows.map((row) => row.telefone.replace(/\D/g, "")));
}

export async function definirConversaBloqueada({
  id,
  bloqueado,
}: {
  id: string;
  bloqueado: boolean;
}): Promise<Conversa> {
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({ bloqueado, atualizado_em: new Date().toISOString() }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa bloqueio update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  if (!rows[0]) throw new Error("Conversa nao encontrada");

  return rows[0];
}

/** Lista as conversas bloqueadas para o painel de gerenciamento de bloqueios. */
export async function listarConversasBloqueadas(): Promise<Conversa[]> {
  const response = await fetch(
    supabaseUrl("/conversas?select=*&bloqueado=eq.true&order=atualizado_em.desc"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) return [];

  return (await response.json()) as Conversa[];
}

export async function excluirConversa(id: string): Promise<void> {
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase delete conversa failed (${response.status}): ${errorBody}`);
  }
}

export async function atualizarConversaAguardandoHumano({
  id,
  aguardandoHumano,
  iaAtiva,
}: {
  id: string;
  aguardandoHumano: boolean;
  iaAtiva?: boolean;
}): Promise<Conversa> {
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      aguardando_humano: aguardandoHumano,
      ...(typeof iaAtiva === "boolean" ? { ia_ativa: iaAtiva } : {}),
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  if (!rows[0]) throw new Error("Conversa nao encontrada");

  return rows[0];
}

export async function marcarConversaLida({
  id,
  lidoAte,
}: {
  id: string;
  lidoAte?: string;
}): Promise<{ ok: true; lido_ate: string }> {
  const valor = lidoAte ?? new Date().toISOString();

  // Atualiza apenas lido_ate (sem mexer em atualizado_em para nao reordenar a lista).
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({ lido_ate: valor }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa lido update failed (${response.status}): ${errorBody}`);
  }

  return { ok: true, lido_ate: valor };
}

export async function atualizarConversaPipeline({
  id,
  estagio,
  aguardandoHumano,
  kanbanColuna,
}: {
  id: string;
  estagio: Conversa["estagio"];
  aguardandoHumano: boolean;
  kanbanColuna?: string;
}): Promise<Conversa> {
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      estagio,
      ...(kanbanColuna ? { kanban_coluna: kanbanColuna } : {}),
      aguardando_humano: aguardandoHumano,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa pipeline update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Conversa[];
  if (!rows[0]) throw new Error("Conversa nao encontrada");

  return rows[0];
}

export async function buscarKanbanConfig(): Promise<KanbanColumn[]> {
  const params = new URLSearchParams({
    chave: "eq.whatsapp_kanban_colunas",
    select: "valor",
    limit: "1",
  });
  const response = await fetch(supabaseUrl(`/crm_configuracoes?${params}`), {
    headers: supabaseHeaders(),
  });
  if (!response.ok) return DEFAULT_KANBAN_COLUMNS.map((column) => ({ ...column }));
  const rows = (await response.json()) as Array<{ valor: unknown }>;
  return sanitizeKanbanColumns(rows[0]?.valor);
}

export async function salvarKanbanConfig(value: unknown): Promise<KanbanColumn[]> {
  const columns = sanitizeKanbanColumns(value);
  const response = await fetch(supabaseUrl("/crm_configuracoes?on_conflict=chave"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify({
      chave: "whatsapp_kanban_colunas",
      valor: columns,
      atualizado_em: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase kanban config upsert failed (${response.status}): ${errorBody}`);
  }
  return columns;
}

export async function adicionarMensagemConversa({
  id,
  mensagem,
}: {
  id: string;
  mensagem: Mensagem;
}): Promise<Conversa> {
  const rpcResponse = await fetch(supabaseUrl("/rpc/append_conversa_mensagem"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      conversa_id: id,
      nova_mensagem: mensagem,
    }),
  });

  if (rpcResponse.ok) {
    const rows = (await rpcResponse.json()) as Conversa[];
    if (rows[0]) return rows[0];
  }

  const rpcError = await rpcResponse.text().catch(() => "");
  if (rpcResponse.status !== 404 && !rpcError.includes("append_conversa_mensagem")) {
    throw new Error(`Supabase conversa message append failed (${rpcResponse.status}): ${rpcError}`);
  }

  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
    limit: "1",
  });

  const selectResponse = await fetch(supabaseUrl(`/conversas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(`Supabase conversa select failed (${selectResponse.status}): ${errorBody}`);
  }

  const rows = (await selectResponse.json()) as Conversa[];
  const conversa = rows[0];
  if (!conversa) throw new Error("Conversa nao encontrada");

  const historico = Array.isArray(conversa.historico) ? conversa.historico : [];
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      historico: [...historico, mensagem],
      aguardando_humano: conversa.aguardando_humano,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversa message update failed (${response.status}): ${errorBody}`);
  }

  const updatedRows = (await response.json()) as Conversa[];
  return updatedRows[0];
}

/**
 * Igual a adicionarMensagemConversa, mas pede so o id de volta ao Supabase. Use
 * quando a conversa atualizada nao e usada (resposta da IA, avisos), para nao
 * trafegar o historico inteiro a cada mensagem.
 */
export async function anexarMensagemConversa({
  id,
  mensagem,
}: {
  id: string;
  mensagem: Mensagem;
}): Promise<void> {
  const response = await fetch(supabaseUrl("/rpc/append_conversa_mensagem?select=id"), {
    method: "POST",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({ conversa_id: id, nova_mensagem: mensagem }),
  });

  if (response.ok) return;

  const rpcError = await response.text().catch(() => "");
  if (response.status !== 404 && !rpcError.includes("append_conversa_mensagem")) {
    throw new Error(`Supabase conversa message append failed (${response.status}): ${rpcError}`);
  }

  // Sem a funcao RPC no banco (migration 20260530011632 nao aplicada): le so o
  // historico e grava sem pedir a linha de volta.
  const selectResponse = await fetch(
    supabaseUrl(
      `/conversas?${new URLSearchParams({ id: `eq.${id}`, select: "historico", limit: "1" })}`,
    ),
    { headers: supabaseHeaders() },
  );
  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(`Supabase conversa select failed (${selectResponse.status}): ${errorBody}`);
  }

  const rows = (await selectResponse.json()) as Array<Pick<Conversa, "historico">>;
  if (!rows[0]) throw new Error("Conversa nao encontrada");

  const historico = Array.isArray(rows[0].historico) ? rows[0].historico : [];
  const patchResponse = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=minimal"),
    body: JSON.stringify({
      historico: [...historico, mensagem],
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!patchResponse.ok) {
    const errorBody = await patchResponse.text();
    throw new Error(
      `Supabase conversa message update failed (${patchResponse.status}): ${errorBody}`,
    );
  }
}

export async function buscarIaStatus(): Promise<IaStatus> {
  const params = new URLSearchParams({
    chave: "eq.ia_global_desativada",
    select: "valor",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/crm_configuracoes?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) return { globalDesativada: false };

  const rows = (await response.json()) as Array<{ valor: boolean | null }>;
  return { globalDesativada: rows[0]?.valor === true };
}

export async function definirIaGlobalDesativada(desativada: boolean): Promise<IaStatus> {
  const response = await fetch(supabaseUrl("/crm_configuracoes?on_conflict=chave"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify({
      chave: "ia_global_desativada",
      valor: desativada,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase IA config upsert failed (${response.status}): ${errorBody}`);
  }

  return { globalDesativada: desativada };
}

function isRegraCustomizada(value: unknown): value is IaRegraCustomizada {
  const regra = value as Partial<IaRegraCustomizada>;
  return (
    Boolean(regra) &&
    typeof regra.id === "string" &&
    typeof regra.titulo === "string" &&
    typeof regra.instrucao === "string" &&
    typeof regra.ativa === "boolean"
  );
}

function normalizeIaConfigRow(
  rows: Array<{ chave: string; valor: unknown; atualizado_em?: string | null }>,
): IaPromptConfig {
  const promptRow = rows.find((row) => row.chave === "ia_system_prompt");
  const regrasRow = rows.find((row) => row.chave === "ia_regras_customizadas");
  const systemPrompt =
    typeof promptRow?.valor === "string" && promptRow.valor.trim()
      ? promptRow.valor
      : BASE_SYSTEM_PROMPT;
  const regras = Array.isArray(regrasRow?.valor) ? regrasRow.valor.filter(isRegraCustomizada) : [];

  return {
    systemPrompt,
    regras,
    atualizadoEm: promptRow?.atualizado_em ?? regrasRow?.atualizado_em ?? undefined,
  };
}

export async function buscarIaPromptConfig(): Promise<IaPromptConfig> {
  const params = new URLSearchParams({
    chave: "in.(ia_system_prompt,ia_regras_customizadas)",
    select: "chave,valor,atualizado_em",
  });

  const response = await fetch(supabaseUrl(`/crm_configuracoes?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    return { systemPrompt: BASE_SYSTEM_PROMPT, regras: [] };
  }

  const rows = (await response.json()) as Array<{
    chave: string;
    valor: unknown;
    atualizado_em?: string | null;
  }>;
  return normalizeIaConfigRow(rows);
}

export async function salvarIaPromptConfig(
  input: Pick<IaPromptConfig, "systemPrompt" | "regras">,
): Promise<IaPromptConfig> {
  const regras = input.regras.filter(isRegraCustomizada).map((regra) => ({
    id: regra.id,
    titulo: regra.titulo.slice(0, 80),
    instrucao: regra.instrucao.slice(0, 1000),
    ativa: regra.ativa,
  }));
  const atualizadoEm = new Date().toISOString();

  const response = await fetch(supabaseUrl("/crm_configuracoes?on_conflict=chave"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([
      {
        chave: "ia_system_prompt",
        valor: input.systemPrompt.trim() || BASE_SYSTEM_PROMPT,
        atualizado_em: atualizadoEm,
      },
      {
        chave: "ia_regras_customizadas",
        valor: regras,
        atualizado_em: atualizadoEm,
      },
    ]),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase IA prompt config upsert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as Array<{
    chave: string;
    valor: unknown;
    atualizado_em?: string | null;
  }>;
  return normalizeIaConfigRow(rows);
}

export async function buscarClientePorTelefone(telefone: string): Promise<ClienteCadastro | null> {
  const params = new URLSearchParams({
    telefone: `eq.${telefone}`,
    select: "id,nome,telefone,endereco,bairro,pets,total_gasto,lucro_liquido,pedidos",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/clientes?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ClienteCadastro[];
  return rows[0] ?? null;
}

function normalizarListaPets(pets: string[] | null | undefined): string[] {
  if (!pets) return [];

  const unicos = new Map<string, string>();

  for (const pet of pets) {
    for (const nomePet of pet.split(",")) {
      const nome = nomePet.trim();
      if (!nome) continue;
      unicos.set(nome.toLowerCase(), nome);
    }
  }

  return Array.from(unicos.values());
}

function mesclarPetsCliente(
  atuais: string[] | null | undefined,
  novos: string[] | null | undefined,
): string[] {
  return normalizarListaPets([...(atuais ?? []), ...(novos ?? [])]);
}

export async function salvarCadastroCliente({
  telefone,
  nome,
  endereco,
  bairro,
  pets,
  origem = "WhatsApp IA",
}: {
  telefone: string;
  nome?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  pets?: string[] | null;
  origem?: string;
}): Promise<ClienteCadastro> {
  const cliente = await buscarClientePorTelefone(telefone);
  const payload: Record<string, unknown> = {
    origem,
    ultima: "hoje",
    atualizado_em: new Date().toISOString(),
  };
  const petsNormalizados = normalizarListaPets(pets);

  if (nome) payload.nome = nome;
  if (endereco) payload.endereco = endereco;
  if (bairro) payload.bairro = bairro;
  if (petsNormalizados.length > 0) {
    payload.pets = cliente ? mesclarPetsCliente(cliente.pets, petsNormalizados) : petsNormalizados;
  }

  if (cliente) {
    const response = await fetch(
      supabaseUrl(`/clientes?telefone=eq.${encodeURIComponent(telefone)}`),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Supabase cliente update failed (${response.status}): ${errorBody}`);
    }

    const rows = (await response.json()) as ClienteCadastro[];
    const atualizado = rows[0] ?? { ...cliente, ...payload };
    await registrarLeadTotal({
      id: atualizado.id,
      nome: atualizado.nome,
      telefone: atualizado.telefone,
      endereco: atualizado.endereco ?? "",
      bairro: atualizado.bairro ?? "",
      pets: atualizado.pets ?? [],
      origem,
      ultima: "hoje",
      totalGasto: atualizado.total_gasto ?? 0,
      lucroLiquido: atualizado.lucro_liquido ?? 0,
      pedidos: atualizado.pedidos ?? 0,
    });

    return atualizado;
  }

  const response = await fetch(supabaseUrl("/clientes?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify({
      nome: nome || `Cliente ${telefone.slice(-4)}`,
      telefone,
      origem,
      ultima: "hoje",
      atualizado_em: new Date().toISOString(),
      ...(endereco ? { endereco } : {}),
      ...(bairro ? { bairro } : {}),
      ...(petsNormalizados.length > 0 ? { pets: petsNormalizados } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente insert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ClienteCadastro[];
  if (rows[0]) {
    await registrarLeadTotal({
      id: rows[0].id,
      nome: rows[0].nome,
      telefone: rows[0].telefone,
      endereco: rows[0].endereco ?? "",
      bairro: rows[0].bairro ?? "",
      pets: rows[0].pets ?? [],
      origem,
      ultima: "hoje",
      totalGasto: rows[0].total_gasto ?? 0,
      lucroLiquido: rows[0].lucro_liquido ?? 0,
      pedidos: rows[0].pedidos ?? 0,
    });
  }

  return rows[0];
}

export async function salvarCadastrosClientesBasicos(
  inputs: Array<{ telefone: string; nome?: string | null; origem?: string }>,
): Promise<ClienteCadastro[]> {
  const payload = inputs
    .map((input) => ({
      telefone: input.telefone.replace(/\D/g, ""),
      nome: input.nome?.trim(),
      origem: input.origem?.trim() || "WhatsApp IA",
    }))
    .filter((input) => input.telefone.length >= 8)
    .map((input) => ({
      telefone: input.telefone,
      nome: input.nome || `Cliente ${input.telefone.slice(-4)}`,
      origem: input.origem,
      ultima: "hoje",
      atualizado_em: new Date().toISOString(),
    }));

  if (payload.length === 0) return [];

  const response = await fetch(supabaseUrl("/clientes?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase clientes bulk upsert failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as ClienteCadastro[];
}

type ProdutoRow = {
  sku: string;
  nome: string;
  estoque: number | null;
  preco: number | null;
  preco_compra: number | null;
};

type ClienteRow = {
  id: string;
  nome: string;
  telefone: string;
  endereco?: string | null;
  bairro?: string | null;
  pets?: string[] | null;
  total_gasto: number | null;
  lucro_liquido: number | null;
  pedidos: number | null;
};

type VendaPedidoRow = {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  pet_nome: string | null;
  total: number | null;
  taxa_maquininha: number | null;
  forma_pagamento: string | null;
  status_pagamento: string | null;
  status: string | null;
  processo: PedidoProcesso | null;
  observacao: string | null;
  criado_em: string;
};

type VendaFaturamentoRow = {
  id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  telefone: string | null;
  total: number | null;
  lucro: number | null;
  status_pagamento: string | null;
  faturado_em: string | null;
};

type VendaDuplicadaRow = {
  id: string;
  criado_em: string;
};

type VendaItemRow = {
  id: string;
  venda_id: string;
  sku: string;
  nome: string;
  quantidade: number;
  preco: number;
  preco_compra: number;
  pet_nome: string | null;
  estoque_baixado: boolean;
};

type VendaItemPetRow = {
  venda_id: string;
  pet_nome: string | null;
};

export type ProdutoCrmResumo = ProdutoPedido & {
  estoque: number;
};

export type ProdutoProcurado = {
  id: string;
  termo: string;
  telefone: string | null;
  nome_cliente: string | null;
  contexto: string | null;
  vezes: number;
  status: string;
  criado_em: string;
  atualizado_em: string;
};

export type ClienteCadastro = ClienteRow & {
  endereco: string | null;
  bairro: string | null;
  pets: string[] | null;
};

function mapProcessoVenda(row: VendaPedidoRow): PedidoProcesso {
  if (row.status === "cancelada" || row.processo === "cancelado") return "cancelado";
  if (row.processo) return row.processo;
  if (row.status_pagamento === "pago") return "pago";
  return "novo";
}

function formatHoraPedido(criadoEm: string): string {
  return new Date(criadoEm).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDataPedido(criadoEm: string): string {
  return new Date(criadoEm).toLocaleDateString("pt-BR");
}

function resumoPedido(observacao: string | null): string {
  if (!observacao) return "Pedido registrado";
  return observacao.replace(/^Pedido WhatsApp IA:\s*/i, "").trim() || "Pedido registrado";
}

function primeiroPetDosItens(itens: ProdutoPedido[]): string | null {
  for (const item of itens) {
    const pet = item.petNome?.trim();
    if (pet) return pet;
  }

  return null;
}

function petNomesTexto(valor: string | null | undefined): string[] {
  return Array.from(
    new Set(
      (valor ?? "")
        .split(",")
        .map((nome) => nome.trim())
        .filter(Boolean),
    ),
  );
}

function petNomesPedido(pet: string | null | undefined, itens: ProdutoPedido[]): string[] {
  return Array.from(
    new Set([...petNomesTexto(pet), ...itens.flatMap((item) => petNomesTexto(item.petNome))]),
  );
}

function deduplicarVendasRecentes(vendas: VendaPedidoRow[]): VendaPedidoRow[] {
  const vistas = new Map<string, number>();
  const janelaDuplicidadeMs = 60 * 60 * 1000;

  return vendas.filter((venda) => {
    const criadoEm = new Date(venda.criado_em).getTime();
    const chave = [
      venda.telefone ?? "",
      venda.total ?? 0,
      venda.observacao ?? "",
      venda.status_pagamento ?? "",
    ].join("|");
    const ultimaVista = vistas.get(chave);

    if (ultimaVista && Math.abs(ultimaVista - criadoEm) <= janelaDuplicidadeMs) {
      return false;
    }

    vistas.set(chave, criadoEm);
    return true;
  });
}

async function buscarClientesCadastro(): Promise<ClienteCadastro[]> {
  const response = await fetch(
    supabaseUrl("/clientes?select=id,nome,telefone,endereco,bairro,pets&order=nome.asc"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase clientes select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as ClienteCadastro[];
}

async function listarPetsItensPorVenda(vendaIds: string[]): Promise<Map<string, string[]>> {
  if (vendaIds.length === 0) return new Map();

  const params = new URLSearchParams({
    venda_id: `in.(${vendaIds.map((id) => `"${id}"`).join(",")})`,
    pet_nome: "not.is.null",
    select: "venda_id,pet_nome",
  });

  const response = await fetch(supabaseUrl(`/venda_itens?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (/pet_nome|PGRST204|PGRST205|relation .* does not exist/i.test(errorBody)) {
      return new Map();
    }

    throw new Error(`Supabase venda_itens pets select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaItemPetRow[];
  const petsPorVenda = new Map<string, string[]>();
  const vistosPorVenda = new Map<string, Set<string>>();

  for (const row of rows) {
    const pet = row.pet_nome?.trim();
    if (!pet) continue;

    const vistos = vistosPorVenda.get(row.venda_id) ?? new Set<string>();
    const chave = pet.toLowerCase();
    if (vistos.has(chave)) continue;

    vistos.add(chave);
    vistosPorVenda.set(row.venda_id, vistos);
    petsPorVenda.set(row.venda_id, [...(petsPorVenda.get(row.venda_id) ?? []), pet]);
  }

  return petsPorVenda;
}

export type ResumoFinanceiroTelefone = {
  totalGasto: number;
  lucroLiquido: number;
  totalDescontos: number;
  ticketMedio: number;
  pedidos: number;
};

type VendaResumoRow = {
  telefone: string | null;
  total: number | null;
  lucro: number | null;
  desconto_cupom: number | null;
  status_pagamento: string | null;
  status: string | null;
};

/**
 * Agrega, por telefone, todas as vendas que a IA registrou (exceto canceladas):
 * total gasto, lucro, descontos, nº de pedidos e ticket médio. Diferente dos
 * acumulados gravados na ficha do cliente (que só contam venda paga/faturada),
 * isto reflete tudo que foi registrado na conversa, pago ou pendente.
 */
export async function resumoFinanceiroPorTelefone(): Promise<
  Map<string, ResumoFinanceiroTelefone>
> {
  const response = await fetch(
    supabaseUrl("/vendas?select=telefone,total,lucro,desconto_cupom,status_pagamento,status"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase resumo financeiro select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaResumoRow[];
  const mapa = new Map<string, ResumoFinanceiroTelefone>();

  for (const row of rows) {
    if (row.status === "cancelada") continue;

    const telefone = (row.telefone ?? "").replace(/\D/g, "");
    if (!telefone) continue;

    const atual = mapa.get(telefone) ?? {
      totalGasto: 0,
      lucroLiquido: 0,
      totalDescontos: 0,
      ticketMedio: 0,
      pedidos: 0,
    };
    atual.totalGasto += Number(row.total ?? 0);
    atual.lucroLiquido += Number(row.lucro ?? 0);
    atual.totalDescontos += Number(row.desconto_cupom ?? 0);
    atual.pedidos += 1;
    mapa.set(telefone, atual);
  }

  for (const resumo of mapa.values()) {
    resumo.ticketMedio = resumo.pedidos > 0 ? resumo.totalGasto / resumo.pedidos : 0;
  }

  return mapa;
}

export async function listarPedidos(options: { desde?: Date } = {}): Promise<PedidoCrm[]> {
  const params = new URLSearchParams({
    select:
      "id,cliente_id,cliente_nome,telefone,pet_nome,total,taxa_maquininha,forma_pagamento,status_pagamento,status,processo,observacao,criado_em",
    order: "criado_em.desc",
  });
  if (options.desde) params.set("criado_em", `gte.${options.desde.toISOString()}`);

  const fallbackParams = new URLSearchParams({
    select:
      "id,cliente_id,cliente_nome,telefone,total,forma_pagamento,status_pagamento,status,processo,observacao,criado_em",
    order: "criado_em.desc",
  });
  if (options.desde) fallbackParams.set("criado_em", `gte.${options.desde.toISOString()}`);

  const [vendas, clientes] = await Promise.all([
    (async () => {
      let response = await fetch(supabaseUrl(`/vendas?${params}`), { headers: supabaseHeaders() });

      if (!response.ok) {
        const errorBody = await response.text();
        if (errorBody.includes("pet_nome") || errorBody.includes("taxa_maquininha")) {
          response = await fetch(supabaseUrl(`/vendas?${fallbackParams}`), {
            headers: supabaseHeaders(),
          });

          if (response.ok) {
            const rows = (await response.json()) as Array<
              Omit<VendaPedidoRow, "pet_nome" | "taxa_maquininha">
            >;
            return rows.map((row) => ({ ...row, pet_nome: null, taxa_maquininha: 0 }));
          }
        }
        throw new Error(`Supabase vendas select failed (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as VendaPedidoRow[];
    })(),
    buscarClientesCadastro(),
  ]);

  const clientesPorId = new Map(clientes.map((cliente) => [cliente.id, cliente]));
  const clientesPorTelefone = new Map(clientes.map((cliente) => [cliente.telefone, cliente]));
  const petsPorVenda = await listarPetsItensPorVenda(vendas.map((venda) => venda.id));

  return deduplicarVendasRecentes(vendas).map((venda) => {
    const cliente =
      (venda.cliente_id ? clientesPorId.get(venda.cliente_id) : undefined) ??
      (venda.telefone ? clientesPorTelefone.get(venda.telefone) : undefined);
    const petsItens = petsPorVenda.get(venda.id);
    const petResumo = petsItens?.length ? petsItens.join(", ") : null;

    return {
      id: venda.id,
      cliente: venda.cliente_nome ?? cliente?.nome ?? venda.telefone ?? "Cliente",
      telefone: venda.telefone ?? cliente?.telefone ?? "",
      pet: petResumo ?? venda.pet_nome ?? cliente?.pets?.[0] ?? resumoPedido(venda.observacao),
      bairro: cliente?.bairro ?? cliente?.endereco ?? "Entrega a confirmar",
      total: venda.total ?? 0,
      hora: formatHoraPedido(venda.criado_em),
      data: formatDataPedido(venda.criado_em),
      criadoEm: venda.criado_em,
      status: mapProcessoVenda(venda),
      pagamento: venda.forma_pagamento ?? "A combinar",
      statusPagamento: venda.status_pagamento ?? "pendente",
      observacao: venda.observacao ?? "",
      taxaMaquina: Number(venda.taxa_maquininha ?? 0),
    };
  });
}

async function buscarPedidoPorId(id: string): Promise<PedidoCrm | null> {
  let response = await fetch(
    supabaseUrl(
      `/vendas?id=eq.${encodeURIComponent(
        id,
      )}&select=id,cliente_id,cliente_nome,telefone,pet_nome,total,taxa_maquininha,forma_pagamento,status_pagamento,status,processo,observacao,criado_em&limit=1`,
    ),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("pet_nome") || errorBody.includes("taxa_maquininha")) {
      response = await fetch(
        supabaseUrl(
          `/vendas?id=eq.${encodeURIComponent(
            id,
          )}&select=id,cliente_id,cliente_nome,telefone,total,forma_pagamento,status_pagamento,status,processo,observacao,criado_em&limit=1`,
        ),
        { headers: supabaseHeaders() },
      );

      if (!response.ok) {
        const retryErrorBody = await response.text();
        throw new Error(`Supabase venda select failed (${response.status}): ${retryErrorBody}`);
      }

      const rows = (await response.json()) as Array<
        Omit<VendaPedidoRow, "pet_nome" | "taxa_maquininha">
      >;
      const venda = rows[0] ? { ...rows[0], pet_nome: null, taxa_maquininha: 0 } : null;
      return venda ? mapPedidoVenda(venda) : null;
    }

    throw new Error(`Supabase venda select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaPedidoRow[];
  return rows[0] ? mapPedidoVenda(rows[0]) : null;
}

async function mapPedidoVenda(venda: VendaPedidoRow): Promise<PedidoCrm> {
  const [clientes, petsPorVenda] = await Promise.all([
    buscarClientesCadastro(),
    listarPetsItensPorVenda([venda.id]),
  ]);
  const clientesPorId = new Map(clientes.map((cliente) => [cliente.id, cliente]));
  const clientesPorTelefone = new Map(clientes.map((cliente) => [cliente.telefone, cliente]));
  const cliente =
    (venda.cliente_id ? clientesPorId.get(venda.cliente_id) : undefined) ??
    (venda.telefone ? clientesPorTelefone.get(venda.telefone) : undefined);
  const petsItens = petsPorVenda.get(venda.id);
  const petResumo = petsItens?.length ? petsItens.join(", ") : null;

  return {
    id: venda.id,
    cliente: venda.cliente_nome ?? cliente?.nome ?? venda.telefone ?? "Cliente",
    telefone: venda.telefone ?? cliente?.telefone ?? "",
    pet: petResumo ?? venda.pet_nome ?? cliente?.pets?.[0] ?? resumoPedido(venda.observacao),
    bairro: cliente?.bairro ?? cliente?.endereco ?? "Entrega a confirmar",
    total: venda.total ?? 0,
    hora: formatHoraPedido(venda.criado_em),
    data: formatDataPedido(venda.criado_em),
    criadoEm: venda.criado_em,
    status: mapProcessoVenda(venda),
    pagamento: venda.forma_pagamento ?? "A combinar",
    statusPagamento: venda.status_pagamento ?? "pendente",
    observacao: venda.observacao ?? "",
    taxaMaquina: Number(venda.taxa_maquininha ?? 0),
  };
}

export async function atualizarProcessoPedido(
  id: string,
  processo: PedidoProcesso,
  options: { formaPagamento?: string | null } = {},
): Promise<PedidoCrm> {
  if (processo === "cancelado") {
    await cancelarVendaComEstorno(id);

    const pedido = await buscarPedidoPorId(id);
    if (!pedido) throw new Error("Pedido nao encontrado apos cancelamento");

    return pedido;
  }

  const payload: Record<string, unknown> = {
    processo,
    atualizado_em: new Date().toISOString(),
  };

  payload.status = "concluida";
  if (options.formaPagamento !== undefined) {
    payload.forma_pagamento = options.formaPagamento?.trim() || null;
  }

  if (processo === "pago") {
    await registrarFaturamentoPedidoPago(id);
  }

  const response = await fetch(supabaseUrl(`/vendas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda update failed (${response.status}): ${errorBody}`);
  }

  const pedido = await buscarPedidoPorId(id);
  if (!pedido) throw new Error("Pedido nao encontrado apos atualizacao");

  return pedido;
}

export async function editarPedidoManual({
  id,
  nome,
  telefone,
  total,
  formaPagamento,
  observacao,
  bairro,
  pet,
  pago,
  criadoEm,
}: {
  id: string;
  nome: string;
  telefone?: string | null;
  total: number;
  formaPagamento?: string | null;
  observacao?: string | null;
  bairro?: string | null;
  pet?: string | null;
  pago?: boolean;
  criadoEm?: string | null;
}): Promise<PedidoCrm> {
  const nomeLimpo = nome.trim();
  const telefoneLimpo = telefone?.replace(/\D/g, "") ?? "";
  if (!nomeLimpo || !Number.isFinite(total) || total <= 0) {
    throw new Error("Nome e total valido sao obrigatorios");
  }

  const vendaAtualResponse = await fetch(
    supabaseUrl(
      `/vendas?id=eq.${encodeURIComponent(id)}&select=id,cliente_id,telefone,status_pagamento,faturado_em,processo`,
    ),
    { headers: supabaseHeaders() },
  );
  if (!vendaAtualResponse.ok) {
    const errorBody = await vendaAtualResponse.text();
    throw new Error(`Supabase venda select failed (${vendaAtualResponse.status}): ${errorBody}`);
  }

  const vendaAtual = (
    (await vendaAtualResponse.json()) as Array<{
      id: string;
      cliente_id: string | null;
      telefone: string | null;
      status_pagamento: string | null;
      faturado_em?: string | null;
      processo: PedidoProcesso | null;
    }>
  )[0];
  if (!vendaAtual) throw new Error("Pedido nao encontrado");

  const cliente =
    telefoneLimpo.length >= 8
      ? await buscarOuCriarCliente(telefoneLimpo, nomeLimpo, "CRM manual")
      : vendaAtual.cliente_id
        ? await buscarClientePorId(vendaAtual.cliente_id)
        : null;

  if (cliente && (bairro?.trim() || pet?.trim() || cliente.nome !== nomeLimpo)) {
    await salvarCadastroCliente({
      telefone: cliente.telefone,
      nome: nomeLimpo,
      bairro,
      pets: pet?.trim() ? [pet.trim()] : undefined,
      origem: "CRM manual",
    });
  }

  const payload: Record<string, unknown> = {
    cliente_id: cliente?.id ?? vendaAtual.cliente_id,
    cliente_nome: nomeLimpo,
    telefone: telefoneLimpo.length >= 8 ? telefoneLimpo : vendaAtual.telefone,
    pet_nome: pet?.trim() || null,
    total,
    forma_pagamento: formaPagamento?.trim() || null,
    observacao: observacao?.trim() || "Pedido manual do CRM",
    atualizado_em: new Date().toISOString(),
  };

  const dataCustom = criadoEm ? new Date(criadoEm) : null;
  const dataCustomIso =
    dataCustom && !Number.isNaN(dataCustom.getTime()) ? dataCustom.toISOString() : null;
  if (dataCustomIso) {
    payload.criado_em = dataCustomIso;
    if (pago === true || vendaAtual.status_pagamento === "pago") {
      payload.faturado_em = dataCustomIso;
    }
  }

  if (pago === true && vendaAtual.status_pagamento !== "pago") {
    payload.processo = "pago";
  } else if (pago === false && vendaAtual.status_pagamento === "pago" && !vendaAtual.faturado_em) {
    payload.status_pagamento = "pendente";
    payload.processo = vendaAtual.processo === "pago" ? "novo" : vendaAtual.processo;
  }

  let response = await fetch(supabaseUrl(`/vendas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("pet_nome") || errorBody.includes("faturado_em")) {
      if (errorBody.includes("pet_nome")) delete payload.pet_nome;
      if (errorBody.includes("faturado_em")) delete payload.faturado_em;
      response = await fetch(supabaseUrl(`/vendas?id=eq.${encodeURIComponent(id)}`), {
        method: "PATCH",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        // Pedido salvo em banco ainda sem a migration pet_nome aplicada.
      } else {
        const retryErrorBody = await response.text();
        throw new Error(`Supabase venda edit failed (${response.status}): ${retryErrorBody}`);
      }
    } else {
      throw new Error(`Supabase venda edit failed (${response.status}): ${errorBody}`);
    }
  }

  if (pago === true && vendaAtual.status_pagamento !== "pago") {
    await registrarFaturamentoPedidoPago(id, { faturadoEm: dataCustomIso });
  }

  const pedido = await buscarPedidoPorId(id);
  if (!pedido) throw new Error("Pedido nao encontrado apos edicao");

  return pedido;
}

export async function apagarPedidoManual(id: string): Promise<void> {
  await cancelarVendaComEstorno(id);
  await requestSupabase(`/pedidos?venda_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await requestSupabase(`/venda_itens?venda_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await requestSupabase(`/vendas?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function criarPedidoManual({
  nome,
  telefone,
  total,
  totalBruto,
  descontoPercentual,
  descontoValor,
  taxaMaquininha,
  formaPagamento,
  observacao,
  bairro,
  pet,
  itens = [],
  pago = false,
  cupomCodigo,
  criadoEm,
  vendaOrigem,
}: {
  nome: string;
  telefone: string;
  total: number;
  totalBruto?: number;
  descontoPercentual?: number;
  descontoValor?: number;
  taxaMaquininha?: number;
  formaPagamento?: string | null;
  observacao?: string | null;
  bairro?: string | null;
  pet?: string | null;
  itens?: ProdutoPedido[];
  pago?: boolean;
  cupomCodigo?: string | null;
  criadoEm?: string | null;
  vendaOrigem?: string | null;
}): Promise<PedidoCrm> {
  const telefoneLimpo = telefone.replace(/\D/g, "");
  const itensValidos = itens.filter(
    (item) =>
      item.sku.trim().toLowerCase() !== "avulso" &&
      item.nome.trim().length > 0 &&
      item.quantidade > 0 &&
      Number.isFinite(item.preco) &&
      Number.isFinite(item.precoCompra),
  );
  const cliente = await buscarOuCriarCliente(telefoneLimpo, nome, "CRM manual");
  const cupomAplicado = cupomCodigo ? await validarCupom(cupomCodigo, total) : null;
  const descontoManual = normalizarDescontoManual({
    total,
    totalBruto,
    descontoPercentual,
    descontoValor,
  });
  const totalFinal = cupomAplicado?.totalFinal ?? total;
  const taxaMaquininhaFinal = normalizarTaxaMaquininha(totalFinal, taxaMaquininha);
  const lucro =
    totalFinal -
    itensValidos.reduce((custo, item) => custo + item.precoCompra * item.quantidade, 0) -
    taxaMaquininhaFinal;
  const petsPedido = petNomesPedido(pet, itensValidos);
  const petPedido = petsPedido.join(", ") || primeiroPetDosItens(itensValidos);

  if (bairro?.trim() || petPedido || (nome.trim() && cliente.nome !== nome.trim())) {
    await salvarCadastroCliente({
      telefone: telefoneLimpo,
      nome,
      bairro,
      pets: petsPedido.length > 0 ? petsPedido : petPedido ? [petPedido] : undefined,
      origem: "CRM manual",
    });
  }

  const vendaPayload: Record<string, unknown> = {
    cliente_id: cliente.id,
    cliente_nome: nome.trim(),
    telefone: telefoneLimpo,
    pet_nome: petPedido || null,
    total: totalFinal,
    taxa_maquininha: taxaMaquininhaFinal,
    lucro,
    forma_pagamento: formaPagamento?.trim() || null,
    status_pagamento: "pendente",
    status: "concluida",
    processo: "novo",
    observacao: observacao?.trim() || "Pedido manual do CRM",
  };

  if (vendaOrigem?.trim()) {
    vendaPayload.venda_origem = vendaOrigem.trim();
  }

  if (criadoEm) {
    const dataCustom = new Date(criadoEm);
    if (!Number.isNaN(dataCustom.getTime())) {
      vendaPayload.criado_em = dataCustom.toISOString();
    }
  }

  if (cupomAplicado) {
    Object.assign(vendaPayload, vendaCupomPayload(cupomAplicado));
  } else if (descontoManual) {
    Object.assign(vendaPayload, vendaDescontoManualPayload(descontoManual));
  }

  let response = await fetch(supabaseUrl("/vendas"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(vendaPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (removerCamposVendaNaoSuportados(vendaPayload, errorBody)) {
      response = await fetch(supabaseUrl("/vendas"), {
        method: "POST",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify(vendaPayload),
      });

      if (response.ok) {
        // Pedido salvo em banco ainda sem a migration pet_nome aplicada.
      } else {
        const retryErrorBody = await response.text();
        throw new Error(
          `Supabase venda manual insert failed (${response.status}): ${retryErrorBody}`,
        );
      }
    } else {
      throw new Error(`Supabase venda manual insert failed (${response.status}): ${errorBody}`);
    }
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  const vendaId = rows[0]?.id;
  if (!vendaId) throw new Error("Pedido manual criado sem id");

  try {
    await salvarItensVenda(vendaId, itensValidos);
    await recalcularRecompraVenda(vendaId).catch((error) => {
      console.error("[recompra] erro_recalcular_pedido_manual", error);
    });
    if (cupomAplicado) {
      await registrarUsoCupom(cupomAplicado.cupom);
      await registrarComissaoVenda(vendaId);
    }
    if (pago)
      await registrarFaturamentoPedidoPago(vendaId, {
        faturadoEm: vendaPayload.criado_em as string | undefined,
      });
  } catch (error) {
    await requestSupabase(`/venda_itens?venda_id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await requestSupabase(`/vendas?id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);

    throw error;
  }

  const pedido = await buscarPedidoPorId(vendaId);
  if (!pedido) throw new Error("Pedido manual nao encontrado apos criacao");

  return pedido;
}

function vendaCupomPayload(cupomAplicado: CupomAplicado): Record<string, unknown> {
  return {
    cupom_id: cupomAplicado.cupom.id,
    influenciador_id: cupomAplicado.cupom.influenciador_id,
    cupom_codigo: cupomAplicado.cupom.codigo,
    desconto_cupom: cupomAplicado.desconto,
    total_bruto: cupomAplicado.totalBruto,
  };
}

type DescontoManualVenda = {
  totalBruto: number;
  desconto: number;
};

function normalizarDescontoManual({
  total,
  totalBruto,
  descontoPercentual,
  descontoValor,
}: {
  total: number;
  totalBruto?: number;
  descontoPercentual?: number;
  descontoValor?: number;
}): DescontoManualVenda | null {
  const bruto = Number.isFinite(totalBruto) && totalBruto !== undefined ? totalBruto : total;
  const desconto =
    Number.isFinite(descontoValor) && descontoValor !== undefined ? descontoValor : 0;
  const percentual =
    Number.isFinite(descontoPercentual) && descontoPercentual !== undefined
      ? descontoPercentual
      : bruto > 0
        ? (desconto / bruto) * 100
        : 0;

  if (bruto <= 0 || desconto <= 0) return null;
  if (desconto < 0 || desconto > bruto) {
    throw new Error("Desconto invalido para o total da venda");
  }
  if (percentual < 0 || percentual > 100) {
    throw new Error("Percentual de desconto invalido");
  }

  const totalEsperado = Math.round((bruto - desconto) * 100) / 100;
  if (Math.abs(totalEsperado - total) > 0.05) {
    throw new Error("Total da venda nao bate com o desconto informado");
  }

  return {
    totalBruto: Math.round(bruto * 100) / 100,
    desconto: Math.round(desconto * 100) / 100,
  };
}

function vendaDescontoManualPayload(desconto: DescontoManualVenda): Record<string, unknown> {
  return {
    desconto_cupom: desconto.desconto,
    total_bruto: desconto.totalBruto,
  };
}

function normalizarTaxaMaquininha(total: number, taxaMaquininha?: number): number {
  if (!Number.isFinite(taxaMaquininha) || taxaMaquininha === undefined) return 0;
  if (taxaMaquininha < 0) {
    throw new Error("Taxa da maquininha invalida");
  }
  if (taxaMaquininha > total) {
    throw new Error("Taxa da maquininha maior que o total da venda");
  }

  return Math.round(taxaMaquininha * 100) / 100;
}

function removerCamposVendaNaoSuportados(
  vendaPayload: Record<string, unknown>,
  errorBody: string,
): boolean {
  let alterou = false;
  const camposRemover = new Set<string>();

  if (errorBody.includes("pet_nome")) camposRemover.add("pet_nome");
  if (errorBody.includes("taxa_maquininha")) camposRemover.add("taxa_maquininha");
  if (errorBody.includes("venda_origem")) camposRemover.add("venda_origem");
  if (
    errorBody.includes("cupom_id") ||
    errorBody.includes("influenciador_id") ||
    errorBody.includes("cupom_codigo")
  ) {
    camposRemover.add("cupom_id");
    camposRemover.add("influenciador_id");
    camposRemover.add("cupom_codigo");
  }
  if (errorBody.includes("desconto_cupom") || errorBody.includes("total_bruto")) {
    camposRemover.add("desconto_cupom");
    camposRemover.add("total_bruto");
  }

  for (const campo of camposRemover) {
    if (campo in vendaPayload) {
      delete vendaPayload[campo];
      alterou = true;
    }
  }

  return alterou;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dinheiroFromTexto(value: string): number | null {
  const match = value.match(/R\$\s*(\d{1,4}(?:\.\d{3})*,\d{2})/i);

  if (!match) return null;

  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

function quantidadeFromTexto(value: string): number {
  const quantidadeMarcador = value.match(/\bquantidade\s*=\s*["']?(\d{1,2})["']?/i);
  if (quantidadeMarcador) return Math.max(1, Number(quantidadeMarcador[1]));

  const match = value.match(/\b(\d{1,2})\s*(?:x|un|unidade|unidades|pacote|pacotes)?\b/i);

  if (!match) return 1;

  return Math.max(1, Number(match[1]));
}

function produtosMarcadosNoPedido(value: string): string[] {
  return Array.from(value.matchAll(/\bproduto\s*=\s*"([^"]+)"/gi))
    .map((match) => match[1]?.trim())
    .filter((produto): produto is string => Boolean(produto));
}

function scoreProdutoPorTexto(produto: ProdutoRow, textoNormalizado: string): number {
  const nome = normalizeText(produto.nome);
  const termos = nome.split(/\s+/).filter((termo) => termo.length >= 4);
  const score = termos.filter((termo) => textoNormalizado.includes(termo)).length;

  return textoNormalizado.includes(nome) ? score + 10 : score;
}

export async function buscarProdutosPorTexto(texto: string): Promise<ProdutoPedido[]> {
  const response = await fetch(
    supabaseUrl("/produtos?select=sku,nome,estoque,preco,preco_compra&order=nome.asc"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produtos select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ProdutoRow[];
  const textoNormalizado = normalizeText(texto);
  const quantidade = quantidadeFromTexto(texto);
  const precoInformado = dinheiroFromTexto(texto);
  const marcadoresProduto = produtosMarcadosNoPedido(texto);

  if (marcadoresProduto.length > 0) {
    const itens = marcadoresProduto.flatMap((produtoMarcado) => {
      const marcadoNormalizado = normalizeText(produtoMarcado);
      const produto = rows
        .map((row) => ({ produto: row, score: scoreProdutoPorTexto(row, marcadoNormalizado) }))
        .filter(({ score }) => score >= 2)
        .sort((a, b) => b.score - a.score)[0]?.produto;

      if (!produto) return [];

      return [
        {
          sku: produto.sku,
          nome: produto.nome,
          quantidade,
          preco: precoInformado ?? produto.preco ?? 0,
          precoCompra: produto.preco_compra ?? 0,
        },
      ];
    });

    return Array.from(new Map(itens.map((item) => [item.sku, item])).values());
  }

  return rows
    .map((produto) => {
      return { produto, score: scoreProdutoPorTexto(produto, textoNormalizado) };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1)
    .map(({ produto }) => ({
      sku: produto.sku,
      nome: produto.nome,
      quantidade,
      preco: precoInformado ?? produto.preco ?? 0,
      precoCompra: produto.preco_compra ?? 0,
    }));
}

export async function buscarProdutosDisponiveisPorTexto(
  texto: string,
  limite = 5,
): Promise<ProdutoCrmResumo[]> {
  const response = await fetch(
    supabaseUrl("/produtos?select=sku,nome,estoque,preco,preco_compra&order=nome.asc"),
    { headers: supabaseHeaders() },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produtos select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ProdutoRow[];
  const textoNormalizado = normalizeText(texto);
  const termosBusca = textoNormalizado.split(/\s+/).filter((termo) => termo.length >= 3);

  return rows
    .map((produto) => {
      const nome = normalizeText(produto.nome);
      const termosProduto = nome.split(/\s+/).filter((termo) => termo.length >= 3);
      const score =
        (textoNormalizado.includes(nome) ? 20 : 0) +
        termosProduto.filter((termo) => textoNormalizado.includes(termo)).length * 3 +
        termosBusca.filter((termo) => nome.includes(termo)).length;

      return { produto, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map(({ produto }) => ({
      sku: produto.sku,
      nome: produto.nome,
      quantidade: 1,
      preco: produto.preco ?? 0,
      precoCompra: produto.preco_compra ?? 0,
      estoque: produto.estoque ?? 0,
    }));
}

export async function registrarProdutoProcurado({
  termo,
  telefone,
  nomeCliente,
  contexto,
}: {
  termo: string;
  telefone?: string | null;
  nomeCliente?: string | null;
  contexto?: string | null;
}): Promise<ProdutoProcurado> {
  const termoLimpo = termo.trim();
  if (!termoLimpo) throw new Error("Produto procurado vazio");

  const params = new URLSearchParams({
    select: "*",
    termo: `ilike.${termoLimpo}`,
    limit: "1",
  });

  const selectResponse = await fetch(supabaseUrl(`/produtos_procurados?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(
      `Supabase produtos_procurados select failed (${selectResponse.status}): ${errorBody}`,
    );
  }

  const existentes = (await selectResponse.json()) as ProdutoProcurado[];
  const existente = existentes[0];

  if (existente) {
    const response = await fetch(supabaseUrl(`/produtos_procurados?id=eq.${existente.id}`), {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        telefone: telefone ?? existente.telefone,
        nome_cliente: nomeCliente ?? existente.nome_cliente,
        contexto: contexto ?? existente.contexto,
        vezes: (existente.vezes ?? 1) + 1,
        atualizado_em: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Supabase produtos_procurados update failed (${response.status}): ${errorBody}`,
      );
    }

    const rows = (await response.json()) as ProdutoProcurado[];
    return rows[0];
  }

  const response = await fetch(supabaseUrl("/produtos_procurados"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      termo: termoLimpo,
      telefone,
      nome_cliente: nomeCliente,
      contexto,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase produtos_procurados insert failed (${response.status}): ${errorBody}`,
    );
  }

  const rows = (await response.json()) as ProdutoProcurado[];
  return rows[0];
}

export async function listarProdutosProcurados(): Promise<ProdutoProcurado[]> {
  const params = new URLSearchParams({
    select: "*",
    order: "atualizado_em.desc",
    limit: "200",
  });
  const response = await fetch(supabaseUrl(`/produtos_procurados?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase produtos_procurados list failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as ProdutoProcurado[];
}

async function buscarOuCriarCliente(
  telefone: string,
  nomeCliente?: string | null,
  origem = "WhatsApp IA",
): Promise<ClienteRow> {
  const params = new URLSearchParams({
    telefone: `eq.${telefone}`,
    select: "id,nome,telefone,total_gasto,lucro_liquido,pedidos",
    limit: "1",
  });

  const selectResponse = await fetch(supabaseUrl(`/clientes?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(`Supabase cliente select failed (${selectResponse.status}): ${errorBody}`);
  }

  const rows = (await selectResponse.json()) as ClienteRow[];
  if (rows[0]) return rows[0];

  const createResponse = await fetch(supabaseUrl("/clientes?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify({
      nome: nomeCliente?.trim() || `Cliente ${telefone.slice(-4)}`,
      telefone,
      origem,
      ultima: "hoje",
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(`Supabase cliente insert failed (${createResponse.status}): ${errorBody}`);
  }

  const created = (await createResponse.json()) as ClienteRow[];
  return created[0];
}

async function atualizarCliente(cliente: ClienteRow, total: number, lucro: number): Promise<void> {
  const response = await fetch(supabaseUrl(`/clientes?id=eq.${cliente.id}`), {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      total_gasto: (cliente.total_gasto ?? 0) + total,
      lucro_liquido: (cliente.lucro_liquido ?? 0) + lucro,
      pedidos: (cliente.pedidos ?? 0) + 1,
      ticket: total,
      ultima: "hoje",
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente update failed (${response.status}): ${errorBody}`);
  }
}

async function buscarClientePorId(id: string): Promise<ClienteRow | null> {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "id,nome,telefone,total_gasto,lucro_liquido,pedidos",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/clientes?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ClienteRow[];
  return rows[0] ?? null;
}

async function baixarEstoque(item: ProdutoPedido): Promise<void> {
  const params = new URLSearchParams({
    sku: `eq.${item.sku}`,
    select: "estoque",
    limit: "1",
  });

  const selectResponse = await fetch(supabaseUrl(`/produtos?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(`Supabase estoque select failed (${selectResponse.status}): ${errorBody}`);
  }

  const rows = (await selectResponse.json()) as Array<{ estoque: number | null }>;
  const estoqueAtual = rows[0]?.estoque ?? 0;
  if (rows.length === 0) {
    throw new Error(`Produto ${item.sku} nao encontrado no estoque`);
  }
  if (estoqueAtual < item.quantidade) {
    throw new Error(
      `Estoque insuficiente para ${item.nome}: disponivel ${estoqueAtual}, venda ${item.quantidade}`,
    );
  }

  const updateResponse = await fetch(
    supabaseUrl(`/produtos?sku=eq.${encodeURIComponent(item.sku)}`),
    {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        estoque: estoqueAtual - item.quantidade,
        atualizado_em: new Date().toISOString(),
      }),
    },
  );

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    throw new Error(`Supabase estoque update failed (${updateResponse.status}): ${errorBody}`);
  }
}

async function devolverEstoque(item: ProdutoPedido): Promise<void> {
  const params = new URLSearchParams({
    sku: `eq.${item.sku}`,
    select: "estoque",
    limit: "1",
  });

  const selectResponse = await fetch(supabaseUrl(`/produtos?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!selectResponse.ok) {
    const errorBody = await selectResponse.text();
    throw new Error(`Supabase estoque select failed (${selectResponse.status}): ${errorBody}`);
  }

  const rows = (await selectResponse.json()) as Array<{ estoque: number | null }>;
  const estoqueAtual = rows[0]?.estoque ?? 0;
  const updateResponse = await fetch(
    supabaseUrl(`/produtos?sku=eq.${encodeURIComponent(item.sku)}`),
    {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        estoque: estoqueAtual + item.quantidade,
        atualizado_em: new Date().toISOString(),
      }),
    },
  );

  if (!updateResponse.ok) {
    const errorBody = await updateResponse.text();
    throw new Error(`Supabase estoque restore failed (${updateResponse.status}): ${errorBody}`);
  }
}

async function estornarCliente(cliente: ClienteRow, total: number, lucro: number): Promise<void> {
  const response = await fetch(supabaseUrl(`/clientes?id=eq.${cliente.id}`), {
    method: "PATCH",
    headers: supabaseHeaders(),
    body: JSON.stringify({
      total_gasto: Math.max(0, (cliente.total_gasto ?? 0) - total),
      lucro_liquido: Math.max(0, (cliente.lucro_liquido ?? 0) - lucro),
      pedidos: Math.max(0, (cliente.pedidos ?? 0) - 1),
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente refund failed (${response.status}): ${errorBody}`);
  }
}

async function listarItensVendaComEstoque(vendaId: string): Promise<VendaItemRow[]> {
  const params = new URLSearchParams({
    venda_id: `eq.${vendaId}`,
    estoque_baixado: "eq.true",
    select: "*",
  });
  const response = await fetch(supabaseUrl(`/venda_itens?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda_itens refund select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as VendaItemRow[];
}

async function cancelarVendaComEstorno(vendaId: string): Promise<void> {
  const response = await fetch(
    supabaseUrl(`/vendas?id=eq.${encodeURIComponent(vendaId)}&status=neq.cancelada`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        status: "cancelada",
        processo: "cancelado",
        atualizado_em: new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda cancel failed (${response.status}): ${errorBody}`);
  }
  await cancelarComissoesVenda(vendaId);

  const vendas = (await response.json()) as VendaFaturamentoRow[];
  const venda = vendas[0];
  if (!venda?.faturado_em) return;

  const itens = await listarItensVendaComEstoque(venda.id);
  for (const item of itens) {
    const itemResponse = await fetch(
      supabaseUrl(`/venda_itens?id=eq.${encodeURIComponent(item.id)}&estoque_baixado=eq.true`),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify({
          estoque_baixado: false,
          atualizado_em: new Date().toISOString(),
        }),
      },
    );

    if (!itemResponse.ok) {
      const errorBody = await itemResponse.text();
      throw new Error(`Supabase venda_itens refund failed (${itemResponse.status}): ${errorBody}`);
    }

    const itensReservados = (await itemResponse.json()) as VendaItemRow[];
    if (!itensReservados[0]) continue;

    await devolverEstoque({
      sku: item.sku,
      nome: item.nome,
      quantidade: item.quantidade,
      preco: item.preco,
      precoCompra: item.preco_compra,
    });
  }

  if (venda.cliente_id) {
    const cliente = await buscarClientePorId(venda.cliente_id);
    if (cliente) await estornarCliente(cliente, venda.total ?? 0, venda.lucro ?? 0);
  }
}

async function salvarItensVenda(vendaId: string, itens: ProdutoPedido[]): Promise<void> {
  if (itens.length === 0) return;

  const payload = itens.map((item) => ({
    venda_id: vendaId,
    sku: item.sku,
    nome: item.nome,
    quantidade: item.quantidade,
    preco: item.preco,
    preco_compra: item.precoCompra,
    pet_nome: item.petNome?.trim() || null,
  }));

  let response = await fetch(supabaseUrl("/venda_itens"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("pet_nome")) {
      const payloadSemPetNome = payload.map((item) => {
        const itemSemPetNome: Record<string, unknown> = { ...item };
        delete itemSemPetNome.pet_nome;
        return itemSemPetNome;
      });
      response = await fetch(supabaseUrl("/venda_itens"), {
        method: "POST",
        headers: supabaseHeaders(),
        body: JSON.stringify(payloadSemPetNome),
      });

      if (response.ok) return;

      const retryErrorBody = await response.text();
      throw new Error(`Supabase venda_itens insert failed (${response.status}): ${retryErrorBody}`);
    }

    throw new Error(`Supabase venda_itens insert failed (${response.status}): ${errorBody}`);
  }
}

async function buscarVendaDuplicadaRecente({
  telefone,
  observacao,
  total,
}: {
  telefone: string;
  observacao: string;
  total: number;
}): Promise<VendaDuplicadaRow | null> {
  const params = new URLSearchParams({
    telefone: `eq.${telefone}`,
    observacao: `eq.${observacao}`,
    total: `eq.${total}`,
    select: "id,criado_em",
    order: "criado_em.desc",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/vendas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda duplicada select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaDuplicadaRow[];
  const venda = rows[0];
  if (!venda) return null;

  const criadaEm = new Date(venda.criado_em).getTime();
  const janelaDuplicidadeMs = 60 * 60 * 1000;

  return Date.now() - criadaEm <= janelaDuplicidadeMs ? venda : null;
}

async function listarItensVendaPendentesEstoque(vendaId: string): Promise<VendaItemRow[]> {
  const params = new URLSearchParams({
    venda_id: `eq.${vendaId}`,
    estoque_baixado: "eq.false",
    select: "*",
  });

  const response = await fetch(supabaseUrl(`/venda_itens?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda_itens select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as VendaItemRow[];
}

export async function baixarEstoqueDaVenda(vendaId: string): Promise<number> {
  const itens = await listarItensVendaPendentesEstoque(vendaId);
  let baixados = 0;

  for (const item of itens) {
    const reservaResponse = await fetch(
      supabaseUrl(`/venda_itens?id=eq.${encodeURIComponent(item.id)}&estoque_baixado=eq.false`),
      {
        method: "PATCH",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify({
          estoque_baixado: true,
          atualizado_em: new Date().toISOString(),
        }),
      },
    );

    if (!reservaResponse.ok) {
      const errorBody = await reservaResponse.text();
      throw new Error(
        `Supabase venda_itens reserve failed (${reservaResponse.status}): ${errorBody}`,
      );
    }

    const reservados = (await reservaResponse.json()) as VendaItemRow[];
    if (!reservados[0]) continue;

    try {
      await baixarEstoque({
        sku: item.sku,
        nome: item.nome,
        quantidade: item.quantidade,
        preco: item.preco,
        precoCompra: item.preco_compra,
      });
    } catch (error) {
      await fetch(
        supabaseUrl(`/venda_itens?id=eq.${encodeURIComponent(item.id)}&estoque_baixado=eq.true`),
        {
          method: "PATCH",
          headers: supabaseHeaders("return=minimal"),
          body: JSON.stringify({
            estoque_baixado: false,
            atualizado_em: new Date().toISOString(),
          }),
        },
      ).catch(() => undefined);
      throw error;
    }
    baixados += 1;
  }

  return baixados;
}

async function buscarVendaParaFaturamento(vendaId: string): Promise<VendaFaturamentoRow | null> {
  const params = new URLSearchParams({
    id: `eq.${vendaId}`,
    select: "id,cliente_id,cliente_nome,telefone,total,lucro,status_pagamento,faturado_em",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/vendas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("faturado_em")) {
      const fallbackParams = new URLSearchParams({
        id: `eq.${vendaId}`,
        select: "id,cliente_id,cliente_nome,telefone,total,lucro,status_pagamento",
        limit: "1",
      });
      const fallbackResponse = await fetch(supabaseUrl(`/vendas?${fallbackParams}`), {
        headers: supabaseHeaders(),
      });

      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.text();
        throw new Error(
          `Supabase venda faturamento select failed (${fallbackResponse.status}): ${fallbackError}`,
        );
      }

      const rows = (await fallbackResponse.json()) as Omit<VendaFaturamentoRow, "faturado_em">[];
      const row = rows[0];
      return row
        ? {
            ...row,
            faturado_em: row.status_pagamento === "pago" ? new Date(0).toISOString() : null,
          }
        : null;
    }

    throw new Error(`Supabase venda faturamento select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaFaturamentoRow[];
  return rows[0] ?? null;
}

async function reservarVendaParaFaturamento(vendaId: string): Promise<VendaFaturamentoRow | null> {
  return reservarVendaParaFaturamentoEm(vendaId, new Date().toISOString());
}

async function reservarVendaParaFaturamentoEm(
  vendaId: string,
  faturadoEm: string,
): Promise<VendaFaturamentoRow | null> {
  const atualizadoEm = new Date().toISOString();
  const response = await fetch(
    supabaseUrl(`/vendas?id=eq.${encodeURIComponent(vendaId)}&faturado_em=is.null`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        status_pagamento: "pago",
        processo: "pago",
        faturado_em: faturadoEm,
        atualizado_em: atualizadoEm,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    if (errorBody.includes("faturado_em")) {
      const fallbackResponse = await fetch(
        supabaseUrl(`/vendas?id=eq.${encodeURIComponent(vendaId)}&status_pagamento=neq.pago`),
        {
          method: "PATCH",
          headers: supabaseHeaders("return=representation"),
          body: JSON.stringify({
            status_pagamento: "pago",
            processo: "pago",
            atualizado_em: atualizadoEm,
          }),
        },
      );

      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.text();
        throw new Error(
          `Supabase venda faturamento update failed (${fallbackResponse.status}): ${fallbackError}`,
        );
      }

      const rows = (await fallbackResponse.json()) as Omit<VendaFaturamentoRow, "faturado_em">[];
      const row = rows[0];
      return row ? { ...row, faturado_em: faturadoEm } : null;
    }

    throw new Error(`Supabase venda faturamento update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaFaturamentoRow[];
  return rows[0] ?? null;
}

export async function registrarFaturamentoPedidoPago(vendaId: string): Promise<{
  faturado: boolean;
  estoqueBaixado: number;
}>;
export async function registrarFaturamentoPedidoPago(
  vendaId: string,
  options: { faturadoEm?: string | null },
): Promise<{
  faturado: boolean;
  estoqueBaixado: number;
}>;
export async function registrarFaturamentoPedidoPago(
  vendaId: string,
  options: { faturadoEm?: string | null } = {},
): Promise<{
  faturado: boolean;
  estoqueBaixado: number;
}> {
  const venda = await buscarVendaParaFaturamento(vendaId);

  if (!venda) {
    throw new Error("Venda nao encontrada para faturamento");
  }

  if (venda.faturado_em) {
    return {
      faturado: false,
      estoqueBaixado: await baixarEstoqueDaVenda(vendaId),
    };
  }

  const faturadoEm = options.faturadoEm?.trim() || new Date().toISOString();
  const vendaReservada = await reservarVendaParaFaturamentoEm(vendaId, faturadoEm);

  if (!vendaReservada) {
    return {
      faturado: false,
      estoqueBaixado: await baixarEstoqueDaVenda(vendaId),
    };
  }

  const cliente = venda.cliente_id
    ? await buscarClientePorId(venda.cliente_id)
    : venda.telefone
      ? await buscarOuCriarCliente(venda.telefone, venda.cliente_nome)
      : null;

  if (cliente) {
    await atualizarCliente(cliente, venda.total ?? 0, venda.lucro ?? 0);
  }

  await registrarComissaoVenda(vendaId);

  return {
    faturado: true,
    estoqueBaixado: await baixarEstoqueDaVenda(vendaId),
  };
}

export async function confirmarPagamentoVenda(vendaId: string): Promise<number> {
  const resultado = await registrarFaturamentoPedidoPago(vendaId);
  return resultado.estoqueBaixado;
}

async function requestSupabase(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(supabaseUrl(path), {
    ...init,
    headers: {
      ...supabaseHeaders("return=minimal"),
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase write failed (${response.status}): ${errorBody}`);
  }
}

export async function zerarFinanceiroCrm(): Promise<{
  vendasRemovidas: boolean;
  acumuladosClientesZerados: boolean;
}> {
  await requestSupabase("/venda_itens?id=not.is.null", { method: "DELETE" });
  await requestSupabase("/pedidos?id=not.is.null", { method: "DELETE" });
  await requestSupabase("/vendas?id=not.is.null", { method: "DELETE" });
  await requestSupabase("/clientes?id=not.is.null", {
    method: "PATCH",
    body: JSON.stringify({
      ticket: 0,
      total_gasto: 0,
      total_descontos: 0,
      lucro_liquido: 0,
      pedidos: 0,
      cac: 0,
      atualizado_em: new Date().toISOString(),
    }),
  });

  return {
    vendasRemovidas: true,
    acumuladosClientesZerados: true,
  };
}

export async function buscarAprendizados(limite = 10): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      select: "licao",
      order: "criado_em.desc",
      limit: String(limite),
    });

    const response = await fetch(supabaseUrl(`/aprendizados?${params}`), {
      headers: supabaseHeaders(),
    });

    if (!response.ok) return [];

    const rows = (await response.json()) as Array<{ licao: string }>;
    return rows.map((r) => r.licao).filter(Boolean);
  } catch {
    return [];
  }
}

export async function buscarIaAprendizadoResumo(limite = 8): Promise<IaAprendizadoResumo> {
  try {
    const params = new URLSearchParams({
      select: "licao,criado_em",
      order: "criado_em.desc",
      limit: "100",
    });

    const response = await fetch(supabaseUrl(`/aprendizados?${params}`), {
      headers: supabaseHeaders(),
    });

    if (!response.ok) throw new Error("aprendizados indisponiveis");

    const rows = (await response.json()) as Array<{ licao: string; criado_em: string }>;
    const agora = Date.now();
    const semanaMs = 7 * 24 * 60 * 60 * 1000;
    const recentes7d = rows.filter(
      (row) => agora - new Date(row.criado_em).getTime() <= semanaMs,
    ).length;
    const total = rows.length;
    const pontosBase = Math.min(45, total * 5);
    const pontosRecentes = Math.min(25, recentes7d * 5);
    const diversidade = new Set(
      rows.map((row) => row.licao.split(" ").slice(0, 4).join(" ").toLowerCase()),
    ).size;
    const pontosDiversidade = Math.min(20, diversidade * 4);
    const pontosUso = total > 0 ? 10 : 0;
    const pontuacao = Math.min(100, pontosBase + pontosRecentes + pontosDiversidade + pontosUso);
    const nivel =
      pontuacao >= 80
        ? "Madura"
        : pontuacao >= 55
          ? "Avancada"
          : pontuacao >= 25
            ? "Aprendendo"
            : "Inicial";

    return {
      total,
      recentes7d,
      pontuacao,
      nivel,
      aprendizados: rows
        .slice(0, limite)
        .map((row) => ({ licao: row.licao, criadoEm: row.criado_em })),
      criterios: [
        { nome: "Licoes salvas", valor: String(total), pontos: pontosBase },
        { nome: "Novas nos ultimos 7 dias", valor: String(recentes7d), pontos: pontosRecentes },
        { nome: "Diversidade de padroes", valor: String(diversidade), pontos: pontosDiversidade },
        { nome: "Uso no prompt", valor: total > 0 ? "Ativo" : "Sem dados", pontos: pontosUso },
      ],
    };
  } catch {
    return {
      total: 0,
      recentes7d: 0,
      pontuacao: 0,
      nivel: "Inicial",
      aprendizados: [],
      criterios: [
        { nome: "Licoes salvas", valor: "0", pontos: 0 },
        { nome: "Novas nos ultimos 7 dias", valor: "0", pontos: 0 },
        { nome: "Diversidade de padroes", valor: "0", pontos: 0 },
        { nome: "Uso no prompt", valor: "Sem dados", pontos: 0 },
      ],
    };
  }
}

export async function salvarAprendizado(licao: string): Promise<void> {
  try {
    await fetch(supabaseUrl("/aprendizados"), {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({ licao }),
    });
  } catch {
    // falha silenciosa — aprendizado não deve travar o fluxo
  }
}

export async function criarPedidoPixPendente({
  telefone,
  descricao,
  valor,
  vendaId,
}: {
  telefone: string;
  descricao: string;
  valor: number;
  vendaId?: string | null;
}): Promise<PedidoPixRow> {
  const response = await fetch(supabaseUrl("/pedidos"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      cliente_telefone: telefone,
      descricao,
      valor,
      venda_id: vendaId,
      status: "pendente",
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase pedido insert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as PedidoPixRow[];
  if (!rows[0]) throw new Error("Pedido Pix nao retornado pelo Supabase");

  return rows[0];
}

export async function atualizarPedidoPixMercadoPago({
  id,
  mpPaymentId,
  qrCode,
  qrCodeBase64,
}: {
  id: string;
  mpPaymentId: string;
  qrCode: string;
  qrCodeBase64: string;
}): Promise<PedidoPixRow> {
  const response = await fetch(supabaseUrl(`/pedidos?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      mp_payment_id: mpPaymentId,
      mp_qr_code: qrCode,
      mp_qr_code_base64: qrCodeBase64,
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase pedido Pix update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as PedidoPixRow[];
  if (!rows[0]) throw new Error("Pedido Pix nao encontrado apos atualizacao");

  return rows[0];
}

export async function buscarPedidoPixPorId(id: string): Promise<PedidoPixRow | null> {
  const params = new URLSearchParams({
    id: `eq.${id}`,
    select: "*",
    limit: "1",
  });

  const response = await fetch(supabaseUrl(`/pedidos?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase pedido select failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as PedidoPixRow[];
  return rows[0] ?? null;
}

export async function marcarPedidoPixPago(id: string): Promise<PedidoPixRow | null> {
  const pedidoAtual = await buscarPedidoPixPorId(id);

  if (pedidoAtual?.status === "pago") {
    return pedidoAtual;
  }

  const response = await fetch(supabaseUrl(`/pedidos?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      status: "pago",
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase pedido pago update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as PedidoPixRow[];
  const pedidoPago = rows[0] ?? null;

  if (pedidoPago?.venda_id) {
    await registrarFaturamentoPedidoPago(pedidoPago.venda_id);
  }

  return pedidoPago;
}

export async function vincularPedidoPixAVenda({
  pedidoPixId,
  vendaId,
  pago = true,
}: {
  pedidoPixId: string;
  vendaId: string;
  pago?: boolean;
}): Promise<PedidoPixRow> {
  const response = await fetch(supabaseUrl(`/pedidos?id=eq.${encodeURIComponent(pedidoPixId)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      venda_id: vendaId,
      status: pago ? "pago" : "pendente",
      atualizado_em: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase pedido Pix venda update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as PedidoPixRow[];
  if (!rows[0]) throw new Error("Pedido Pix nao encontrado apos vincular venda");

  return rows[0];
}

function valoresIguais(a: number | null | undefined, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(Number(a) - b) <= 0.02;
}

export async function existeVendaComMarcador(marcador: string): Promise<boolean> {
  const texto = marcador.trim();
  if (!texto) return false;

  const params = new URLSearchParams({
    observacao: `ilike.*${texto}*`,
    select: "id",
    limit: "1",
  });
  const response = await fetch(supabaseUrl(`/vendas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda marcador select failed (${response.status}): ${errorBody}`);
  }

  return ((await response.json()) as Array<{ id: string }>).length > 0;
}

export async function existeVendaPagaComValor({
  telefone,
  valor,
  dataReferencia,
  janelaDias = 5,
}: {
  telefone: string;
  valor: number;
  dataReferencia?: string;
  janelaDias?: number;
}): Promise<boolean> {
  const telefoneLimpo = telefone.replace(/\D/g, "");
  if (!telefoneLimpo || !Number.isFinite(valor) || valor <= 0) return false;

  const params = new URLSearchParams({
    telefone: `eq.${telefoneLimpo}`,
    status_pagamento: "eq.pago",
    status: "neq.cancelada",
    select: "id,total,criado_em",
    order: "criado_em.desc",
    limit: "30",
  });
  const response = await fetch(supabaseUrl(`/vendas?${params}`), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda paga select failed (${response.status}): ${errorBody}`);
  }

  const vendas = (await response.json()) as Array<{
    id: string;
    total: number | null;
    criado_em: string;
  }>;
  const referencia = dataReferencia ? new Date(dataReferencia).getTime() : Number.NaN;
  const janelaMs = janelaDias * 24 * 60 * 60 * 1000;

  return vendas.some((venda) => {
    if (!valoresIguais(venda.total, valor)) return false;
    if (!Number.isFinite(referencia)) return true;

    const criadaEm = new Date(venda.criado_em).getTime();
    // Vendas lancadas retroativamente nascem com criado_em = agora; vendas em
    // tempo real ficam perto da data do comprovante. Considera duplicada se a
    // venda paga de mesmo valor estiver na janela OU for posterior ao comprovante.
    return !Number.isFinite(criadaEm) || criadaEm >= referencia - janelaMs;
  });
}

export async function confirmarPixPorComprovanteWhatsapp({
  telefone,
  valor,
  formaPagamento = "Pix",
}: {
  telefone: string;
  valor: number;
  formaPagamento?: string;
}): Promise<ConfirmacaoComprovantePix> {
  const telefoneLimpo = telefone.replace(/\D/g, "");
  if (!telefoneLimpo || !Number.isFinite(valor) || valor <= 0) {
    return { confirmado: false, motivo: "dados_invalidos" };
  }

  const pedidosParams = new URLSearchParams({
    cliente_telefone: `eq.${telefoneLimpo}`,
    status: "eq.pendente",
    select: "*",
    order: "criado_em.desc",
    limit: "10",
  });
  const pedidosResponse = await fetch(supabaseUrl(`/pedidos?${pedidosParams}`), {
    headers: supabaseHeaders(),
  });

  if (!pedidosResponse.ok) {
    const errorBody = await pedidosResponse.text();
    throw new Error(
      `Supabase pedidos Pix comprovante select failed (${pedidosResponse.status}): ${errorBody}`,
    );
  }

  const pedidosPix = ((await pedidosResponse.json()) as PedidoPixRow[]).filter((pedido) =>
    valoresIguais(pedido.valor, valor),
  );

  if (pedidosPix.length === 1) {
    const pedidoPix = pedidosPix[0];

    if (!pedidoPix.venda_id) {
      return {
        confirmado: false,
        motivo: "pedido_pix_sem_venda",
        pedidoPixId: pedidoPix.id,
        valor: pedidoPix.valor,
      };
    }

    const pedidoPago = await marcarPedidoPixPago(pedidoPix.id);
    return {
      confirmado: Boolean(pedidoPago),
      tipo: "pedido_pix",
      pedidoPixId: pedidoPago?.id,
      vendaId: pedidoPago?.venda_id ?? undefined,
      valor: pedidoPago?.valor,
    };
  }

  if (pedidosPix.length > 1) {
    return { confirmado: false, motivo: "multiplos_pedidos_pix_mesmo_valor", valor };
  }

  const vendasParams = new URLSearchParams({
    telefone: `eq.${telefoneLimpo}`,
    status_pagamento: "neq.pago",
    status: "neq.cancelada",
    select: "id,total,criado_em",
    order: "criado_em.desc",
    limit: "10",
  });
  const vendasResponse = await fetch(supabaseUrl(`/vendas?${vendasParams}`), {
    headers: supabaseHeaders(),
  });

  if (!vendasResponse.ok) {
    const errorBody = await vendasResponse.text();
    throw new Error(
      `Supabase vendas comprovante select failed (${vendasResponse.status}): ${errorBody}`,
    );
  }

  const vendas = (
    (await vendasResponse.json()) as Array<{ id: string; total: number | null }>
  ).filter((venda) => valoresIguais(venda.total, valor));

  if (vendas.length === 1) {
    await registrarFaturamentoPedidoPago(vendas[0].id);
    await fetch(supabaseUrl(`/vendas?id=eq.${encodeURIComponent(vendas[0].id)}`), {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({
        forma_pagamento: formaPagamento,
        atualizado_em: new Date().toISOString(),
      }),
    }).then(async (response) => {
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Supabase venda forma pagamento update failed (${response.status}): ${errorBody}`,
        );
      }
    });

    return { confirmado: true, tipo: "venda", vendaId: vendas[0].id, valor };
  }

  if (vendas.length > 1) {
    return { confirmado: false, motivo: "multiplas_vendas_mesmo_valor", valor };
  }

  return { confirmado: false, motivo: "pedido_pendente_nao_encontrado", valor };
}

export async function registrarPedidoDoWhatsapp({
  telefone,
  texto,
  nomeCliente,
  formaPagamento,
  totalPago,
  pago = false,
  observacaoExtra,
}: {
  telefone: string;
  texto: string;
  nomeCliente?: string | null;
  formaPagamento?: string | null;
  totalPago?: number | null;
  pago?: boolean;
  observacaoExtra?: string | null;
}): Promise<{
  registrado: boolean;
  motivo?: string;
  itens: ProdutoPedido[];
  total: number;
  vendaId?: string;
}> {
  const itens = await buscarProdutosPorTexto(texto);
  const totalConfirmado =
    typeof totalPago === "number" && Number.isFinite(totalPago) && totalPago > 0 ? totalPago : null;

  if (itens.length === 0) {
    if (pago && totalConfirmado) {
      const cliente = await buscarOuCriarCliente(telefone, nomeCliente);
      const observacao = observacaoExtra?.trim()
        ? `Pedido WhatsApp IA: Produto a confirmar | ${observacaoExtra.trim().slice(0, 180)}`
        : "Pedido WhatsApp IA: Produto a confirmar";
      const vendaDuplicada = await buscarVendaDuplicadaRecente({
        telefone,
        observacao,
        total: totalConfirmado,
      });

      if (vendaDuplicada) {
        return {
          registrado: true,
          motivo: "pedido_duplicado_ignorado",
          itens: [],
          total: totalConfirmado,
          vendaId: vendaDuplicada.id,
        };
      }

      const vendaResponse = await fetch(supabaseUrl("/vendas"), {
        method: "POST",
        headers: supabaseHeaders("return=representation"),
        body: JSON.stringify({
          cliente_id: cliente.id,
          cliente_nome: cliente.nome,
          telefone,
          total: totalConfirmado,
          lucro: totalConfirmado,
          forma_pagamento: formaPagamento,
          status_pagamento: "pendente",
          status: "concluida",
          processo: "novo",
          observacao,
        }),
      });

      if (!vendaResponse.ok) {
        const errorBody = await vendaResponse.text();
        throw new Error(
          `Supabase venda comprovante insert failed (${vendaResponse.status}): ${errorBody}`,
        );
      }

      const vendasCriadas = (await vendaResponse.json()) as Array<{ id: string }>;
      const vendaId = vendasCriadas[0]?.id;
      if (!vendaId) throw new Error("Venda de comprovante criada sem id retornado pelo Supabase");

      try {
        await registrarFaturamentoPedidoPago(vendaId);
      } catch (error) {
        await requestSupabase(`/vendas?id=eq.${encodeURIComponent(vendaId)}`, {
          method: "DELETE",
        }).catch(() => undefined);

        throw error;
      }

      return { registrado: true, itens: [], total: totalConfirmado, vendaId };
    }

    return { registrado: false, motivo: "produto_nao_encontrado_no_estoque", itens: [], total: 0 };
  }

  const total = itens.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const cupomAplicado = await (async () => {
    if (totalConfirmado) return null;
    const codigo = extrairCupomTexto(texto);
    return codigo ? validarCupom(codigo, total) : null;
  })();
  const totalFinal = totalConfirmado ?? cupomAplicado?.totalFinal ?? total;
  const custoTotal = itens.reduce((sum, item) => sum + item.precoCompra * item.quantidade, 0);
  const lucro = totalFinal - custoTotal;
  const cliente = await buscarOuCriarCliente(telefone, nomeCliente);
  const observacaoBase = `Pedido WhatsApp IA: ${itens
    .map((item) => `${item.quantidade}x ${item.nome}`)
    .join(", ")}`;
  const observacao = observacaoExtra?.trim()
    ? `${observacaoBase} | ${observacaoExtra.trim().slice(0, 180)}`
    : observacaoBase;
  const vendaDuplicada = await buscarVendaDuplicadaRecente({
    telefone,
    observacao,
    total: totalFinal,
  });

  if (vendaDuplicada) {
    return {
      registrado: true,
      motivo: "pedido_duplicado_ignorado",
      itens,
      total: totalFinal,
      vendaId: vendaDuplicada.id,
    };
  }

  const vendaPayload: Record<string, unknown> = {
    cliente_id: cliente.id,
    cliente_nome: cliente.nome,
    telefone,
    total: totalFinal,
    lucro,
    forma_pagamento: formaPagamento,
    status_pagamento: "pendente",
    status: "concluida",
    processo: "novo",
    observacao,
  };

  if (cupomAplicado) {
    Object.assign(vendaPayload, vendaCupomPayload(cupomAplicado));
  }

  const vendaResponse = await fetch(supabaseUrl("/vendas"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(vendaPayload),
  });

  if (!vendaResponse.ok) {
    const errorBody = await vendaResponse.text();
    throw new Error(`Supabase venda insert failed (${vendaResponse.status}): ${errorBody}`);
  }

  const vendasCriadas = (await vendaResponse.json()) as Array<{ id: string }>;
  const vendaId = vendasCriadas[0]?.id;

  if (!vendaId) {
    throw new Error("Venda criada sem id retornado pelo Supabase");
  }

  try {
    await salvarItensVenda(vendaId, itens);
    await recalcularRecompraVenda(vendaId).catch((error) => {
      console.error("[recompra] erro_recalcular_whatsapp", error);
    });
    if (cupomAplicado) {
      await registrarUsoCupom(cupomAplicado.cupom);
      await registrarComissaoVenda(vendaId);
    }
    if (pago) {
      await registrarFaturamentoPedidoPago(vendaId);
    }
  } catch (error) {
    await requestSupabase(`/venda_itens?venda_id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await requestSupabase(`/vendas?id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);

    throw error;
  }

  return { registrado: true, itens, total: totalFinal, vendaId };
}
