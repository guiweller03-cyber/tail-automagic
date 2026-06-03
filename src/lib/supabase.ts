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
import { recalcularRecompraVenda } from "./recompra-supabase";

export type Conversa = {
  id: string;
  telefone: string;
  nome_cliente: string | null;
  historico: Mensagem[];
  aguardando_humano: boolean;
  ia_ativa: boolean | null;
  estagio: "novo" | "qualificando" | "vendendo" | "pos_venda" | "inativo";
  criado_em: string;
  atualizado_em: string;
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
  status: PedidoProcesso;
  pagamento: string;
  statusPagamento: string;
  observacao: string;
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
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
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

export async function upsertConversas(payloads: ConversaUpsert[]): Promise<Conversa[]> {
  if (payloads.length === 0) return [];

  const response = await fetch(supabaseUrl("/conversas?on_conflict=telefone"), {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payloads),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase bulk upsert failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as Conversa[];
}

export async function listarConversas(): Promise<Conversa[]> {
  const response = await fetch(supabaseUrl("/conversas?select=*&order=atualizado_em.desc"), {
    headers: supabaseHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase conversas select failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as Conversa[];
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

export async function atualizarConversaPipeline({
  id,
  estagio,
  aguardandoHumano,
}: {
  id: string;
  estagio: Conversa["estagio"];
  aguardandoHumano: boolean;
}): Promise<Conversa> {
  const response = await fetch(supabaseUrl(`/conversas?id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify({
      estagio,
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

  if (nome) payload.nome = nome;
  if (endereco) payload.endereco = endereco;
  if (bairro) payload.bairro = bairro;
  if (pets && pets.length > 0) payload.pets = pets;

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
    return rows[0] ?? { ...cliente, ...payload };
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
      ...(pets && pets.length > 0 ? { pets } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase cliente insert failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as ClienteCadastro[];
  return rows[0];
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
  total: number | null;
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
  estoque_baixado: boolean;
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

function resumoPedido(observacao: string | null): string {
  if (!observacao) return "Pedido registrado";
  return observacao.replace(/^Pedido WhatsApp IA:\s*/i, "").trim() || "Pedido registrado";
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

export async function listarPedidos(): Promise<PedidoCrm[]> {
  const [vendas, clientes] = await Promise.all([
    (async () => {
      const response = await fetch(
        supabaseUrl(
          "/vendas?select=id,cliente_id,cliente_nome,telefone,total,forma_pagamento,status_pagamento,status,processo,observacao,criado_em&order=criado_em.desc",
        ),
        { headers: supabaseHeaders() },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Supabase vendas select failed (${response.status}): ${errorBody}`);
      }

      return (await response.json()) as VendaPedidoRow[];
    })(),
    buscarClientesCadastro(),
  ]);

  const clientesPorId = new Map(clientes.map((cliente) => [cliente.id, cliente]));
  const clientesPorTelefone = new Map(clientes.map((cliente) => [cliente.telefone, cliente]));

  return deduplicarVendasRecentes(vendas).map((venda) => {
    const cliente =
      (venda.cliente_id ? clientesPorId.get(venda.cliente_id) : undefined) ??
      (venda.telefone ? clientesPorTelefone.get(venda.telefone) : undefined);

    return {
      id: venda.id,
      cliente: venda.cliente_nome ?? cliente?.nome ?? venda.telefone ?? "Cliente",
      telefone: venda.telefone ?? cliente?.telefone ?? "",
      pet: cliente?.pets?.[0] ?? resumoPedido(venda.observacao),
      bairro: cliente?.bairro ?? cliente?.endereco ?? "Entrega a confirmar",
      total: venda.total ?? 0,
      hora: formatHoraPedido(venda.criado_em),
      status: mapProcessoVenda(venda),
      pagamento: venda.forma_pagamento ?? "A combinar",
      statusPagamento: venda.status_pagamento ?? "pendente",
      observacao: venda.observacao ?? "",
    };
  });
}

export async function atualizarProcessoPedido(
  id: string,
  processo: PedidoProcesso,
  options: { formaPagamento?: string | null } = {},
): Promise<PedidoCrm> {
  if (processo === "cancelado") {
    await cancelarVendaComEstorno(id);

    const pedidos = await listarPedidos();
    const pedido = pedidos.find((item) => item.id === id);
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

  const pedidos = await listarPedidos();
  const pedido = pedidos.find((item) => item.id === id);
  if (!pedido) throw new Error("Pedido nao encontrado apos atualizacao");

  return pedido;
}

export async function criarPedidoManual({
  nome,
  telefone,
  total,
  formaPagamento,
  observacao,
  bairro,
  pet,
  itens = [],
  pago = false,
  cupomCodigo,
}: {
  nome: string;
  telefone: string;
  total: number;
  formaPagamento?: string | null;
  observacao?: string | null;
  bairro?: string | null;
  pet?: string | null;
  itens?: ProdutoPedido[];
  pago?: boolean;
  cupomCodigo?: string | null;
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
  const totalFinal = cupomAplicado?.totalFinal ?? total;
  const lucro =
    totalFinal -
    itensValidos.reduce((custo, item) => custo + item.precoCompra * item.quantidade, 0);

  if (bairro?.trim() || pet?.trim() || (nome.trim() && cliente.nome !== nome.trim())) {
    await salvarCadastroCliente({
      telefone: telefoneLimpo,
      nome,
      bairro,
      pets: pet?.trim() ? [pet.trim()] : undefined,
      origem: "CRM manual",
    });
  }

  const vendaPayload: Record<string, unknown> = {
    cliente_id: cliente.id,
    cliente_nome: nome.trim(),
    telefone: telefoneLimpo,
    total: totalFinal,
    lucro,
    forma_pagamento: formaPagamento?.trim() || null,
    status_pagamento: "pendente",
    status: "concluida",
    processo: "novo",
    observacao: observacao?.trim() || "Pedido manual do CRM",
  };

  if (cupomAplicado) {
    Object.assign(vendaPayload, vendaCupomPayload(cupomAplicado));
  }

  const response = await fetch(supabaseUrl("/vendas"), {
    method: "POST",
    headers: supabaseHeaders("return=representation"),
    body: JSON.stringify(vendaPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Supabase venda manual insert failed (${response.status}): ${errorBody}`);
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
    if (pago) await registrarFaturamentoPedidoPago(vendaId);
  } catch (error) {
    await requestSupabase(`/venda_itens?venda_id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    await requestSupabase(`/vendas?id=eq.${encodeURIComponent(vendaId)}`, {
      method: "DELETE",
    }).catch(() => undefined);

    throw error;
  }

  const pedido = (await listarPedidos()).find((item) => item.id === vendaId);
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
  const match = value.match(/\b(\d{1,2})\s*(?:x|un|unidade|unidades|pacote|pacotes)?\b/i);

  if (!match) return 1;

  return Math.max(1, Number(match[1]));
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

  return rows
    .map((produto) => {
      const nome = normalizeText(produto.nome);
      const termos = nome.split(/\s+/).filter((termo) => termo.length >= 4);
      const score = termos.filter((termo) => textoNormalizado.includes(termo)).length;

      return { produto, score: textoNormalizado.includes(nome) ? score + 10 : score };
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
    .filter(({ produto, score }) => score > 0 && (produto.estoque ?? 0) > 0)
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

  const updateResponse = await fetch(
    supabaseUrl(`/produtos?sku=eq.${encodeURIComponent(item.sku)}`),
    {
      method: "PATCH",
      headers: supabaseHeaders(),
      body: JSON.stringify({
        estoque: Math.max(0, estoqueAtual - item.quantidade),
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

  const response = await fetch(supabaseUrl("/venda_itens"), {
    method: "POST",
    headers: supabaseHeaders(),
    body: JSON.stringify(
      itens.map((item) => ({
        venda_id: vendaId,
        sku: item.sku,
        nome: item.nome,
        quantidade: item.quantidade,
        preco: item.preco,
        preco_compra: item.precoCompra,
      })),
    ),
  });

  if (!response.ok) {
    const errorBody = await response.text();
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
    status_pagamento: "eq.pendente",
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

    await baixarEstoque({
      sku: item.sku,
      nome: item.nome,
      quantidade: item.quantidade,
      preco: item.preco,
      precoCompra: item.preco_compra,
    });
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
  const response = await fetch(
    supabaseUrl(`/vendas?id=eq.${encodeURIComponent(vendaId)}&faturado_em=is.null`),
    {
      method: "PATCH",
      headers: supabaseHeaders("return=representation"),
      body: JSON.stringify({
        status_pagamento: "pago",
        processo: "pago",
        faturado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
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
            atualizado_em: new Date().toISOString(),
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
      return row ? { ...row, faturado_em: new Date().toISOString() } : null;
    }

    throw new Error(`Supabase venda faturamento update failed (${response.status}): ${errorBody}`);
  }

  const rows = (await response.json()) as VendaFaturamentoRow[];
  return rows[0] ?? null;
}

export async function registrarFaturamentoPedidoPago(vendaId: string): Promise<{
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

  const vendaReservada = await reservarVendaParaFaturamento(vendaId);

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

export async function registrarPedidoDoWhatsapp({
  telefone,
  texto,
  nomeCliente,
  formaPagamento,
}: {
  telefone: string;
  texto: string;
  nomeCliente?: string | null;
  formaPagamento?: string | null;
}): Promise<{
  registrado: boolean;
  motivo?: string;
  itens: ProdutoPedido[];
  total: number;
  vendaId?: string;
}> {
  const itens = await buscarProdutosPorTexto(texto);

  if (itens.length === 0) {
    return { registrado: false, motivo: "produto_nao_encontrado_no_estoque", itens: [], total: 0 };
  }

  const total = itens.reduce((sum, item) => sum + item.preco * item.quantidade, 0);
  const cupomAplicado = await (async () => {
    const codigo = extrairCupomTexto(texto);
    return codigo ? validarCupom(codigo, total) : null;
  })();
  const totalFinal = cupomAplicado?.totalFinal ?? total;
  const lucro =
    itens.reduce((sum, item) => sum + (item.preco - item.precoCompra) * item.quantidade, 0) -
    (cupomAplicado?.desconto ?? 0);
  const cliente = await buscarOuCriarCliente(telefone, nomeCliente);
  const observacao = `Pedido WhatsApp IA: ${itens
    .map((item) => `${item.quantidade}x ${item.nome}`)
    .join(", ")}`;
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

  await salvarItensVenda(vendaId, itens);
  await recalcularRecompraVenda(vendaId).catch((error) => {
    console.error("[recompra] erro_recalcular_whatsapp", error);
  });
  if (cupomAplicado) {
    await registrarUsoCupom(cupomAplicado.cupom);
    await registrarComissaoVenda(vendaId);
  }

  return { registrado: true, itens, total: totalFinal, vendaId };
}
