import { iaInicial, iaAlertas, type IaMessage } from "@/lib/mock";
import { Sparkles, Send, Bot, User, AlertTriangle, TrendingUp, Zap } from "lucide-react";
import { useState } from "react";

const respostas: Record<string, string> = {
  default: "Tudo certo! Posso executar essa ação agora — quer que eu confirme o disparo?",
  risco: "Identifiquei **5 clientes em risco**:\n\n• Helena Souza — 62 dias sem comprar\n• Pedro Alves — 12 dias (recompra prevista para hoje)\n• Marcos R. — 48 dias\n• Bia Lopes — 35 dias\n• Sandro K. — 41 dias\n\nQuer que eu envie a campanha de reativação com 15% OFF?",
  campanha: "Pronto! Criei a campanha **Ração Premium · Maio**:\n\n• Público: 142 VIPs + 38 Premium\n• Mensagem: cupom RACAO15\n• Disparo: hoje 18h\n\nConfirma envio?",
  lucro: "Esta semana: **R$ 31.660** em vendas, **R$ 8.940** de lucro líquido (margem 28,2%). Crescimento de **+14%** vs semana anterior 📈",
};

export function AssistenteIA() {
  const [messages, setMessages] = useState<IaMessage[]>(iaInicial);
  const [input, setInput] = useState("");

  function send(text: string) {
    if (!text.trim()) return;
    const lower = text.toLowerCase();
    let reply = respostas.default;
    if (lower.includes("risco")) reply = respostas.risco;
    else if (lower.includes("campanha") || lower.includes("ração")) reply = respostas.campanha;
    else if (lower.includes("lucr") || lower.includes("ganh") || lower.includes("faturamento")) reply = respostas.lucro;
    setMessages(m => [...m, { role: "user", content: text }, { role: "ai", content: reply }]);
    setInput("");
  }

  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center text-primary-foreground">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold">Assistente IA · Mundo Pet</div>
            <div className="text-xs text-muted-foreground">Conectado · pode executar ações no CRM</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-success/15 text-success">ATIVO</span>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-secondary/30">
          {messages.map((m, i) => <Bubble key={i} m={m} onSuggest={send} />)}
        </div>

        <div className="p-3 border-t border-border flex items-end gap-2">
          <textarea
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(input);}}}
            placeholder="Pergunte qualquer coisa ou peça uma ação..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent"
          />
          <button onClick={()=>send(input)} className="p-3 rounded-xl bg-foreground text-background hover:opacity-90"><Send className="size-5" /></button>
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto scrollbar-thin">
        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="size-4 text-accent" /> Ações rápidas</h3>
          <div className="mt-3 grid gap-1.5">
            {["Mande mensagem para clientes inativos +30 dias","Quais produtos não temos mas pediram?","Crie relatório financeiro semanal","Sugira reposição de estoque"].map(a => (
              <button key={a} onClick={()=>send(a)} className="text-left text-xs px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 transition">{a}</button>
            ))}
          </div>
        </div>

        <div className="card-soft p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="size-4 text-accent" /> Alertas IA</h3>
          <div className="mt-3 space-y-2">
            {iaAlertas.map((a,i) => {
              const tone = a.tone === "destructive" ? "border-destructive/30 bg-destructive/5" : a.tone === "warning" ? "border-accent/30 bg-accent/5" : "border-success/30 bg-success/5";
              const Icon = a.tone === "success" ? TrendingUp : AlertTriangle;
              const ic = a.tone === "destructive" ? "text-destructive" : a.tone === "warning" ? "text-accent" : "text-success";
              return (
                <div key={i} className={`p-3 rounded-xl border ${tone}`}>
                  <div className="flex items-center gap-2 text-xs font-semibold"><Icon className={`size-3.5 ${ic}`} /> {a.tipo}</div>
                  <p className="text-xs text-muted-foreground mt-1">{a.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, onSuggest }: { m: IaMessage; onSuggest: (s: string) => void }) {
  const me = m.role === "user";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${me ? "bg-foreground text-background rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}>
        <div className="flex items-center gap-1 text-[10px] opacity-80 mb-1.5">
          {me ? <><User className="size-3" /> Você</> : <><Bot className="size-3" /> IA Mundo Pet</>}
        </div>
        <div className="whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: m.content.replace(/\*\*(.+?)\*\*/g,"<b>$1</b>") }} />
        {m.suggestions && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {m.suggestions.map(s => (
              <button key={s} onClick={()=>onSuggest(s)} className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary hover:bg-primary/15 transition">{s}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
