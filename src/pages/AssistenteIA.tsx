import type { DashboardData } from "@/lib/crm-supabase";
import { onCrmReload } from "@/lib/crm-refresh";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  LineChart,
  Loader2,
  Send,
  Sparkles,
  User,
  Wallet,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
};

type AssistenteResponse = {
  ok: boolean;
  resposta?: string;
  erro?: string;
  acoesExecutadas?: string[];
  metricas?: DashboardData["kpis"];
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const sugestoes = [
  "Me resume o que precisa de atencao hoje",
  "Como esta o faturamento da semana?",
  "Quais clientes ou conversas devo priorizar?",
  "Desativar IA geral do CRM",
  "Ativar IA geral do CRM",
];

export function AssistenteIA() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Oi. Sou seu assistente de gestao do CRM. Posso resumir metricas, apontar prioridades e executar acoes seguras, como ligar ou desligar a IA geral.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    let ignore = false;

    async function carregarResumo() {
      try {
        const response = await fetch("/api/crm/dashboard", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as DashboardData;
        if (!ignore) setDashboard(data);
      } catch (error) {
        console.error("Erro ao carregar metricas do assistente:", error);
      }
    }

    void carregarResumo();
    const offCrmReload = onCrmReload(() => void carregarResumo());

    return () => {
      ignore = true;
      offCrmReload();
    };
  }, []);

  const metricas = useMemo(() => dashboard?.kpis ?? null, [dashboard]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || loading) return;

    const userMessage: ChatMessage = { role: "user", content: prompt };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/crm/assistente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: prompt, messages }),
      });
      const data = (await response.json()) as AssistenteResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.erro ?? "Erro ao falar com o assistente");
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.resposta ?? "Nao consegui montar uma resposta agora.",
          actions: data.acoesExecutadas ?? [],
        },
      ]);

      if (data.metricas && dashboard) {
        setDashboard({ ...dashboard, kpis: data.metricas });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao falar com o assistente";
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Nao consegui concluir agora: ${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Assistente IA do CRM</div>
            <div className="text-xs text-muted-foreground">
              Analisa metricas, prioriza tarefas e executa acoes seguras
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-success/15 text-success">
            OPERACIONAL
          </span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-secondary/30">
          {messages.map((message, index) => (
            <Bubble key={index} message={message} onSuggest={send} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3 text-sm inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                Analisando o CRM...
              </div>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border space-y-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {sugestoes.map((sugestao) => (
              <button
                key={sugestao}
                onClick={() => void send(sugestao)}
                disabled={loading}
                className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-secondary hover:bg-primary/10 disabled:opacity-50 transition"
              >
                {sugestao}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Pergunte sobre vendas, lucro, estoque, clientes ou peca uma acao..."
              rows={1}
              className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent"
            />
            <button
              onClick={() => void send(input)}
              disabled={loading || !input.trim()}
              className="p-3 rounded-xl bg-foreground text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Enviar"
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 overflow-y-auto scrollbar-thin">
        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <LineChart className="size-4 text-primary" /> Painel que a IA esta lendo
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MetricCard
              icon={<Wallet className="size-4" />}
              label="Hoje"
              value={brl(metricas?.faturamentoHoje ?? 0)}
            />
            <MetricCard
              icon={<Wallet className="size-4" />}
              label="Semana"
              value={brl(metricas?.faturamentoSemana ?? 0)}
            />
            <MetricCard
              icon={<CheckCircle2 className="size-4" />}
              label="Pedidos hoje"
              value={String(metricas?.pedidosHoje ?? 0)}
            />
            <MetricCard
              icon={<AlertTriangle className="size-4" />}
              label="Estoque critico"
              value={String(metricas?.estoqueCritico ?? 0)}
            />
          </div>
        </div>

        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Zap className="size-4 text-accent" /> O que ele pode fazer agora
          </h3>
          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <Capability text="Resumir faturamento, lucro, ticket medio e pedidos." />
            <Capability text="Apontar clientes em risco, estoque critico e conversas pendentes." />
            <Capability text="Sugerir proximas acoes comerciais para o administrador." />
            <Capability text="Ativar ou desativar a IA geral do CRM quando solicitado." />
          </div>
        </div>

        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="size-4 text-accent" /> Alertas atuais
          </h3>
          <div className="mt-3 space-y-2">
            <AlertCard
              active={(metricas?.estoqueCritico ?? 0) > 0}
              text={`${metricas?.estoqueCritico ?? 0} produto(s) abaixo do minimo.`}
            />
            <AlertCard
              active={(metricas?.clientesRisco ?? 0) > 0}
              text={`${metricas?.clientesRisco ?? 0} cliente(s) marcados como risco.`}
            />
            <AlertCard
              active={(dashboard?.conversas ?? []).some((conversa) => conversa.naoLidas > 0)}
              text="Ha conversas recentes aguardando atencao."
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

function Bubble({
  message,
  onSuggest,
}: {
  message: ChatMessage;
  onSuggest: (text: string) => void;
}) {
  const me = message.role === "user";

  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm ${
          me
            ? "bg-foreground text-background rounded-br-md"
            : "bg-card border border-border rounded-bl-md"
        }`}
      >
        <div className="flex items-center gap-1 text-[10px] opacity-80 mb-1.5">
          {me ? (
            <>
              <User className="size-3" /> Admin
            </>
          ) : (
            <>
              <Bot className="size-3" /> Assistente do CRM
            </>
          )}
        </div>
        <div className="whitespace-pre-wrap leading-relaxed">
          <MessageContent content={message.content} />
        </div>
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 space-y-1">
            {message.actions.map((action) => (
              <div
                key={action}
                className="text-[11px] rounded-lg bg-success/10 text-success px-2.5 py-1 inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="size-3" /> {action}
              </div>
            ))}
          </div>
        )}
        {!me && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["O que eu faco agora?", "Detalhe os alertas", "Monte um plano de acao"].map(
              (suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => onSuggest(suggestion)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/15 transition"
                >
                  {suggestion}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  return content.split(/(\*\*.+?\*\*)/g).map((part, index) => {
    const destaque = part.match(/^\*\*(.+)\*\*$/s)?.[1];

    return destaque ? <b key={index}>{destaque}</b> : <span key={index}>{part}</span>;
  });
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-secondary/70 p-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="mt-2 text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-bold truncate">{value}</div>
    </div>
  );
}

function Capability({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <CheckCircle2 className="size-3.5 text-success shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function AlertCard({ active, text }: { active: boolean; text: string }) {
  return (
    <div
      className={`p-3 rounded-xl border text-xs ${
        active
          ? "border-accent/30 bg-accent/5 text-foreground"
          : "border-success/30 bg-success/5 text-muted-foreground"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold">
        {active ? (
          <AlertTriangle className="size-3.5 text-accent" />
        ) : (
          <CheckCircle2 className="size-3.5 text-success" />
        )}
        {text}
      </div>
    </div>
  );
}
