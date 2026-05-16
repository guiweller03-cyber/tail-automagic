import { useEffect, useMemo, useState } from "react";
import { Sparkles, Send, Bot, User, AlertTriangle, TrendingUp, Zap, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { gerarInsights, responderPergunta } from "@/features/ia-consultor/insights";
import { useAlertas, ALERTA_META } from "@/features/alertas/store";

type Msg = { role: "user" | "ai"; content: string };

const SUGESTOES = [
  "Quem está em risco de churn?",
  "Sugira campanha Golden",
  "Cupons abaixo da média",
  "Pets com vermífugo vencendo",
  "Sugestões de upsell",
  "Clientes inativos +60 dias",
];

export function AssistenteIA() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "ai", content: "Olá! Sou seu consultor operacional. Já analisei o CRM — veja os insights na lateral ou me pergunte algo." },
  ]);
  const [input, setInput] = useState("");
  const insights = useMemo(() => gerarInsights(), []);
  const { ativos: alertasAtivos, resolver, descartar } = useAlertas();

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    const reply = responderPergunta(t);
    setMessages((m) => [...m, { role: "user", content: t }, { role: "ai", content: reply }]);
    setInput("");
  }

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Consultor IA · Mundo Pet</div>
            <div className="text-xs text-muted-foreground">Análise contínua de funil, cupons, churn e recompra</div>
          </div>
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
            placeholder="Pergunte sobre clientes, cupons, ticket, marcas..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent"
          />
          <button onClick={() => send(input)} className="p-3 rounded-xl bg-foreground text-background hover:opacity-90"><Send className="size-5" /></button>
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
