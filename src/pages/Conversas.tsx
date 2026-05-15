import { conversas, clientes, kanbanStages, filtrosConversa, type Conversa, type ConversaFiltro, type KanbanStage } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Send, Sparkles, Phone, MoreVertical, Search, Bot, User,
  LayoutGrid, MessageSquare, MapPin, Wallet, Paperclip, Mic,
  Smile, Image as ImageIcon, CheckCheck, TrendingUp, Target,
  DollarSign, Tag, Users, PawPrint, Zap, ChevronDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { SpeciePill } from "@/pages/RecompraPrevista";
import { SmartKanban } from "@/features/whatsapp-crm/components/SmartKanban";
import { AIAssistantToggle } from "@/features/whatsapp-crm/components/AIAssistantToggle";
import { useAIAssistant } from "@/features/whatsapp-crm/hooks/useAIAssistant";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Conversas() {
  const [view, setView] = useState<"chat" | "kanban">("chat");
  const [active, setActive] = useState<Conversa>(conversas[0]);
  const [items, setItems] = useState<Conversa[]>(conversas);
  const [filtro, setFiltro] = useState<(typeof filtrosConversa)[number]>("Todos");
  const [busca, setBusca] = useState("");

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (filtro !== "Todos" && !c.filtros.includes(filtro as ConversaFiltro)) return false;
      if (busca && !c.cliente.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [items, filtro, busca]);

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
            <LayoutGrid className="size-3.5" /> Kanban
          </button>
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
        <ChatView active={active} setActive={setActive} items={filtered} busca={busca} setBusca={setBusca} />
      ) : (
        <KanbanView items={items} setItems={setItems} />
      )}
    </div>
  );
}

function ChatView({
  active, setActive, items, busca, setBusca,
}: {
  active: Conversa;
  setActive: (c: Conversa) => void;
  items: Conversa[];
  busca: string;
  setBusca: (s: string) => void;
}) {
  const cli = clientes.find((c) => c.nome === active.cliente) ?? clientes[0];

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr_340px] gap-3 min-h-0">
      {/* LISTA */}
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm outline-none focus:ring-2 ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {items.map((c) => {
            const ativo = active.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActive(c)}
                className={`w-full text-left p-3 flex gap-3 border-b border-border hover:bg-secondary/40 transition ${
                  ativo ? "bg-sidebar-accent" : ""
                }`}
              >
                <div className="relative shrink-0">
                  <div className="size-11 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center text-foreground font-bold text-xs">
                    {c.cliente
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  {c.tag === "IA" && (
                    <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-primary grid place-items-center ring-2 ring-card">
                      <Bot className="size-2.5 text-primary-foreground" />
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-sm font-semibold truncate">{c.cliente}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0">{c.hora}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultima}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-success shrink-0">
                        {brl(c.valorPotencial)}
                      </span>
                      <span className="text-[9px] text-muted-foreground truncate">· {c.estagio}</span>
                    </div>
                    {c.naoLidas > 0 && (
                      <span className="text-[10px] font-bold size-4 grid place-items-center rounded-full bg-success text-success-foreground">
                        {c.naoLidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="p-8 text-center text-xs text-muted-foreground">Nenhuma conversa neste filtro.</div>
          )}
        </div>
      </div>

      {/* CHAT */}
      <div className="card-soft flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3">
          <div className="size-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 grid place-items-center font-bold text-xs">
            {active.cliente.split(" ").map((n) => n[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-2">
              {active.cliente}
              <StatusBadge value={cli.perfil} />
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-success" /> online · Pet: {active.pet}
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-secondary"><Phone className="size-4" /></button>
          <button className="p-2 rounded-lg hover:bg-secondary"><MoreVertical className="size-4" /></button>
        </div>

        <div
          className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-3"
          style={{
            background:
              "repeating-linear-gradient(45deg, hsl(var(--secondary)/0.3) 0 2px, transparent 2px 18px), hsl(var(--secondary)/0.25)",
          }}
        >
          <DateChip>Hoje</DateChip>
          <Bubble side="them" hora="14:25">
            Oi! A ração do {active.pet} está quase acabando 😅
          </Bubble>
          <Bubble side="me" ai hora="14:25">
            Oi {active.cliente.split(" ")[0]}! 😊 A última caixa foi entregue há 26 dias. Quer que eu deixe igual da última compra?
          </Bubble>
          <Bubble side="them" hora="14:30">Sim! Pode mandar o Pix?</Bubble>
          <Bubble side="me" ai hora="14:32">
            Perfeito! Pedido criado · <b>{brl(cli.ticket)}</b>. Pix gerado abaixo 👇
          </Bubble>
          <Bubble side="me" hora="14:32">
            <div className="space-y-1.5 -mx-1">
              <div className="text-[10px] uppercase tracking-wide opacity-70">Pix copia e cola</div>
              <div className="font-mono text-[11px] bg-black/20 rounded-md p-2 break-all">
                00020126360014BR.GOV.BCB.PIX0114+5511998123344...
              </div>
            </div>
          </Bubble>
        </div>

        {/* Composer */}
        <div className="px-3 py-2 border-t border-border space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <QuickReply label="Confirmar pedido" />
            <QuickReply label="Enviar Pix" />
            <QuickReply label="Status entrega" />
            <QuickReply label="Sugerir upsell" icon={<Sparkles className="size-3" />} />
          </div>
          <div className="flex items-end gap-2">
            <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><Smile className="size-5" /></button>
            <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><Paperclip className="size-5" /></button>
            <button className="p-2 rounded-xl hover:bg-secondary text-muted-foreground"><ImageIcon className="size-5" /></button>
            <textarea
              rows={1}
              placeholder="Mensagem ou /comando IA..."
              className="flex-1 resize-none px-4 py-2.5 rounded-xl bg-secondary outline-none text-sm focus:bg-card focus:ring-2 ring-primary/30 max-h-32"
            />
            <button className="p-2.5 rounded-xl bg-primary/15 text-primary hover:bg-primary/25 transition" title="Resposta IA">
              <Sparkles className="size-5" />
            </button>
            <button className="p-3 rounded-xl bg-success text-success-foreground shadow hover:bg-success/90">
              <Send className="size-5" />
            </button>
            <button className="p-2.5 rounded-xl hover:bg-secondary text-muted-foreground"><Mic className="size-5" /></button>
          </div>
        </div>
      </div>

      {/* CRM PANEL */}
      <CrmPanel cli={cli} />
    </div>
  );
}

function CrmPanel({ cli }: { cli: typeof clientes[number] }) {
  const cacRoi = cli.totalGasto > 0 && cli.cac > 0 ? (cli.totalGasto / cli.cac).toFixed(1) : "∞";

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
            <MapPin className="size-3" /> {cli.cidade ?? "São Paulo"}{cli.bairro ? ` — ${cli.bairro}` : ""}
          </span>
          {(cli.especies ?? []).map((e) => (
            <SpeciePill key={e} especie={e} />
          ))}
          {(!cli.especies || cli.especies.length === 0) && (
            <SpeciePill especie="cachorro" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
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
        <Section icon={<Zap className="size-3" />} title="IA aprendeu">
          <ul className="space-y-1 text-[11px]">
            <li className="flex gap-1.5"><CheckCheck className="size-3 text-success shrink-0 mt-0.5" /> Aceita upsell (8/10)</li>
            <li className="flex gap-1.5"><CheckCheck className="size-3 text-success shrink-0 mt-0.5" /> Recompra a cada 26-30 dias</li>
            <li className="flex gap-1.5"><CheckCheck className="size-3 text-success shrink-0 mt-0.5" /> Prefere Pix</li>
            <li className="flex gap-1.5"><CheckCheck className="size-3 text-success shrink-0 mt-0.5" /> Responde rápido (~2min)</li>
          </ul>
        </Section>

        {/* Ações Rápidas */}
        <Section icon={<Zap className="size-3" />} title="Ações rápidas">
          <div className="grid grid-cols-2 gap-1.5">
            <ActionBtn icon="📋" label="Abrir pedido" />
            <ActionBtn icon="💸" label="Gerar Pix" primary />
            <ActionBtn icon="🏷️" label="Aplicar desconto" />
            <ActionBtn icon="🔔" label="Follow-up" />
            <ActionBtn icon="📊" label="Mover kanban" />
            <ActionBtn icon="📜" label="Histórico" />
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

function ActionBtn({ icon, label, primary }: { icon: string; label: string; primary?: boolean }) {
  return (
    <button className={`h-9 px-2 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 transition ${
      primary ? "bg-success text-success-foreground hover:opacity-90" : "bg-secondary hover:bg-secondary/70"
    }`}>
      <span>{icon}</span> {label}
    </button>
  );
}

function QuickReply({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <button className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 transition">
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
