import { useEffect, useMemo, useState } from "react";
import { Sparkles, Send, Bot, User, AlertTriangle, TrendingUp, Zap, CheckCircle2, XCircle, ArrowRight, Trash2, Plus, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { gerarInsights } from "@/features/ia-consultor/insights";
import { useAlertas, ALERTA_META } from "@/features/alertas/store";

type Msg = { role: "user" | "ai"; content: string };
const HISTORY_KEY = "crm_assistente_ia_historico_v1";
const CONVERSATIONS_KEY = "crm_assistente_ia_conversas_v1";
type Conversation = {
  id: string;
  title: string;
  messages: Msg[];
  updatedAt: string;
};
const INITIAL_MESSAGE: Msg = {
  role: "ai",
  content:
    "Ola! Estou conectado a OpenAI e ao CRM. Posso consultar dados reais e executar acoes como atualizar pedidos, clientes e IA do atendimento.",
};
const INITIAL_CONVERSATION: Conversation = {
  id: "chat-inicial",
  title: "Nova conversa",
  messages: [INITIAL_MESSAGE],
  updatedAt: "",
};

function createConversation(messages: Msg[] = [INITIAL_MESSAGE], title = "Nova conversa"): Conversation {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    messages,
    updatedAt: new Date().toISOString(),
  };
}

function validMessages(value: unknown): Msg[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (message): message is Msg =>
      Boolean(message) &&
      (message.role === "user" || message.role === "ai") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );
}

function titleFromMessages(messages: Msg[]): string {
  const firstUserMessage = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUserMessage) return "Nova conversa";

  return firstUserMessage.length > 42 ? `${firstUserMessage.slice(0, 42)}...` : firstUserMessage;
}

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [INITIAL_CONVERSATION];

  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Conversation[];
      const conversations = Array.isArray(parsed)
        ? parsed
            .map((conversation) => ({
              id: typeof conversation.id === "string" ? conversation.id : `chat-${Date.now()}`,
              title:
                typeof conversation.title === "string" && conversation.title.trim()
                  ? conversation.title.trim()
                  : titleFromMessages(validMessages(conversation.messages)),
              messages: validMessages(conversation.messages),
              updatedAt:
                typeof conversation.updatedAt === "string"
                  ? conversation.updatedAt
                  : new Date().toISOString(),
            }))
            .filter((conversation) => conversation.messages.length > 0)
        : [];

      if (conversations.length > 0) return conversations;
    }

    const oldRaw = window.localStorage.getItem(HISTORY_KEY);
    const oldMessages = oldRaw ? validMessages(JSON.parse(oldRaw)) : [];
    if (oldMessages.length > 0) {
      return [createConversation(oldMessages, titleFromMessages(oldMessages))];
    }
  } catch {
    // fallback abaixo
  }

  return [createConversation()];
}

const SUGESTOES = [
  "Quem está em risco de churn?",
  "Sugira campanha Golden",
  "Cupons abaixo da média",
  "Pets com vermífugo vencendo",
  "Sugestões de upsell",
  "Clientes inativos +60 dias",
];

export function AssistenteIA() {
  const [conversations, setConversations] = useState<Conversation[]>([INITIAL_CONVERSATION]);
  const [activeConversationId, setActiveConversationId] = useState(INITIAL_CONVERSATION.id);
  const [hydrated, setHydrated] = useState(false);
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    createConversation();
  const messages = activeConversation.messages;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const insights = useMemo(() => gerarInsights(), []);
  const { ativos: alertasAtivos, resolver, descartar } = useAlertas();

  useEffect(() => {
    const loaded = loadConversations();
    setConversations(loaded);
    setActiveConversationId(loaded[0]?.id ?? INITIAL_CONVERSATION.id);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(
        CONVERSATIONS_KEY,
        JSON.stringify(
          conversations
            .map((conversation) => ({
              ...conversation,
              messages: conversation.messages.slice(-80),
            }))
            .slice(0, 30),
        ),
      );
      window.localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Historico local nao deve travar a conversa.
    }
  }, [conversations, hydrated]);

  function updateActiveMessages(updater: (messages: Msg[]) => Msg[]) {
    setConversations((current) =>
      current.map((conversation) => {
        if (conversation.id !== activeConversation.id) return conversation;
        const nextMessages = updater(conversation.messages).slice(-80);

        return {
          ...conversation,
          title: titleFromMessages(nextMessages),
          messages: nextMessages,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  function newConversation() {
    const conversation = createConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    setInput("");
  }

  function clearHistory() {
    const conversation = createConversation();
    setConversations([conversation]);
    setActiveConversationId(conversation.id);
    try {
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(CONVERSATIONS_KEY);
    } catch {
      // noop
    }
  }

  function deleteConversation(id: string) {
    setConversations((current) => {
      const next = current.filter((conversation) => conversation.id !== id);
      if (next.length === 0) {
        const replacement = createConversation();
        setActiveConversationId(replacement.id);
        return [replacement];
      }

      if (id === activeConversationId) {
        setActiveConversationId(next[0].id);
      }

      return next;
    });
  }

  async function send(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    updateActiveMessages((m) => [...m, { role: "user", content: t }]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/crm/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: t,
          messages: messages.slice(-8),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; resposta?: string; erro?: string };

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.erro || "Falha ao consultar o assistente.");
      }

      updateActiveMessages((m) => [
        ...m,
        { role: "ai", content: payload.resposta || "Nao recebi uma resposta do assistente." },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      updateActiveMessages((m) => [
        ...m,
        { role: "ai", content: `Nao consegui consultar a OpenAI agora. ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 xl:grid-cols-[260px_1fr_360px] lg:grid-cols-[240px_1fr] gap-4">
      <div className="card-soft overflow-hidden flex flex-col min-h-[220px]">
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <div className="font-semibold text-sm inline-flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" /> Conversas
          </div>
          <button
            onClick={newConversation}
            title="Nova conversa"
            className="p-2 rounded-lg bg-secondary hover:bg-secondary/70"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {conversations.map((conversation) => {
            const active = conversation.id === activeConversation.id;
            return (
              <button
                key={conversation.id}
                onClick={() => setActiveConversationId(conversation.id)}
                className={`group w-full text-left p-2.5 rounded-lg border transition ${
                  active
                    ? "bg-primary/10 border-primary/30"
                    : "bg-transparent border-transparent hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className={`size-3.5 mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold truncate">{conversation.title}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {hydrated && conversation.updatedAt
                        ? new Date(conversation.updatedAt).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </div>
                  </div>
                  {conversations.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Excluir conversa"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteConversation(conversation.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          deleteConversation(conversation.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                    >
                      <Trash2 className="size-3.5" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Consultor IA · Mundo Pet</div>
            <div className="text-xs text-muted-foreground">OpenAI conectada a dados e acoes reais do CRM</div>
          </div>
          <button
            onClick={clearHistory}
            title="Limpar historico"
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
          >
            <Trash2 className="size-4" />
          </button>
          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-success/15 text-success">CONECTADO AO CRM</span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-secondary/30">
          {messages.map((m, i) => <Bubble key={i} m={m} />)}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {SUGESTOES.map((s) => (
              <button key={s} onClick={() => send(s)} className="text-[11px] px-2.5 py-1 rounded-lg bg-card border border-border hover:border-primary transition">{s}</button>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-border flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Pergunte sobre clientes, pedidos, estoque, faturamento..."
            rows={1}
            disabled={loading}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent"
          />
          <button disabled={loading} onClick={() => send(input)} className="p-3 rounded-xl bg-foreground text-background hover:opacity-90 disabled:opacity-50"><Send className="size-5" /></button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto scrollbar-thin">
        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="size-4 text-accent" /> Insights do CRM</h3>
          <div className="mt-3 space-y-2">
            {insights.map((i) => {
              const tone = i.severidade === "critico" ? "border-destructive/30 bg-destructive/5" : i.severidade === "alerta" ? "border-accent/30 bg-accent/5" : "border-primary/20 bg-primary/5";
              const Icon = i.severidade === "critico" ? AlertTriangle : i.severidade === "alerta" ? TrendingUp : Sparkles;
              const iconColor = i.severidade === "critico" ? "text-destructive" : i.severidade === "alerta" ? "text-accent" : "text-primary";
              return (
                <div key={i.id} className={`p-3 rounded-xl border ${tone}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold"><Icon className={`size-3.5 ${iconColor}`} /> {i.titulo}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{i.descricao}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-foreground/80 truncate">→ {i.acao}</span>
                    {i.rota && (
                      <Link to={i.rota} className="text-[10px] font-bold text-primary hover:underline inline-flex items-center gap-0.5">
                        Aplicar <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="size-4 text-accent" /> Alertas ativos ({alertasAtivos.length})</h3>
          <div className="mt-3 space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin">
            {alertasAtivos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum alerta ativo 🎉</p>}
            {alertasAtivos.map((a) => {
              const meta = ALERTA_META[a.tipo];
              return (
                <div key={a.id} className={`p-2.5 rounded-lg border ${meta.tone}`}>
                  <div className="flex items-start gap-2">
                    <Link to={a.rota} className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase font-bold opacity-70">{meta.label}</div>
                      <div className="text-xs font-semibold mt-0.5 truncate text-foreground">{a.titulo}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.mensagem}</div>
                    </Link>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => resolver(a.id)} title="Resolver" className="p-1 rounded hover:bg-success/15 text-success"><CheckCircle2 className="size-3.5" /></button>
                      <button onClick={() => descartar(a.id)} title="Descartar" className="p-1 rounded hover:bg-destructive/15 text-destructive"><XCircle className="size-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  const me = m.role === "user";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${me ? "bg-foreground text-background rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}>
        <div className="flex items-center gap-1 text-[10px] opacity-80 mb-1.5">
          {me ? <><User className="size-3" /> Você</> : <><Bot className="size-3" /> Consultor IA</>}
        </div>
        <div className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }} />
      </div>
    </div>
  );
}
