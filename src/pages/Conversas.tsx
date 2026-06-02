import type { Cliente, Conversa, ConversaFiltro, KanbanStage } from "@/lib/crm-types";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Send, Sparkles, Phone, MoreVertical, Search, Bot, User,
  LayoutGrid, MessageSquare, MapPin, Wallet, Paperclip,
  Image as ImageIcon, CheckCheck, TrendingUp, Target,
  DollarSign, Tag, Users, PawPrint, Zap, Settings2, Plus, Trash2, Save, RotateCcw, Pencil,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SpeciePill } from "@/pages/RecompraPrevista";
import { AIAssistantToggle } from "@/features/whatsapp-crm/components/AIAssistantToggle";
import { toast } from "sonner";

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

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const onlyDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeName = (value: unknown) => String(value ?? "").trim().toLowerCase();
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
const kanbanStages: KanbanStage[] = ["Hoje", "Recompra", "Follow-up", "Aguardando pagamento", "Upsell", "Risco"];

type ConversaView = Conversa & {
  telefone: string;
  historico: any[];
  aguardandoHumano: boolean;
  iaAtiva: boolean | null;
  atualizado_em?: string;
};

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
  const historico = Array.isArray(row.historico) ? row.historico : [];
  const ultimaMsg = historico.at(-1) as { content?: unknown } | undefined;
  const atualizadoEm = typeof row.atualizado_em === "string" ? row.atualizado_em : "";

  return {
    id: String(row.id ?? ""),
    cliente: String(row.nome_cliente ?? row.telefone ?? "Cliente"),
    telefone: String(row.telefone ?? ""),
    ultima: String(ultimaMsg?.content ?? ""),
    hora: atualizadoEm
      ? new Date(atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
    naoLidas: row.aguardando_humano ? 1 : 0,
    tag: row.aguardando_humano ? "Aguardando" : "IA",
    estagio: mapStageFromApi(row.estagio),
    valorPotencial: Number(row.valor_potencial ?? 0),
    filtros: [],
    historico,
    aguardandoHumano: Boolean(row.aguardando_humano),
    iaAtiva: typeof row.ia_ativa === "boolean" ? row.ia_ativa : null,
    atualizado_em: atualizadoEm,
  };
}

function horaMensagem(mensagem: any): string | undefined {
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

function applyConversationAIState<T extends Record<string, any>>(conversation: T, aguardandoHumano: boolean): T {
  return {
    ...conversation,
    aguardandoHumano,
    iaAtiva: !aguardandoHumano,
    tag: aguardandoHumano ? "Humano" : "IA",
    naoLidas: aguardandoHumano ? Math.max(Number(conversation.naoLidas ?? 0), 1) : 0,
  };
}

function isConversationAIEnabled(conversation: any, globalAiDisabled: boolean): boolean {
  if (typeof conversation?.iaAtiva === "boolean") return conversation.iaAtiva;
  return !globalAiDisabled && !conversation?.aguardandoHumano;
}

function clienteFromConversa(active: any): Cliente {
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

function findClienteForConversation(active: any, clientes: Cliente[]) {
  const activePhone = onlyDigits(active?.telefone);
  const activeName = normalizeName(active?.cliente);

  return (
    (activePhone ? clientes.find((cliente) => onlyDigits(cliente.telefone) === activePhone) : undefined) ??
    (activeName ? clientes.find((cliente) => normalizeName(cliente.nome) === activeName) : undefined) ??
    clienteFromConversa(active)
  );
}

export function Conversas({
  conversasIniciais,
  clientesIniciais,
  iaStatus,
}: {
  conversasIniciais: Conversa[];
  clientesIniciais: Cliente[];
  iaStatus?: any;
}) {
  const [view, setView] = useState<"chat" | "kanban" | "regras">("chat");
  const [active, setActive] = useState<any>(conversasIniciais[0] ?? null);
  const [items, setItems] = useState<any[]>(conversasIniciais);
  const [clientesAtuais, setClientesAtuais] = useState<Cliente[]>(clientesIniciais);
  const [filtro, setFiltro] = useState<(typeof filtrosConversa)[number]>("Todos");
  const [busca, setBusca] = useState("");
  const [globalAiDisabled, setGlobalAiDisabled] = useState(Boolean(iaStatus?.globalDesativada));
  const [globalAiSaving, setGlobalAiSaving] = useState(false);
  const [conversationAiSaving, setConversationAiSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingWhatsapp, setSyncingWhatsapp] = useState(false);
  const refreshingRef = useRef(false);

  const applyRemoteConversations = useCallback((next: ConversaView[]) => {
    setItems(next);
    setActive((current: any) => {
      if (!current) return next[0] ?? null;

      const byId = next.find((item) => item.id === current.id);
      if (byId) return byId;

      const currentPhone = onlyDigits(current.telefone);
      const byPhone = currentPhone
        ? next.find((item) => onlyDigits(item.telefone) === currentPhone)
        : undefined;

      return byPhone ?? next[0] ?? current;
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/crm/conversas", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao atualizar conversas");
      if (Array.isArray(data)) {
        applyRemoteConversations(data.map((row) => mapApiConversa(row as Record<string, unknown>)));
      }
    } catch (error) {
      console.error(error);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [applyRemoteConversations]);

  useEffect(() => {
    void refreshConversations();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshConversations();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshConversations();
    };

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshConversations]);

  const filtered = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoNumerico = onlyDigits(busca);

    return items.filter((c) => {
      if (filtro !== "Todos" && !c.filtros.includes(filtro as ConversaFiltro)) return false;
      if (
        termo &&
        !c.cliente.toLowerCase().includes(termo) &&
        !String(c.ultima ?? "").toLowerCase().includes(termo) &&
        !(termoNumerico && onlyDigits(c.telefone).includes(termoNumerico))
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
          chatsLimite: 50,
          mensagensLimite: 80,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao sincronizar WhatsApp");

      await refreshConversations();
      toast.success(
        `WhatsApp sincronizado: ${data.conversas_sincronizadas ?? 0} conversas, ${data.mensagens_importadas ?? 0} mensagens novas`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel sincronizar");
    } finally {
      setSyncingWhatsapp(false);
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
        const errorBody = await response.text();
        throw new Error(errorBody || `Falha ao atualizar IA global (${response.status})`);
      }

      const saved = (await response.json()) as { globalDesativada?: boolean };
      setGlobalAiDisabled(saved.globalDesativada ?? nextDisabled);
    } catch (error) {
      console.error(error);
      setGlobalAiDisabled(previous);
    } finally {
      setGlobalAiSaving(false);
    }
  }

  async function toggleConversationAI(conversation: any) {
    if (!conversation || conversationAiSaving) return;

    const previous = conversation;
    const nextAiEnabled = !isConversationAIEnabled(conversation, globalAiDisabled);
    const nextAguardandoHumano = !nextAiEnabled;
    const optimistic = applyConversationAIState(conversation, nextAguardandoHumano);

    setConversationAiSaving(true);
    setActive(optimistic);
    setItems((current) =>
      current.map((item) => (item.id === conversation.id ? applyConversationAIState(item, nextAguardandoHumano) : item)),
    );

    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "conversa",
          id: conversation.id,
          aguardandoHumano: nextAguardandoHumano,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `Falha ao atualizar conversa (${response.status})`);
      }

      const saved = (await response.json()) as { aguardando_humano?: boolean };
      const savedState = saved.aguardando_humano ?? nextAguardandoHumano;
      const savedActive = applyConversationAIState(conversation, savedState);

      setActive(savedActive);
      setItems((current) =>
        current.map((item) => (item.id === conversation.id ? applyConversationAIState(item, savedState) : item)),
      );
    } catch (error) {
      console.error(error);
      setActive(previous);
      setItems((current) => current.map((item) => (item.id === previous.id ? previous : item)));
    } finally {
      setConversationAiSaving(false);
    }
  }

  return (
    <div className="space-y-3 h-[calc(100vh-7rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp IA</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {filtered.length} conversas · {items.filter((c) => c.naoLidas > 0).length} não lidas ·{" "}
            <span className="text-success font-semibold">
              {brl(items.reduce((s, c) => s + c.valorPotencial, 0))}
            </span>{" "}
            em pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void syncWhatsappHistory()}
            disabled={syncingWhatsapp || refreshing}
            className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50"
            title="Sincronizar historico do WhatsApp"
            aria-label="Sincronizar historico do WhatsApp"
          >
            <RotateCcw className={`size-4 ${syncingWhatsapp || refreshing ? "animate-spin" : ""}`} />
          </button>
          <AIAssistantToggle
            enabled={!globalAiDisabled}
            onToggle={toggleGlobalAI}
            saving={globalAiSaving}
            label="IA global"
            onText="Ligada para todos"
            offText="Desligada para todos"
          />
          <div className="inline-flex p-1 rounded-xl bg-secondary">
            <button
              onClick={() => setView("chat")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                view === "chat" ? "bg-card shadow-sm" : ""
              }`}
            >
              <MessageSquare className="size-3.5" /> Chat
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                view === "kanban" ? "bg-card shadow-sm" : ""
              }`}
            >
              <LayoutGrid className="size-3.5" /> Kanban IA
            </button>
            <button
              onClick={() => setView("regras")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                view === "regras" ? "bg-card shadow-sm" : ""
              }`}
            >
              <Settings2 className="size-3.5" /> Regras da IA
            </button>
          </div>
        </div>
      </div>

      {/* Filtros rápidos */}
      {view === "chat" && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-thin">
          {filtrosConversa.map((f) => {
            const count =
              f === "Todos" ? items.length : items.filter((c) => c.filtros.includes(f as ConversaFiltro)).length;
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
          />
        ) : (
          <div className="card-soft grid flex-1 place-items-center text-sm text-muted-foreground">Nenhuma conversa real encontrada.</div>
        )
      ) : view === "kanban" ? (
        <KanbanView items={items} setItems={setItems} />
      ) : (
        <IaRulesView />
      )}
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
}: {
  active: any;
  setActive: (c: any) => void;
  setItems: React.Dispatch<React.SetStateAction<any[]>>;
  items: any[];
  busca: string;
  setBusca: (s: string) => void;
  clientes: Cliente[];
  setClientes: React.Dispatch<React.SetStateAction<Cliente[]>>;
  globalAiDisabled: boolean;
  conversationAiSaving: boolean;
  onToggleConversationAI: (conversation: any) => void;
}) {
  const cli = findClienteForConversation(active, clientes);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mensagens = Array.isArray(active.historico) ? active.historico : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [active.id, mensagens.length]);

  function updateConversation(conversa: any) {
    const ultimaMsg = Array.isArray(conversa.historico) ? conversa.historico.at(-1) : null;
    const updated = {
      ...active,
      ...conversa,
      ultima: String(ultimaMsg?.content ?? active.ultima ?? ""),
      hora: conversa.atualizado_em
        ? new Date(String(conversa.atualizado_em)).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : active.hora,
      historico: Array.isArray(conversa.historico) ? conversa.historico : active.historico,
    };

    setActive(updated);
    setItems((current) => current.map((item) => (item.id === active.id ? { ...item, ...updated } : item)));
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
    if (!response.ok) throw new Error(data.erro || data.mensagem || responseText || "Falha ao enviar mensagem");
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

  async function moveConversationToStage(stage: KanbanStage) {
    try {
      const response = await fetch("/api/crm/conversas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "pipeline", id: active.id, stage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.erro || "Falha ao mover conversa");

      const updated = { ...active, estagio: stage, aguardandoHumano: Boolean(data.aguardando_humano) };
      setActive(updated);
      setItems((current) => current.map((item) => (item.id === active.id ? { ...item, ...updated } : item)));
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
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)_300px] gap-3 min-h-0">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar conversa"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-secondary outline-none text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item)}
              className={`w-full text-left rounded-xl p-2.5 transition ${
                item.id === active.id ? "bg-primary/10" : "hover:bg-secondary"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-xs truncate">{item.cliente}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{item.hora}</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-1">{item.ultima || "Sem mensagens"}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card-soft flex flex-col overflow-hidden min-w-0">
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold truncate">{active.cliente}</div>
            <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Phone className="size-3" /> {active.telefone}
            </div>
          </div>
          <div className="inline-flex items-center gap-2">
            <AIAssistantToggle
              enabled={isConversationAIEnabled(active, globalAiDisabled)}
              onToggle={() => onToggleConversationAI(active)}
              saving={conversationAiSaving}
              label="IA da conversa"
              onText={globalAiDisabled ? "Ligada so aqui" : "Ligada aqui"}
              offText={globalAiDisabled ? "Desligada aqui" : "Manual aqui"}
            />
            <StatusBadge value={active.tag} />
            <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground">
              <MoreVertical className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-secondary/20">
          <DateChip>Hoje</DateChip>
          {mensagens.length > 0 ? (
            mensagens.map((mensagem: any, index: number) => (
              <Bubble
                key={`${mensagem.role}-${index}`}
                side={mensagem.role === "assistant" || mensagem.role === "ai" ? "me" : "them"}
                ai={mensagem.role === "assistant" || mensagem.role === "ai"}
                hora={horaMensagem(mensagem)}
              >
                {mensagem.content}
              </Bubble>
            ))
          ) : (
            <div className="h-full grid place-items-center text-sm text-muted-foreground">
              Nenhuma mensagem nesta conversa.
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-border bg-card space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
            <QuickReply label="Confirmar pedido" onClick={() => void sendMessage("Pedido confirmado. Vou seguir com a separacao e ja te aviso o proximo passo.")} />
            <QuickReply
              label="Enviar Pix"
              onClick={async () => {
                const handler = async () => {
                  const res = await fetch("/api/crm/pix", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      telefone: active.telefone,
                      enviarMensagem: true,
                    }),
                  });

                  const data = await res.json();
                  if (!res.ok) throw new Error(data.mensagem || data.erro || "Falha ao gerar Pix");
                  return data;
                };

                toast.promise(handler(), {
                  loading: "Gerando Pix...",
                  success: "Pix enviado!",
                  error: (err) => (err instanceof Error ? err.message : "Erro ao gerar Pix"),
                });
              }}
            />
            <QuickReply label="Status entrega" onClick={() => void sendMessage("Vou verificar o status da entrega e ja te retorno por aqui.")} />
            <QuickReply label="Sugerir upsell" icon={<Sparkles className="size-3" />} onClick={sendAiSuggestion} />
          </div>
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void sendFile(file);
            }} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void sendFile(file);
            }} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground disabled:opacity-50"><Paperclip className="size-5" /></button>
            <button type="button" onClick={() => imageInputRef.current?.click()} disabled={sending} className="p-2 rounded-xl hover:bg-secondary text-muted-foreground disabled:opacity-50"><ImageIcon className="size-5" /></button>
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
              className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:ring-2 ring-primary/30 max-h-32"
            />
            <button type="button" onClick={sendAiSuggestion} disabled={sending} className="p-2.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition disabled:opacity-50" title="Resposta IA">
              <Sparkles className="size-5" />
            </button>
            <button type="button" onClick={() => void sendMessage()} disabled={sending || !messageText.trim()} className="p-3 rounded-xl bg-success text-success-foreground shadow hover:bg-success/90 disabled:opacity-50" title="Enviar mensagem">
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
            const index = current.findIndex((item) => item.id === cliente.id || onlyDigits(item.telefone) === onlyDigits(cliente.telefone));
            if (index < 0) return [cliente, ...current];
            return current.map((item, itemIndex) => (itemIndex === index ? cliente : item));
          });
          setActive((current: any) => ({
            ...current,
            cliente: cliente.nome || current.cliente,
            telefone: cliente.telefone || current.telefone,
          }));
          setItems((current) =>
            current.map((item) =>
              item.id === active.id
                ? { ...item, cliente: cliente.nome || item.cliente, telefone: cliente.telefone || item.telefone }
                : item,
            ),
          );
        }}
        onSendMessage={(text) => void sendMessage(text)}
        onMoveKanban={() => void moveConversationToStage("Follow-up")}
        onOpenHistory={() => {
          const resumo = mensagens
            .slice(-6)
            .map((mensagem: any) => `${mensagem.role === "user" ? "Cliente" : "CRM"}: ${mensagem.content}`)
            .join("\n");
          setMessageText(resumo ? `Historico recente:\n${resumo}` : "Ainda nao ha historico nesta conversa.");
          toast.info("Historico carregado no campo de mensagem");
        }}
      />
    </div>
  );
}

function IaRulesView() {
  const emptyLearning: IaAprendizado = {
    total: 0,
    recentes7d: 0,
    pontuacao: 0,
    nivel: "Inicial",
    aprendizados: [],
    criterios: [],
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [basePrompt, setBasePrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [regras, setRegras] = useState<IaRegra[]>([]);
  const [aprendizado, setAprendizado] = useState<IaAprendizado>(emptyLearning);

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
        setAprendizado(payload.aprendizado ?? emptyLearning);
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
    return <div className="card-soft grid flex-1 place-items-center text-sm text-muted-foreground">Carregando regras da IA...</div>;
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
            <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">System prompt editavel</span>
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
                <p className="text-xs text-muted-foreground">Entram no system prompt junto com o texto acima.</p>
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
                  <div key={regra.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={regra.ativa}
                        onChange={(event) =>
                          setRegras((current) =>
                            current.map((item) => item.id === regra.id ? { ...item, ativa: event.target.checked } : item),
                          )
                        }
                        className="size-4 accent-primary"
                      />
                      <input
                        value={regra.titulo}
                        onChange={(event) =>
                          setRegras((current) =>
                            current.map((item) => item.id === regra.id ? { ...item, titulo: event.target.value } : item),
                          )
                        }
                        className="h-9 flex-1 rounded-lg bg-secondary px-3 text-sm font-semibold outline-none focus:ring-2 ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setRegras((current) => current.filter((item) => item.id !== regra.id))}
                        className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <textarea
                      value={regra.instrucao}
                      onChange={(event) =>
                        setRegras((current) =>
                          current.map((item) => item.id === regra.id ? { ...item, instrucao: event.target.value } : item),
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
            <div className="rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">{aprendizado.nivel}</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${Math.min(aprendizado.pontuacao, 100)}%` }} />
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
                      <td className="px-3 py-2 text-right font-bold text-primary">+{criterio.pontos}</td>
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
  onSendMessage,
  onMoveKanban,
  onOpenHistory,
}: {
  cli: Cliente;
  mensagens: any[];
  active: any;
  onClienteSaved: (cliente: Cliente) => void;
  onSendMessage: (text: string) => void;
  onMoveKanban: () => void;
  onOpenHistory: () => void;
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
    textoCliente.includes("cartao") || textoCliente.includes("cartão") ? "Cliente citou cartao na conversa." : null,
    textoCliente.includes("dinheiro") ? "Cliente citou dinheiro na conversa." : null,
    ...mensagens
      .filter((mensagem) => mensagem.role === "user")
      .map((mensagem) => String(mensagem.content ?? ""))
      .filter((texto) => /ra[cç][aã]o|golden|formula|f[oó]rmula|simparic|pet|gato|cachorro/i.test(texto))
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
    });
  }, [cli.id, cli.nome, cli.telefone]);

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
      const data = (await response.json()) as { cliente?: Cliente; erro?: string };
      if (!response.ok || !data.cliente) throw new Error(data.erro || "Nao foi possivel atualizar o contexto");

      onClienteSaved(data.cliente);
      toast.success("Contexto do cliente atualizado pela IA");
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
            data: cli.followUpManual?.data ?? "",
            canal: cli.followUpManual?.canal ?? "WhatsApp",
            status: cli.followUpManual?.status ?? "pendente",
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
    <div className="card-soft hidden md:flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-accent grid place-items-center font-bold text-primary-foreground">
            {cli.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{cli.nome}</div>
            <div className="text-[11px] text-muted-foreground">{cli.telefone}</div>
          </div>
        </div>
        {/* Etiquetas visuais: cidade + espécie */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-border bg-card text-foreground">
            <MapPin className="size-3" /> {[cli.cidade, cli.bairro].filter(Boolean).join(" - ") || "Endereco nao identificado"}
          </span>
          {especiesContexto.map((e) => (
            <SpeciePill key={e} especie={e} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => void atualizarComIa()}
            disabled={loadingIa || mensagens.length === 0}
            className="h-8 rounded-lg bg-primary/15 text-primary text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Sparkles className={`size-3 ${loadingIa ? "animate-spin" : ""}`} />
            {loadingIa ? "Lendo..." : "Atualizar IA"}
          </button>
          <button
            type="button"
            onClick={() => setEditing((current) => !current)}
            className="h-8 rounded-lg bg-secondary text-[11px] font-bold inline-flex items-center justify-center gap-1"
          >
            <Pencil className="size-3" />
            {editing ? "Ver contexto" : "Editar manual"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {editing && (
          <Section icon={<Pencil className="size-3" />} title="Editar informacoes">
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <input
                value={manual.nome}
                onChange={(event) => setManual((state) => ({ ...state, nome: event.target.value }))}
                placeholder="Nome"
                className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
              />
              <input
                value={manual.telefone}
                onChange={(event) => setManual((state) => ({ ...state, telefone: event.target.value }))}
                placeholder="Telefone"
                className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
              />
              <input
                value={manual.pets}
                onChange={(event) => setManual((state) => ({ ...state, pets: event.target.value }))}
                placeholder="Pets separados por virgula"
                className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={manual.endereco}
                  onChange={(event) => setManual((state) => ({ ...state, endereco: event.target.value }))}
                  placeholder="Endereco"
                  className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                />
                <input
                  value={manual.bairro}
                  onChange={(event) => setManual((state) => ({ ...state, bairro: event.target.value }))}
                  placeholder="Bairro"
                  className="h-9 w-full rounded-lg bg-secondary px-3 text-xs outline-none"
                />
              </div>
              <textarea
                value={manual.observacoes}
                onChange={(event) => setManual((state) => ({ ...state, observacoes: event.target.value }))}
                placeholder="Observacoes do cliente"
                rows={3}
                className="w-full resize-y rounded-lg bg-secondary px-3 py-2 text-xs outline-none"
              />
              <textarea
                value={manual.followUpMensagem}
                onChange={(event) => setManual((state) => ({ ...state, followUpMensagem: event.target.value }))}
                placeholder="Follow-up manual"
                rows={2}
                className="w-full resize-y rounded-lg bg-secondary px-3 py-2 text-xs outline-none"
              />
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

        {/* Pets */}
        <Section icon={<PawPrint className="size-3" />} title={`Pets (${cli.pets.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {cli.pets.map((p) => (
              <span key={p} className="px-2.5 py-1 rounded-lg bg-secondary text-xs font-semibold">
                🐾 {p}
              </span>
            ))}
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
                    <div className="text-[9px] uppercase font-bold text-primary tracking-wide">CAC individual</div>
                    <div className="text-base font-bold text-primary">{brl(cli.cac)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] uppercase text-muted-foreground tracking-wide">ROI</div>
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
            <Behavior label="Cliente VIP" value={cli.perfil === "VIP" || cli.perfil === "Premium"} />
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
              Nenhum contexto confiavel identificado ainda. Use "Atualizar com IA" ou edite manualmente.
            </div>
          )}
        </Section>

        {/* Ações Rápidas */}
        <Section icon={<Zap className="size-3" />} title="Ações rápidas">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn
              icon="📋"
              label="Abrir pedido"
              onClick={() => onSendMessage("Vou abrir seu pedido por aqui e ja confirmo os itens, valores e entrega.")}
            />
            <ActionBtn
              icon="💸"
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
              icon="🏷️"
              label="Aplicar desconto"
              onClick={() => onSendMessage("Consegui aplicar uma condicao especial para voce. Quer que eu te envie os valores atualizados?")}
            />
            <ActionBtn
              icon="🔔"
              label="Follow-up"
              onClick={() => onSendMessage("Oi, tudo bem? Passando para saber se posso te ajudar com seu pedido ou alguma duvida.")}
            />
            <ActionBtn icon="📊" label="Mover kanban" onClick={onMoveKanban} />
            <ActionBtn icon="📜" label="Histórico" onClick={onOpenHistory} />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cli.endereco + " " + cli.bairro)}`}
              target="_blank" rel="noreferrer"
              className="col-span-2 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-secondary hover:bg-secondary/70 text-xs font-semibold transition"
            >
              📍 Abrir endereço no Maps
            </a>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
      <div className={`font-bold text-xs mt-0.5 truncate ${accent === "success" ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}

function Behavior({ label, value, invert }: { label: string; value: boolean; invert?: boolean }) {
  return (
    <div className={`rounded-lg p-2 border ${value ? (invert ? "bg-destructive/10 border-destructive/20" : "bg-success/10 border-success/20") : "bg-secondary/40 border-transparent"}`}>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide leading-tight">{label}</div>
      <div className={`font-bold text-xs mt-0.5 ${value ? (invert ? "text-destructive" : "text-success") : "text-muted-foreground"}`}>
        {value ? "Sim" : "Não"}
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, primary, onClick }: { icon: string; label: string; primary?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-9 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition ${
      primary ? "bg-success text-success-foreground hover:opacity-90" : "bg-secondary hover:bg-secondary/70"
    }`}>
      <span>{icon}</span> {label}
    </button>
  );
}

function QuickReply({ label, icon, onClick }: { label: string; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 transition">
      {icon} {label}
    </button>
  );
}

function DateChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center">
      <span className="text-[10px] uppercase font-bold tracking-wide px-2.5 py-1 rounded-full bg-card border border-border text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function Bubble({ side, children, ai, hora }: { side: "me" | "them"; children: React.ReactNode; ai?: boolean; hora?: string }) {
  const me = side === "me";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
          me ? "bg-success text-success-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"
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
        <div className="leading-snug">{children}</div>
        {hora && (
          <div className={`text-[9px] mt-1 flex items-center justify-end gap-0.5 ${me ? "opacity-80" : "text-muted-foreground"}`}>
            {hora} {me && <CheckCheck className="size-3" />}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanView({ items, setItems }: { items: Conversa[]; setItems: (i: Conversa[]) => void }) {
  const [drag, setDrag] = useState<string | null>(null);

  function move(stage: KanbanStage) {
    if (!drag) return;
    setItems(items.map((c) => (c.id === drag ? { ...c, estagio: stage } : c)));
    setDrag(null);
  }

  return (
    <div className="flex-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 overflow-auto pb-2 min-h-0">
      {kanbanStages.map((stage) => {
        const list = items.filter((c) => c.estagio === stage);
        const total = list.reduce((s, c) => s + c.valorPotencial, 0);
        return (
          <div
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => move(stage)}
            className="bg-secondary/50 rounded-2xl p-3 min-h-[280px] flex flex-col"
          >
            <div className="flex items-center justify-between px-1 pb-2.5">
              <div>
                <div className="font-semibold text-sm">{stage}</div>
                <div className="text-[10px] text-success font-bold">{brl(total)}</div>
              </div>
              <span className="text-xs font-bold size-5 grid place-items-center rounded-md bg-card text-muted-foreground">
                {list.length}
              </span>
            </div>
            <div className="space-y-2 flex-1">
              {list.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDrag(c.id)}
                  className="card-soft p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold text-[10px]">
                      {c.cliente.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <div className="font-semibold text-xs truncate">{c.cliente}</div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{c.ultima}</p>
                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-success">{brl(c.valorPotencial)}</span>
                    <span className="text-[10px] text-muted-foreground">{c.hora}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
