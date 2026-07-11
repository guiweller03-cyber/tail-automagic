import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
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
import type { Cliente } from "@/lib/crm-types";

type DisparoModo = "automatico" | "semi";
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
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDisparo | null>(null);

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
        const [clientesRes, followupsRes] = await Promise.all([
          fetch(CLIENTES_ENDPOINT, { cache: "no-store" }),
          fetch(`${FOLLOWUPS_ENDPOINT}?status=pendente,aguardando_confirmacao,erro`, {
            cache: "no-store",
          }),
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

  const previewLeads = modo === "automatico" ? autoLeads.slice(0, limiteAuto) : selecionadosLista;
  const followupLeads =
    followupAudience === "automatico" ? autoLeads.slice(0, limiteAuto) : selecionadosLista;

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

    setEnviando(true);
    setResultado(null);
    try {
      const response = await fetch(DISPAROS_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modo,
          mensagem: texto,
          midiaUrl: midiaArquivo ? undefined : midia || undefined,
          midiaBase64: midiaArquivo?.base64,
          midiaTipo: midia || midiaArquivo ? midiaTipo : undefined,
          midiaNome: midiaNome.trim() || midiaArquivo?.nome || undefined,
          midiaMimeType: midiaArquivo?.tipo,
          limite: limiteAuto,
          clienteIds: modo === "semi" ? selecionadosLista.map((cliente) => cliente.id) : undefined,
        }),
      });
      const data = (await response.json()) as ResultadoDisparo & { erro?: string };
      if (!response.ok) throw new Error(data.erro || "Falha ao disparar mensagens");
      setResultado(data);
      toast.success(`${data.enviados} mensagem(ns) enviada(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao disparar mensagens");
    } finally {
      setEnviando(false);
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

      for (const cliente of followupLeads.slice(0, 50)) {
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
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
              <SegmentButton active={modo === "automatico"} onClick={() => setModo("automatico")}>
                <Zap className="size-3.5" /> Automatico
              </SegmentButton>
              <SegmentButton active={modo === "semi"} onClick={() => setModo("semi")}>
                <ListChecks className="size-3.5" /> Semi
              </SegmentButton>
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
                {modo === "automatico" ? "Disparar auto" : "Disparar selecionados"}
              </button>
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
            <SectionTitle icon={<Users className="size-4" />} title="Selecao semi-automatica" />
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar lead, telefone, perfil ou pet"
                  className="input h-10 pl-9"
                />
              </div>
              <button
                type="button"
                onClick={selectVisible}
                className="h-10 rounded-lg bg-secondary px-3 text-xs font-bold hover:bg-secondary/70"
              >
                Selecionar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            {loading ? (
              <div className="grid h-48 place-items-center text-sm text-muted-foreground">
                Carregando leads...
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
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1">
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
            </div>
          </div>

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
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
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
