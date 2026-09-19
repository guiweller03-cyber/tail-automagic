import type {
  Cliente,
  Conversa,
  ConversaFiltro,
  KanbanStage,
  PetDetalhe,
  Produto,
  ProdutoDetalhesTecnicos,
} from "@/lib/crm-types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Send,
  Sparkles,
  Phone,
  MoreVertical,
  Search,
  Menu,
  PanelRightOpen,
  Bot,
  User,
  LayoutGrid,
  MessageSquare,
  MapPin,
  Wallet,
  Paperclip,
  Image as ImageIcon,
  Check,
  CheckCheck,
  TrendingUp,
  Target,
  DollarSign,
  Tag,
  Users,
  PawPrint,
  Zap,
  Settings2,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  Pencil,
  X as XIcon,
  Package,
  SlidersHorizontal,
  Clock,
  Link,
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  Banknote,
  Ban,
  Store,
  Maximize2,
} from "lucide-react";
import { useSearch } from "@tanstack/react-router";
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chaveDiaConversa, formatarDiaConversa, formatarQuandoConversa } from "@/lib/formato-data";
import { SpeciePill } from "@/pages/RecompraPrevista";
import { AIAssistantToggle } from "@/features/whatsapp-crm/components/AIAssistantToggle";
import { FollowupScheduler } from "@/features/whatsapp-crm/components/FollowupScheduler";
import { produtoFotoProxyUrl } from "@/lib/produto-foto-url";
import { useMessageNotifications } from "@/features/whatsapp-crm/hooks/useMessageNotifications";
import { toast } from "sonner";

const PDV = lazy(() => import("@/pages/PDV").then((m) => ({ default: m.PDV })));
import {
  DEFAULT_KANBAN_COLUMNS,
  defaultKanbanColumnId,
  sanitizeKanbanColumns,
  type KanbanColumn,
  type KanbanColumnColor,
} from "@/features/whatsapp-crm/kanban-config";

type IaRegra = { id: string; titulo: string; instrucao: string; ativa: boolean };
type IaAprendizado = {
  total: number;
  recentes7d: number;
  pontuacao: number;
  nivel: string;
  aprendizados: Array<{ licao: string; criadoEm: string }>;
  criterios: Array<{ nome: string; valor: string; pontos: number }>;
};
type IaConfigPayload = {
  systemPrompt: string;
  baseSystemPrompt: string;
  regras: IaRegra[];
  aprendizado: IaAprendizado;
  atualizadoEm?: string;
};
const EMPTY_LEARNING: IaAprendizado = {
  total: 0,
  recentes7d: 0,
  pontuacao: 0,
  nivel: "Inicial",
  aprendizados: [],
  criterios: [],
};
type IaStatusPayload = {
  globalDesativada?: boolean;
};
export type ConversaMensagem = {
  id?: string;
  role?: string;
  content?: string;
  at?: string;
  source?: string;
  fromMe?: boolean;
  messageType?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  mediaKey?: string;
};
type ProdutoEnvioCrm = {
  texto: string;
  fotoUrl?: string | null;
  nomeArquivo?: string;
  mimeType?: string;
};
type EstoqueConjunto = {
  id: string;
  nome: string;
  skus: string[];
  criadoEm: string;
};
type ProdutoEstoqueFormState = {
  sku: string;
  nome: string;
  categoria: string;
  tipo: Produto["tipo"];
  giro: Produto["giro"];
  fornecedor: string;
  estoque: string;
  minimo: string;
  precoCompra: string;
  preco: string;
};
type QuickMessageTemplate = {
  id: string;
  label: string;
  text: string;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function precoComDesconto(preco: number, descontoPercentual: number) {
  const percentual = Number.isFinite(descontoPercentual)
    ? Math.min(100, Math.max(0, descontoPercentual))
    : 0;
  return Math.round(Math.max(0, preco) * (1 - percentual / 100) * 100) / 100;
}
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
function phoneForMatch(value: unknown): string {
  const digits = onlyDigits(value);
  if (digits.startsWith("55") && digits.length > 11) return digits.slice(2);
  return digits;
}
function phoneCandidates(value: unknown): string[] {
  const raw = onlyDigits(value);
  const withoutCountry = phoneForMatch(value);
  return Array.from(
    new Set(
      [
        raw,
        withoutCountry,
        withoutCountry.slice(-11),
        withoutCountry.slice(-10),
        withoutCountry.slice(-9),
        withoutCountry.slice(-8),
      ].filter((item) => item.length >= 8),
    ),
  );
}
function phoneMatches(a: unknown, b: unknown): boolean {
  const left = phoneCandidates(a);
  const right = phoneCandidates(b);
  return left.some((item) => right.includes(item));
}
function phoneIncludes(value: unknown, query: unknown): boolean {
  const phone = phoneForMatch(value);
  const term = phoneForMatch(query);
  return Boolean(term && (phone.includes(term) || onlyDigits(value).includes(onlyDigits(query))));
}
const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
type EstoqueInfoKey =
  | "preco"
  | "disponibilidade"
  | "foto"
  | "marcaLinha"
  | "indicacao"
  | "beneficios"
  | "ingredientes"
  | "nutricional";

const ESTOQUE_INFO_LABELS: Array<{ key: EstoqueInfoKey; label: string }> = [
  { key: "preco", label: "Preco" },
  { key: "disponibilidade", label: "Disponibilidade" },
  { key: "foto", label: "Foto" },
  { key: "marcaLinha", label: "Marca/linha" },
  { key: "indicacao", label: "Indicacao" },
  { key: "beneficios", label: "Beneficios" },
  { key: "ingredientes", label: "Ingredientes" },
  { key: "nutricional", label: "Nutricao" },
];

const DEFAULT_ESTOQUE_INFO: Record<EstoqueInfoKey, boolean> = {
  preco: true,
  disponibilidade: true,
  foto: true,
  marcaLinha: true,
  indicacao: true,
  beneficios: true,
  ingredientes: false,
  nutricional: false,
};
const QUICK_MESSAGE_TEMPLATES_STORAGE_KEY = "crm-respostas-prontas-v1";
const DEFAULT_QUICK_MESSAGE_TEMPLATES: QuickMessageTemplate[] = [
  {
    id: "confirmar-pedido",
    label: "Confirmar pedido",
    text: "Pedido confirmado. Vou seguir com a separacao e ja te aviso o proximo passo.",
  },
  {
    id: "forma-pagamento",
    label: "Forma de pagamento",
    text: "Qual vai ser a forma de pagamento? Pode ser Pix, cartao ou dinheiro.",
  },
  {
    id: "status-entrega",
    label: "Status entrega",
    text: "Vou verificar o status da entrega e ja te retorno por aqui.",
  },
  {
    id: "follow-up",
    label: "Follow-up",
    text: "Oi, tudo bem? Passando para saber se posso te ajudar com seu pedido ou alguma duvida.",
  },
];
const ESTOQUE_CONJUNTOS_STORAGE_KEY = "crm-estoque-conjuntos-v1";
const MAX_ESTOQUE_CONJUNTOS = 30;
const ESTOQUE_TIPOS: Array<{ value: Produto["tipo"]; label: string }> = [
  { value: "próprio", label: "Proprio" },
  { value: "consignado", label: "Consignado" },
];
const ESTOQUE_GIROS: Array<{ value: Produto["giro"]; label: string }> = [
  { value: "alto", label: "Alto" },
  { value: "médio", label: "Medio" },
  { value: "baixo", label: "Baixo" },
];
const PESO_PADRAO_GATO_KG = 3.5;

function normalizarTextoBusca(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isHttpUrl(value?: string | null): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function detalhesProdutoTexto(
  detalhes: ProdutoDetalhesTecnicos | undefined,
  keys: Array<keyof ProdutoDetalhesTecnicos>,
) {
  return keys
    .map((key) => detalhes?.[key])
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(" | ");
}

function montarMensagemProduto(
  produto: Produto,
  info: Record<EstoqueInfoKey, boolean>,
  incluirLinkFoto = true,
  descontoPercentual = 10,
) {
  const detalhes = produto.detalhesTecnicos;
  const descontoSeguro = Number.isFinite(descontoPercentual)
    ? Math.min(100, Math.max(0, descontoPercentual))
    : 0;
  const linhas = [`Tenho essa opcao aqui: ${produto.nome}`];

  if (info.preco) {
    linhas.push(`Preco real: ${brl(produto.preco)}`);
    if (descontoSeguro > 0) {
      linhas.push(
        `Etiqueta: ${descontoSeguro}% de desconto - por apenas ${brl(
          precoComDesconto(produto.preco, descontoSeguro),
        )}`,
      );
    }
  }
  if (info.disponibilidade) {
    linhas.push(
      produto.estoque > 0
        ? "Disponivel no estoque."
        : "Vou confirmar a disponibilidade certinha para voce.",
    );
  }
  if (info.marcaLinha) {
    const marcaLinha = detalhesProdutoTexto(detalhes, [
      "marca",
      "linha",
      "peso",
      "especie",
      "idade",
      "porte",
    ]);
    if (marcaLinha) linhas.push(marcaLinha);
  }
  if (info.indicacao && detalhes?.indicacao) linhas.push(`Indicacao: ${detalhes.indicacao}`);
  if (info.beneficios && detalhes?.beneficios) linhas.push(`Beneficios: ${detalhes.beneficios}`);
  if (info.ingredientes && detalhes?.principaisIngredientes) {
    linhas.push(`Ingredientes principais: ${detalhes.principaisIngredientes}`);
  }
  if (info.nutricional) {
    const nutricional = detalhesProdutoTexto(detalhes, [
      "proteinaBruta",
      "gordura",
      "fibra",
      "umidade",
      "calcio",
      "fosforo",
      "omega3",
      "omega6",
    ]);
    if (nutricional) linhas.push(`Info nutricional: ${nutricional}`);
  }
  if (incluirLinkFoto && info.foto && produto.fotoUrl) linhas.push(`Foto: ${produto.fotoUrl}`);

  return linhas.join("\n");
}

function carregarConjuntosEstoqueStorage(): EstoqueConjunto[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ESTOQUE_CONJUNTOS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item): EstoqueConjunto | null => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const nome = typeof row.nome === "string" ? row.nome.trim() : "";
        const skus = Array.isArray(row.skus)
          ? row.skus
              .map((sku) => (typeof sku === "string" ? sku.trim().toUpperCase() : ""))
              .filter(Boolean)
          : [];
        if (!nome || skus.length === 0) return null;

        return {
          id: typeof row.id === "string" && row.id.trim() ? row.id : `${nome}-${skus.join("-")}`,
          nome,
          skus: Array.from(new Set(skus)),
          criadoEm:
            typeof row.criadoEm === "string" && row.criadoEm.trim()
              ? row.criadoEm
              : new Date(0).toISOString(),
        };
      })
      .filter((item): item is EstoqueConjunto => Boolean(item))
      .slice(0, MAX_ESTOQUE_CONJUNTOS);
  } catch {
    return [];
  }
}

function salvarConjuntosEstoqueStorage(conjuntos: EstoqueConjunto[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    ESTOQUE_CONJUNTOS_STORAGE_KEY,
    JSON.stringify(conjuntos.slice(0, MAX_ESTOQUE_CONJUNTOS)),
  );
}

function produtoToEstoqueForm(produto: Produto): ProdutoEstoqueFormState {
  return {
    sku: produto.sku,
    nome: produto.nome,
    categoria: produto.categoria,
    tipo: produto.tipo,
    giro: produto.giro,
    fornecedor: produto.fornecedor ?? "",
    estoque: String(produto.estoque),
    minimo: String(produto.minimo),
    precoCompra: String(produto.precoCompra),
    preco: String(produto.preco),
  };
}

function numeroEstoqueForm(value: string) {
  return Number(value.replace(",", "."));
}

function estoqueFormToProduto(form: ProdutoEstoqueFormState, original: Produto): Produto | null {
  const estoque = Number(form.estoque);
  const minimo = Number(form.minimo);
  const preco = numeroEstoqueForm(form.preco);
  const precoCompra = numeroEstoqueForm(form.precoCompra);

  if (
    !form.sku.trim() ||
    !form.nome.trim() ||
    !form.categoria.trim() ||
    !Number.isInteger(estoque) ||
    !Number.isInteger(minimo) ||
    estoque < 0 ||
    minimo < 0 ||
    !Number.isFinite(preco) ||
    !Number.isFinite(precoCompra) ||
    preco < 0 ||
    precoCompra < 0
  ) {
    return null;
  }

  return {
    sku: form.sku.trim().toUpperCase(),
    nome: form.nome.trim(),
    categoria: form.categoria.trim(),
    estoque,
    minimo,
    giro: form.giro,
    preco,
    precoCompra,
    tipo: form.tipo,
    fornecedor: form.fornecedor.trim() || undefined,
    fotoUrl: original.fotoUrl,
    fotoPath: original.fotoPath,
    detalhesTecnicos: original.detalhesTecnicos,
  };
}

function parsePesoPetKg(value: unknown): number | undefined {
  if (typeof value === "string" && !value.trim()) return undefined;
  const texto =
    typeof value === "string" ? value.replace(",", ".").match(/\d+(?:\.\d+)?/)?.[0] : undefined;
  const numero = typeof value === "number" ? value : texto ? Number(texto) : Number.NaN;

  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
}

function formatPesoPetKg(value?: number) {
  if (value === undefined) return "";

  return String(value).replace(".", ",");
}

function aplicarPesoPadraoGato(pet: PetDetalhe): PetDetalhe {
  if (pet.especie !== "gato" || pet.pesoKg) return pet;

  return { ...pet, pesoKg: PESO_PADRAO_GATO_KG };
}

function normalizarTextoPet(value?: string): string | undefined {
  return value?.trim() || undefined;
}

function normalizarPetFormulario(pet: PetDetalhe): PetDetalhe {
  return aplicarPesoPadraoGato({
    ...pet,
    nome: pet.nome.trim(),
    raca: normalizarTextoPet(pet.raca),
    idade: normalizarTextoPet(pet.idade),
    nascimento: normalizarTextoPet(pet.nascimento),
    observacao: normalizarTextoPet(pet.observacao),
  });
}

function petTemConteudo(pet: PetDetalhe): boolean {
  return Boolean(
    pet.nome ||
    pet.especie ||
    pet.castrado !== undefined ||
    pet.raca ||
    pet.porte ||
    pet.pesoKg ||
    pet.idade ||
    pet.nascimento ||
    pet.observacao,
  );
}

function nomesPetsDetalhes(pets: PetDetalhe[]): string[] {
  const nomes = new Map<string, string>();

  for (const pet of pets) {
    const nome = pet.nome.trim();
    if (nome) nomes.set(nome.toLowerCase(), nome);
  }

  return [...nomes.values()];
}

function novoIdConjuntoEstoque() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function quickTemplateId() {
  return globalThis.crypto?.randomUUID?.() ?? `resposta-${Date.now()}`;
}

function sanitizeQuickTemplates(value: unknown): QuickMessageTemplate[] {
  if (!Array.isArray(value)) return DEFAULT_QUICK_MESSAGE_TEMPLATES;

  const templates = value
    .map((item): QuickMessageTemplate | null => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const text = typeof row.text === "string" ? row.text.trim() : "";
      if (!label || !text) return null;

      return {
        id: typeof row.id === "string" && row.id.trim() ? row.id : quickTemplateId(),
        label,
        text,
      };
    })
    .filter((item): item is QuickMessageTemplate => Boolean(item))
    .slice(0, 12);

  return templates.length > 0 ? templates : DEFAULT_QUICK_MESSAGE_TEMPLATES;
}

function carregarQuickTemplatesStorage(): QuickMessageTemplate[] {
  if (typeof window === "undefined") return DEFAULT_QUICK_MESSAGE_TEMPLATES;

  try {
    return sanitizeQuickTemplates(
      JSON.parse(window.localStorage.getItem(QUICK_MESSAGE_TEMPLATES_STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return DEFAULT_QUICK_MESSAGE_TEMPLATES;
  }
}

function salvarQuickTemplatesStorage(templates: QuickMessageTemplate[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    QUICK_MESSAGE_TEMPLATES_STORAGE_KEY,
    JSON.stringify(sanitizeQuickTemplates(templates)),
  );
}
const filtrosConversa: ("Todos" | ConversaFiltro)[] = [
  "Todos",
  "Novos leads",
  "Recompra",
  "Follow-up",
  "VIP",
  "Sem resposta",
  "Em negociação",
  "Upsell",
  "Pedido hoje",
];
const kanbanStages: KanbanStage[] = [
  "Hoje",
  "Recompra",
  "Follow-up",
  "Aguardando pagamento",
  "Upsell",
  "Risco",
];

export type ConversaView = Conversa & {
  telefone: string;
  historico: ConversaMensagem[];
  aguardandoHumano: boolean;
  iaAtiva: boolean | null;
  atualizado_em?: string;
  lidoAte?: string | null;
  historicoResumido?: boolean;
};

/** Conta as mensagens recebidas do cliente ainda nao lidas pelo operador. */
function contarNaoLidas(conversa: ConversaView, overrideMs?: number): number {
  const lidoServidorMs = conversa.lidoAte ? new Date(conversa.lidoAte).getTime() : NaN;
  const limites = [lidoServidorMs, overrideMs ?? NaN].filter((value) => Number.isFinite(value));
  const limite = limites.length > 0 ? Math.max(...limites) : null;

  let total = 0;
  for (const mensagem of conversa.historico) {
    const recebida = !mensagem.fromMe && mensagem.role !== "assistant" && mensagem.role !== "ai";
    if (!recebida) continue;
    if (limite == null) {
      total += 1;
      continue;
    }
    const horario = mensagem.at ? new Date(mensagem.at).getTime() : 0;
    if (horario > limite) total += 1;
  }
  return total;
}

function mapStageFromApi(value: unknown): KanbanStage {
  switch (value) {
    case "pos_venda":
      return "Follow-up";
    case "vendendo":
      return "Aguardando pagamento";
    case "inativo":
      return "Risco";
    default:
      return "Hoje";
  }
}

function mapApiConversa(row: Record<string, unknown>): ConversaView {
  const historico = Array.isArray(row.historico) ? (row.historico as ConversaMensagem[]) : [];
  const ultimaMsg = historico.at(-1) as { content?: unknown } | undefined;
  const atualizadoEm = typeof row.atualizado_em === "string" ? row.atualizado_em : "";
  const aguardandoHumano = Boolean(row.aguardando_humano);
  const iaAtiva = typeof row.ia_ativa === "boolean" ? row.ia_ativa : null;

  return {
    id: String(row.id ?? ""),
    cliente: String(row.nome_cliente ?? row.telefone ?? "Cliente"),
    telefone: String(row.telefone ?? ""),
    ultima: String(ultimaMsg?.content ?? ""),
    hora: formatarQuandoConversa(atualizadoEm),
    naoLidas: row.aguardando_humano ? 1 : 0,
    tag: statusConversaIa(aguardandoHumano, iaAtiva),
    estagio: mapStageFromApi(row.estagio),
    kanbanColumnId:
      typeof row.kanban_coluna === "string" && row.kanban_coluna
        ? row.kanban_coluna
        : defaultKanbanColumnId(row.estagio),
    valorPotencial: Number(row.valor_potencial ?? 0),
    resumoFinanceiro: mapResumoFinanceiroApi(row.resumo_financeiro),
    filtros: [],
    historico,
    aguardandoHumano,
    iaAtiva,
    atualizado_em: atualizadoEm,
    lidoAte: typeof row.lido_ate === "string" ? row.lido_ate : null,
    historicoResumido: row.historico_resumido === true,
  };
}

function mapResumoFinanceiroApi(value: unknown): ConversaView["resumoFinanceiro"] {
  if (!value || typeof value !== "object") return undefined;

  const row = value as Record<string, unknown>;
  return {
    totalGasto: Number(row.total_gasto ?? 0),
    lucroLiquido: Number(row.lucro_liquido ?? 0),
    totalDescontos: Number(row.total_descontos ?? 0),
    ticketMedio: Number(row.ticket_medio ?? 0),
    pedidos: Number(row.pedidos ?? 0),
  };
}

function horaMensagem(mensagem: ConversaMensagem): string | undefined {
  if (!mensagem?.at) return undefined;
  const date = new Date(String(mensagem.at));

  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}

function applyConversationAIState<T extends ConversaView>(
  conversation: T,
  aguardandoHumano: boolean,
  iaAtiva: boolean | null = !aguardandoHumano,
): T {
  return {
    ...conversation,
    aguardandoHumano,
    iaAtiva,
    tag: statusConversaIa(aguardandoHumano, iaAtiva),
    naoLidas: aguardandoHumano ? Math.max(Number(conversation.naoLidas ?? 0), 1) : 0,
  };
}

function statusConversaIa(aguardandoHumano: boolean, iaAtiva: boolean | null): Conversa["tag"] {
  if (aguardandoHumano && iaAtiva === true) return "Humano + IA";
  if (aguardandoHumano) return "Humano";
  return "IA";
}

function isConversationAIEnabled(conversation: ConversaView, globalAiDisabled: boolean): boolean {
  if (typeof conversation?.iaAtiva === "boolean") return conversation.iaAtiva;
  return !globalAiDisabled && !conversation?.aguardandoHumano;
}

function clienteFromConversa(active: ConversaView): Cliente {
  return {
    id: String(active?.id ?? active?.telefone ?? "conversa"),
    nome: String(active?.cliente ?? "Cliente"),
    telefone: String(active?.telefone ?? ""),
    endereco: "",
    bairro: "",
    pets: [],
    ticket: 0,
    frequencia: "",
    ultima: "",
    perfil: "Novo",
    origem: "WhatsApp IA",
    cac: 0,
    totalGasto: Number(active?.valorPotencial ?? 0),
    totalDescontos: 0,
    lucroLiquido: 0,
    pedidos: 0,
    proxRecompra: "",
    observacoes: "",
  };
}

function findClienteForConversation(active: ConversaView, clientes: Cliente[]) {
  const activeName = normalizeName(active?.cliente);

  const base =
    clientes.find((cliente) => phoneMatches(cliente.telefone, active?.telefone)) ??
    (activeName
      ? clientes.find((cliente) => normalizeName(cliente.nome) === activeName)
      : undefined) ??
    clienteFromConversa(active);

  return aplicarResumoFinanceiroConversa(base, active);
}

/**
 * Faz o painel "Financeiro do cliente" refletir o que a IA registrou naquela
 * conversa (todos os pedidos do telefone, pagos ou pendentes), em vez de apenas
 * os acumulados de venda paga/faturada gravados na ficha do cliente.
 */
function aplicarResumoFinanceiroConversa(cli: Cliente, active: ConversaView): Cliente {
  const resumo = active?.resumoFinanceiro;
  if (!resumo || resumo.pedidos <= 0) return cli;

  return {
    ...cli,
    totalGasto: resumo.totalGasto,
    lucroLiquido: resumo.lucroLiquido,
    totalDescontos: resumo.totalDescontos,
    ticket: resumo.ticketMedio,
    pedidos: resumo.pedidos,
  };
}

export function Conversas({
  conversasIniciais,
  clientesIniciais,
  iaStatus,
  kanbanColumns: kanbanColumnsIniciais = DEFAULT_KANBAN_COLUMNS,
}: {
  conversasIniciais: ConversaView[];
  clientesIniciais: Cliente[];
  iaStatus?: IaStatusPayload | null;
  kanbanColumns?: KanbanColumn[];
}) {
  const conversaSearch = useSearch({ from: "/conversas" });
  const telefoneLink = onlyDigits(conversaSearch.telefone);
  const clienteIdLink = conversaSearch.clienteId;
  const clienteNomeLink = conversaSearch.cliente;
  const [view, setView] = useState<"chat" | "kanban" | "regras">("chat");
  const [active, setActive] = useState<ConversaView | null>(conversasIniciais[0] ?? null);
  const [items, setItems] = useState<ConversaView[]>(conversasIniciais);
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>(
    sanitizeKanbanColumns(kanbanColumnsIniciais),
  );
  const [clientesAtuais, setClientesAtuais] = useState<Cliente[]>(clientesIniciais);
  const [filtro, setFiltro] = useState<(typeof filtrosConversa)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [globalAiDisabled, setGlobalAiDisabled] = useState(Boolean(iaStatus?.globalDesativada));
  const [globalAiSaving, setGlobalAiSaving] = useState(false);
  const [conversationAiSaving, setConversationAiSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingWhatsapp, setSyncingWhatsapp] = useState(false);
  const [scanningPagamentos, setScanningPagamentos] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [blockedList, setBlockedList] = useState<ConversaView[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const refreshingRef = useRef(false);
  const refreshingClientesRef = useRef(false);
  const { notify, enabled: notifEnabled, toggle: toggleNotif } = useMessageNotifications();
  const [readOverrides, setReadOverrides] = useState<Record<string, number>>({});
  const activeIdRef = useRef<string | null>(active?.id ?? null);
  const lastReadSentRef = useRef<Map<string, number>>(new Map());
  const lastConversationSyncRef = useRef(
    conversasIniciais.reduce<string | null>((latest, conversa) => {
      const value = conversa.atualizado_em;
      if (!value) return latest;
      return !latest || new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
    }, null),
  );
  const notificationsPrimedRef = useRef(false);
  const resumosFinanceirosRef = useRef<
    Record<string, NonNullable<ConversaView["resumoFinanceiro"]>>
  >({});

  useEffect(() => {
    activeIdRef.current = active?.id ?? null;
  }, [active]);

  useEffect(() => {
    if (!active?.id || !active.historicoResumido) return;

    const controller = new AbortController();
    void fetch(`/api/crm/conversas?detalhe=${encodeURIComponent(active.id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Falha ao carregar a conversa");
        return mapApiConversa(data as Record<string, unknown>);
      })
      .then((detail) => {
        setItems((current) =>
          current.map((item) =>
            item.id === detail.id
              ? {
                  ...item,
                  ...detail,
                  valorPotencial: item.valorPotencial,
                  resumoFinanceiro: item.resumoFinanceiro,
                }
              : item,
          ),
        );
        setActive((current) =>
          current?.id === detail.id
            ? {
                ...current,
                ...detail,
                valorPotencial: current.valorPotencial,
                resumoFinanceiro: current.resumoFinanceiro,
              }
            : current,
        );
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      });

    return () => controller.abort();
  }, [active?.historicoResumido, active?.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/conversas?financeiro=resumo", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Falha ao carregar resumo financeiro");
        return data as Record<
          string,
          {
            totalGasto: number;
            lucroLiquido: number;
            totalDescontos: number;
            ticketMedio: number;
            pedidos: number;
          }
        >;
      })
      .then((resumos) => {
        resumosFinanceirosRef.current = resumos;
        const applyResumo = (item: ConversaView): ConversaView => {
          const resumo = resumos[onlyDigits(item.telefone)];
          return resumo
            ? { ...item, valorPotencial: resumo.totalGasto, resumoFinanceiro: resumo }
            : item;
        };
        setItems((current) => current.map(applyResumo));
        setActive((current) => (current ? applyResumo(current) : current));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      });

    return () => controller.abort();
  }, []);

  const findLinkedConversation = useCallback(
    (list: ConversaView[]) => {
      const clienteCadastro = clienteIdLink
        ? clientesAtuais.find((cliente) => cliente.id === clienteIdLink)
        : undefined;
      const telefonesBusca = [telefoneLink, clienteCadastro?.telefone].filter(Boolean);
      const nomesBusca = [clienteNomeLink, clienteCadastro?.nome]
        .map((nome) => normalizeName(nome))
        .filter(Boolean);

      const byExactPhone = list.find((item) =>
        telefonesBusca.some((telefone) => phoneForMatch(item.telefone) === phoneForMatch(telefone)),
      );
      const byPhone = list.find((item) =>
        telefonesBusca.some((telefone) => phoneMatches(item.telefone, telefone)),
      );
      const byExactName = list.find((item) => nomesBusca.includes(normalizeName(item.cliente)));
      const byLooseName = list.find((item) => {
        const nomeConversa = normalizeName(item.cliente);
        return nomesBusca.some(
          (nome) =>
            nome.length >= 3 && (nomeConversa.includes(nome) || nome.includes(nomeConversa)),
        );
      });

      return byExactPhone ?? byPhone ?? byExactName ?? byLooseName ?? null;
    },
    [clienteIdLink, clienteNomeLink, clientesAtuais, telefoneLink],
  );

  useEffect(() => {
    if (!telefoneLink && !clienteIdLink) return;

    const next = findLinkedConversation(items);

    setView("chat");
    const nextBusca = next?.telefone || clienteNomeLink || telefoneLink;
    if (nextBusca && busca !== nextBusca) setBusca(nextBusca);
    if (next?.id !== active?.id) setActive(next);
  }, [
    active?.id,
    busca,
    clienteIdLink,
    clienteNomeLink,
    findLinkedConversation,
    items,
    telefoneLink,
  ]);

  // Marca a conversa como lida: zera o badge na hora e persiste no banco (com throttle).
  const markRead = useCallback((id: string | null | undefined) => {
    if (!id) return;
    const agora = Date.now();
    setReadOverrides((current) => ({ ...current, [id]: agora }));

    const ultimoEnvio = lastReadSentRef.current.get(id) ?? 0;
    if (agora - ultimoEnvio < 8000) return;
    lastReadSentRef.current.set(id, agora);

    void fetch("/api/crm/conversas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "marcar_lida", id, lidoAte: new Date(agora).toISOString() }),
    }).catch((error) => console.error(error));
  }, []);

  // Marca como lida ao abrir a conversa e quando a aba volta ao foco.
  useEffect(() => {
    if (!active?.id) return;
    if (document.hasFocus()) markRead(active.id);
    const onFocus = () => markRead(activeIdRef.current);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active?.id, markRead]);

  const unread = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      map[item.id] = contarNaoLidas(item, readOverrides[item.id]);
    }
    return map;
  }, [items, readOverrides]);

  const applyRemoteConversations = useCallback(
    (next: ConversaView[]) => {
      const nextComResumo = next.map((item) => {
        const resumo = resumosFinanceirosRef.current[onlyDigits(item.telefone)];
        return resumo
          ? { ...item, valorPotencial: resumo.totalGasto, resumoFinanceiro: resumo }
          : item;
      });
      setItems(nextComResumo);
      setActive((current) => {
        if (telefoneLink || clienteIdLink) return findLinkedConversation(nextComResumo);
        if (!current) return nextComResumo[0] ?? null;

        const byId = nextComResumo.find((item) => item.id === current.id);
        if (byId) return byId;

        const byPhone = nextComResumo.find((item) => phoneMatches(item.telefone, current.telefone));

        return byPhone ?? nextComResumo[0] ?? current;
      });
    },
    [clienteIdLink, findLinkedConversation, telefoneLink],
  );

  const applyRemoteConversationUpdates = useCallback((updates: ConversaView[]) => {
    if (updates.length === 0) return;

    const updatesComResumo = updates.map((item) => {
      const resumo = resumosFinanceirosRef.current[onlyDigits(item.telefone)];
      return resumo
        ? { ...item, valorPotencial: resumo.totalGasto, resumoFinanceiro: resumo }
        : item;
    });

    const merge = (previous: ConversaView, next: ConversaView): ConversaView => ({
      ...previous,
      ...next,
      valorPotencial:
        next.resumoFinanceiro === undefined ? previous.valorPotencial : next.valorPotencial,
      resumoFinanceiro: next.resumoFinanceiro ?? previous.resumoFinanceiro,
    });
    const byId = new Map(updatesComResumo.map((item) => [item.id, item]));

    setItems((current) => {
      const currentIds = new Set(current.map((item) => item.id));
      const merged = current.map((item) => {
        const update = byId.get(item.id);
        return update ? merge(item, update) : item;
      });
      for (const update of updatesComResumo) {
        if (!currentIds.has(update.id)) merged.push(update);
      }
      return merged.sort(
        (a, b) =>
          new Date(b.atualizado_em ?? 0).getTime() - new Date(a.atualizado_em ?? 0).getTime(),
      );
    });
    setActive((current) => {
      if (!current) return current;
      const update = byId.get(current.id);
      return update ? merge(current, update) : current;
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const desde = lastConversationSyncRef.current;
      // A conversa aberta volta completa; as demais so com as ultimas mensagens.
      const ativa = activeIdRef.current ? `&ativa=${encodeURIComponent(activeIdRef.current)}` : "";
      const endpoint = desde
        ? `/api/crm/conversas?desde=${encodeURIComponent(desde)}${ativa}`
        : "/api/crm/conversas";
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao atualizar conversas");
      if (Array.isArray(data)) {
        const next = data.map((row) => mapApiConversa(row as Record<string, unknown>));
        if (desde) applyRemoteConversationUpdates(next);
        else applyRemoteConversations(next);

        for (const conversa of next) {
          if (
            conversa.atualizado_em &&
            (!lastConversationSyncRef.current ||
              new Date(conversa.atualizado_em).getTime() >
                new Date(lastConversationSyncRef.current).getTime())
          ) {
            lastConversationSyncRef.current = conversa.atualizado_em;
          }
        }

        // Dispara o som/toast/titulo para mensagens novas (controle proprio de sessao).
        notify(next, activeIdRef.current);

        // Mantem a conversa aberta como lida enquanto a aba esta em foco.
        if (
          typeof document !== "undefined" &&
          document.hasFocus() &&
          activeIdRef.current &&
          next.some((conversa) => conversa.id === activeIdRef.current)
        ) {
          markRead(activeIdRef.current);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [applyRemoteConversationUpdates, applyRemoteConversations, notify, markRead]);

  const refreshClientes = useCallback(async () => {
    if (refreshingClientesRef.current) return;

    refreshingClientesRef.current = true;
    try {
      const response = await fetch("/api/crm/clientes", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao atualizar clientes");
      if (Array.isArray(data)) setClientesAtuais(data as Cliente[]);
    } catch (error) {
      console.error(error);
    } finally {
      refreshingClientesRef.current = false;
    }
  }, []);

  const refreshConversationsRef = useRef(refreshConversations);
  const refreshClientesRef = useRef(refreshClientes);
  const applyRemoteConversationsRef = useRef(applyRemoteConversations);

  useEffect(() => {
    refreshConversationsRef.current = refreshConversations;
    refreshClientesRef.current = refreshClientes;
    applyRemoteConversationsRef.current = applyRemoteConversations;
  }, [applyRemoteConversations, refreshClientes, refreshConversations]);

  useEffect(() => {
    if (!telefoneLink && !clienteIdLink) return;

    const controller = new AbortController();
    const conversaDireta = conversasIniciais[0];

    void fetch("/api/crm/conversas", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Falha ao carregar conversas");
        if (!Array.isArray(data)) return;

        const lista = data.map((row) => mapApiConversa(row as Record<string, unknown>));
        const listaComDetalhe = conversaDireta
          ? lista.map((item) =>
              item.id === conversaDireta.id
                ? {
                    ...item,
                    ...conversaDireta,
                    atualizado_em: item.atualizado_em ?? conversaDireta.atualizado_em,
                  }
                : item,
            )
          : lista;
        applyRemoteConversationsRef.current(listaComDetalhe);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      });

    void refreshClientesRef.current();

    return () => controller.abort();
  }, [clienteIdLink, conversasIniciais, telefoneLink]);

  useEffect(() => {
    if (!notificationsPrimedRef.current) {
      notify(conversasIniciais, activeIdRef.current);
      notificationsPrimedRef.current = true;
    }
  }, [conversasIniciais, notify]);

  useEffect(() => {
    const conversationsInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshConversationsRef.current();
    }, 10000);
    const clientesInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshClientesRef.current();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshConversationsRef.current();
        void refreshClientesRef.current();
      }
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(conversationsInterval);
      window.clearInterval(clientesInterval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const filtered = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNumerico = onlyDigits(busca);

    return items.filter((c) => {
      if (filtro !== "Todos" && !c.filtros.includes(filtro as ConversaFiltro)) return false;
      if (
        termo &&
        !c.cliente.toLowerCase().includes(termo) &&
        !String(c.ultima ?? "")
          .toLowerCase()
          .includes(termo) &&
        !(termoNumerico && phoneIncludes(c.telefone, termoNumerico))
      ) {
        return false;
      }
      return true;
    });
  }, [items, filtro, busca]);

  async function syncWhatsappHistory() {
    if (syncingWhatsapp) return;

    setSyncingWhatsapp(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "sincronizar_whatsapp",
          chatsLimite: 12,
          mensagensLimite: 40,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao sincronizar WhatsApp");

      await refreshConversations();
      toast.success(
        `WhatsApp sincronizado: ${data.conversas_sincronizadas ?? 0} conversas, ${data.clientes_registrados ?? 0} leads novos, ${data.mensagens_importadas ?? 0} mensagens novas`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel sincronizar");
    } finally {
      setSyncingWhatsapp(false);
    }
  }

  async function detectarPagamentos() {
    if (scanningPagamentos) return;

    setScanningPagamentos(true);
    try {
      let offset: number | null = 0;
      let confirmados = 0;
      let analisados = 0;
      let jaLancados = 0;
      let iteracoes = 0;

      while (offset !== null && iteracoes < 40) {
        iteracoes += 1;
        const response: Response = await fetch("/api/crm/pagamentos/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, limiteConversas: 6 }),
        });
        const data: {
          ok?: boolean;
          erro?: string;
          pagamentos_confirmados?: number;
          comprovantes_analisados?: number;
          comprovantes_ja_lancados?: number;
          proximo_offset?: number | null;
        } = await response.json();
        if (!response.ok || data.ok === false) {
          throw new Error(data.erro || "Falha ao detectar pagamentos");
        }

        confirmados += data.pagamentos_confirmados ?? 0;
        analisados += data.comprovantes_analisados ?? 0;
        jaLancados += data.comprovantes_ja_lancados ?? 0;
        offset = typeof data.proximo_offset === "number" ? data.proximo_offset : null;
      }

      await refreshConversations();
      toast.success(
        `Pagamentos detectados: ${confirmados} lancados no sistema, ${analisados} comprovantes analisados, ${jaLancados} ja estavam lancados`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel detectar pagamentos");
    } finally {
      setScanningPagamentos(false);
    }
  }

  async function toggleGlobalAI() {
    if (globalAiSaving) return;

    const previous = globalAiDisabled;
    const nextDisabled = !previous;

    setGlobalAiSaving(true);
    setGlobalAiDisabled(nextDisabled);

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "global",
          desativada: nextDisabled,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(errorBody?.erro || `Falha ao atualizar IA global (${response.status})`);
      }

      const saved = (await response.json()) as { globalDesativada?: boolean };
      const savedDisabled = saved.globalDesativada ?? nextDisabled;
      setGlobalAiDisabled(savedDisabled);
      toast.success(savedDisabled ? "IA global desligada" : "IA global ligada");
    } catch (error) {
      console.error(error);
      setGlobalAiDisabled(previous);
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel atualizar a IA global",
      );
    } finally {
      setGlobalAiSaving(false);
    }
  }

  async function toggleConversationAI(conversation: ConversaView) {
    if (!conversation || conversationAiSaving) return;

    const previous = conversation;
    const nextAiEnabled = !isConversationAIEnabled(conversation, globalAiDisabled);
    const nextAguardandoHumano = !nextAiEnabled;
    const optimistic = applyConversationAIState(conversation, nextAguardandoHumano, nextAiEnabled);

    setConversationAiSaving(true);
    setActive(optimistic);
    setItems((current) =>
      current.map((item) =>
        item.id === conversation.id
          ? applyConversationAIState(item, nextAguardandoHumano, nextAiEnabled)
          : item,
      ),
    );

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "conversa",
          id: conversation.id,
          aguardandoHumano: nextAguardandoHumano,
          iaAtiva: nextAiEnabled,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Falha ao atualizar conversa (${response.status})`);
      }

      const saved = (await response.json()) as {
        aguardando_humano?: boolean;
        aguardandoHumano?: boolean;
        ia_ativa?: boolean | null;
        iaAtiva?: boolean | null;
      };
      const savedState =
        typeof saved.aguardando_humano === "boolean"
          ? saved.aguardando_humano
          : typeof saved.aguardandoHumano === "boolean"
            ? saved.aguardandoHumano
            : nextAguardandoHumano;
      const savedIaAtiva =
        typeof saved.ia_ativa === "boolean"
          ? saved.ia_ativa
          : typeof saved.iaAtiva === "boolean"
            ? saved.iaAtiva
            : nextAiEnabled;
      const savedActive = applyConversationAIState(conversation, savedState, savedIaAtiva);

      setActive(savedActive);
      setItems((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? applyConversationAIState(item, savedState, savedIaAtiva)
            : item,
        ),
      );
      toast.success(savedState ? "IA da conversa desligada" : "IA da conversa ligada");
    } catch (error) {
      console.error(error);
      setActive(previous);
      setItems((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel atualizar a IA da conversa",
      );
    } finally {
      setConversationAiSaving(false);
    }
  }

  async function enableAIWhileWaiting(conversation: ConversaView) {
    if (!conversation || conversationAiSaving) return;

    const previous = conversation;
    const optimistic = applyConversationAIState(conversation, true, true);

    setConversationAiSaving(true);
    setActive(optimistic);
    setItems((current) =>
      current.map((item) =>
        item.id === conversation.id ? applyConversationAIState(item, true, true) : item,
      ),
    );

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "conversa",
          id: conversation.id,
          aguardandoHumano: true,
          iaAtiva: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Falha ao ativar IA nesta conversa (${response.status})`);
      }

      const saved = (await response.json()) as {
        aguardando_humano?: boolean;
        ia_ativa?: boolean | null;
      };
      const savedActive = applyConversationAIState(
        conversation,
        saved.aguardando_humano ?? true,
        saved.ia_ativa ?? true,
      );

      setActive(savedActive);
      setItems((current) =>
        current.map((item) =>
          item.id === conversation.id
            ? applyConversationAIState(item, savedActive.aguardandoHumano, savedActive.iaAtiva)
            : item,
        ),
      );
      toast.success("IA vai responder mesmo aguardando humano");
    } catch (error) {
      console.error(error);
      setActive(previous);
      setItems((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      toast.error(error instanceof Error ? error.message : "Nao foi possivel ativar a IA aqui");
    } finally {
      setConversationAiSaving(false);
    }
  }

  async function blockConversation(conversation: ConversaView) {
    if (!conversation) return;

    const alvo = conversation.cliente || conversation.telefone || "este contato";
    const confirmado = window.confirm(
      `Bloquear ${alvo}? A conversa some da lista do WhatsApp IA e a IA para de responder. ` +
        "Mesmo que essa pessoa mande mensagem de novo, ela nao reaparece aqui.",
    );
    if (!confirmado) return;

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "bloquear", id: conversation.id, bloqueado: true }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(errorBody?.erro || `Falha ao bloquear contato (${response.status})`);
      }

      setItems((current) => {
        const next = current.filter((item) => item.id !== conversation.id);
        setActive((act) => (act?.id === conversation.id ? (next[0] ?? null) : act));
        return next;
      });
      toast.success("Contato bloqueado e removido da lista");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel bloquear o contato");
    }
  }

  const openBlockedManager = useCallback(async () => {
    setShowBlocked(true);
    setBlockedLoading(true);
    try {
      const response = await fetch("/api/crm/conversas?bloqueados=lista", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.erro || "Falha ao carregar bloqueados");
      if (Array.isArray(data)) {
        setBlockedList(data.map((row) => mapApiConversa(row as Record<string, unknown>)));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel carregar bloqueados");
    } finally {
      setBlockedLoading(false);
    }
  }, []);

  async function unblockConversation(conversation: ConversaView) {
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "bloquear", id: conversation.id, bloqueado: false }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(errorBody?.erro || `Falha ao desbloquear contato (${response.status})`);
      }

      setBlockedList((current) => current.filter((item) => item.id !== conversation.id));
      void refreshConversations();
      toast.success("Contato desbloqueado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel desbloquear");
    }
  }

  async function moveKanbanConversation(conversation: ConversaView, column: KanbanColumn) {
    if (conversation.kanbanColumnId === column.id) return;

    const previous = conversation;
    const stage = mapStageFromApi(column.estagioInterno);
    const applyStage = (item: ConversaView): ConversaView =>
      item.id === conversation.id ? { ...item, estagio: stage, kanbanColumnId: column.id } : item;

    setItems((current) => current.map(applyStage));
    setActive((current) => (current?.id === conversation.id ? applyStage(current) : current));

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pipeline", id: conversation.id, columnId: column.id }),
      });
      const responseText = await response.text();
      const data = responseText
        ? (() => {
            try {
              return JSON.parse(responseText) as Record<string, unknown>;
            } catch {
              return { erro: responseText };
            }
          })()
        : {};

      if (!response.ok) {
        throw new Error(String(data.erro || "Falha ao mover conversa"));
      }

      const aguardandoHumano = Boolean(data.aguardando_humano);
      const iaAtiva =
        typeof data.ia_ativa === "boolean"
          ? data.ia_ativa
          : typeof previous.iaAtiva === "boolean"
            ? previous.iaAtiva
            : null;
      const applyServerState = (item: ConversaView): ConversaView =>
        item.id === conversation.id
          ? {
              ...item,
              estagio: stage,
              kanbanColumnId: column.id,
              aguardandoHumano,
              iaAtiva,
              tag: statusConversaIa(aguardandoHumano, iaAtiva),
            }
          : item;

      setItems((current) => current.map(applyServerState));
      setActive((current) =>
        current?.id === conversation.id ? applyServerState(current) : current,
      );
      toast.success(`Conversa movida para ${column.nome}`);
    } catch (error) {
      setItems((current) => current.map((item) => (item.id === previous.id ? previous : item)));
      setActive((current) => (current?.id === previous.id ? previous : current));
      toast.error(error instanceof Error ? error.message : "Nao foi possivel mover a conversa");
    }
  }

  async function saveKanbanColumns(columns: KanbanColumn[]) {
    const normalized = sanitizeKanbanColumns(columns);
    const response = await fetch("/api/crm/conversas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "kanban_config", columns: normalized }),
    });
    const data = (await response.json().catch(() => null)) as {
      columns?: unknown;
      erro?: string;
    } | null;
    if (!response.ok) throw new Error(data?.erro || "Falha ao salvar as colunas");
    const saved = sanitizeKanbanColumns(data?.columns ?? normalized);
    setKanbanColumns(saved);
    toast.success("Colunas do Kanban salvas");
  }

  return (
    <div className="flex h-[calc(100dvh-4.5rem)] min-h-0 flex-col gap-2 overflow-hidden md:h-[calc(100vh-7rem)] md:gap-3">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl xl:text-2xl">
            WhatsApp IA
          </h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm xl:text-xs">
            {filtered.length} conversas · {items.filter((c) => c.naoLidas > 0).length} não lidas ·{" "}
            <span className="text-success font-semibold">
              {brl(items.reduce((s, c) => s + c.valorPotencial, 0))}
            </span>{" "}
            em pipeline
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2 xl:flex-nowrap">
          <button
            type="button"
            onClick={() => void toggleNotif()}
            className={`grid size-10 shrink-0 place-items-center rounded-xl transition disabled:opacity-50 sm:size-10 xl:size-9 ${
              notifEnabled
                ? "bg-primary/15 text-primary hover:bg-primary/25"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
            title={
              notifEnabled
                ? "Notificacoes de novas mensagens ligadas"
                : "Ativar notificacoes de novas mensagens"
            }
            aria-label={
              notifEnabled ? "Desligar notificacoes" : "Ligar notificacoes de novas mensagens"
            }
            aria-pressed={notifEnabled}
          >
            {notifEnabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void syncWhatsappHistory()}
            disabled={syncingWhatsapp || refreshing}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Sincronizar historico do WhatsApp"
            aria-label="Sincronizar historico do WhatsApp"
          >
            <RotateCcw
              className={`size-4 ${syncingWhatsapp || refreshing ? "animate-spin" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => void detectarPagamentos()}
            disabled={scanningPagamentos}
            className="hidden size-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 sm:grid xl:size-9"
            title="Detectar pagamentos nas conversas e lancar vendas"
            aria-label="Detectar pagamentos nas conversas"
          >
            <Banknote className={`size-4 ${scanningPagamentos ? "animate-pulse" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => void openBlockedManager()}
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground sm:size-10 xl:size-9"
            title="Contatos bloqueados"
            aria-label="Gerenciar contatos bloqueados"
          >
            <Ban className="size-4" />
          </button>
          <span className="hidden sm:inline-flex">
            <AIAssistantToggle
              enabled={!globalAiDisabled}
              onToggle={toggleGlobalAI}
              saving={globalAiSaving}
              label="IA global"
              onText="Ligada para todos"
              offText="Desligada para todos"
            />
          </span>
          <div className="grid w-full min-w-0 grid-cols-3 rounded-lg bg-secondary p-1 sm:inline-flex sm:w-auto sm:shrink-0 sm:rounded-xl">
            <button
              onClick={() => setView("chat")}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap sm:h-9 sm:rounded-lg ${
                view === "chat" ? "bg-card shadow-sm" : ""
              }`}
            >
              <MessageSquare className="size-3.5" /> Chat
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap sm:h-9 sm:rounded-lg ${
                view === "kanban" ? "bg-card shadow-sm" : ""
              }`}
            >
              <LayoutGrid className="size-3.5" /> <span className="sm:hidden">Kanban</span>
              <span className="hidden sm:inline">Kanban IA</span>
            </button>
            <button
              onClick={() => setView("regras")}
              className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap sm:h-9 sm:rounded-lg ${
                view === "regras" ? "bg-card shadow-sm" : ""
              }`}
            >
              <Settings2 className="size-3.5" /> <span className="sm:hidden">Regras</span>
              <span className="hidden sm:inline">Regras da IA</span>
            </button>
          </div>
        </div>
        <div className="sm:hidden">
          <AIAssistantToggle
            enabled={!globalAiDisabled}
            onToggle={toggleGlobalAI}
            saving={globalAiSaving}
            label="IA global"
            onText="Ligada para todos"
            offText="Desligada para todos"
            showLabelOnMobile
            className="h-10 w-full justify-start"
          />
        </div>
      </div>

      {/* Filtros rápidos */}
      {view === "chat" && (
        <div className="hidden shrink-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-thin xl:flex">
          {filtrosConversa.map((f) => {
            const count =
              f === "Todos"
                ? items.length
                : items.filter((c) => c.filtros.includes(f as ConversaFiltro)).length;
            const ativo = filtro === f;
            return (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 border transition ${
                  ativo
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card border-border hover:border-foreground/30"
                }`}
              >
                {f}
                <span
                  className={`text-[10px] px-1.5 rounded-full ${
                    ativo ? "bg-background/20" : "bg-secondary"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {view === "chat" ? (
        active ? (
          <ChatView
            active={active}
            setActive={setActive}
            items={filtered}
            setItems={setItems}
            busca={busca}
            setBusca={setBusca}
            clientes={clientesAtuais}
            setClientes={setClientesAtuais}
            globalAiDisabled={globalAiDisabled}
            conversationAiSaving={conversationAiSaving}
            onToggleConversationAI={toggleConversationAI}
            onEnableAIWhileWaiting={enableAIWhileWaiting}
            onBlockConversation={blockConversation}
            unread={unread}
          />
        ) : (
          <div className="card-soft grid min-h-[55dvh] flex-1 place-items-center px-6 text-center text-sm text-muted-foreground md:min-h-0">
            Nenhuma conversa real encontrada.
          </div>
        )
      ) : view === "kanban" ? (
        <KanbanView
          items={items}
          columns={kanbanColumns}
          onMoveColumn={moveKanbanConversation}
          onSaveColumns={saveKanbanColumns}
          onOpenConversation={(conversation) => {
            setActive(conversation);
            setView("chat");
          }}
        />
      ) : (
        <IaRulesView />
      )}

      {showBlocked && (
        <BlockedContactsModal
          contacts={blockedList}
          loading={blockedLoading}
          onClose={() => setShowBlocked(false)}
          onUnblock={unblockConversation}
        />
      )}
    </div>
  );
}

function BlockedContactsModal({
  contacts,
  loading,
  onClose,
  onUnblock,
}: {
  contacts: ConversaView[];
  loading: boolean;
  onClose: () => void;
  onUnblock: (conversation: ConversaView) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-soft flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="inline-flex items-center gap-2 text-base font-bold">
            <Ban className="size-4 text-destructive" /> Contatos bloqueados
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Fechar"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum contato bloqueado. Bloqueie um contato pelo botão de bloqueio dentro da
              conversa.
            </p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{contact.cliente}</div>
                    <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Phone className="size-3" /> {contact.telefone}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnblock(contact)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-foreground/30 hover:bg-secondary"
                  >
                    Desbloquear
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatView({
  active,
  setActive,
  setItems,
  items,
  busca,
  setBusca,
  clientes,
  setClientes,
  globalAiDisabled,
  conversationAiSaving,
  onToggleConversationAI,
  onEnableAIWhileWaiting,
  onBlockConversation,
  unread,
}: {
  active: ConversaView;
  setActive: React.Dispatch<React.SetStateAction<ConversaView | null>>;
  setItems: React.Dispatch<React.SetStateAction<ConversaView[]>>;
  items: ConversaView[];
  busca: string;
  setBusca: (s: string) => void;
  clientes: Cliente[];
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>;
  globalAiDisabled: boolean;
  conversationAiSaving: boolean;
  onToggleConversationAI: (conversation: ConversaView) => void;
  onEnableAIWhileWaiting: (conversation: ConversaView) => void;
  onBlockConversation: (conversation: ConversaView) => void;
  unread: Record<string, number>;
}) {
  const cli = findClienteForConversation(active, clientes);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mensagens = Array.isArray(active.historico) ? active.historico : [];
  const [mobilePane, setMobilePane] = useState<"list" | "chat" | "context">("chat");
  const [quickTemplates, setQuickTemplates] = useState<QuickMessageTemplate[]>(() =>
    carregarQuickTemplatesStorage(),
  );
  const [configuringQuickTemplates, setConfiguringQuickTemplates] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [active.id, mensagens.length]);

  useEffect(() => {
    salvarQuickTemplatesStorage(quickTemplates);
  }, [quickTemplates]);

  function updateConversation(conversa: Partial<ConversaView>) {
    const ultimaMsg = Array.isArray(conversa.historico) ? conversa.historico.at(-1) : null;
    const updated = {
      ...active,
      ...conversa,
      ultima: String(ultimaMsg?.content ?? active.ultima ?? ""),
      hora: conversa.atualizado_em
        ? formatarQuandoConversa(String(conversa.atualizado_em))
        : active.hora,
      historico: Array.isArray(conversa.historico) ? conversa.historico : active.historico,
    };

    setActive(updated);
    setItems((current) =>
      current.map((item) => (item.id === active.id ? { ...item, ...updated } : item)),
    );
  }

  async function postConversation(body: Record<string, unknown>) {
    const response = await fetch("/api/crm/conversas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    const data = responseText
      ? (() => {
          try {
            return JSON.parse(responseText);
          } catch {
            return { erro: responseText };
          }
        })()
      : {};
    if (!response.ok)
      throw new Error(data.erro || data.mensagem || responseText || "Falha ao enviar mensagem");
    updateConversation(data);
    return data;
  }

  async function sendMessage(text = messageText) {
    const texto = text.trim();
    if (!texto || sending) return;

    setSending(true);
    try {
      await postConversation({ tipo: "mensagem", id: active.id, telefone: active.telefone, texto });
      setMessageText("");
      toast.success("Mensagem enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel enviar");
    } finally {
      setSending(false);
    }
  }

  async function sendProductMessages(produtos: ProdutoEnvioCrm[]) {
    const itens = produtos
      .map((produto, index) => ({
        ...produto,
        texto: produto.texto.trim(),
        nomeArquivo: produto.nomeArquivo ?? `produto-${active.id}-${index + 1}.jpg`,
        mimeType: produto.mimeType ?? "image/jpeg",
      }))
      .filter((produto) => produto.texto);
    if (itens.length === 0 || sending) return;

    setSending(true);
    let fotosFalharam = 0;
    try {
      for (const item of itens) {
        if (item.fotoUrl) {
          try {
            await postConversation({
              tipo: "midia_url",
              id: active.id,
              telefone: active.telefone,
              mediaUrl: item.fotoUrl,
              legenda: item.texto,
              nomeArquivo: item.nomeArquivo,
              mimeType: item.mimeType,
            });
            continue;
          } catch (error) {
            fotosFalharam += 1;
            console.warn(
              "[conversas] falha_envio_foto_produto",
              error instanceof Error ? error.message : String(error),
            );
          }
        }

        await postConversation({
          tipo: "mensagem",
          id: active.id,
          telefone: active.telefone,
          texto: isHttpUrl(item.fotoUrl) ? `${item.texto}\nFoto: ${item.fotoUrl}` : item.texto,
        });
      }

      setMessageText("");
      if (fotosFalharam > 0) {
        toast.warning(
          fotosFalharam === itens.length
            ? "Produto enviado sem foto porque a imagem nao estava disponivel"
            : `${fotosFalharam} foto(s) falharam; enviei o texto mesmo assim`,
        );
      } else {
        toast.success(
          itens.length === 1
            ? itens[0]?.fotoUrl
              ? "Produto enviado com foto"
              : "Produto enviado"
            : `${itens.length} produtos enviados`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel enviar os produtos");
    } finally {
      setSending(false);
    }
  }

  async function sendProductMessage(text: string, fotoUrl?: string | null) {
    await sendProductMessages([{ texto: text, fotoUrl }]);
  }

  async function moveConversationToStage(stage: KanbanStage) {
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pipeline", id: active.id, stage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao mover conversa");

      const updated = {
        ...active,
        estagio: stage,
        kanbanColumnId:
          typeof data.kanban_coluna === "string" ? data.kanban_coluna : active.kanbanColumnId,
        aguardandoHumano: Boolean(data.aguardando_humano),
      };
      setActive(updated);
      setItems((current) =>
        current.map((item) => (item.id === active.id ? { ...item, ...updated } : item)),
      );
      toast.success(`Conversa movida para ${stage}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel mover a conversa");
    }
  }
  async function sendAiSuggestion() {
    const texto = messageText.trim() || "Sugira uma resposta curta e natural para o cliente.";
    if (sending) return;

    setSending(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "sugestao_ia", historico: mensagens, texto }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao gerar sugestao");
      setMessageText(String(data.resposta ?? ""));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel gerar a resposta");
    } finally {
      setSending(false);
    }
  }

  function draftMessage(text: string) {
    setMessageText(text);
    setMobilePane("chat");
    toast.info("Mensagem carregada no campo de envio");
  }

  function updateQuickTemplate(id: string, patch: Partial<QuickMessageTemplate>) {
    setQuickTemplates((current) =>
      current.map((template) => (template.id === id ? { ...template, ...patch } : template)),
    );
  }

  function addQuickTemplate() {
    setQuickTemplates((current) => [
      ...current,
      {
        id: quickTemplateId(),
        label: "Nova resposta",
        text: "Digite aqui a mensagem pronta.",
      },
    ]);
    setConfiguringQuickTemplates(true);
  }

  function removeQuickTemplate(id: string) {
    setQuickTemplates((current) => {
      const next = current.filter((template) => template.id !== id);
      return next.length > 0 ? next : DEFAULT_QUICK_MESSAGE_TEMPLATES;
    });
  }

  async function sendFile(file: File, audio = false) {
    if (sending) return;

    setSending(true);
    try {
      const base64 = await fileToBase64(file);
      await postConversation({
        tipo: "midia",
        id: active.id,
        telefone: active.telefone,
        base64,
        legenda: audio ? undefined : messageText,
        nomeArquivo: file.name,
        mimeType: file.type,
        audio,
      });
      if (!audio) setMessageText("");
      toast.success(audio ? "Audio enviado" : "Midia enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel enviar a midia");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 xl:grid xl:grid-cols-[260px_minmax(0,1fr)_300px] xl:gap-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm xl:hidden">
        <button
          type="button"
          onClick={() => setMobilePane("list")}
          aria-pressed={mobilePane === "list"}
          className={`h-9 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            mobilePane === "list" ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Menu className="size-4" /> Conversas
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("chat")}
          aria-pressed={mobilePane === "chat"}
          className={`h-9 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            mobilePane === "chat" ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          <MessageSquare className="size-4" /> Chat
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("context")}
          aria-pressed={mobilePane === "context"}
          className={`h-9 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            mobilePane === "context" ? "bg-card shadow-sm" : "text-muted-foreground"
          }`}
        >
          <PanelRightOpen className="size-4" /> Contexto
        </button>
      </div>

      <div
        className={`min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm xl:rounded-[1.25rem] ${
          mobilePane === "list" ? "flex" : "hidden"
        } xl:flex`}
      >
        <div className="border-b border-border p-2.5 sm:p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar conversa"
              className="h-11 w-full rounded-lg bg-secondary pl-9 pr-3 text-sm outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
          {items.map((item) => {
            const naoLidas = unread[item.id] ?? 0;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActive(item);
                  setMobilePane("chat");
                }}
                className={`w-full border-b border-border/60 px-2.5 py-3 text-left transition last:border-b-0 ${
                  item.id === active.id ? "bg-primary/10" : "hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {naoLidas > 0 && (
                      <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
                    )}
                    <span className="truncate text-sm font-bold">{item.cliente}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{item.hora}</span>
                    {naoLidas > 0 && (
                      <span
                        className="grid h-5 min-w-5 place-items-center rounded-full bg-success px-1.5 text-[11px] font-bold leading-none text-success-foreground"
                        aria-label={`${naoLidas} ${naoLidas === 1 ? "mensagem nova" : "mensagens novas"}`}
                      >
                        {naoLidas > 99 ? "99+" : naoLidas}
                      </span>
                    )}
                  </span>
                </div>
                <p
                  className={`mt-1 truncate text-xs ${
                    naoLidas > 0 ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {item.ultima || "Sem mensagens"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm xl:rounded-[1.25rem] ${
          mobilePane === "chat" ? "flex" : "hidden"
        } xl:flex`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-2.5 sm:p-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobilePane("list")}
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground xl:hidden"
              aria-label="Abrir lista de conversas"
              title="Conversas"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-base font-bold sm:text-lg">{active.cliente}</div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Phone className="size-3" /> {active.telefone}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {active.aguardandoHumano && active.iaAtiva !== true && (
              <button
                type="button"
                disabled={conversationAiSaving}
                onClick={() => onEnableAIWhileWaiting(active)}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary/35 bg-primary/10 px-2.5 text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:cursor-wait disabled:opacity-70"
                title="Fazer a IA responder mesmo aguardando humano"
              >
                <Bot className="size-4" />
                <span className="hidden sm:inline">IA responder</span>
              </button>
            )}
            <AIAssistantToggle
              enabled={isConversationAIEnabled(active, globalAiDisabled)}
              onToggle={() => onToggleConversationAI(active)}
              saving={conversationAiSaving}
              label="IA da conversa"
              onText={globalAiDisabled ? "Ligada so aqui" : "Ligada aqui"}
              offText={globalAiDisabled ? "Desligada aqui" : "Manual aqui"}
            />
            <span className="hidden sm:inline-flex">
              <StatusBadge value={active.tag} />
            </span>
            <button
              type="button"
              onClick={() => onBlockConversation(active)}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              aria-label="Bloquear e remover contato"
              title="Bloquear contato (some da lista e a IA para de responder)"
            >
              <Ban className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobilePane("context")}
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary text-muted-foreground"
              aria-label="Abrir contexto e acoes"
              title="Contexto e acoes"
            >
              <MoreVertical className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin bg-secondary/20 p-2.5 space-y-2.5 sm:p-4 sm:space-y-3">
          {mensagens.length > 0 ? (
            mensagens.map((mensagem: ConversaMensagem, index: number) => {
              const dia = chaveDiaConversa(mensagem.at);
              const diaAnterior = index > 0 ? chaveDiaConversa(mensagens[index - 1]?.at) : null;
              return (
                <Fragment key={`${mensagem.role}-${index}`}>
                  {dia && dia !== diaAnterior && (
                    <DateChip>{formatarDiaConversa(mensagem.at)}</DateChip>
                  )}
                  <Bubble
                    side={mensagem.role === "assistant" || mensagem.role === "ai" ? "me" : "them"}
                    ai={mensagem.role === "assistant" || mensagem.role === "ai"}
                    hora={horaMensagem(mensagem)}
                    message={mensagem}
                  >
                    {mensagem.content}
                  </Bubble>
                </Fragment>
              );
            })
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Nenhuma mensagem nesta conversa.
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border bg-card p-2.5 space-y-2 sm:p-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="-mx-0.5 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 scrollbar-thin">
                {quickTemplates.map((template) => (
                  <QuickReply
                    key={template.id}
                    label={template.label}
                    onClick={() => draftMessage(template.text)}
                  />
                ))}
                <QuickReply
                  label="Sugerir upsell"
                  icon={<Sparkles className="size-3" />}
                  onClick={sendAiSuggestion}
                />
              </div>
              <button
                type="button"
                onClick={() => setConfiguringQuickTemplates((current) => !current)}
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
                title="Configurar respostas prontas"
                aria-label="Configurar respostas prontas"
              >
                <Settings2 className="size-4" />
              </button>
            </div>
            {configuringQuickTemplates && (
              <div className="rounded-lg border border-border bg-secondary/30 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold">Respostas prontas</div>
                  <button
                    type="button"
                    onClick={addQuickTemplate}
                    className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-primary/15 px-2 text-[10px] font-bold text-primary hover:bg-primary/25"
                  >
                    <Plus className="size-3" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {quickTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="grid grid-cols-[90px_minmax(0,1fr)_auto] gap-1.5"
                    >
                      <input
                        value={template.label}
                        onChange={(event) =>
                          updateQuickTemplate(template.id, { label: event.target.value })
                        }
                        className="h-8 rounded-md bg-card px-2 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-primary/25"
                        placeholder="Nome"
                      />
                      <input
                        value={template.text}
                        onChange={(event) =>
                          updateQuickTemplate(template.id, { text: event.target.value })
                        }
                        className="h-8 min-w-0 rounded-md bg-card px-2 text-[11px] outline-none focus:ring-2 focus:ring-primary/25"
                        placeholder="Mensagem"
                      />
                      <button
                        type="button"
                        onClick={() => removeQuickTemplate(template.id)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"
                        aria-label={`Remover resposta ${template.label}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void sendFile(file);
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void sendFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-50 sm:size-10"
            >
              <Paperclip className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={sending}
              className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-secondary text-muted-foreground disabled:opacity-50 sm:size-10"
            >
              <ImageIcon className="size-5" />
            </button>
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              placeholder="Mensagem ou /comando IA..."
              className="min-h-9 flex-1 resize-none rounded-lg bg-secondary px-3 py-2 text-sm outline-none ring-primary/30 focus:bg-card focus:ring-2 max-h-28"
            />
            <button
              type="button"
              onClick={sendAiSuggestion}
              disabled={sending}
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary transition hover:bg-primary/25 disabled:opacity-50"
              title="Resposta IA"
            >
              <Sparkles className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={sending || !messageText.trim()}
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-success text-success-foreground shadow hover:bg-success/90 disabled:opacity-50"
              title="Enviar mensagem"
            >
              <Send className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* CRM PANEL */}
      <CrmPanel
        cli={cli}
        mensagens={mensagens}
        active={active}
        onClienteSaved={(cliente) => {
          setClientes((current) => {
            const index = current.findIndex(
              (item) => item.id === cliente.id || phoneMatches(item.telefone, cliente.telefone),
            );
            if (index < 0) return [cliente, ...current];
            return current.map((item, itemIndex) => (itemIndex === index ? cliente : item));
          });
          setActive((current) => {
            const currentConversation = current ?? active;

            return {
              ...currentConversation,
              cliente: cliente.nome || currentConversation.cliente,
              telefone: cliente.telefone || currentConversation.telefone,
            };
          });
          setItems((current) =>
            current.map((item) =>
              item.id === active.id
                ? {
                    ...item,
                    cliente: cliente.nome || item.cliente,
                    telefone: cliente.telefone || item.telefone,
                  }
                : item,
            ),
          );
        }}
        onDraftMessage={draftMessage}
        onSendProduct={(text, fotoUrl) => void sendProductMessage(text, fotoUrl)}
        onSendProducts={sendProductMessages}
        onMoveKanban={() => void moveConversationToStage("Follow-up")}
        onOpenHistory={() => {
          const resumo = mensagens
            .slice(-6)
            .map(
              (mensagem: ConversaMensagem) =>
                `${mensagem.role === "user" ? "Cliente" : "CRM"}: ${mensagem.content}`,
            )
            .join("\n");
          setMessageText(
            resumo ? `Historico recente:\n${resumo}` : "Ainda nao ha historico nesta conversa.",
          );
          toast.info("Historico carregado no campo de mensagem");
        }}
        mobileOpen={mobilePane === "context"}
      />
    </div>
  );
}

function IaRulesView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [basePrompt, setBasePrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [regras, setRegras] = useState<IaRegra[]>([]);
  const [aprendizado, setAprendizado] = useState<IaAprendizado>(EMPTY_LEARNING);

  useEffect(() => {
    let alive = true;

    async function loadConfig() {
      try {
        const response = await fetch("/api/crm/conversas?ia=config", { cache: "no-store" });
        if (!response.ok) throw new Error(await response.text());

        const payload = (await response.json()) as IaConfigPayload;
        if (!alive) return;

        setBasePrompt(payload.baseSystemPrompt);
        setSystemPrompt(payload.systemPrompt || payload.baseSystemPrompt);
        setRegras(payload.regras ?? []);
        setAprendizado(payload.aprendizado ?? EMPTY_LEARNING);
      } catch (error) {
        console.error(error);
        toast.error("Nao foi possivel carregar as regras da IA");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadConfig();
    return () => {
      alive = false;
    };
  }, []);

  function addRegra() {
    setRegras((current) => [
      ...current,
      {
        id: `regra-${Date.now()}`,
        titulo: "Nova regra",
        instrucao: "Descreva como a Ana deve mudar o comportamento.",
        ativa: true,
      },
    ]);
  }

  async function saveConfig() {
    setSaving(true);

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "ia_config", systemPrompt, regras }),
      });

      if (!response.ok) throw new Error(await response.text());

      const payload = (await response.json()) as { systemPrompt: string; regras: IaRegra[] };
      setSystemPrompt(payload.systemPrompt);
      setRegras(payload.regras);
      toast.success("Regras da IA salvas");
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel salvar as regras");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card-soft grid flex-1 place-items-center text-sm text-muted-foreground">
        Carregando regras da IA...
      </div>
    );
  }

  return (
    <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 min-h-0">
      <div className="card-soft min-h-0 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Prompt e regras da Ana</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edite o prompt principal ou adicione regras complementares sem apagar o texto base.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSystemPrompt(basePrompt)}
              className="h-9 px-3 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-secondary/70"
            >
              <RotateCcw className="size-3.5" /> Restaurar base
            </button>
            <button
              type="button"
              onClick={() => void saveConfig()}
              disabled={saving}
              className="h-9 px-3 rounded-lg bg-foreground text-background text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="size-3.5" /> {saving ? "Salvando" : "Salvar"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <label className="block">
            <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
              System prompt editavel
            </span>
            <textarea
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className="mt-2 min-h-[360px] w-full resize-y rounded-xl border border-border bg-secondary/60 p-3 font-mono text-xs leading-5 outline-none focus:border-primary focus:bg-card"
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">Regras complementares</h3>
                <p className="text-xs text-muted-foreground">
                  Entram no system prompt junto com o texto acima.
                </p>
              </div>
              <button
                type="button"
                onClick={addRegra}
                className="h-9 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/25"
              >
                <Plus className="size-3.5" /> Nova regra
              </button>
            </div>

            {regras.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                Nenhuma regra customizada criada.
              </div>
            ) : (
              <div className="space-y-2">
                {regras.map((regra) => (
                  <div
                    key={regra.id}
                    className="rounded-xl border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={regra.ativa}
                        onChange={(event) =>
                          setRegras((current) =>
                            current.map((item) =>
                              item.id === regra.id
                                ? { ...item, ativa: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        className="size-4 accent-primary"
                      />
                      <input
                        value={regra.titulo}
                        onChange={(event) =>
                          setRegras((current) =>
                            current.map((item) =>
                              item.id === regra.id ? { ...item, titulo: event.target.value } : item,
                            ),
                          )
                        }
                        className="h-9 flex-1 rounded-lg bg-secondary px-3 text-sm font-semibold outline-none focus:ring-2 ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRegras((current) => current.filter((item) => item.id !== regra.id))
                        }
                        className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <textarea
                      value={regra.instrucao}
                      onChange={(event) =>
                        setRegras((current) =>
                          current.map((item) =>
                            item.id === regra.id
                              ? { ...item, instrucao: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="min-h-20 w-full resize-y rounded-lg bg-secondary p-3 text-sm outline-none focus:ring-2 ring-primary/30"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-soft overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-border">
          <div className="text-xs text-muted-foreground">Pontuacao de aprendizado</div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="text-4xl font-bold tabular-nums">{aprendizado.pontuacao}</div>
            <div className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
              {aprendizado.nivel}
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(aprendizado.pontuacao, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Licoes" value={String(aprendizado.total)} />
            <Stat label="7 dias" value={String(aprendizado.recentes7d)} accent="success" />
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2">Criterios</h3>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {aprendizado.criterios.map((criterio) => (
                    <tr key={criterio.nome} className="border-t border-border first:border-t-0">
                      <td className="px-3 py-2 text-muted-foreground">{criterio.nome}</td>
                      <td className="px-3 py-2 font-semibold">{criterio.valor}</td>
                      <td className="px-3 py-2 text-right font-bold text-primary">
                        +{criterio.pontos}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold mb-2">Ultimos aprendizados</h3>
            {aprendizado.aprendizados.length === 0 ? (
              <div className="rounded-xl bg-secondary/50 p-4 text-xs text-muted-foreground">
                A IA ainda nao salvou aprendizados suficientes.
              </div>
            ) : (
              <div className="space-y-2">
                {aprendizado.aprendizados.map((item, index) => (
                  <div key={`${item.criadoEm}-${index}`} className="rounded-xl bg-secondary/50 p-3">
                    <div className="text-xs font-medium leading-relaxed">{item.licao}</div>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {new Date(item.criadoEm).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CrmPanel({
  cli,
  mensagens,
  active,
  onClienteSaved,
  onDraftMessage,
  onSendProduct,
  onSendProducts,
  onMoveKanban,
  onOpenHistory,
  mobileOpen = false,
}: {
  cli: Cliente;
  mensagens: ConversaMensagem[];
  active: ConversaView;
  onClienteSaved: (cliente: Cliente) => void;
  onDraftMessage: (text: string) => void;
  onSendProduct: (text: string, fotoUrl?: string | null) => void;
  onSendProducts: (produtos: ProdutoEnvioCrm[]) => Promise<void>;
  onMoveKanban: () => void;
  onOpenHistory: () => void;
  mobileOpen?: boolean;
}) {
  const cacRoi = cli.totalGasto > 0 && cli.cac > 0 ? (cli.totalGasto / cli.cac).toFixed(1) : "∞";
  const textoCliente = mensagens
    .filter((mensagem) => mensagem.role === "user")
    .map((mensagem) => String(mensagem.content ?? ""))
    .join("\n")
    .toLowerCase();
  const aprendizadosContexto = [
    cli.observacoes ? cli.observacoes : null,
    cli.followUpManual?.mensagem ? `Follow-up: ${cli.followUpManual.mensagem}` : null,
    textoCliente.includes("pix") ? "Cliente citou Pix na conversa." : null,
    textoCliente.includes("cartao") || textoCliente.includes("cartão")
      ? "Cliente citou cartao na conversa."
      : null,
    textoCliente.includes("dinheiro") ? "Cliente citou dinheiro na conversa." : null,
    ...mensagens
      .filter((mensagem) => mensagem.role === "user")
      .map((mensagem) => String(mensagem.content ?? ""))
      .filter((texto) =>
        /ra[cç][aã]o|golden|formula|f[oó]rmula|simparic|pet|gato|cachorro/i.test(texto),
      )
      .slice(-2)
      .map((texto) => `Interesse citado: ${texto}`),
  ].filter((item): item is string => Boolean(item));
  const especiesContexto = cli.especies?.length
    ? cli.especies
    : [
        textoCliente.match(/\b(gato|gata|felino|felina)\b/) ? ("gato" as const) : null,
        textoCliente.match(/\b(cachorro|cadela|cao|cão|dog)\b/) ? ("cachorro" as const) : null,
      ].filter((item): item is "cachorro" | "gato" => Boolean(item));
  const [loadingIa, setLoadingIa] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [produtosEstoque, setProdutosEstoque] = useState<Produto[]>([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [buscaEstoque, setBuscaEstoque] = useState("");
  const [estoqueInfo, setEstoqueInfo] =
    useState<Record<EstoqueInfoKey, boolean>>(DEFAULT_ESTOQUE_INFO);
  const [descontoEstoque, setDescontoEstoque] = useState("10");
  const [showEstoquePopup, setShowEstoquePopup] = useState(false);
  const [selecionadosSku, setSelecionadosSku] = useState<string[]>([]);
  const [conjuntosEstoque, setConjuntosEstoque] = useState<EstoqueConjunto[]>(() =>
    carregarConjuntosEstoqueStorage(),
  );
  const [nomeConjunto, setNomeConjunto] = useState("");
  const [enviandoEstoque, setEnviandoEstoque] = useState(false);
  const [produtoEditandoEstoque, setProdutoEditandoEstoque] = useState<Produto | null>(null);
  const [estoqueEditForm, setEstoqueEditForm] = useState<ProdutoEstoqueFormState | null>(null);
  const [salvandoProdutoEstoque, setSalvandoProdutoEstoque] = useState(false);
  const [excluindoProdutoSku, setExcluindoProdutoSku] = useState<string | null>(null);
  const [petsDetalhe, setPetsDetalhe] = useState<PetDetalhe[]>(() => cli.petsDetalhes ?? []);
  const [pesoPetDrafts, setPesoPetDrafts] = useState<Record<string, string>>({});
  const [sugerindoPets, setSugerindoPets] = useState(false);
  const [salvandoPets, setSalvandoPets] = useState(false);
  const [manual, setManual] = useState({
    nome: cli.nome,
    telefone: cli.telefone,
    endereco: cli.endereco,
    bairro: cli.bairro,
    pets: cli.pets.join(", "),
    perfil: cli.perfil,
    origem: cli.origem || "WhatsApp IA",
    observacoes: cli.observacoes ?? "",
    followUpMensagem: cli.followUpManual?.mensagem ?? "",
    followUpData: cli.followUpManual?.data ?? "",
    followUpHora: cli.followUpManual?.hora ?? "",
    followUpMidiaUrl: cli.followUpManual?.midiaUrl ?? "",
    followUpMidiaNome: cli.followUpManual?.midiaNome ?? "",
    followUpMidiaTipo: cli.followUpManual?.midiaTipo ?? "",
  });

  useEffect(() => {
    setManual({
      nome: cli.nome,
      telefone: cli.telefone,
      endereco: cli.endereco,
      bairro: cli.bairro,
      pets: cli.pets.join(", "),
      perfil: cli.perfil,
      origem: cli.origem || "WhatsApp IA",
      observacoes: cli.observacoes ?? "",
      followUpMensagem: cli.followUpManual?.mensagem ?? "",
      followUpData: cli.followUpManual?.data ?? "",
      followUpHora: cli.followUpManual?.hora ?? "",
      followUpMidiaUrl: cli.followUpManual?.midiaUrl ?? "",
      followUpMidiaNome: cli.followUpManual?.midiaNome ?? "",
      followUpMidiaTipo: cli.followUpManual?.midiaTipo ?? "",
    });
  }, [
    cli.bairro,
    cli.endereco,
    cli.followUpManual?.data,
    cli.followUpManual?.hora,
    cli.followUpManual?.mensagem,
    cli.followUpManual?.midiaNome,
    cli.followUpManual?.midiaTipo,
    cli.followUpManual?.midiaUrl,
    cli.id,
    cli.nome,
    cli.observacoes,
    cli.origem,
    cli.perfil,
    cli.pets,
    cli.telefone,
  ]);

  // Resincroniza os dados do pet so ao trocar de conversa, para nao sobrescrever
  // edicoes em andamento quando a lista de clientes atualiza em segundo plano.
  useEffect(() => {
    setPetsDetalhe((cli.petsDetalhes ?? []).map(aplicarPesoPadraoGato));
    setPesoPetDrafts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cli.id]);

  function atualizarPet(index: number, campo: keyof PetDetalhe, valor: string) {
    if (campo === "pesoKg") {
      setPesoPetDrafts((current) => ({ ...current, [String(index)]: valor }));
    }
    if (campo === "especie" && valor === "gato") {
      setPesoPetDrafts((current) =>
        current[String(index)] ? current : { ...current, [String(index)]: "3,5" },
      );
    }

    setPetsDetalhe((prev) =>
      prev.map((pet, i) => {
        if (i !== index) return pet;
        if (campo === "pesoKg") {
          return { ...pet, pesoKg: parsePesoPetKg(valor) };
        }
        if (campo === "especie") {
          const especie = valor === "cachorro" || valor === "gato" ? valor : undefined;
          const pesoKg = especie === "gato" && !pet.pesoKg ? PESO_PADRAO_GATO_KG : pet.pesoKg;

          return { ...pet, especie, pesoKg };
        }
        if (campo === "porte") {
          return {
            ...pet,
            porte:
              valor === "pequeno" || valor === "medio" || valor === "grande" ? valor : undefined,
          };
        }
        if (campo === "castrado") {
          return {
            ...pet,
            castrado: valor === "sim" ? true : valor === "nao" ? false : undefined,
          };
        }
        return { ...pet, [campo]: valor };
      }),
    );
  }

  function finalizarEdicaoPesoPet(index: number, pet: PetDetalhe, valor: string) {
    const numero =
      parsePesoPetKg(valor) ?? (pet.especie === "gato" ? PESO_PADRAO_GATO_KG : undefined);

    setPetsDetalhe((prev) =>
      prev.map((item, i) => (i === index ? { ...item, pesoKg: numero } : item)),
    );
    setPesoPetDrafts((current) => {
      const next = { ...current };
      if (numero === undefined) {
        delete next[String(index)];
      } else {
        next[String(index)] = formatPesoPetKg(numero);
      }

      return next;
    });
  }

  function adicionarPet() {
    setPetsDetalhe((prev) => [...prev, { nome: "" }]);
  }

  function removerPet(index: number) {
    setPetsDetalhe((prev) => prev.filter((_, i) => i !== index));
    setPesoPetDrafts({});
  }

  async function sugerirPetsIa() {
    if (sugerindoPets) return;
    if (mensagens.length === 0) {
      toast.error("Sem conversa para a IA analisar");
      return;
    }

    setSugerindoPets(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tipo: "sugerir_pets_ia", historico: mensagens }),
      });
      const data = (await response.json()) as { pets?: PetDetalhe[]; erro?: string };
      if (!response.ok) throw new Error(data.erro || "Falha ao sugerir pets");

      const sugeridos = Array.isArray(data.pets) ? data.pets.map(aplicarPesoPadraoGato) : [];
      if (sugeridos.length === 0) {
        toast.info("A IA nao encontrou dados de pet nessa conversa");
        return;
      }

      setPetsDetalhe(sugeridos);
      setPesoPetDrafts({});
      toast.success(`${sugeridos.length} pet(s) preenchidos pela IA. Revise e salve.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao sugerir pets");
    } finally {
      setSugerindoPets(false);
    }
  }

  async function salvarPetsDetalhe() {
    if (salvandoPets) return;

    const nome = cli.nome.trim();
    const telefone = cli.telefone.replace(/\D/g, "");
    if (!nome || telefone.length < 8) {
      toast.error("Cliente precisa de nome e telefone para salvar os pets");
      return;
    }

    const limpos = petsDetalhe.map(normalizarPetFormulario).filter(petTemConteudo);
    const nomesPets = nomesPetsDetalhes(limpos);

    setSalvandoPets(true);
    try {
      const isFallback = cli.id === active.id;
      const response = await fetch("/api/crm/clientes", {
        method: isFallback ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isFallback ? {} : { id: cli.id }),
          nome,
          telefone,
          endereco: cli.endereco,
          bairro: cli.bairro,
          pets: nomesPets,
          petsDetalhes: limpos,
          perfil: cli.perfil,
          origem: cli.origem || "WhatsApp IA",
        }),
      });
      const data = (await response.json()) as Cliente | { erro?: string };
      if (!response.ok) throw new Error("erro" in data ? data.erro : "Nao foi possivel salvar");

      const clienteSalvo = data as Cliente;
      const detalhesSalvos = clienteSalvo.petsDetalhes?.length ? clienteSalvo.petsDetalhes : limpos;

      onClienteSaved(clienteSalvo);
      setPetsDetalhe(detalhesSalvos.map(aplicarPesoPadraoGato));
      setManual((state) => ({
        ...state,
        nome: clienteSalvo.nome,
        telefone: clienteSalvo.telefone,
        endereco: clienteSalvo.endereco,
        bairro: clienteSalvo.bairro,
        pets: clienteSalvo.pets.join(", "),
      }));
      toast.success("Dados do pet salvos");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar pets");
    } finally {
      setSalvandoPets(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function carregarEstoque() {
      setLoadingEstoque(true);
      try {
        const response = await fetch("/api/crm/produtos", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Falha ao carregar estoque");
        if (!cancelled && Array.isArray(data)) setProdutosEstoque(data);
      } catch (error) {
        if (!cancelled)
          toast.error(
            error instanceof Error ? error.message : "Nao foi possivel carregar o estoque",
          );
      } finally {
        if (!cancelled) setLoadingEstoque(false);
      }
    }

    void carregarEstoque();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    salvarConjuntosEstoqueStorage(conjuntosEstoque);
  }, [conjuntosEstoque]);

  const produtosPorSku = useMemo(
    () => new Map(produtosEstoque.map((produto) => [produto.sku, produto])),
    [produtosEstoque],
  );

  const selecionadosSet = useMemo(() => new Set(selecionadosSku), [selecionadosSku]);

  const produtosFiltrados = useMemo(() => {
    const termo = normalizarTextoBusca(buscaEstoque);
    return produtosEstoque.filter((produto) => {
      if (!termo) return true;
      return normalizarTextoBusca(
        [
          produto.nome,
          produto.sku,
          produto.categoria,
          produto.fornecedor,
          ...Object.values(produto.detalhesTecnicos ?? {}),
        ].join(" "),
      ).includes(termo);
    });
  }, [produtosEstoque, buscaEstoque]);

  const produtosSelecionados = useMemo(
    () =>
      selecionadosSku
        .map((sku) => produtosPorSku.get(sku))
        .filter((produto): produto is Produto => Boolean(produto)),
    [produtosPorSku, selecionadosSku],
  );

  function toggleEstoqueInfo(key: EstoqueInfoKey) {
    setEstoqueInfo((current) => ({ ...current, [key]: !current[key] }));
  }

  function toggleProdutoSelecionado(sku: string) {
    setSelecionadosSku((current) =>
      current.includes(sku) ? current.filter((item) => item !== sku) : [...current, sku],
    );
  }

  function selecionarProdutosFiltrados() {
    const skus = produtosFiltrados.map((produto) => produto.sku);
    if (skus.length === 0) return;

    setSelecionadosSku((current) => Array.from(new Set([...current, ...skus])));
  }

  function limparSelecaoEstoque() {
    setSelecionadosSku([]);
  }

  function produtosDoConjunto(conjunto: EstoqueConjunto): Produto[] {
    return conjunto.skus
      .map((sku) => produtosPorSku.get(sku))
      .filter((produto): produto is Produto => Boolean(produto));
  }

  function produtoEnvioEstoque(produto: Produto): ProdutoEnvioCrm {
    const fotoUrl = estoqueInfo.foto && isHttpUrl(produto.fotoUrl) ? produto.fotoUrl : null;
    const produtoMensagem = isHttpUrl(produto.fotoUrl) ? produto : { ...produto, fotoUrl: null };
    const descontoPercentual = Number(descontoEstoque.replace(",", "."));

    return {
      texto: montarMensagemProduto(produtoMensagem, estoqueInfo, !fotoUrl, descontoPercentual),
      fotoUrl,
      nomeArquivo: `produto-${produto.sku}.jpg`,
      mimeType: "image/jpeg",
    };
  }

  async function enviarProdutosEstoque(produtos: Produto[]) {
    if (enviandoEstoque) return;
    if (produtos.length === 0) {
      toast.error("Selecione pelo menos um produto");
      return;
    }

    setEnviandoEstoque(true);
    try {
      await onSendProducts(produtos.map(produtoEnvioEstoque));
      setShowEstoquePopup(false);
    } finally {
      setEnviandoEstoque(false);
    }
  }

  function enviarProdutoEstoque(produto: Produto) {
    const envio = produtoEnvioEstoque(produto);
    onSendProduct(envio.texto, envio.fotoUrl);
    setShowEstoquePopup(false);
  }

  function abrirEdicaoProdutoEstoque(produto: Produto) {
    setProdutoEditandoEstoque(produto);
    setEstoqueEditForm(produtoToEstoqueForm(produto));
  }

  function fecharEdicaoProdutoEstoque() {
    if (salvandoProdutoEstoque || excluindoProdutoSku) return;
    setProdutoEditandoEstoque(null);
    setEstoqueEditForm(null);
  }

  async function salvarProdutoEstoque() {
    if (!produtoEditandoEstoque || !estoqueEditForm) return;
    const produto = estoqueFormToProduto(estoqueEditForm, produtoEditandoEstoque);
    if (!produto) {
      toast.error("Preencha os dados do produto corretamente");
      return;
    }
    if (
      produtosEstoque.some(
        (item) => item.sku !== produtoEditandoEstoque.sku && item.sku === produto.sku,
      )
    ) {
      toast.error("SKU ja existe");
      return;
    }

    setSalvandoProdutoEstoque(true);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skuAtual: produtoEditandoEstoque.sku, ...produto }),
      });
      const data = (await response.json()) as Produto | { erro?: string };
      if (!response.ok) throw new Error("erro" in data ? data.erro : "Erro ao salvar produto");

      const atualizado = data as Produto;
      const skuAnterior = produtoEditandoEstoque.sku;
      setProdutosEstoque((current) =>
        current.map((item) => (item.sku === skuAnterior ? atualizado : item)),
      );
      if (skuAnterior !== atualizado.sku) {
        setSelecionadosSku((current) =>
          Array.from(new Set(current.map((sku) => (sku === skuAnterior ? atualizado.sku : sku)))),
        );
        setConjuntosEstoque((current) =>
          current.map((conjunto) => ({
            ...conjunto,
            skus: Array.from(
              new Set(conjunto.skus.map((sku) => (sku === skuAnterior ? atualizado.sku : sku))),
            ),
          })),
        );
      }

      setProdutoEditandoEstoque(null);
      setEstoqueEditForm(null);
      toast.success("Produto atualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar produto");
    } finally {
      setSalvandoProdutoEstoque(false);
    }
  }

  async function excluirProdutoEstoque(produto: Produto) {
    if (excluindoProdutoSku) return;
    const confirmado = window.confirm(
      `Excluir "${produto.nome}" do estoque? Esta acao nao pode ser desfeita.`,
    );
    if (!confirmado) return;

    setExcluindoProdutoSku(produto.sku);
    try {
      const response = await fetch("/api/crm/produtos", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku: produto.sku }),
      });
      const data = (await response.json().catch(() => ({}))) as { erro?: string };
      if (!response.ok) throw new Error(data.erro ?? "Erro ao excluir produto");

      setProdutosEstoque((current) => current.filter((item) => item.sku !== produto.sku));
      setSelecionadosSku((current) => current.filter((sku) => sku !== produto.sku));
      setConjuntosEstoque((current) =>
        current
          .map((conjunto) => ({
            ...conjunto,
            skus: conjunto.skus.filter((sku) => sku !== produto.sku),
          }))
          .filter((conjunto) => conjunto.skus.length > 0),
      );
      if (produtoEditandoEstoque?.sku === produto.sku) {
        setProdutoEditandoEstoque(null);
        setEstoqueEditForm(null);
      }
      toast.success("Produto excluido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir produto");
    } finally {
      setExcluindoProdutoSku(null);
    }
  }

  function salvarConjuntoEstoque() {
    const nome = nomeConjunto.trim();
    if (!nome) {
      toast.error("Informe um nome para o conjunto");
      return;
    }
    if (produtosSelecionados.length === 0) {
      toast.error("Selecione os produtos antes de salvar");
      return;
    }

    const novo: EstoqueConjunto = {
      id: novoIdConjuntoEstoque(),
      nome,
      skus: produtosSelecionados.map((produto) => produto.sku),
      criadoEm: new Date().toISOString(),
    };

    setConjuntosEstoque((current) => {
      const semDuplicado = current.filter(
        (conjunto) => conjunto.nome.trim().toLowerCase() !== nome.toLowerCase(),
      );
      return [novo, ...semDuplicado].slice(0, MAX_ESTOQUE_CONJUNTOS);
    });
    setNomeConjunto("");
    toast.success("Conjunto salvo");
  }

  function carregarConjuntoEstoque(conjunto: EstoqueConjunto) {
    const produtos = produtosDoConjunto(conjunto);
    if (produtos.length === 0) {
      toast.error("Nenhum produto desse conjunto esta no estoque atual");
      return;
    }

    setSelecionadosSku(produtos.map((produto) => produto.sku));
    setBuscaEstoque("");
    toast.success(`Conjunto "${conjunto.nome}" carregado`);
  }

  function removerConjuntoEstoque(id: string) {
    setConjuntosEstoque((current) => current.filter((conjunto) => conjunto.id !== id));
  }

  const quickActions = (
    <div className="grid grid-cols-2 gap-1.5">
      <ActionBtn
        icon={<Package className="size-3.5" />}
        label="Abrir pedido"
        onClick={() =>
          onDraftMessage("Vou abrir seu pedido por aqui e ja confirmo os itens, valores e entrega.")
        }
      />
      <ActionBtn
        icon={<Banknote className="size-3.5" />}
        label="Gerar Pix"
        primary
        onClick={async () => {
          const handler = async () => {
            const res = await fetch("/api/crm/pix", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                telefone: cli.telefone,
                enviarMensagem: true,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.mensagem || data.erro || "Falha ao gerar Pix");
            return data;
          };

          toast.promise(handler(), {
            loading: "Gerando Pix...",
            success: "Pix enviado para o WhatsApp do cliente!",
            error: (err) => (err instanceof Error ? err.message : "Erro ao gerar Pix"),
          });
        }}
      />
      <ActionBtn
        icon={<Tag className="size-3.5" />}
        label="Aplicar desconto"
        onClick={() =>
          onDraftMessage(
            "Consegui aplicar uma condicao especial para voce. Quer que eu te envie os valores atualizados?",
          )
        }
      />
      <ActionBtn
        icon={<Bell className="size-3.5" />}
        label="Follow-up"
        onClick={() =>
          onDraftMessage(
            "Oi, tudo bem? Passando para saber se posso te ajudar com seu pedido ou alguma duvida.",
          )
        }
      />
      <ActionBtn
        icon={<Target className="size-3.5" />}
        label="Mover kanban"
        onClick={onMoveKanban}
      />
      <ActionBtn icon={<Clock className="size-3.5" />} label="Historico" onClick={onOpenHistory} />
      <button
        type="button"
        onClick={() => setShowEstoquePopup(true)}
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-[11px] font-semibold transition hover:bg-secondary/70"
      >
        <Package className="size-3.5" /> Estoque
      </button>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cli.endereco + " " + cli.bairro)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-2 text-[11px] font-semibold transition hover:bg-secondary/70"
      >
        <MapPin className="size-3.5" /> Maps
      </a>
    </div>
  );

  async function atualizarComIa() {
    if (loadingIa) return;

    setLoadingIa(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "perfil_cliente_ia",
          telefone: active.telefone,
          nomeCliente: active.cliente,
          historico: mensagens,
        }),
      });
      const data = (await response.json()) as {
        cliente?: Cliente;
        erro?: string;
        comprovantesPix?: { confirmados?: number };
      };
      if (!response.ok || !data.cliente)
        throw new Error(data.erro || "Nao foi possivel atualizar o contexto");

      onClienteSaved(data.cliente);
      setPetsDetalhe((data.cliente.petsDetalhes ?? []).map(aplicarPesoPadraoGato));
      setPesoPetDrafts({});
      setManual((state) => ({
        ...state,
        nome: data.cliente?.nome ?? state.nome,
        telefone: data.cliente?.telefone ?? state.telefone,
        endereco: data.cliente?.endereco ?? state.endereco,
        bairro: data.cliente?.bairro ?? state.bairro,
        pets: data.cliente?.pets.join(", ") ?? state.pets,
        perfil: data.cliente?.perfil ?? state.perfil,
        origem: data.cliente?.origem ?? state.origem,
        observacoes: data.cliente?.observacoes ?? state.observacoes,
      }));
      const pixConfirmados = data.comprovantesPix?.confirmados ?? 0;
      toast.success(
        pixConfirmados > 0
          ? `Contexto atualizado e ${pixConfirmados} Pix confirmado no financeiro`
          : "Contexto do cliente atualizado pela IA",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar contexto");
    } finally {
      setLoadingIa(false);
    }
  }

  async function salvarManual() {
    if (savingManual) return;

    const nome = manual.nome.trim();
    const telefone = manual.telefone.replace(/\D/g, "");
    if (!nome || telefone.length < 8) {
      toast.error("Informe nome e telefone validos");
      return;
    }

    setSavingManual(true);
    try {
      const isFallback = cli.id === active.id;
      const response = await fetch("/api/crm/clientes", {
        method: isFallback ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(isFallback ? {} : { id: cli.id }),
          nome,
          telefone,
          endereco: manual.endereco,
          bairro: manual.bairro,
          pets: manual.pets,
          perfil: manual.perfil,
          origem: manual.origem,
          observacoes: manual.observacoes,
          followUpManual: {
            mensagem: manual.followUpMensagem,
            data: manual.followUpData,
            hora: manual.followUpHora,
            canal: cli.followUpManual?.canal ?? "WhatsApp",
            status: cli.followUpManual?.status ?? "pendente",
            midiaUrl: manual.followUpMidiaUrl,
            midiaNome: manual.followUpMidiaNome,
            midiaTipo: manual.followUpMidiaTipo,
            atualizadoEm: new Date().toISOString(),
          },
        }),
      });
      const data = (await response.json()) as Cliente | { erro?: string };
      if (!response.ok) throw new Error("erro" in data ? data.erro : "Nao foi possivel salvar");

      onClienteSaved(data as Cliente);
      setEditing(false);
      toast.success("Informacoes do cliente salvas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar cliente");
    } finally {
      setSavingManual(false);
    }
  }

  return (
    <div
      className={`min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm xl:rounded-[1.25rem] ${
        mobileOpen ? "flex" : "hidden"
      } xl:flex`}
    >
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="border-b border-border bg-secondary/25 p-3 sm:bg-gradient-to-br sm:from-primary/5 sm:to-accent/5 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent font-bold text-primary-foreground sm:size-12 sm:rounded-2xl">
              {cli.nome
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{cli.nome}</div>
              <div className="text-[11px] text-muted-foreground">{cli.telefone}</div>
            </div>
          </div>
          {/* Etiquetas visuais: cidade + espécie */}
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-border bg-card text-foreground">
              <MapPin className="size-3" />{" "}
              {[cli.cidade, cli.bairro].filter(Boolean).join(" - ") || "Endereco nao identificado"}
            </span>
            {especiesContexto.map((e) => (
              <SpeciePill key={e} especie={e} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void atualizarComIa()}
              disabled={loadingIa || mensagens.length === 0}
              className="h-10 rounded-lg bg-primary/15 text-primary text-xs font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50 sm:h-8 sm:text-[11px]"
            >
              <Sparkles className={`size-3 ${loadingIa ? "animate-spin" : ""}`} />
              {loadingIa ? "Lendo..." : "Atualizar IA"}
            </button>
            <button
              type="button"
              onClick={() => setEditing((current) => !current)}
              className="h-10 rounded-lg bg-card text-xs font-bold inline-flex items-center justify-center gap-1 sm:h-8 sm:bg-secondary sm:text-[11px]"
            >
              <Pencil className="size-3" />
              {editing ? "Ver contexto" : "Editar manual"}
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-card/80 p-2">
            <div className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Zap className="size-3" /> Acoes rapidas
            </div>
            {quickActions}
          </div>
        </div>

        <div className="p-2.5 space-y-2.5 sm:p-3 sm:space-y-3">
          <FollowupScheduler
            telefone={cli.telefone || active.telefone}
            nome={cli.nome || active.cliente}
            contexto={{
              nome: cli.nome || active.cliente,
              pet: cli.pets?.[0],
              ultimaMensagem: mensagens
                .filter((m) => m.role === "user")
                .map((m) => String(m.content ?? ""))
                .at(-1),
            }}
          />
          {editing && (
            <Section icon={<Pencil className="size-3" />} title="Editar informacoes">
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <input
                  value={manual.nome}
                  onChange={(event) =>
                    setManual((state) => ({ ...state, nome: event.target.value }))
                  }
                  placeholder="Nome"
                  className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                />
                <input
                  value={manual.telefone}
                  onChange={(event) =>
                    setManual((state) => ({ ...state, telefone: event.target.value }))
                  }
                  placeholder="Telefone"
                  className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                />
                <input
                  value={manual.pets}
                  onChange={(event) =>
                    setManual((state) => ({ ...state, pets: event.target.value }))
                  }
                  placeholder="Pets separados por virgula"
                  className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={manual.endereco}
                    onChange={(event) =>
                      setManual((state) => ({ ...state, endereco: event.target.value }))
                    }
                    placeholder="Endereco"
                    className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                  />
                  <input
                    value={manual.bairro}
                    onChange={(event) =>
                      setManual((state) => ({ ...state, bairro: event.target.value }))
                    }
                    placeholder="Bairro"
                    className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                  />
                </div>
                <textarea
                  value={manual.observacoes}
                  onChange={(event) =>
                    setManual((state) => ({ ...state, observacoes: event.target.value }))
                  }
                  placeholder="Observacoes do cliente"
                  rows={3}
                  className="w-full resize-y rounded-lg bg-secondary px-3 py-2 text-xs outline-none"
                />
                <textarea
                  value={manual.followUpMensagem}
                  onChange={(event) =>
                    setManual((state) => ({ ...state, followUpMensagem: event.target.value }))
                  }
                  placeholder="Follow-up manual"
                  rows={2}
                  className="w-full resize-y rounded-lg bg-secondary px-3 py-2 text-xs outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Clock className="size-3" /> Data
                    </span>
                    <input
                      type="date"
                      value={manual.followUpData}
                      onChange={(event) =>
                        setManual((state) => ({ ...state, followUpData: event.target.value }))
                      }
                      className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Clock className="size-3" /> Horario
                    </span>
                    <input
                      type="time"
                      value={manual.followUpHora}
                      onChange={(event) =>
                        setManual((state) => ({ ...state, followUpHora: event.target.value }))
                      }
                      className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                    />
                  </label>
                </div>
                <div className="rounded-lg border border-border p-2 space-y-2">
                  <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Link className="size-3" /> Midia agendada
                  </div>
                  <input
                    value={manual.followUpMidiaUrl}
                    onChange={(event) =>
                      setManual((state) => ({ ...state, followUpMidiaUrl: event.target.value }))
                    }
                    placeholder="URL da midia"
                    className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={manual.followUpMidiaNome}
                      onChange={(event) =>
                        setManual((state) => ({ ...state, followUpMidiaNome: event.target.value }))
                      }
                      placeholder="Nome do arquivo"
                      className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                    />
                    <select
                      value={manual.followUpMidiaTipo}
                      onChange={(event) =>
                        setManual((state) => ({ ...state, followUpMidiaTipo: event.target.value }))
                      }
                      className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                    >
                      <option value="">Tipo</option>
                      <option value="image">Imagem</option>
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                      <option value="document">Documento</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void salvarManual()}
                  disabled={savingManual}
                  className="h-9 w-full rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <Save className="size-3.5" />
                  {savingManual ? "Salvando..." : "Salvar informacoes"}
                </button>
              </div>
            </Section>
          )}

          {/* Dados do pet */}
          <Section
            icon={<PawPrint className="size-3" />}
            title={`Dados do pet (${petsDetalhe.length})`}
          >
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void sugerirPetsIa()}
                disabled={sugerindoPets || mensagens.length === 0}
                className="h-9 w-full rounded-lg bg-primary/15 text-primary text-[11px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className={`size-3 ${sugerindoPets ? "animate-spin" : ""}`} />
                {sugerindoPets ? "Lendo conversa..." : "Preencher com IA"}
              </button>

              {petsDetalhe.length === 0 ? (
                <div className="rounded-xl bg-secondary/50 p-3 text-[11px] text-muted-foreground">
                  Nenhum pet salvo ainda. Use "Preencher com IA" para puxar do contexto da conversa
                  ou adicione manualmente.
                </div>
              ) : (
                petsDetalhe.map((pet, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-border bg-card p-2.5 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        value={pet.nome}
                        onChange={(event) => atualizarPet(index, "nome", event.target.value)}
                        placeholder="Nome do pet"
                        className="h-9 flex-1 rounded-lg bg-secondary px-3 text-xs font-semibold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removerPet(index)}
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive"
                        aria-label="Remover pet"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={pet.especie ?? ""}
                        onChange={(event) => atualizarPet(index, "especie", event.target.value)}
                        className="h-9 w-full rounded-lg bg-secondary px-2 text-xs outline-none"
                      >
                        <option value="">Espécie</option>
                        <option value="cachorro">Cachorro</option>
                        <option value="gato">Gato</option>
                      </select>
                      <select
                        value={pet.porte ?? ""}
                        onChange={(event) => atualizarPet(index, "porte", event.target.value)}
                        className="h-9 w-full rounded-lg bg-secondary px-2 text-xs outline-none"
                      >
                        <option value="">Porte opcional</option>
                        <option value="pequeno">Pequeno</option>
                        <option value="medio">Médio</option>
                        <option value="grande">Grande</option>
                      </select>
                      <select
                        value={pet.castrado === undefined ? "" : pet.castrado ? "sim" : "nao"}
                        onChange={(event) => atualizarPet(index, "castrado", event.target.value)}
                        className="h-9 w-full rounded-lg bg-secondary px-2 text-xs outline-none"
                      >
                        <option value="">Castrado?</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                      <input
                        value={pet.raca ?? ""}
                        onChange={(event) => atualizarPet(index, "raca", event.target.value)}
                        placeholder="Raça"
                        className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                      />
                      <input
                        value={pet.idade ?? ""}
                        onChange={(event) => atualizarPet(index, "idade", event.target.value)}
                        placeholder="Idade"
                        className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                      />
                      <input
                        type="date"
                        value={pet.nascimento ?? ""}
                        onChange={(event) => atualizarPet(index, "nascimento", event.target.value)}
                        aria-label="Nascimento do pet"
                        className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                      />
                      <input
                        value={pesoPetDrafts[String(index)] ?? formatPesoPetKg(pet.pesoKg)}
                        onChange={(event) => atualizarPet(index, "pesoKg", event.target.value)}
                        onBlur={(event) =>
                          finalizarEdicaoPesoPet(index, pet, event.currentTarget.value)
                        }
                        inputMode="decimal"
                        placeholder={pet.especie === "gato" ? "Peso (kg) padrao 3,5" : "Peso (kg)"}
                        className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                      />
                      <input
                        value={pet.observacao ?? ""}
                        onChange={(event) => atualizarPet(index, "observacao", event.target.value)}
                        placeholder="Observação"
                        className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                      />
                    </div>
                  </div>
                ))
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={adicionarPet}
                  className="h-9 rounded-lg bg-secondary text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-secondary/70"
                >
                  <Plus className="size-3.5" /> Adicionar pet
                </button>
                <button
                  type="button"
                  onClick={() => void salvarPetsDetalhe()}
                  disabled={salvandoPets}
                  className="h-9 rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <Save className="size-3.5" />
                  {salvandoPets ? "Salvando..." : "Salvar pet"}
                </button>
              </div>
            </div>
          </Section>

          {/* Origem detalhada */}
          <Section icon={<Target className="size-3" />} title="Origem do lead">
            <div className="rounded-xl border border-border p-2.5 space-y-1.5 bg-card">
              <div className="text-sm font-semibold">{cli.origem}</div>
              {cli.origemDetalhe && (
                <div className="text-[11px] text-muted-foreground">{cli.origemDetalhe}</div>
              )}
              {cli.influenciador && (
                <div className="text-[11px] flex items-center gap-1 text-foreground">
                  <Users className="size-3" /> {cli.influenciador}
                </div>
              )}
              {cli.cupom && (
                <div className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                  <Tag className="size-2.5" /> {cli.cupom}
                </div>
              )}
            </div>
          </Section>

          {/* Custo do lead */}
          <Section icon={<DollarSign className="size-3" />} title="Custo de aquisição">
            <div className="rounded-xl border border-border p-2.5 bg-card space-y-2">
              {cli.campanha ? (
                <>
                  <div className="text-[11px] text-muted-foreground">
                    Campanha <b className="text-foreground">{cli.campanha}</b>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Custo" value={brl(cli.campanhaCusto ?? 0)} />
                    <Stat label="Convertidos" value={`${cli.campanhaConvertidos ?? 0}`} />
                  </div>
                  <div className="rounded-lg bg-primary/10 p-2 flex items-center justify-between">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-primary tracking-wide">
                        CAC individual
                      </div>
                      <div className="text-base font-bold text-primary">{brl(cli.cac)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">
                        ROI
                      </div>
                      <div className="text-sm font-bold text-success">{cacRoi}x</div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-muted-foreground italic">
                  Lead orgânico · sem custo de aquisição
                </div>
              )}
            </div>
          </Section>

          {/* Financeiro */}
          <Section icon={<Wallet className="size-3" />} title="Financeiro do cliente">
            <div className="grid grid-cols-2 gap-1.5">
              <Stat label="Total gasto" value={brl(cli.totalGasto)} />
              <Stat label="Lucro líquido" value={brl(cli.lucroLiquido)} accent="success" />
              <Stat label="Descontos" value={brl(cli.totalDescontos)} />
              <Stat label="Ticket médio" value={brl(cli.ticket)} />
              <Stat label="Pedidos" value={String(cli.pedidos)} />
              <Stat label="Recompra" value={cli.proxRecompra} />
            </div>
          </Section>

          {/* Comportamento */}
          <Section icon={<Sparkles className="size-3" />} title="Comportamento">
            <div className="grid grid-cols-2 gap-1.5">
              <Behavior label="Aceita upsell" value={cli.perfil !== "Econômico"} />
              <Behavior label="Ignora promoções" value={cli.perfil === "Premium"} invert />
              <Behavior label="Sensível a preço" value={cli.perfil === "Econômico"} invert />
              <Behavior
                label="Cliente VIP"
                value={cli.perfil === "VIP" || cli.perfil === "Premium"}
              />
              <Behavior label="Risco de perder" value={cli.perfil === "Risco"} invert />
              <Behavior label="Bom pagador" value={cli.totalDescontos < cli.totalGasto * 0.1} />
            </div>
          </Section>

          {/* IA Aprendeu */}
          <Section icon={<Zap className="size-3" />} title="Contexto da conversa">
            {aprendizadosContexto.length > 0 ? (
              <ul className="space-y-1 text-[11px]">
                {aprendizadosContexto.slice(0, 5).map((item, index) => (
                  <li key={`${item}-${index}`} className="flex gap-1.5">
                    <CheckCheck className="size-3 text-success shrink-0 mt-0.5" /> {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl bg-secondary/50 p-3 text-[11px] text-muted-foreground">
                Nenhum contexto confiavel identificado ainda. Use "Atualizar com IA" ou edite
                manualmente.
              </div>
            )}
          </Section>

          {showEstoquePopup && (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4"
              onClick={() => setShowEstoquePopup(false)}
            >
              <div
                className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Package className="size-4 text-primary" /> Estoque
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Escolha produtos, salve conjuntos e envie todos com foto e valor.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEstoquePopup(false)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Fechar estoque"
                  >
                    <XIcon />
                  </button>
                </div>

                <div className="space-y-3 p-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <input
                      value={buscaEstoque}
                      onChange={(event) => setBuscaEstoque(event.target.value)}
                      placeholder="Buscar produto do estoque"
                      className="w-full h-10 pl-8 pr-3 rounded-lg bg-secondary outline-none text-sm"
                    />
                  </div>

                  {conjuntosEstoque.length > 0 && (
                    <div className="rounded-lg border border-border p-2">
                      <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        <Package className="size-3" /> Conjuntos salvos
                      </div>
                      <div className="space-y-1.5">
                        {conjuntosEstoque.map((conjunto) => {
                          const produtos = produtosDoConjunto(conjunto);
                          return (
                            <div
                              key={conjunto.id}
                              className="flex items-center gap-1.5 rounded-md bg-secondary/50 p-1.5"
                            >
                              <button
                                type="button"
                                onClick={() => carregarConjuntoEstoque(conjunto)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="truncate text-xs font-bold">{conjunto.nome}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {produtos.length} produto{produtos.length === 1 ? "" : "s"}
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => void enviarProdutosEstoque(produtos)}
                                disabled={enviandoEstoque || produtos.length === 0}
                                className="h-8 rounded-md bg-success px-2 text-[10px] font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
                              >
                                Enviar
                              </button>
                              <button
                                type="button"
                                onClick={() => removerConjuntoEstoque(conjunto.id)}
                                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                                aria-label={`Remover conjunto ${conjunto.nome}`}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border p-2">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-bold">
                        {produtosSelecionados.length} selecionado
                        {produtosSelecionados.length === 1 ? "" : "s"}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={selecionarProdutosFiltrados}
                          disabled={produtosFiltrados.length === 0}
                          className="h-7 rounded-md bg-secondary px-2 text-[10px] font-semibold hover:bg-secondary/70 disabled:opacity-50"
                        >
                          Selecionar resultados
                        </button>
                        <button
                          type="button"
                          onClick={limparSelecaoEstoque}
                          disabled={produtosSelecionados.length === 0}
                          className="h-7 rounded-md bg-secondary px-2 text-[10px] font-semibold hover:bg-secondary/70 disabled:opacity-50"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <input
                        value={nomeConjunto}
                        onChange={(event) => setNomeConjunto(event.target.value)}
                        placeholder="Nome do conjunto"
                        className="h-9 min-w-0 rounded-md bg-secondary px-2 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={salvarConjuntoEstoque}
                        disabled={produtosSelecionados.length === 0}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary/15 px-2 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        <Save className="size-3.5" /> Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => void enviarProdutosEstoque(produtosSelecionados)}
                        disabled={enviandoEstoque || produtosSelecionados.length === 0}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-success px-2 text-xs font-bold text-success-foreground hover:bg-success/90 disabled:opacity-50"
                      >
                        <Send className="size-3.5" /> Enviar
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-2">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        <SlidersHorizontal className="size-3" /> Enviar junto
                      </div>
                      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                        <Tag className="size-3" />
                        Desconto
                        <input
                          inputMode="decimal"
                          value={descontoEstoque}
                          onChange={(event) =>
                            setDescontoEstoque(event.target.value.replace(/[^\d.,]/g, ""))
                          }
                          className="h-7 w-14 rounded-md bg-secondary px-2 text-right text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Percentual de desconto no envio do produto"
                        />
                        %
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                      {ESTOQUE_INFO_LABELS.map((item) => (
                        <label
                          key={item.key}
                          className="flex items-center gap-1.5 rounded-md bg-secondary/50 px-2 py-1.5 text-[10px] font-semibold"
                        >
                          <input
                            type="checkbox"
                            checked={estoqueInfo[item.key]}
                            onChange={() => toggleEstoqueInfo(item.key)}
                            className="size-3 accent-primary"
                          />
                          <span className="truncate">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="max-h-[55vh] overflow-y-auto pr-1 scrollbar-thin space-y-2">
                    {loadingEstoque ? (
                      <div className="rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">
                        Carregando estoque...
                      </div>
                    ) : produtosFiltrados.length === 0 ? (
                      <div className="rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">
                        Nenhum produto encontrado.
                      </div>
                    ) : (
                      produtosFiltrados.map((produto) => {
                        const selecionado = selecionadosSet.has(produto.sku);
                        return (
                          <div
                            key={produto.sku}
                            className={`group rounded-xl border p-2.5 shadow-sm transition ${
                              selecionado
                                ? "border-primary/70 bg-primary/10 shadow-primary/10"
                                : "border-border bg-card hover:border-primary/35 hover:bg-secondary/25"
                            }`}
                          >
                            <div className="flex gap-2.5">
                              <button
                                type="button"
                                onClick={() => toggleProdutoSelecionado(produto.sku)}
                                className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                                  selecionado
                                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                    : "border-border bg-background text-transparent hover:border-primary/60 hover:bg-primary/10"
                                }`}
                                aria-label={`Selecionar ${produto.nome}`}
                                aria-pressed={selecionado}
                              >
                                <Check className="size-3.5" />
                              </button>
                              <div
                                className={`size-16 shrink-0 overflow-hidden rounded-lg border bg-secondary shadow-sm ${
                                  selecionado ? "border-primary/40" : "border-border"
                                }`}
                              >
                                {produto.fotoUrl || produto.fotoPath ? (
                                  <img
                                    src={produtoFotoProxyUrl(produto)}
                                    alt={produto.nome}
                                    className="size-full object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="grid size-full place-items-center text-muted-foreground">
                                    <Package className="size-5" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold leading-snug line-clamp-2">
                                  {produto.nome}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                  <span>Real {brl(produto.preco)}</span>
                                  <span>-</span>
                                  <span>
                                    {Number(descontoEstoque.replace(",", ".")) || 0}%{" "}
                                    {brl(
                                      precoComDesconto(
                                        produto.preco,
                                        Number(descontoEstoque.replace(",", ".")) || 0,
                                      ),
                                    )}
                                  </span>
                                  <span>-</span>
                                  <span>{produto.estoque > 0 ? "Disponivel" : "Sem estoque"}</span>
                                </div>
                              </div>
                            </div>
                            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleProdutoSelecionado(produto.sku)}
                                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition ${
                                  selecionado
                                    ? "border-primary/40 bg-primary/15 text-primary hover:bg-primary/25"
                                    : "border-border bg-secondary text-foreground hover:border-primary/35 hover:bg-secondary/70"
                                }`}
                              >
                                {selecionado ? (
                                  <XIcon className="size-3.5" />
                                ) : (
                                  <Check className="size-3.5" />
                                )}
                                {selecionado ? "Remover" : "Selecionar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => enviarProdutoEstoque(produto)}
                                disabled={enviandoEstoque}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
                              >
                                <Send className="size-3.5" /> Enviar
                              </button>
                              <button
                                type="button"
                                onClick={() => abrirEdicaoProdutoEstoque(produto)}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-2 text-xs font-semibold transition hover:border-primary/35 hover:bg-secondary/70"
                              >
                                <Pencil className="size-3.5" /> Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void excluirProdutoEstoque(produto)}
                                disabled={excluindoProdutoSku === produto.sku}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 px-2 text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:opacity-50"
                              >
                                <Trash2 className="size-3.5" />
                                {excluindoProdutoSku === produto.sku ? "Excluindo..." : "Excluir"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {produtoEditandoEstoque && estoqueEditForm && (
            <div
              className="fixed inset-0 z-[60] grid place-items-center bg-foreground/60 p-4"
              onClick={fecharEdicaoProdutoEstoque}
            >
              <div
                className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Pencil className="size-4 text-primary" /> Editar produto
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Atualize preco, estoque e dados basicos usados no envio.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={fecharEdicaoProdutoEstoque}
                    disabled={salvandoProdutoEstoque || Boolean(excluindoProdutoSku)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                    aria-label="Fechar edicao do produto"
                  >
                    <XIcon />
                  </button>
                </div>

                <div className="max-h-[75vh] space-y-3 overflow-y-auto p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>SKU</span>
                      <input
                        value={estoqueEditForm.sku}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, sku: event.target.value.toUpperCase() },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Categoria</span>
                      <input
                        value={estoqueEditForm.categoria}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, categoria: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="col-span-2 space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Nome</span>
                      <input
                        value={estoqueEditForm.nome}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, nome: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Tipo</span>
                      <select
                        value={estoqueEditForm.tipo}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) =>
                              form && { ...form, tipo: event.target.value as Produto["tipo"] },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {ESTOQUE_TIPOS.map((tipo) => (
                          <option key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Giro</span>
                      <select
                        value={estoqueEditForm.giro}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) =>
                              form && { ...form, giro: event.target.value as Produto["giro"] },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {ESTOQUE_GIROS.map((giro) => (
                          <option key={giro.value} value={giro.value}>
                            {giro.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col-span-2 space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Fornecedor</span>
                      <input
                        value={estoqueEditForm.fornecedor}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, fornecedor: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Estoque</span>
                      <input
                        type="number"
                        min="0"
                        value={estoqueEditForm.estoque}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, estoque: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Minimo</span>
                      <input
                        type="number"
                        min="0"
                        value={estoqueEditForm.minimo}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, minimo: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Preco compra</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={estoqueEditForm.precoCompra}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, precoCompra: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                    <label className="space-y-1 text-[11px] font-semibold text-muted-foreground">
                      <span>Preco venda</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={estoqueEditForm.preco}
                        onChange={(event) =>
                          setEstoqueEditForm(
                            (form) => form && { ...form, preco: event.target.value },
                          )
                        }
                        className="h-10 w-full rounded-md bg-secondary px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void excluirProdutoEstoque(produtoEditandoEstoque)}
                      disabled={
                        salvandoProdutoEstoque || excluindoProdutoSku === produtoEditandoEstoque.sku
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-destructive/10 px-3 text-sm font-semibold text-destructive hover:bg-destructive/15 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                      {excluindoProdutoSku === produtoEditandoEstoque.sku
                        ? "Excluindo..."
                        : "Excluir"}
                    </button>
                    <button
                      type="button"
                      onClick={fecharEdicaoProdutoEstoque}
                      disabled={salvandoProdutoEstoque || Boolean(excluindoProdutoSku)}
                      className="h-10 flex-1 rounded-md bg-secondary text-sm font-semibold hover:bg-secondary/70 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void salvarProdutoEstoque()}
                      disabled={salvandoProdutoEstoque || Boolean(excluindoProdutoSku)}
                      className="h-10 flex-1 rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {salvandoProdutoEstoque ? "Salvando..." : "Salvar alteracoes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5 px-1">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "success" }) {
  return (
    <div className="rounded-lg bg-secondary/60 p-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div
        className={`font-bold text-xs mt-0.5 truncate ${accent === "success" ? "text-success" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Behavior({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  return (
    <div
      className={`rounded-lg p-2 border ${value ? (invert ? "bg-destructive/10 border-destructive/20" : "bg-success/10 border-success/20") : "bg-secondary/40 border-transparent"}`}
    >
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide leading-tight">
        {label}
      </div>
      <div
        className={`font-bold text-xs mt-0.5 ${value ? (invert ? "text-destructive" : "text-success") : "text-muted-foreground"}`}
      >
        {value ? "Sim" : "Não"}
      </div>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition ${
        primary
          ? "bg-success text-success-foreground hover:opacity-90"
          : "bg-secondary hover:bg-secondary/70"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function QuickReply({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-[11px] font-bold leading-tight text-primary transition hover:bg-primary/20"
    >
      {icon} {label}
    </button>
  );
}

function DateChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-md border border-border bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function mediaUrlValida(value: unknown): string | undefined {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  return undefined;
}

function tipoMidiaMensagem(
  message: ConversaMensagem,
): "image" | "audio" | "video" | "document" | null {
  const type = `${message?.mimeType ?? ""} ${message?.messageType ?? ""}`.toLowerCase();
  if (type.includes("image")) return "image";
  if (type.includes("audio") || type.includes("ptt")) return "audio";
  if (type.includes("video")) return "video";
  if (mediaUrlValida(message?.mediaUrl)) return "document";
  return null;
}

function mediaSrcMensagem(message: ConversaMensagem): string | undefined {
  const mediaUrl = mediaUrlValida(message?.mediaUrl);
  if (!mediaUrl) return undefined;
  if (!/^https?:/i.test(mediaUrl)) return mediaUrl;

  // URLs publicas do nosso storage (Supabase) ja sao acessiveis e nao precisam
  // do proxy de descriptografia; carrega direto para evitar o 400 do proxy.
  if (/\/storage\/v1\/object\/public\//.test(mediaUrl)) return mediaUrl;

  const mediaKey = typeof message?.mediaKey === "string" ? message.mediaKey.trim() : "";
  const params = new URLSearchParams({
    url: mediaUrl,
    messageType: String(message?.messageType ?? ""),
    mimeType: String(message?.mimeType ?? ""),
  });
  if (mediaKey) params.set("mediaKey", mediaKey);

  return `/api/crm/media?${params}`;
}

function MediaPreview({ message, me }: { message?: ConversaMensagem; me: boolean }) {
  if (!message) return null;
  const mediaUrl = mediaSrcMensagem(message);
  if (!mediaUrl) return null;

  const tipo = tipoMidiaMensagem(message);
  const label = String(message?.fileName ?? "Abrir midia");

  if (tipo === "image") {
    return (
      <a
        href={mediaUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block overflow-hidden rounded-lg border border-black/10 bg-black/5"
      >
        <img src={mediaUrl} alt={label} className="max-h-72 w-full object-contain" loading="lazy" />
      </a>
    );
  }

  if (tipo === "audio") {
    return (
      <audio
        controls
        src={mediaUrl}
        className={`mt-2 h-10 w-64 max-w-full ${me ? "accent-success" : ""}`}
      >
        <a href={mediaUrl} target="_blank" rel="noreferrer">
          Abrir audio
        </a>
      </audio>
    );
  }

  if (tipo === "video") {
    return (
      <video controls src={mediaUrl} className="mt-2 max-h-72 w-72 max-w-full rounded-lg bg-black">
        <a href={mediaUrl} target="_blank" rel="noreferrer">
          Abrir video
        </a>
      </video>
    );
  }

  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noreferrer"
      className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${
        me ? "bg-white/15 hover:bg-white/25" : "bg-secondary hover:bg-secondary/70"
      }`}
    >
      <Paperclip className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}

function Bubble({
  side,
  children,
  ai,
  hora,
  message,
}: {
  side: "me" | "them";
  children: React.ReactNode;
  ai?: boolean;
  hora?: string;
  message?: ConversaMensagem;
}) {
  const me = side === "me";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[84%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[78%] sm:rounded-2xl sm:px-3.5 ${
          me
            ? "bg-success text-success-foreground rounded-br-sm"
            : "bg-card border border-border rounded-bl-sm"
        }`}
      >
        {ai && (
          <div className="flex items-center gap-1 text-[10px] opacity-90 mb-1 font-semibold">
            <Bot className="size-3" /> IA Mundo Pet
          </div>
        )}
        {!ai && !me && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1 font-semibold">
            <User className="size-3" /> Cliente
          </div>
        )}
        <div className="whitespace-pre-wrap leading-snug">{children}</div>
        <MediaPreview message={message} me={me} />
        {hora && (
          <div
            className={`text-[9px] mt-1 flex items-center justify-end gap-0.5 ${me ? "opacity-80" : "text-muted-foreground"}`}
          >
            {hora} {me && <CheckCheck className="size-3" />}
          </div>
        )}
      </div>
    </div>
  );
}

const KANBAN_COLOR_CLASSES: Record<
  KanbanColumnColor,
  { dot: string; badge: string; border: string }
> = {
  sky: {
    dot: "bg-sky-500",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    border: "border-t-sky-500",
  },
  violet: {
    dot: "bg-violet-500",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    border: "border-t-violet-500",
  },
  amber: {
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    border: "border-t-amber-500",
  },
  emerald: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    border: "border-t-emerald-500",
  },
  rose: {
    dot: "bg-rose-500",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    border: "border-t-rose-500",
  },
  slate: {
    dot: "bg-slate-500",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    border: "border-t-slate-500",
  },
};

/**
 * Janela flutuante com a DM do cliente, aberta de dentro do Kanban.
 * Carrega o historico completo e envia mensagem sem sair da tela do pipeline.
 */
function ConversaChatPopup({
  conversation,
  onClose,
  onExpand,
  embedded = false,
}: {
  conversation: Conversa & { telefone?: string; historico?: ConversaMensagem[] };
  onClose: () => void;
  onExpand?: () => void;
  embedded?: boolean;
}) {
  const [mensagens, setMensagens] = useState<ConversaMensagem[]>(
    () => conversation.historico ?? [],
  );
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/crm/conversas?detalhe=${encodeURIComponent(conversation.id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.erro || "Falha ao carregar a conversa");
        return data as Record<string, unknown>;
      })
      .then((data) => {
        if (Array.isArray(data.historico)) setMensagens(data.historico as ConversaMensagem[]);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [conversation.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  async function enviar() {
    const valor = texto.trim();
    if (!valor || sending) return;

    setSending(true);
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "mensagem",
          id: conversation.id,
          telefone: conversation.telefone ?? "",
          texto: valor,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) throw new Error(String(data.erro ?? "Falha ao enviar mensagem"));

      if (Array.isArray(data.historico)) setMensagens(data.historico as ConversaMensagem[]);
      else
        setMensagens((current) => [
          ...current,
          { role: "assistant", content: valor, at: new Date().toISOString(), fromMe: true },
        ]);
      setTexto("");
      toast.success("Mensagem enviada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 flex-col overflow-hidden border-t border-border bg-card lg:border-l lg:border-t-0"
          : "fixed bottom-3 right-3 left-3 z-50 flex max-h-[75dvh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:left-auto sm:w-[370px]"
      }
    >
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-3 py-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary">
          {conversation.cliente
            .split(" ")
            .map((name) => name[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{conversation.cliente}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {conversation.telefone || "Sem telefone"}
          </div>
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            title="Abrir no WhatsApp IA"
            aria-label="Abrir no WhatsApp IA"
          >
            <Maximize2 className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title="Fechar"
          aria-label="Fechar conversa"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="scrollbar-thin min-h-[180px] flex-1 space-y-2.5 overflow-y-auto bg-secondary/20 p-3">
        {mensagens.length > 0 ? (
          mensagens.map((mensagem, index) => {
            const dia = chaveDiaConversa(mensagem.at);
            const diaAnterior = index > 0 ? chaveDiaConversa(mensagens[index - 1]?.at) : null;
            return (
              <Fragment key={`${mensagem.role}-${index}`}>
                {dia && dia !== diaAnterior && (
                  <DateChip>{formatarDiaConversa(mensagem.at)}</DateChip>
                )}
                <Bubble
                  side={mensagem.role === "assistant" || mensagem.role === "ai" ? "me" : "them"}
                  ai={mensagem.role === "assistant" || mensagem.role === "ai"}
                  hora={horaMensagem(mensagem)}
                  message={mensagem}
                >
                  {mensagem.content}
                </Bubble>
              </Fragment>
            );
          })
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            {loading ? "Carregando conversa..." : "Nenhuma mensagem nesta conversa."}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2.5">
        <input
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void enviar();
            }
          }}
          placeholder="Escreva uma mensagem"
          className="h-10 min-w-0 flex-1 rounded-xl bg-secondary px-3 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={sending || !texto.trim()}
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          aria-label="Enviar mensagem"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}

function KanbanView<T extends Conversa & { telefone?: string; historico?: ConversaMensagem[] }>({
  items,
  columns,
  onMoveColumn,
  onSaveColumns,
  onOpenConversation,
}: {
  items: T[];
  columns: KanbanColumn[];
  onMoveColumn: (conversation: T, column: KanbanColumn) => Promise<void> | void;
  onSaveColumns: (columns: KanbanColumn[]) => Promise<void> | void;
  onOpenConversation: (conversation: T) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [chatPopup, setChatPopup] = useState<T | null>(null);
  const [pdvConversation, setPdvConversation] = useState<T | null>(null);
  const [editing, setEditing] = useState(false);
  const [mobileColumnId, setMobileColumnId] = useState(columns[0]?.id ?? "");
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (columns.some((column) => column.id === mobileColumnId)) return;
    setMobileColumnId(columns[0]?.id ?? "");
  }, [columns, mobileColumnId]);

  function scrollBoard(direction: -1 | 1) {
    boardRef.current?.scrollBy({ left: direction * 640, behavior: "smooth" });
  }

  async function move(column: KanbanColumn) {
    if (!drag) return;
    const conversation = items.find((c) => c.id === drag);
    if (!conversation) {
      setDrag(null);
      return;
    }

    try {
      await onMoveColumn(conversation, column);
    } finally {
      setDrag(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 md:gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm sm:px-4 sm:py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold">
            <LayoutGrid className="size-4 text-primary" /> Pipeline de atendimento
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-[11px]">
            <span className="md:hidden">Escolha uma etapa e toque no cliente para mover.</span>
            <span className="hidden md:inline">
              Arraste os clientes entre as colunas. Cada coluna tem sua propria rolagem.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollBoard(-1)}
            className="hidden size-9 place-items-center rounded-xl border border-border bg-secondary transition hover:border-primary/40 hover:text-primary md:grid"
            title="Ver colunas anteriores"
            aria-label="Rolar Kanban para a esquerda"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scrollBoard(1)}
            className="hidden size-9 place-items-center rounded-xl border border-border bg-secondary transition hover:border-primary/40 hover:text-primary md:grid"
            title="Ver proximas colunas"
            aria-label="Rolar Kanban para a direita"
          >
            <ArrowRight className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-secondary text-xs font-semibold transition hover:border-primary/40 hover:text-primary sm:inline-flex sm:w-auto sm:px-3"
          >
            <Settings2 className="size-3.5" />{" "}
            <span className="hidden sm:inline">Editar colunas</span>
          </button>
        </div>
      </div>

      <div className="kanban-scrollbar -mx-0.5 flex shrink-0 gap-1.5 overflow-x-auto px-0.5 pb-1 md:hidden">
        {columns.map((column) => {
          const count = items.filter(
            (conversation) =>
              (conversation.kanbanColumnId ?? defaultKanbanColumnId(conversation.estagio)) ===
              column.id,
          ).length;
          const color = KANBAN_COLOR_CLASSES[column.cor];
          const active = column.id === mobileColumnId;

          return (
            <button
              key={column.id}
              type="button"
              onClick={() => setMobileColumnId(column.id)}
              aria-pressed={active}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                active
                  ? "border-foreground bg-foreground text-background shadow-sm"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className={`size-2 rounded-full ${color.dot}`} />
              <span>{column.nome}</span>
              <span
                className={`grid min-w-5 place-items-center rounded-md px-1 py-0.5 text-[10px] ${
                  active ? "bg-background/15" : color.badge
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={boardRef}
        className="flex min-h-0 flex-1 overflow-hidden md:kanban-scrollbar md:snap-x md:gap-3 md:overflow-x-scroll md:overflow-y-hidden md:pb-3"
      >
        {columns.map((column) => {
          const list = items.filter(
            (conversation) =>
              (conversation.kanbanColumnId ?? defaultKanbanColumnId(conversation.estagio)) ===
              column.id,
          );
          const total = list.reduce((sum, conversation) => sum + conversation.valorPotencial, 0);
          const color = KANBAN_COLOR_CLASSES[column.cor];
          return (
            <section
              key={column.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => void move(column)}
              className={`${column.id === mobileColumnId ? "flex" : "hidden"} h-full min-h-[300px] w-full shrink-0 flex-col overflow-hidden rounded-2xl border border-border border-t-4 bg-secondary/35 md:flex md:min-h-[360px] md:w-[310px] md:snap-start ${color.border}`}
            >
              <div className="shrink-0 border-b border-border/70 bg-card/70 px-3.5 py-3 backdrop-blur">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${color.dot}`} />
                      <h3 className="truncate text-sm font-bold">{column.nome}</h3>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {column.descricao}
                    </p>
                  </div>
                  <span
                    className={`grid min-w-6 place-items-center rounded-lg px-1.5 py-1 text-[11px] font-bold ${color.badge}`}
                  >
                    {list.length}
                  </span>
                </div>
                <div className="mt-2 text-[10px] font-bold text-success">
                  {brl(total)} em potencial
                </div>
              </div>

              <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
                {list.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    draggable
                    onDragStart={() => setDrag(conversation.id)}
                    onClick={() => setSelected(conversation)}
                    className="group w-full cursor-grab rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:cursor-grabbing"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${color.badge}`}
                      >
                        {conversation.cliente
                          .split(" ")
                          .map((name) => name[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold group-hover:text-primary">
                          {conversation.cliente}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {conversation.telefone || "Sem telefone"}
                        </div>
                      </div>
                      {conversation.naoLidas > 0 && (
                        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-[9px] font-bold text-success-foreground">
                          {conversation.naoLidas}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {conversation.ultima || "Sem mensagens recentes"}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between border-t border-border/70 pt-2">
                      <span className="text-[10px] font-bold text-success">
                        {brl(conversation.valorPotencial)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{conversation.hora}</span>
                    </div>
                  </button>
                ))}
                {list.length === 0 && (
                  <div className="grid min-h-24 place-items-center rounded-xl border border-dashed border-border bg-card/40 px-4 text-center text-[10px] text-muted-foreground">
                    Arraste um cliente para esta coluna
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {selected && (
        <KanbanContactModal
          conversation={selected}
          column={columns.find((column) => column.id === selected.kanbanColumnId)}
          columns={columns}
          onClose={() => setSelected(null)}
          onOpen={() => onOpenConversation(selected)}
          onOpenPopup={() => {
            setChatPopup(selected);
            setSelected(null);
          }}
          onOpenPdv={() => {
            setPdvConversation(selected);
            setSelected(null);
          }}
          onMove={async (column) => {
            await onMoveColumn(selected, column);
            setMobileColumnId(column.id);
          }}
        />
      )}
      {pdvConversation && (
        <KanbanPdvModal conversation={pdvConversation} onClose={() => setPdvConversation(null)} />
      )}
      {editing && (
        <KanbanColumnsModal
          columns={columns}
          items={items}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            await onSaveColumns(next);
            setEditing(false);
          }}
        />
      )}
      {chatPopup && (
        <ConversaChatPopup
          key={chatPopup.id}
          conversation={chatPopup}
          onClose={() => setChatPopup(null)}
          onExpand={() => {
            onOpenConversation(chatPopup);
            setChatPopup(null);
          }}
        />
      )}
    </div>
  );
}

function KanbanContactModal<T extends Conversa & { telefone?: string }>({
  conversation,
  column,
  columns,
  onClose,
  onOpen,
  onOpenPopup,
  onOpenPdv,
  onMove,
}: {
  conversation: T;
  column?: KanbanColumn;
  columns: KanbanColumn[];
  onClose: () => void;
  onOpen: () => void;
  onOpenPopup: () => void;
  onOpenPdv: () => void;
  onMove: (column: KanbanColumn) => Promise<void> | void;
}) {
  const [targetColumnId, setTargetColumnId] = useState(column?.id ?? "");
  const [moving, setMoving] = useState(false);

  async function moveConversation() {
    const target = columns.find((item) => item.id === targetColumnId);
    if (!target || target.id === column?.id || moving) return;

    setMoving(true);
    await onMove(target);
    setMoving(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-sm font-black text-primary">
              {conversation.cliente
                .split(" ")
                .map((name) => name[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold">{conversation.cliente}</h3>
              <p className="text-xs text-muted-foreground">{conversation.telefone}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-secondary"
            aria-label="Fechar"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="mt-4 rounded-2xl bg-secondary/60 p-3.5">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>{column?.nome ?? "Kanban"}</span>
            <span>{conversation.hora}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">
            {conversation.ultima || "Sem mensagens recentes."}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border p-3">
            <div className="text-[10px] text-muted-foreground">Potencial</div>
            <div className="mt-0.5 text-sm font-bold text-success">
              {brl(conversation.valorPotencial)}
            </div>
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="text-[10px] text-muted-foreground">Mensagens novas</div>
            <div className="mt-0.5 text-sm font-bold">{conversation.naoLidas}</div>
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-secondary/35 p-3 md:hidden">
          <label
            htmlFor="kanban-mobile-destination"
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Mover para outra etapa
          </label>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <select
              id="kanban-mobile-destination"
              value={targetColumnId}
              onChange={(event) => setTargetColumnId(event.target.value)}
              className="h-11 min-w-0 rounded-xl border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-primary"
            >
              {columns.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void moveConversation()}
              disabled={moving || !targetColumnId || targetColumnId === column?.id}
              className="h-11 rounded-xl bg-foreground px-4 text-xs font-bold text-background disabled:opacity-40"
            >
              {moving ? "Movendo..." : "Mover"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenPdv}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary text-sm font-bold hover:border-primary/40 hover:text-primary"
          >
            <Store className="size-4" /> Abrir PDV
          </button>
          <button
            type="button"
            onClick={onOpenPopup}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <MessageSquare className="size-4" /> Abrir conversa
          </button>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
        >
          <Maximize2 className="size-3.5" /> Abrir no WhatsApp IA
        </button>
      </div>
    </div>
  );
}

function KanbanPdvModal<T extends Conversa & { telefone?: string }>({
  conversation,
  onClose,
}: {
  conversation: T;
  onClose: () => void;
}) {
  const [conversaAberta, setConversaAberta] = useState(true);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && conversaAberta) setConversaAberta(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [conversaAberta]);

  // Nao fecha ao clicar fora para nao perder uma venda sendo montada.
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-2 sm:p-4">
      <div className="flex h-[94dvh] w-full max-w-[1480px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Store className="size-4 text-primary" /> PDV
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              Venda para {conversation.cliente}
              {conversation.telefone ? ` · ${conversation.telefone}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Fechar PDV"
          >
            <XIcon />
          </button>
        </div>
        <div
          className={`grid min-h-0 flex-1 bg-background ${
            conversaAberta
              ? "grid-rows-[minmax(0,1fr)_minmax(280px,45%)] lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1"
              : "grid-cols-1"
          }`}
        >
          <div className="scrollbar-thin min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4">
            <Suspense
              fallback={
                <div className="rounded-lg bg-secondary/50 p-3 text-sm text-muted-foreground">
                  Carregando PDV...
                </div>
              }
            >
              <PDV
                initialCliente={conversation.cliente}
                initialTelefone={(conversation.telefone ?? "").replace(/\D/g, "")}
                conversaAberta={conversaAberta}
                onAlternarConversa={() => setConversaAberta((aberta) => !aberta)}
              />
            </Suspense>
          </div>
          <div className={conversaAberta ? "min-h-0" : "hidden"}>
            <ConversaChatPopup
              conversation={conversation}
              onClose={() => setConversaAberta(false)}
              embedded
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanColumnsModal<T extends Conversa & { telefone?: string }>({
  columns,
  items,
  onClose,
  onSave,
}: {
  columns: KanbanColumn[];
  items: T[];
  onClose: () => void;
  onSave: (columns: KanbanColumn[]) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(() => columns.map((column) => ({ ...column })));
  const [saving, setSaving] = useState(false);

  function update(id: string, patch: Partial<KanbanColumn>) {
    setDraft((current) =>
      current.map((column) => (column.id === id ? { ...column, ...patch } : column)),
    );
  }

  function addColumn() {
    const id = `personalizada-${Date.now().toString(36)}`;
    setDraft((current) => [
      ...current,
      {
        id,
        nome: "Nova coluna",
        descricao: "Descreva quando usar esta coluna",
        cor: "slate",
        estagioInterno: "qualificando",
      },
    ]);
  }

  function moveColumn(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    if (draft.some((column) => !column.nome.trim())) {
      toast.error("Todas as colunas precisam de um nome");
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar as colunas");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-3 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-bold">Organizar Kanban</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Renomeie, reordene ou crie colunas para o seu processo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-secondary"
            aria-label="Fechar"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {draft.map((column, index) => {
            const count = items.filter(
              (item) => (item.kanbanColumnId ?? defaultKanbanColumnId(item.estagio)) === column.id,
            ).length;
            return (
              <div
                key={column.id}
                className="grid gap-2 rounded-2xl border border-border bg-secondary/30 p-3 sm:grid-cols-[1fr_1.35fr_110px_auto] sm:items-center"
              >
                <input
                  value={column.nome}
                  onChange={(event) => update(column.id, { nome: event.target.value })}
                  className="h-9 min-w-0 rounded-lg border border-border bg-card px-3 text-xs font-semibold outline-none focus:border-primary"
                  aria-label="Nome da coluna"
                />
                <input
                  value={column.descricao}
                  onChange={(event) => update(column.id, { descricao: event.target.value })}
                  className="h-9 min-w-0 rounded-lg border border-border bg-card px-3 text-xs outline-none focus:border-primary"
                  aria-label="Descricao da coluna"
                />
                <select
                  value={column.cor}
                  onChange={(event) =>
                    update(column.id, { cor: event.target.value as KanbanColumnColor })
                  }
                  className="h-9 rounded-lg border border-border bg-card px-2 text-xs outline-none focus:border-primary"
                  aria-label="Cor da coluna"
                >
                  <option value="sky">Azul</option>
                  <option value="violet">Violeta</option>
                  <option value="amber">Amarelo</option>
                  <option value="emerald">Verde</option>
                  <option value="rose">Vermelho</option>
                  <option value="slate">Cinza</option>
                </select>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => moveColumn(index, -1)}
                    disabled={index === 0}
                    className="grid size-8 place-items-center rounded-lg bg-card text-xs font-bold disabled:opacity-30"
                    title="Mover para esquerda"
                  >
                    &larr;
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 1)}
                    disabled={index === draft.length - 1}
                    className="grid size-8 place-items-center rounded-lg bg-card text-xs font-bold disabled:opacity-30"
                    title="Mover para direita"
                  >
                    &rarr;
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => current.filter((item) => item.id !== column.id))
                    }
                    disabled={count > 0 || draft.length === 1}
                    className="grid size-8 place-items-center rounded-lg bg-card text-destructive disabled:opacity-30"
                    title={
                      count > 0 ? `Mova os ${count} clientes antes de excluir` : "Excluir coluna"
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addColumn}
            disabled={draft.length >= 16}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <Plus className="size-4" /> Criar nova coluna
          </button>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-xs font-semibold hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            <Save className="size-3.5" /> {saving ? "Salvando..." : "Salvar alteracoes"}
          </button>
        </div>
      </div>
    </div>
  );
}
