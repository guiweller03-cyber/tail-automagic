import { conversas } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Send, Sparkles, Phone, MoreVertical, Search, Bot, User } from "lucide-react";
import { useState } from "react";

export function Conversas() {
  const [active, setActive] = useState(conversas[0]);
  return (
    <div className="h-[calc(100vh-8rem)] grid grid-cols-1 md:grid-cols-[320px_1fr_280px] gap-4">
      {/* List */}
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Conversas</h2>
          <div className="relative mt-3">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar..." className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {conversas.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c)}
              className={`w-full text-left p-3 flex gap-3 border-b border-border hover:bg-secondary/40 transition ${active.id === c.id ? "bg-sidebar-accent" : ""}`}
            >
              <div className="size-10 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold text-xs shrink-0">
                {c.cliente.split(" ").map(n=>n[0]).slice(0,2).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold truncate">{c.cliente}</p>
                  <span className="text-[10px] text-muted-foreground">{c.hora}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultima}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge value={c.tag} />
                  {c.naoLidas > 0 && <span className="text-[10px] font-bold px-1.5 rounded-full bg-success text-success-foreground">{c.naoLidas}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold">
            {active.cliente.split(" ").map(n=>n[0]).slice(0,2).join("")}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{active.cliente}</div>
            <div className="text-xs text-muted-foreground">Pet: {active.pet} · online agora</div>
          </div>
          <button className="p-2 rounded-lg hover:bg-secondary"><Phone className="size-4" /></button>
          <button className="p-2 rounded-lg hover:bg-secondary"><MoreVertical className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-secondary/30">
          <Bubble side="them">Oi! A ração do Thor está quase acabando 😅</Bubble>
          <Bubble side="me" ai>Oi Marina! 😊 Acredito que sim — a última caixa foi entregue há 26 dias. Quer que eu já deixe separado igual da última compra (Golden 15kg)?</Bubble>
          <Bubble side="them">Sim! Pode mandar o Pix?</Bubble>
          <Bubble side="me" ai>Perfeito! Pedido #10238 criado · R$ 189,90. Pix gerado abaixo 👇 entrego hoje entre 15h e 17h ✨</Bubble>
          <Bubble side="me" ai>
            <div className="text-xs font-mono bg-card text-foreground p-3 rounded-lg border border-border mt-1">
              00020126480014BR.GOV.BCB.PIX0114+5511999...
            </div>
          </Bubble>
          <Bubble side="them">Pode mandar o Pix? 🙏</Bubble>
        </div>

        <div className="p-3 border-t border-border flex items-end gap-2">
          <button className="p-2.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition" title="Sugerir com IA">
            <Sparkles className="size-5" />
          </button>
          <textarea
            placeholder="Digite uma mensagem ou deixe a IA responder..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent"
          />
          <button className="p-3 rounded-xl bg-success text-success-foreground hover:opacity-90 transition">
            <Send className="size-5" />
          </button>
        </div>
      </div>

      {/* Customer panel */}
      <div className="card-soft p-5 hidden md:flex flex-col gap-4 overflow-y-auto scrollbar-thin">
        <div>
          <div className="text-xs text-muted-foreground">Cliente</div>
          <div className="font-semibold">{active.cliente}</div>
          <div className="text-xs text-muted-foreground mt-0.5">(11) 99812-3344 · Vila Mariana</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Ticket" value="R$ 210" />
          <Mini label="Pedidos" value="14" />
          <Mini label="Recompra" value="28d" />
          <Mini label="Perfil" value="VIP" />
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pets</div>
          <div className="card-soft p-3">
            <div className="font-semibold text-sm">🐶 Thor</div>
            <div className="text-xs text-muted-foreground">Golden Retriever · 4 anos · 32kg</div>
            <div className="text-xs text-muted-foreground">Ração: Golden 15kg · castrado</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">IA aprendeu</div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>✓ Aceita upsell (8/10 vezes)</li>
            <li>✓ Responde rápido</li>
            <li>✓ Prefere produtos premium</li>
            <li>✓ Recompra sempre em 26-30 dias</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Bubble({ side, children, ai }: { side: "me"|"them"; children: React.ReactNode; ai?: boolean }) {
  const me = side === "me";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${me ? "bg-success text-success-foreground rounded-br-md" : "bg-card border border-border rounded-bl-md"}`}>
        {ai && <div className="flex items-center gap-1 text-[10px] opacity-80 mb-1"><Bot className="size-3" /> IA Mundo Pet</div>}
        {!ai && !me && <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1"><User className="size-3" /> Cliente</div>}
        {children}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-bold text-sm mt-0.5">{value}</div>
    </div>
  );
}
