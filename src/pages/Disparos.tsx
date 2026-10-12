import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Columns3,
  ListChecks,
  Loader2,
  Paperclip,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { KanbanColumn } from "@/features/whatsapp-crm/kanban-config";
import type { Cliente } from "@/lib/crm-types";
import {
  COOLDOWNS,
  cooldownAleatorio,
  executarFilaDisparo,
  formatarDuracao,
  tempoEstimadoMs as calcularTempoEstimadoMs,
  type CooldownNivel,
} from "@/lib/disparos-fila";

type DisparoModo = "automatico" | "semi" | "kanban";

type KanbanContato = {
  telefone: string;
  nome: string;
  kanbanColuna: string;
};
type DisparoMidiaTipo = "image" | "audio" | "video" | "document";
type FollowupModo = "manual" | "ia";
type FollowupDisparo = "automatico" | "confirmar";
type FollowupStatus = "pendente" | "aguardando_confirmacao" | "enviado" | "cancelado" | "erro";

type Followup = {
  id: string;
  telefone: string;
  clienteNome: string;
  agendadoPara: string;
  modo: FollowupModo;
  disparo: FollowupDisparo;
  mensagem: string;
  contexto?: { origem?: "geral" | "recompra" | "whatsapp_ia" };
  status: FollowupStatus;
  erro?: string;
};

type ResultadoDisparo = {
  total: number;
  enviados: number;
  erros: number;
  resultados: Array<{ id: string; nome: string; telefone: string; ok: boolean; erro?: string }>;
};

type MidiaArquivo = {
  nome: string;
  tipo: string;
  tamanho: number;
  base64: string;
};

const DISPAROS_ENDPOINT = "/api/crm/disparos";
const FOLLOWUPS_ENDPOINT = "/api/crm/followups";
const CLIENTES_ENDPOINT = "/api/crm/clientes";
const NOME_UTIL_RE = /[\p{L}\p{N}]/u;
const LEADS_VISIVEIS_MAX = 80;

// Disparo em andamento fica no modulo, fora do componente: sair da pagina e voltar
// nao perde o progresso nem permite iniciar um segundo disparo em paralelo.
type DisparoAtivo = {
  emAndamento: boolean;
  feitos: number;
  total: number;
  proximoEnvioEm: number | null;
  resultado: ResultadoDisparo;
};

let disparoAtivo: DisparoAtivo | null = null;
let pararDisparoAtivo = false;
let acordarCooldown: (() => void) | null = null;
const ouvintesDisparo = new Set<() => void>();

function atualizarDisparoAtivo(next: DisparoAtivo | null) {
  disparoAtivo = next;
  ouvintesDisparo.forEach((ouvinte) => ouvinte());
}

function assinarDisparoAtivo(ouvinte: () => void): () => void {
  ouvintesDisparo.add(ouvinte);
  return () => ouvintesDisparo.delete(ouvinte);
}

// Espera o cooldown, mas acorda na hora se o usuario clicar em parar.
function aguardarCooldown(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      acordarCooldown = null;
      resolve();
    }, ms);
    acordarCooldown = () => {
      window.clearTimeout(timer);
      acordarCooldown = null;
      resolve();
    };
  });
}

function pararDisparo() {
  pararDisparoAtivo = true;
  acordarCooldown?.();
}

// Fechar/recarregar a aba mata o disparo; o navegador pede confirmacao antes.
function avisarSaidaDuranteDisparo(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

// Impede a tela/PC de dormir durante disparos longos (so vale com a aba visivel).
async function manterTelaAcordada(): Promise<(() => void) | null> {
  try {
    const lock = await navigator.wakeLock?.request("screen");
    return lock ? () => void lock.release().catch(() => {}) : null;
  } catch {
    return null;
  }
}

const mensagemPadrao =
  "Oi {nome}, tudo bem? Passando da Mundo Pet para saber se posso ajudar com algo para {pet} hoje.";

const followupPadrao =
  "Oi {nome}, tudo bem? Passando para saber se ficou alguma duvida ou se posso ajudar com o proximo pedido.";

const MIDIA_MAX_BYTES = 16 * 1024 * 1024;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function telefoneValido(value: string): boolean {
  return onlyDigits(value).length >= 10;
}

// DDD + ultimos 8 digitos: casa telefones com/sem 55 e com/sem o nono digito.
function chaveTelefone(value: string): string {
  let digits = onlyDigits(value);
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.length >= 10 ? `${digits.slice(0, 2)}${digits.slice(-8)}` : digits;
}

function clienteDoContato(contato: KanbanContato): Cliente {
  return {
    id: `kanban-${contato.telefone}`,
    nome: contato.nome,
    telefone: contato.telefone,
    endereco: "",
    bairro: "",
    pets: [],
    ticket: 0,
    frequencia: "",
    ultima: "",
    perfil: "Novo",
    origem: "WhatsApp IA",
    cac: 0,
    totalGasto: 0,
    totalDescontos: 0,
    lucroLiquido: 0,
    pedidos: 0,
    proxRecompra: "",
    observacoes: "",
  };
}

function nuncaComprou(cliente: Cliente): boolean {
  return cliente.pedidos <= 0 && cliente.totalGasto <= 0;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasDesdeData(value?: string): number | null {
  if (!value || value === "atrasada") return value === "atrasada" ? 999 : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function scoreLead(cliente: Cliente): number {
  if (!NOME_UTIL_RE.test(cliente.nome)) return 0;

  let score = 0;
  const diasRecompra = diasDesdeData(cliente.proxRecompra);

  if (cliente.perfil === "Risco") score += 45;
  if (cliente.perfil === "VIP" || cliente.perfil === "Premium") score += 15;
  if (cliente.pedidos <= 0) score += 25;
  if (cliente.pedidos > 0 && cliente.totalGasto > 0) score += 10;
  if (diasRecompra !== null && diasRecompra >= 0) score += Math.min(35, 12 + diasRecompra);
  if (cliente.followUpManual?.status === "pendente") score += 20;
  if (telefoneValido(cliente.telefone)) score += 5;

  return score;
}

function defaultDateTimeLocal(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function localToIso(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstPet(cliente: Cliente): string {
  return cliente.pets?.find(Boolean) ?? "pet";
}

function aplicarVariaveis(template: string, cliente: Cliente): string {
  const pets = cliente.pets?.filter(Boolean).join(", ") || "seu pet";
  return template
    .replaceAll("{nome}", cliente.nome || "tudo bem")
    .replaceAll("{pet}", firstPet(cliente))
    .replaceAll("{pets}", pets)
    .trim();
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

function tipoArquivoMidia(file: File): DisparoMidiaTipo {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

const statusMeta: Record<FollowupStatus, { label: string; className: string; icon: ReactNode }> = {
  pendente: {
    label: "Agendado",
    className: "bg-primary/15 text-primary",
    icon: <Clock className="size-3" />,
  },
  aguardando_confirmacao: {
    label: "Confirmar",
    className: "bg-accent/15 text-accent",
    icon: <AlertTriangle className="size-3" />,
  },
  enviado: {
    label: "Enviado",
    className: "bg-success/15 text-success",
    icon: <Check className="size-3" />,
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-secondary text-muted-foreground",
    icon: <X className="size-3" />,
  },
  erro: {
    label: "Erro",
    className: "bg-destructive/15 text-destructive",
    icon: <AlertTriangle className="size-3" />,
  },
};

export function Disparos() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modo, setModo] = useState<DisparoModo>("automatico");
  const [mensagem, setMensagem] = useState(mensagemPadrao);
  const [midiaUrl, setMidiaUrl] = useState("");
  const [midiaArquivo, setMidiaArquivo] = useState<MidiaArquivo | null>(null);
  const [midiaTipo, setMidiaTipo] = useState<DisparoMidiaTipo>("image");
  const [midiaNome, setMidiaNome] = useState("");
  const [limiteAuto, setLimiteAuto] = useState(10);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [kanbanColunas, setKanbanColunas] = useState<KanbanColumn[]>([]);
  const [kanbanContatos, setKanbanContatos] = useState<KanbanContato[]>([]);
  const [colunasSelecionadas, setColunasSelecionadas] = useState<Set<string>>(() => new Set());
  const [somenteSemCompra, setSomenteSemCompra] = useState(true);
  const [cooldown, setCooldown] = useState<CooldownNivel>("seguro");
  const [agora, setAgora] = useState(() => Date.now());
  const disparo = useSyncExternalStore(
    assinarDisparoAtivo,
    () => disparoAtivo,
    () => null,
  );
  const enviando = disparo?.emAndamento ?? false;
  const resultado = disparo?.resultado ?? null;
  const proximoEnvioEm = disparo?.proximoEnvioEm ?? null;

  // Relogio da contagem regressiva do proximo envio.
  useEffect(() => {
    if (proximoEnvioEm === null) return;
    setAgora(Date.now());
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [proximoEnvioEm]);

  const [followupAudience, setFollowupAudience] = useState<DisparoModo>("automatico");
  const [followupQuando, setFollowupQuando] = useState(defaultDateTimeLocal);
  const [followupModo, setFollowupModo] = useState<FollowupModo>("ia");
  const [followupDisparo, setFollowupDisparo] = useState<FollowupDisparo>("automatico");
  const [followupMensagem, setFollowupMensagem] = useState(followupPadrao);
  const [salvandoFollowup, setSalvandoFollowup] = useState(false);
  const [acaoFollowupId, setAcaoFollowupId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const [clientesRes, followupsRes, kanbanRes] = await Promise.all([
          fetch(CLIENTES_ENDPOINT, { cache: "no-store" }),
          fetch(`${FOLLOWUPS_ENDPOINT}?status=pendente,aguardando_confirmacao,erro&origem=geral`, {
            cache: "no-store",
          }),
          fetch(DISPAROS_ENDPOINT, { cache: "no-store" }).catch(() => null),
        ]);
        const clientesData = (await clientesRes.json()) as Cliente[] | { erro?: string };
        const followupsData = (await followupsRes.json()) as Followup[] | { erro?: string };

        if (!clientesRes.ok || !Array.isArray(clientesData)) {
          throw new Error(
            Array.isArray(clientesData) ? "Erro ao carregar leads" : clientesData.erro,
          );
        }
        if (!followupsRes.ok || !Array.isArray(followupsData)) {
          throw new Error(
            Array.isArray(followupsData) ? "Erro ao carregar follow-ups" : followupsData.erro,
          );
        }

        if (alive) {
          setClientes(clientesData);
          setFollowups(followupsData);
        }

        const kanbanData = kanbanRes?.ok
          ? ((await kanbanRes.json()) as { colunas?: KanbanColumn[]; contatos?: KanbanContato[] })
          : null;
        if (alive && kanbanData) {
          setKanbanColunas(kanbanData.colunas ?? []);
          setKanbanContatos(kanbanData.contatos ?? []);
        } else if (alive) {
          toast.error("Nao foi possivel carregar as colunas do kanban");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erro ao carregar disparos");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();

    return () => {
      alive = false;
    };
  }, []);

  const leadsValidos = useMemo(
    () => clientes.filter((cliente) => telefoneValido(cliente.telefone)),
    [clientes],
  );

  const autoLeads = useMemo(
    () =>
      [...leadsValidos]
        .map((cliente) => ({ cliente, score: scoreLead(cliente) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.cliente.nome.localeCompare(b.cliente.nome))
        .map((item) => item.cliente),
    [leadsValidos],
  );

  const leadsFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leadsValidos;

    return leadsValidos.filter((cliente) => {
      const haystack = [
        cliente.nome,
        cliente.telefone,
        cliente.perfil,
        cliente.origem,
        cliente.bairro,
        cliente.pets?.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [leadsValidos, query]);

  const leadsVisiveis = useMemo(
    () => leadsFiltrados.slice(0, LEADS_VISIVEIS_MAX),
    [leadsFiltrados],
  );

  const selecionadosLista = useMemo(
    () => leadsValidos.filter((cliente) => selecionados.has(cliente.id)),
    [leadsValidos, selecionados],
  );

  const contatosPorColuna = useMemo(() => {
    const contagem = new Map<string, number>();
    kanbanContatos.forEach((contato) =>
      contagem.set(contato.kanbanColuna, (contagem.get(contato.kanbanColuna) ?? 0) + 1),
    );
    return contagem;
  }, [kanbanContatos]);

  // Contatos das colunas escolhidas, cruzados com o cadastro de clientes pelo telefone.
  // Quem nao tem cadastro nunca teve venda registrada, entao conta como "nunca comprou".
  const kanbanLeads = useMemo(() => {
    if (colunasSelecionadas.size === 0) return [];
    const clientesPorTelefone = new Map(
      clientes.map((cliente) => [chaveTelefone(cliente.telefone), cliente] as const),
    );
    const vistos = new Set<string>();

    return kanbanContatos.flatMap((contato): Cliente[] => {
      if (!colunasSelecionadas.has(contato.kanbanColuna)) return [];
      const chave = chaveTelefone(contato.telefone);
      if (vistos.has(chave)) return [];
      vistos.add(chave);
      const cadastro = clientesPorTelefone.get(chave);
      const lead = cadastro
        ? { ...cadastro, telefone: contato.telefone, nome: cadastro.nome || contato.nome }
        : clienteDoContato(contato);
      if (somenteSemCompra && !nuncaComprou(lead)) return [];
      return [lead];
    });
  }, [clientes, colunasSelecionadas, kanbanContatos, somenteSemCompra]);

  const kanbanColunaPorTelefone = useMemo(
    () =>
      new Map(
        kanbanContatos.map((contato) => [chaveTelefone(contato.telefone), contato.kanbanColuna]),
      ),
    [kanbanContatos],
  );
  const kanbanColunaNomePorId = useMemo(
    () => new Map(kanbanColunas.map((coluna) => [coluna.id, coluna.nome])),
    [kanbanColunas],
  );
  const kanbanLeadsFiltrados = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return kanbanLeads;

    return kanbanLeads.filter((cliente) => {
      const colunaId = kanbanColunaPorTelefone.get(chaveTelefone(cliente.telefone));
      const haystack = [
        cliente.nome,
        cliente.telefone,
        cliente.perfil,
        cliente.origem,
        cliente.bairro,
        cliente.pets?.join(" "),
        colunaId ? kanbanColunaNomePorId.get(colunaId) : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [kanbanColunaNomePorId, kanbanColunaPorTelefone, kanbanLeads, query]);
  const kanbanLeadsVisiveis = useMemo(
    () => kanbanLeadsFiltrados.slice(0, LEADS_VISIVEIS_MAX),
    [kanbanLeadsFiltrados],
  );

  function publicoDoModo(value: DisparoModo): Cliente[] {
    if (value === "automatico") return autoLeads.slice(0, limiteAuto);
    if (value === "kanban") return kanbanLeads;
    return selecionadosLista;
  }

  const previewLeads = publicoDoModo(modo);
  const tempoEstimadoMs = calcularTempoEstimadoMs(previewLeads.length, cooldown);
  const followupLeads = publicoDoModo(followupAudience);

  const resumo = useMemo(
    () => ({
      validos: leadsValidos.length,
      automaticos: autoLeads.length,
      selecionados: selecionados.size,
      followups: followups.length,
    }),
    [autoLeads.length, followups.length, leadsValidos.length, selecionados.size],
  );

  function toggleLead(id: string) {
    setSelecionados((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColuna(id: string) {
    setColunasSelecionadas((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelecionados((current) => {
      const next = new Set(current);
      leadsVisiveis.slice(0, 50).forEach((cliente) => next.add(cliente.id));
      return next;
    });
  }

  async function selecionarArquivoMidia(file: File | undefined) {
    if (!file) return;
    if (file.size > MIDIA_MAX_BYTES) {
      toast.error("Arquivo muito grande. Use ate 16MB.");
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setMidiaArquivo({ nome: file.name, tipo: file.type, tamanho: file.size, base64 });
      setMidiaTipo(tipoArquivoMidia(file));
      setMidiaNome(file.name);
      setMidiaUrl("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao ler arquivo");
    }
  }

  async function enviarDisparo() {
    const texto = mensagem.trim();
    const midia = midiaUrl.trim();
    if (!texto && !midia && !midiaArquivo) {
      toast.error("Escreva a mensagem ou informe uma midia");
      return;
    }
    if (midia && !/^https?:\/\//i.test(midia)) {
      toast.error("Informe uma URL de midia com http ou https");
      return;
    }
    if (modo === "semi" && selecionadosLista.length === 0) {
      toast.error("Selecione pelo menos um lead");
      return;
    }
    if (modo === "kanban" && kanbanLeads.length === 0) {
      toast.error("Nenhum contato nas colunas escolhidas");
      return;
    }
    if (disparoAtivo?.emAndamento) {
      toast.error("Ja existe um disparo em andamento");
      return;
    }
    const publico = previewLeads;
    if (publico.length === 0) {
      toast.error("Nenhum lead para disparar");
      return;
    }
    if (
      !window.confirm(
        `Disparar para ${publico.length} contato(s) no modo ${COOLDOWNS[cooldown].label}?` +
          ` Tempo estimado: ~${formatarDuracao(tempoEstimadoMs)}.`,
      )
    ) {
      return;
    }

    const payloadBase = {
      mensagem: texto,
      midiaUrl: midiaArquivo ? undefined : midia || undefined,
      midiaBase64: midiaArquivo?.base64,
      midiaTipo: midia || midiaArquivo ? midiaTipo : undefined,
      midiaNome: midiaNome.trim() || midiaArquivo?.nome || undefined,
      midiaMimeType: midiaArquivo?.tipo,
    };

    async function postDisparo(body: Record<string, unknown>): Promise<ResultadoDisparo> {
      const response = await fetch(DISPAROS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payloadBase, ...body }),
      });
      const data = (await response.json()) as ResultadoDisparo & { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Falha ao disparar mensagens");
      return data;
    }

    // Um contato por requisicao; o cooldown entre eles roda aqui no navegador.
    const acumulado: ResultadoDisparo = { total: 0, enviados: 0, erros: 0, resultados: [] };
    const nivel = cooldown;
    let feitos = 0;
    const publicar = (proximoEnvioEm: number | null, emAndamento = true) =>
      atualizarDisparoAtivo({
        emAndamento,
        feitos,
        total: publico.length,
        proximoEnvioEm,
        resultado: { ...acumulado, resultados: [...acumulado.resultados] },
      });

    pararDisparoAtivo = false;
    publicar(null);
    window.addEventListener("beforeunload", avisarSaidaDuranteDisparo);
    const liberarTela = await manterTelaAcordada();
    try {
      const { interrompido } = await executarFilaDisparo({
        itens: publico,
        intervaloMs: () => cooldownAleatorio(nivel),
        aguardar: async (ms) => {
          await aguardarCooldown(ms);
          publicar(null);
        },
        deveParar: () => pararDisparoAtivo,
        onEsperando: (ms) => publicar(Date.now() + ms),
        enviar: async (cliente) => {
          const telefone = onlyDigits(cliente.telefone);
          try {
            const data = await postDisparo({
              modo: "lista",
              destinatarios: [{ telefone, nome: cliente.nome, pets: cliente.pets }],
            });
            acumulado.total += data.total;
            acumulado.enviados += data.enviados;
            acumulado.erros += data.erros;
            acumulado.resultados.push(...data.resultados);
          } catch (error) {
            acumulado.total += 1;
            acumulado.erros += 1;
            acumulado.resultados.push({
              id: cliente.id,
              nome: cliente.nome,
              telefone,
              ok: false,
              erro: error instanceof Error ? error.message : "Falha ao enviar",
            });
          }
          feitos += 1;
          publicar(null);
        },
      });

      const resumoEnvio = `${acumulado.enviados} mensagem(ns) enviada(s)`;
      if (interrompido) toast.success(`Disparo interrompido: ${resumoEnvio}`);
      else if (acumulado.enviados === 0)
        toast.error("Nenhuma mensagem enviada. Veja os erros abaixo.");
      else toast.success(resumoEnvio);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao disparar mensagens");
    } finally {
      window.removeEventListener("beforeunload", avisarSaidaDuranteDisparo);
      liberarTela?.();
      publicar(null, false);
    }
  }

  async function agendarFollowups() {
    const iso = localToIso(followupQuando);
    if (!iso) {
      toast.error("Escolha uma data e hora validas");
      return;
    }
    if (followupModo === "manual" && !followupMensagem.trim()) {
      toast.error("Escreva a mensagem ou deixe a IA gerar");
      return;
    }
    if (followupLeads.length === 0) {
      toast.error("Nenhum lead para agendar follow-up");
      return;
    }

    setSalvandoFollowup(true);
    try {
      const criados: Followup[] = [];
      const erros: string[] = [];

      const limiteFollowups = followupAudience === "kanban" ? followupLeads.length : 50;
      for (const cliente of followupLeads.slice(0, limiteFollowups)) {
        const response = await fetch(FOLLOWUPS_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            telefone: onlyDigits(cliente.telefone),
            clienteNome: cliente.nome,
            agendadoPara: iso,
            modo: followupModo,
            disparo: followupDisparo,
            mensagem: followupModo === "manual" ? aplicarVariaveis(followupMensagem, cliente) : "",
            contexto: {
              nome: cliente.nome,
              pet: firstPet(cliente),
              objetivo: "Follow-up criado pela aba Disparos",
              resumo: cliente.observacoes,
            },
          }),
        });
        const data = (await response.json()) as Followup & { erro?: string };
        if (!response.ok) erros.push(`${cliente.nome}: ${data.erro || "falha"}`);
        else criados.push(data);
      }

      if (criados.length > 0) {
        setFollowups((current) =>
          [...criados, ...current].sort((a, b) => a.agendadoPara.localeCompare(b.agendadoPara)),
        );
      }
      if (erros.length > 0) toast.error(`${erros.length} follow-up(s) falharam`);
      toast.success(`${criados.length} follow-up(s) agendado(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao agendar follow-ups");
    } finally {
      setSalvandoFollowup(false);
    }
  }

  async function acaoFollowup(id: string, acao: "enviar" | "cancelar") {
    setAcaoFollowupId(id);
    try {
      const response = await fetch(FOLLOWUPS_ENDPOINT, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, acao }),
      });
      const data = (await response.json()) as Followup & { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Falha no follow-up");
      setFollowups((current) => current.map((item) => (item.id === id ? data : item)));
      toast.success(acao === "enviar" ? "Follow-up enviado" : "Follow-up cancelado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no follow-up");
    } finally {
      setAcaoFollowupId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disparos</h1>
          <p className="text-sm text-muted-foreground">
            Envie mensagens em lote e programe follow-ups com a mesma fila do WhatsApp IA.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Metric label="Leads validos" value={String(resumo.validos)} />
          <Metric label="Auto" value={String(resumo.automaticos)} />
          <Metric label="Selecionados" value={String(resumo.selecionados)} />
          <Metric label="Follow-ups" value={String(resumo.followups)} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="card-soft p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle icon={<Send className="size-4" />} title="Disparo de mensagens" />
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              <SegmentButton active={modo === "automatico"} onClick={() => setModo("automatico")}>
                <Zap className="size-3.5" /> Automatico
              </SegmentButton>
              <SegmentButton active={modo === "semi"} onClick={() => setModo("semi")}>
                <ListChecks className="size-3.5" /> Semi
              </SegmentButton>
              <SegmentButton active={modo === "kanban"} onClick={() => setModo("kanban")}>
                <Columns3 className="size-3.5" /> Kanban
              </SegmentButton>
            </div>
          </div>

          {modo === "kanban" && (
            <KanbanFiltro
              colunas={kanbanColunas}
              contagem={contatosPorColuna}
              selecionadas={colunasSelecionadas}
              onToggle={toggleColuna}
              somenteSemCompra={somenteSemCompra}
              onSomenteSemCompra={setSomenteSemCompra}
              total={kanbanLeads.length}
            />
          )}

          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-bold">
                <Clock className="size-4 text-primary" />
                Intervalo entre mensagens
              </span>
              <span className="text-[11px] text-muted-foreground">
                {previewLeads.length} contato(s) · ~{formatarDuracao(tempoEstimadoMs)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              {(Object.keys(COOLDOWNS) as CooldownNivel[]).map((nivel) => (
                <SegmentButton
                  key={nivel}
                  active={cooldown === nivel}
                  onClick={() => setCooldown(nivel)}
                  disabled={enviando}
                >
                  {nivel === "perigoso" && <AlertTriangle className="size-3.5" />}
                  {nivel === "medio" && <Clock className="size-3.5" />}
                  {nivel === "seguro" && <CheckCircle2 className="size-3.5" />}
                  {COOLDOWNS[nivel].label}
                </SegmentButton>
              ))}
            </div>
            <div
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${COOLDOWNS[cooldown].className}`}
            >
              {COOLDOWNS[cooldown].descricao}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_180px]">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Mensagem
              </span>
              <textarea
                value={mensagem}
                onChange={(event) => setMensagem(event.target.value)}
                rows={5}
                className="input min-h-32"
                placeholder="Use {nome}, {pet} ou {pets}"
              />
            </label>
            <div className="space-y-3">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Limite auto
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={limiteAuto}
                  onChange={(event) => setLimiteAuto(Number(event.target.value))}
                  className="input"
                />
              </label>
              <button
                type="button"
                onClick={() => void enviarDisparo()}
                disabled={enviando || previewLeads.length === 0}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-bold text-background hover:opacity-90 disabled:opacity-50"
              >
                {enviando ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {modo === "automatico"
                  ? "Disparar auto"
                  : modo === "kanban"
                    ? `Disparar para ${kanbanLeads.length}`
                    : "Disparar selecionados"}
              </button>
              {enviando && disparo && (
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div>
                    Enviados {disparo.feitos}/{disparo.total}
                    {proximoEnvioEm !== null
                      ? ` · proxima em ${formatarDuracao(proximoEnvioEm - agora)}`
                      : "..."}
                  </div>
                  <button
                    type="button"
                    onClick={pararDisparo}
                    className="h-8 w-full rounded-lg bg-secondary text-xs font-bold text-foreground hover:bg-secondary/70"
                  >
                    Parar disparo
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold">
              <Paperclip className="size-4 text-primary" />
              Midia opcional no disparo
            </div>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void selecionarArquivoMidia(event.dataTransfer.files[0]);
              }}
              className="mb-3 rounded-xl border border-dashed border-border bg-secondary/40 p-4 text-center"
            >
              <Upload className="mx-auto size-6 text-primary" />
              <div className="mt-2 text-sm font-bold">
                Arraste a midia aqui ou selecione do computador
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Imagem, audio, video ou documento ate 16MB
              </div>
              <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-xs font-bold text-background">
                <Upload className="size-3.5" />
                Importar arquivo
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => void selecionarArquivoMidia(event.target.files?.[0])}
                />
              </label>
              {midiaArquivo && (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs">
                  <Paperclip className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{midiaArquivo.nome}</span>
                  <button
                    type="button"
                    onClick={() => setMidiaArquivo(null)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title="Remover arquivo"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-[160px_1fr_180px]">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Tipo
                </span>
                <select
                  value={midiaTipo}
                  onChange={(event) => setMidiaTipo(event.target.value as DisparoMidiaTipo)}
                  className="input h-10"
                >
                  <option value="image">Imagem</option>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                  <option value="document">Documento</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  URL da midia
                </span>
                <input
                  value={midiaUrl}
                  onChange={(event) => {
                    setMidiaUrl(event.target.value);
                    if (event.target.value.trim()) setMidiaArquivo(null);
                  }}
                  className="input h-10"
                  placeholder="Opcional: https://..."
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Nome arquivo
                </span>
                <input
                  value={midiaNome}
                  onChange={(event) => setMidiaNome(event.target.value)}
                  className="input h-10"
                  placeholder="catalogo.pdf"
                />
              </label>
            </div>
            {(midiaUrl.trim() || midiaArquivo) && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                Imagem, video e documento usam a mensagem como legenda. Audio envia a midia e em
                seguida o texto.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-bold">
                {modo === "automatico"
                  ? `${previewLeads.length} lead(s) escolhidos pelo CRM`
                  : modo === "kanban"
                    ? `${previewLeads.length} contato(s) das colunas do kanban`
                    : `${previewLeads.length} lead(s) selecionados`}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Preview com variaveis aplicadas
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {previewLeads.slice(0, 4).map((cliente) => (
                <LeadPreview key={cliente.id} cliente={cliente} mensagem={mensagem} />
              ))}
              {previewLeads.length === 0 && (
                <div className="rounded-lg bg-card p-3 text-sm text-muted-foreground">
                  {modo === "automatico"
                    ? "Nenhum lead valido para disparo automatico."
                    : modo === "kanban"
                      ? "Escolha uma ou mais colunas do kanban."
                      : "Selecione leads na lista ao lado."}
                </div>
              )}
            </div>
          </div>

          {resultado && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="size-4 text-success" />
                {resultado.enviados}/{resultado.total} enviadas
                {resultado.erros > 0 && (
                  <span className="text-destructive">{resultado.erros} erro(s)</span>
                )}
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs scrollbar-thin">
                {resultado.resultados.map((item) => (
                  <div
                    key={`${item.id}-${item.telefone}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-secondary/50 px-2 py-1.5"
                  >
                    <span className="truncate">{item.nome}</span>
                    <span className={item.ok ? "text-success" : "text-destructive"}>
                      {item.ok ? "Enviado" : (item.erro ?? "Erro")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="card-soft flex min-h-[520px] flex-col overflow-hidden">
          <div className="border-b border-border p-4">
            <SectionTitle
              icon={
                modo === "kanban" ? (
                  <Columns3 className="size-4" />
                ) : (
                  <Users className="size-4" />
                )
              }
              title={modo === "kanban" ? "Contatos do WhatsApp / Kanban" : "Selecao semi-automatica"}
            />
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    modo === "kanban"
                      ? "Buscar contato, telefone ou coluna"
                      : "Buscar lead, telefone, perfil ou pet"
                  }
                  className="input h-10 pl-9"
                />
              </div>
              {modo !== "kanban" && (
                <button
                  type="button"
                  onClick={selectVisible}
                  className="h-10 rounded-lg bg-secondary px-3 text-xs font-bold hover:bg-secondary/70"
                >
                  Selecionar
                </button>
              )}
            </div>
            {modo === "kanban" && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                A lista abaixo vem diretamente das conversas do WhatsApp e acompanha a coluna atual
                de cada contato.
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {loading ? (
              <div className="grid h-48 place-items-center text-sm text-muted-foreground">
                {modo === "kanban" ? "Carregando contatos do WhatsApp..." : "Carregando leads..."}
              </div>
            ) : modo === "kanban" ? (
              <div className="space-y-1.5">
                {kanbanLeadsVisiveis.map((cliente) => {
                  const colunaId = kanbanColunaPorTelefone.get(chaveTelefone(cliente.telefone));
                  return (
                    <KanbanLeadRow
                      key={cliente.id}
                      cliente={cliente}
                      coluna={colunaId ? kanbanColunaNomePorId.get(colunaId) : undefined}
                    />
                  );
                })}
                {kanbanLeadsFiltrados.length > kanbanLeadsVisiveis.length && (
                  <div className="rounded-lg bg-secondary/50 p-3 text-center text-xs text-muted-foreground">
                    Mostrando {kanbanLeadsVisiveis.length} de {kanbanLeadsFiltrados.length}. Use a
                    busca para refinar a lista.
                  </div>
                )}
                {colunasSelecionadas.size === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Escolha uma ou mais colunas do Kanban para ver os contatos aqui.
                  </div>
                )}
                {colunasSelecionadas.size > 0 && kanbanLeadsFiltrados.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado com os filtros atuais.
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {leadsVisiveis.map((cliente) => (
                  <LeadRow
                    key={cliente.id}
                    cliente={cliente}
                    checked={selecionados.has(cliente.id)}
                    onToggle={() => toggleLead(cliente.id)}
                  />
                ))}
                {leadsFiltrados.length > leadsVisiveis.length && (
                  <div className="rounded-lg bg-secondary/50 p-3 text-center text-xs text-muted-foreground">
                    Mostrando {leadsVisiveis.length} de {leadsFiltrados.length}. Use a busca para
                    refinar a lista.
                  </div>
                )}
                {leadsFiltrados.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum lead encontrado.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)]">
        <div className="card-soft p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              icon={<CalendarClock className="size-4" />}
              title="Disparo de follow-ups"
            />
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-secondary p-1">
              <SegmentButton
                active={followupAudience === "automatico"}
                onClick={() => setFollowupAudience("automatico")}
              >
                <Bot className="size-3.5" /> Auto
              </SegmentButton>
              <SegmentButton
                active={followupAudience === "semi"}
                onClick={() => setFollowupAudience("semi")}
              >
                <ListChecks className="size-3.5" /> Selecionados
              </SegmentButton>
              <SegmentButton
                active={followupAudience === "kanban"}
                onClick={() => setFollowupAudience("kanban")}
              >
                <Columns3 className="size-3.5" /> Kanban
              </SegmentButton>
            </div>
          </div>

          {followupAudience === "kanban" && (
            <KanbanFiltro
              colunas={kanbanColunas}
              contagem={contatosPorColuna}
              selecionadas={colunasSelecionadas}
              onToggle={toggleColuna}
              somenteSemCompra={somenteSemCompra}
              onSomenteSemCompra={setSomenteSemCompra}
              total={kanbanLeads.length}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Quando
              </span>
              <input
                type="datetime-local"
                value={followupQuando}
                onChange={(event) => setFollowupQuando(event.target.value)}
                className="input"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                No horario
              </span>
              <select
                value={followupDisparo}
                onChange={(event) => setFollowupDisparo(event.target.value as FollowupDisparo)}
                className="input"
              >
                <option value="automatico">Envia sozinho</option>
                <option value="confirmar">Operador confirma</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Quem escreve
              </span>
              <select
                value={followupModo}
                onChange={(event) => setFollowupModo(event.target.value as FollowupModo)}
                className="input"
              >
                <option value="ia">IA escreve na hora</option>
                <option value="manual">Mensagem manual</option>
              </select>
            </label>
            <div className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
              <div className="font-bold text-foreground">
                {followupLeads.length} destinatario(s)
              </div>
              Usa a mesma fila `crm_followups`: automatico envia pelo worker, confirmar deixa pronto
              para 1 clique.
            </div>
          </div>

          {followupModo === "manual" && (
            <textarea
              value={followupMensagem}
              onChange={(event) => setFollowupMensagem(event.target.value)}
              rows={4}
              className="input"
              placeholder="Use {nome}, {pet} ou {pets}"
            />
          )}

          <button
            type="button"
            onClick={() => void agendarFollowups()}
            disabled={salvandoFollowup || followupLeads.length === 0}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {salvandoFollowup ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarClock className="size-4" />
            )}
            Agendar follow-ups
          </button>
        </div>

        <div className="card-soft overflow-hidden">
          <div className="border-b border-border p-4">
            <SectionTitle icon={<Clock className="size-4" />} title="Fila de follow-ups" />
          </div>
          <div className="max-h-[520px] overflow-y-auto p-3 scrollbar-thin">
            <div className="space-y-2">
              {followups.map((followup) => (
                <FollowupRow
                  key={followup.id}
                  followup={followup}
                  busy={acaoFollowupId === followup.id}
                  onSend={() => void acaoFollowup(followup.id, "enviar")}
                  onCancel={() => void acaoFollowup(followup.id, "cancelar")}
                />
              ))}
              {!loading && followups.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum follow-up pendente no momento.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  );
}

function KanbanFiltro({
  colunas,
  contagem,
  selecionadas,
  onToggle,
  somenteSemCompra,
  onSomenteSemCompra,
  total,
}: {
  colunas: KanbanColumn[];
  contagem: Map<string, number>;
  selecionadas: Set<string>;
  onToggle: (id: string) => void;
  somenteSemCompra: boolean;
  onSomenteSemCompra: (value: boolean) => void;
  total: number;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-xs font-bold">
        <Columns3 className="size-4 text-primary" />
        Colunas do kanban
      </div>
      {colunas.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nenhuma coluna carregada.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {colunas.map((coluna) => {
            const ativa = selecionadas.has(coluna.id);
            return (
              <button
                key={coluna.id}
                type="button"
                onClick={() => onToggle(coluna.id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition ${
                  ativa
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {ativa && <Check className="size-3.5" />}
                {coluna.nome}
                <span className="rounded bg-background/60 px-1 text-[10px]">
                  {contagem.get(coluna.id) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={somenteSemCompra}
          onChange={(event) => onSomenteSemCompra(event.target.checked)}
          className="size-4 accent-primary"
        />
        Somente quem nunca comprou
      </label>
      <div className="text-[11px] text-muted-foreground">
        {total} contato(s) vao receber. Envia para todos, respeitando o intervalo escolhido.
      </div>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-sm font-bold">
      <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
        {icon}
      </span>
      {title}
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
  disabled,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition disabled:opacity-50 ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function LeadPreview({ cliente, mensagem }: { cliente: Cliente; mensagem: string }) {
  return (
    <div className="rounded-lg bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{cliente.nome}</div>
          <div className="text-[11px] text-muted-foreground">
            {cliente.perfil} - score {scoreLead(cliente)}
          </div>
        </div>
        <Sparkles className="size-4 shrink-0 text-primary" />
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {aplicarVariaveis(mensagem, cliente)}
      </p>
    </div>
  );
}

function LeadRow({
  cliente,
  checked,
  onToggle,
}: {
  cliente: Cliente;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-xl border p-3 text-left transition ${
        checked ? "border-primary/40 bg-primary/10" : "border-transparent hover:bg-secondary/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${
            checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
          }`}
        >
          {checked && <Check className="size-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-bold">{cliente.nome}</div>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {scoreLead(cliente)}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {onlyDigits(cliente.telefone)} - {cliente.perfil} - {firstPet(cliente)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <span className="rounded bg-secondary px-1.5 py-0.5">{cliente.origem || "CRM"}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5">{brl(cliente.totalGasto)}</span>
            {cliente.proxRecompra && (
              <span className="rounded bg-secondary px-1.5 py-0.5">
                Recompra {cliente.proxRecompra}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function KanbanLeadRow({
  cliente,
  coluna,
}: {
  cliente: Cliente;
  coluna?: string;
}) {
  const semCompra = nuncaComprou(cliente);

  return (
    <div className="w-full rounded-xl border border-transparent p-3 text-left hover:bg-secondary/60">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {(cliente.nome.trim() || cliente.telefone).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">
                {cliente.nome.trim() || "Contato sem nome"}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {onlyDigits(cliente.telefone)}
                {cliente.pets?.length ? ` - ${cliente.pets.join(", ")}` : ""}
              </div>
            </div>
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
              {coluna || "Kanban"}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <span
              className={`rounded px-1.5 py-0.5 font-semibold ${
                semCompra ? "bg-accent/15 text-accent" : "bg-success/15 text-success"
              }`}
            >
              {semCompra ? "Nunca comprou" : `${cliente.pedidos} compra(s)`}
            </span>
            {!semCompra && (
              <span className="rounded bg-secondary px-1.5 py-0.5">
                {brl(cliente.totalGasto)} no CRM
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FollowupRow({
  followup,
  busy,
  onSend,
  onCancel,
}: {
  followup: Followup;
  busy: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const meta = statusMeta[followup.status];
  const canAct = followup.status === "pendente" || followup.status === "aguardando_confirmacao";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">
            {followup.clienteNome || followup.telefone}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {formatDateTime(followup.agendadoPara)} - {followup.modo === "ia" ? "IA" : "Manual"} -{" "}
            {followup.disparo === "automatico" ? "auto" : "confirmar"}
          </div>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${meta.className}`}
        >
          {meta.icon} {meta.label}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
        {followup.mensagem || "Mensagem sera gerada pela IA no momento do envio."}
      </p>
      {followup.status === "erro" && followup.erro && (
        <div className="mt-2 text-xs text-destructive">{followup.erro}</div>
      )}
      {canAct && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSend}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-success px-3 text-xs font-bold text-success-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Enviar
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-bold hover:bg-secondary/70 disabled:opacity-50"
          >
            <X className="size-3.5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
