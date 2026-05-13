import { conversas, clientes, kanbanStages, type Conversa, type KanbanStage } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { Send, Sparkles, Phone, MoreVertical, Search, Bot, User, LayoutGrid, MessageSquare, MapPin, Wallet } from "lucide-react";
import { useState } from "react";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Conversas() {
  const [view, setView] = useState<"chat" | "kanban">("chat");
  const [active, setActive] = useState<Conversa>(conversas[0]);
  const [items, setItems] = useState<Conversa[]>(conversas);

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp IA</h1>
          <p className="text-sm text-muted-foreground">{items.length} conversas · {items.filter(c=>c.naoLidas>0).length} não lidas</p>
        </div>
        <div className="inline-flex p-1 rounded-xl bg-secondary">
          <button onClick={()=>setView("chat")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${view==="chat"?"bg-card shadow-sm":""}`}>
            <MessageSquare className="size-3.5" /> Chat
          </button>
          <button onClick={()=>setView("kanban")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${view==="kanban"?"bg-card shadow-sm":""}`}>
            <LayoutGrid className="size-3.5" /> Kanban
          </button>
        </div>
      </div>

      {view === "chat" ? (
        <ChatView active={active} setActive={setActive} items={items} />
      ) : (
        <KanbanView items={items} setItems={setItems} />
      )}
    </div>
  );
}

function ChatView({ active, setActive, items }: { active: Conversa; setActive: (c: Conversa) => void; items: Conversa[] }) {
  const cli = clientes.find(c => c.nome === active.cliente) ?? clientes[0];
  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr_300px] gap-4 min-h-0">
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Buscar..." className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {items.map((c) => (
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

      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold">
            {active.cliente.split(" ").map(n=>n[0]).slice(0,2).join("")}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{active.cliente}</div>
            <div className="text-xs text-muted-foreground">Pet: {active.pet} · {cli.perfil}</div>
          </div>
          <button className="p-2 rounded-lg hover:bg-secondary"><Phone className="size-4" /></button>
          <button className="p-2 rounded-lg hover:bg-secondary"><MoreVertical className="size-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3 bg-secondary/30">
          <Bubble side="them">Oi! A ração do {active.pet} está quase acabando 😅</Bubble>
          <Bubble side="me" ai>Oi {active.cliente.split(" ")[0]}! 😊 A última caixa foi entregue há 26 dias. Quer que eu deixe igual da última compra?</Bubble>
          <Bubble side="them">Sim! Pode mandar o Pix?</Bubble>
          <Bubble side="me" ai>Perfeito! Pedido criado · {brl(cli.ticket)}. Pix gerado abaixo 👇</Bubble>
        </div>

        <div className="p-3 border-t border-border flex items-end gap-2">
          <button className="p-2.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition"><Sparkles className="size-5" /></button>
          <textarea rows={1} placeholder="Digite ou deixe a IA responder..." className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:border-primary border border-transparent" />
          <button className="p-3 rounded-xl bg-success text-success-foreground"><Send className="size-5" /></button>
        </div>
      </div>

      <div className="card-soft p-4 hidden md:flex flex-col gap-3 overflow-y-auto scrollbar-thin">
        <div>
          <div className="font-semibold">{cli.nome}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="size-3" /> {cli.endereco} · {cli.bairro}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{cli.telefone}</div>
          <div className="mt-2"><StatusBadge value={cli.perfil} /></div>
        </div>

        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-accent/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wide text-muted-foreground"><Wallet className="size-3" /> Financeiro do cliente</div>
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <FinMini label="Total gasto" value={brl(cli.totalGasto)} />
            <FinMini label="Lucro líquido" value={brl(cli.lucroLiquido)} accent />
            <FinMini label="Descontos" value={brl(cli.totalDescontos)} />
            <FinMini label="Ticket médio" value={brl(cli.ticket)} />
            <FinMini label="Pedidos" value={String(cli.pedidos)} />
            <FinMini label="Recompra" value={cli.proxRecompra} />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">Pets ({cli.pets.length})</div>
          {cli.pets.map(p => (
            <div key={p} className="rounded-lg bg-secondary p-2.5 mb-1.5">
              <div className="font-semibold text-sm">🐾 {p}</div>
              <div className="text-[11px] text-muted-foreground">Última visita há 5 dias</div>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-1.5">IA aprendeu</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>✓ Aceita upsell (8/10)</li>
            <li>✓ Recompra a cada 26-30 dias</li>
            <li>✓ Origem: <b className="text-foreground">{cli.origem}</b></li>
            {cli.cupom && <li>✓ Usou cupom <b className="text-foreground">{cli.cupom}</b></li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KanbanView({ items, setItems }: { items: Conversa[]; setItems: (i: Conversa[]) => void }) {
  const [drag, setDrag] = useState<string | null>(null);

  function move(stage: KanbanStage) {
    if (!drag) return;
    setItems(items.map(c => c.id === drag ? { ...c, estagio: stage } : c));
    setDrag(null);
  }

  return (
    <div className="flex-1 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 overflow-auto pb-2 min-h-0">
      {kanbanStages.map(stage => {
        const list = items.filter(c => c.estagio === stage);
        return (
          <div
            key={stage}
            onDragOver={e=>e.preventDefault()}
            onDrop={()=>move(stage)}
            className="bg-secondary/50 rounded-2xl p-3 min-h-[280px] flex flex-col"
          >
            <div className="flex items-center justify-between px-1 pb-2.5">
              <span className="font-semibold text-sm">{stage}</span>
              <span className="text-xs font-bold size-5 grid place-items-center rounded-md bg-card text-muted-foreground">{list.length}</span>
            </div>
            <div className="space-y-2 flex-1">
              {list.map(c => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={()=>setDrag(c.id)}
                  className="card-soft p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition"
                >
                  <div className="flex items-center gap-2">
                    <div className="size-7 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold text-[10px]">
                      {c.cliente.split(" ").map(n=>n[0]).slice(0,2).join("")}
                    </div>
                    <div className="font-semibold text-xs truncate">{c.cliente}</div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{c.ultima}</p>
                  <div className="mt-2 flex justify-between items-center">
                    <StatusBadge value={c.tag} />
                    <span className="text-[10px] text-muted-foreground">{c.hora}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground px-1 italic">
              {stage === "Follow-up" && "IA agenda msg auto"}
              {stage === "Recompra" && "Disparo 3d antes"}
              {stage === "Risco" && "Reativação 15% OFF"}
              {stage === "Aguardando pagamento" && "Lembrete em 2h"}
              {stage === "Upsell" && "Sugere combo IA"}
              {stage === "Hoje" && "Prioridade alta"}
            </div>
          </div>
        );
      })}
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

function FinMini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg p-2 ${accent ? "bg-success/10" : "bg-card"}`}>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-xs mt-0.5 truncate ${accent ? "text-success" : ""}`}>{value}</div>
    </div>
  );
}
